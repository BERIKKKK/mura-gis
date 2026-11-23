/* Плагиндер менеджері: .muraplug архивін тексеру, орнату, қосу/өшіру, рұқсаттар, баптаулар, жою.
   Барлығы бағдарламаның баптаулар қалтасында, жоба файлынан (.gpkg) БӨЛЕК:
     userData/plugins/installed/<id>/   — плагин файлдары + .mura-integrity.json (әр файлдың SHA-256 хеші);
     userData/plugins/state.json        — күйі: { suspended, plugins: { id: { enabled, granted, settings, … } } };
     userData/plugins/data/<id>/        — плагиннің жеке деректері (mura.storage).
   Орнату кезінде ештеңе орындалмайды: архив жадта тексеріледі, пайдаланушы растағаннан кейін ғана файлдар
   уақытша қалтаға жазылып, бір әрекетпен (rename) орнына қойылады. Жоба деректеріне плагин менеджері мүлде тимейді. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const M = require('../../plugin-sdk/lib/manifest.cjs');
const Z = require('../../plugin-sdk/lib/zip.cjs');

const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const STAGE_TTL = 15 * 60 * 1000;

class PluginManager {
  /** dir — userData/plugins; env — { appVersion, platform }. */
  constructor(dir, env) {
    this.dir = dir;
    this.env = { appVersion: env.appVersion, platform: env.platform || 'desktop', apis: M.SUPPORTED_API };
    this.instDir = path.join(dir, 'installed');
    this.dataDir = path.join(dir, 'data');
    this.stateFile = path.join(dir, 'state.json');
    this.staged = new Map();
    this.safeMode = false;           // --no-plugins / MURA_NO_PLUGINS=1: ешбір плагин іске қосылмайды
    this.state = this.readState();
    this.cache = null;
  }

  /* ---------- Күй файлы (.tmp → rename, алдыңғысы .bak) ---------- */
  readState() {
    for (const f of [this.stateFile, this.stateFile + '.bak']) {
      try {
        const j = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (j && typeof j === 'object' && j.plugins && typeof j.plugins === 'object') return { version: 1, suspended: !!j.suspended, plugins: j.plugins };
      } catch (e) { /* келесі */ }
    }
    return { version: 1, suspended: false, plugins: {} };
  }
  writeState() {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = this.stateFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 1));
    if (fs.existsSync(this.stateFile)) { try { fs.copyFileSync(this.stateFile, this.stateFile + '.bak'); } catch (e) { /* елемейміз */ } }
    fs.renameSync(tmp, this.stateFile);
    this.cache = null;
  }

  /* ---------- Орнатылғандар ---------- */
  /** Орнатылған плагиндер: { id, dir, manifest, errors, compat, enabled, granted, settings, … }. */
  list() {
    if (this.cache) return this.cache;
    const out = [];
    let names = [];
    try { names = fs.readdirSync(this.instDir, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('.')).map(d => d.name); } catch (e) { names = []; }
    for (const name of names.sort()) {
      const dir = path.join(this.instDir, name);
      const st = this.state.plugins[name] || {};
      let manifest = null, errors = [], integrity = null;
      try {
        const v = M.validateManifest(JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')));
        if (v.ok && v.manifest.id !== name) errors = ['Қалта атауы плагин id-іне сәйкес емес.'];
        else if (v.ok) manifest = v.manifest; else errors = v.errors;
      } catch (e) { errors = ['manifest.json оқылмады: ' + e.message]; }
      try { integrity = JSON.parse(fs.readFileSync(path.join(dir, Z.META_FILE), 'utf8')); } catch (e) { errors.push('Тұтастық файлы (' + Z.META_FILE + ') жоқ — плагинді қайта орнатыңыз.'); }
      const compat = manifest ? M.compatibility(manifest, this.env) : { ok: false, reason: errors[0] || '', reason_ru: errors[0] || '' };
      const granted = manifest ? (Array.isArray(st.granted) ? st.granted : []).filter(p => manifest.permissions.includes(p) && M.PERMISSIONS[p].available) : [];
      const settings = {};
      if (manifest) for (const s of manifest.settings) settings[s.key] = M.settingValue(s, st.settings ? st.settings[s.key] : undefined);
      out.push({ id: name, dir, manifest, errors, integrity, compat, enabled: st.enabled !== false, granted, settings, source: st.source === 'official' ? 'official' : 'file',
        reasons: integrity && integrity.reasons || {}, installed_at: st.installed_at || '', updated_at: st.updated_at || '' });
    }
    this.cache = out;
    return out;
  }
  get(id) { return this.list().find(p => p.id === id) || null; }
  /** Іске қосуға бола ма: қосулы, үйлесімді, қате жоқ, жалпы тоқтатылмаған. */
  runnable(p) { return !!(p && p.manifest && !p.errors.length && p.compat.ok && p.enabled && !this.state.suspended && !this.safeMode); }

  /** Орнатылған файлдардың тұтастығы: әр файлдың SHA-256 хеші орнату кезіндегімен бірдей ме, артық файл жоқ па. */
  verify(p) {
    const files = p.integrity && p.integrity.files;
    if (!files || typeof files !== 'object') return 'Тұтастық туралы мәлімет жоқ.';
    const want = new Set(Object.keys(files));
    const walk = (d, rel) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const r = rel ? rel + '/' + e.name : e.name;
        if (!rel && e.name === Z.META_FILE) continue;
        if (e.isSymbolicLink()) throw new Error('символдық сілтеме: ' + r);
        if (e.isDirectory()) walk(path.join(d, e.name), r);
        else if (!want.has(r)) throw new Error('бөтен файл қосылған: ' + r);
        else if (sha256(fs.readFileSync(path.join(d, e.name))) !== files[r]) throw new Error('файл өзгертілген: ' + r);
        else want.delete(r);
      }
    };
    try { walk(p.dir, ''); } catch (e) { return 'Плагин файлдары орнатылғаннан кейін өзгерген (' + e.message + '). Қайта орнатыңыз.'; }
    return want.size ? 'Плагин файлдары жоқ: ' + [...want].slice(0, 5).join(', ') : '';
  }

  /* ---------- Орнату: 1) тексеру (inspect) → 2) пайдаланушы растайды → 3) install ---------- */
  inspect(file) {
    const st = fs.statSync(file);
    if (!st.isFile()) throw new Error('Бұл файл емес.');
    if (st.size > Z.LIMITS.archive) throw new Error('Архив тым үлкен (шегі ' + Math.round(Z.LIMITS.archive / 1048576) + ' МБ).');
    return this.inspectBuffer(fs.readFileSync(file), path.basename(file));
  }
  /** source: 'official' — бағдарламамен бірге келген ұсынылған плагин (catalog.js), 'file' — пайдаланушы таңдаған файл. */
  inspectBuffer(buf, fileName, source = 'file') {
    const { files } = Z.readPlugin(buf);
    for (const n of files.keys()) if (n.startsWith('__mura/')) throw new Error('«__mura/» — бағдарламаның қызметтік жолы, архивте болмауы керек: ' + n);
    if (!files.has('manifest.json')) throw new Error('Архивтің түбінде manifest.json жоқ.');
    let raw;
    try { raw = JSON.parse(files.get('manifest.json').toString('utf8').replace(/^﻿/, '')); } catch (e) { throw new Error('manifest.json — дұрыс JSON емес: ' + e.message); }
    const v = M.validateManifest(raw, { files: new Set(files.keys()) });
    let reasons = {};
    if (files.has('permissions.json')) {
      try { reasons = M.cleanReasons(JSON.parse(files.get('permissions.json').toString('utf8').replace(/^﻿/, '')), v.ok ? v.manifest.permissions : []); }
      catch (e) { v.warnings.push('permissions.json оқылмады — еленбейді.'); }
    }
    for (const n of files.keys()) {
      if (/\.(js|json)$/.test(n)) { try { new TextDecoder('utf-8', { fatal: true }).decode(files.get(n)); } catch (e) { v.errors.push('Файл UTF-8 мәтіні емес: ' + n); } }
      if (n.endsWith('.json') && n !== 'manifest.json') { try { JSON.parse(files.get(n).toString('utf8').replace(/^﻿/, '')); } catch (e) { v.warnings.push('JSON файлы оқылмайды: ' + n); } }
    }
    const archiveSha = sha256(buf);
    const res = {
      fileName, sha256: archiveSha, size: buf.length, count: files.size, ok: v.ok && !v.errors.length, errors: v.errors, warnings: v.warnings,
      manifest: v.ok ? v.manifest : null, reasons, compat: null, existing: null, token: null, icon: null, source,
    };
    if (!res.ok) return res;
    const m = v.manifest;
    res.compat = M.compatibility(m, this.env);
    const ex = this.get(m.id);
    if (ex) res.existing = { version: ex.manifest ? ex.manifest.version : '?', granted: ex.granted, cmp: ex.manifest ? M.compareVersions(m.version, ex.manifest.version) : 1 };
    if (m.icon && files.has(m.icon)) res.icon = iconUrl(m.icon, files.get(m.icon));
    if (!res.compat.ok) return res;
    // Растауға дейін тек жадта сақталады
    const token = crypto.randomBytes(16).toString('hex');
    for (const [k, s] of this.staged) if (Date.now() - s.at > STAGE_TTL) this.staged.delete(k);
    this.staged.set(token, { at: Date.now(), files, manifest: m, sha: archiveSha, reasons, source });
    res.token = token;
    return res;
  }

  /** Растаудан кейін орнату. grants — пайдаланушы берген рұқсаттар (манифестте сұралғандардың ішінен). */
  install(token, grants) {
    const s = this.staged.get(String(token || ''));
    if (!s) throw new Error('Орнату сеансы табылмады не мерзімі өтті — файлды қайта таңдаңыз.');
    this.staged.delete(token);
    const m = s.manifest;
    const granted = (Array.isArray(grants) ? grants : []).filter(p => m.permissions.includes(p) && M.PERMISSIONS[p] && M.PERMISSIONS[p].available);
    fs.mkdirSync(this.instDir, { recursive: true });
    const tmp = path.join(this.instDir, '.tmp-' + crypto.randomBytes(6).toString('hex'));
    const dest = path.join(this.instDir, m.id);
    const old = path.join(this.instDir, '.old-' + crypto.randomBytes(6).toString('hex'));
    const hashes = {};
    try {
      for (const [name, data] of s.files) {
        const f = path.join(tmp, ...name.split('/'));
        if (!path.resolve(f).startsWith(path.resolve(tmp) + path.sep)) throw new Error('Жол архив қалтасынан шығады: ' + name);
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, data, { flag: 'wx' });
        hashes[name] = sha256(data);
      }
      fs.writeFileSync(path.join(tmp, Z.META_FILE), JSON.stringify({ archive_sha256: s.sha, files: hashes, reasons: s.reasons, installed_at: new Date().toISOString() }, null, 1));
      const had = fs.existsSync(dest);
      if (had) fs.renameSync(dest, old);
      try { fs.renameSync(tmp, dest); }
      catch (e) { if (had) fs.renameSync(old, dest); throw e; }
      if (had) fs.rmSync(old, { recursive: true, force: true });
    } catch (e) {
      fs.rmSync(tmp, { recursive: true, force: true });
      throw new Error('Плагин орнатылмады: ' + e.message);
    }
    const prev = this.state.plugins[m.id] || {};
    const now = new Date().toISOString();
    this.state.plugins[m.id] = { enabled: true, granted, settings: prev.settings || {}, installed_at: prev.installed_at || now, updated_at: now, version: m.version, sha256: s.sha, source: s.source === 'official' ? 'official' : 'file' };
    this.writeState();
    return this.get(m.id);
  }

  setEnabled(id, on) { this.patch(id, { enabled: !!on }); }
  setGrants(id, grants) {
    const p = this.must(id);
    this.patch(id, { granted: (Array.isArray(grants) ? grants : []).filter(x => p.manifest.permissions.includes(x) && M.PERMISSIONS[x].available) });
  }
  setSettings(id, values) {
    const p = this.must(id);
    const out = {};
    for (const s of p.manifest.settings) out[s.key] = M.settingValue(s, values && typeof values === 'object' ? values[s.key] : undefined);
    this.patch(id, { settings: out });
    return out;
  }
  setSuspended(on) { this.state.suspended = !!on; this.writeState(); }
  must(id) {
    const p = this.get(String(id || ''));
    if (!p || !p.manifest) throw new Error('Плагин табылмады не манифесі бүлінген.');
    return p;
  }
  patch(id, o) {
    if (!this.get(String(id || ''))) throw new Error('Плагин табылмады.');
    this.state.plugins[id] = { ...(this.state.plugins[id] || {}), ...o };
    this.writeState();
  }

  /** Жою: тек плагин файлдары (және сұралса — оның жеке деректері). Жоба деректері өзгермейді. */
  uninstall(id, opts = {}) {
    id = String(id || '');
    const dir = path.join(this.instDir, id);
    if (!/^[a-z0-9.-]+$/.test(id) || !fs.existsSync(dir)) throw new Error('Плагин табылмады.');
    const trash = path.join(this.instDir, '.del-' + crypto.randomBytes(6).toString('hex'));
    fs.renameSync(dir, trash);
    fs.rmSync(trash, { recursive: true, force: true });
    if (opts.data) fs.rmSync(path.join(this.dataDir, id), { recursive: true, force: true });
    delete this.state.plugins[id];
    this.writeState();
  }

  /* ---------- Плагиннің жеке деректері (mura.storage): data/<id>/storage.json, шегі 5 МБ ---------- */
  storageFile(id) { return path.join(this.dataDir, id, 'storage.json'); }
  storageRead(id) { try { const j = JSON.parse(fs.readFileSync(this.storageFile(id), 'utf8')); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch (e) { return {}; } }
  storageWrite(id, obj) {
    const s = JSON.stringify(obj);
    if (s.length > 5 * 1024 * 1024) throw new Error('Плагин деректерінің шегі (5 МБ) асып кетті.');
    const f = this.storageFile(id);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f + '.tmp', s);
    if (fs.existsSync(f)) { try { fs.copyFileSync(f, f + '.bak'); } catch (e) { /* елемейміз */ } }
    fs.renameSync(f + '.tmp', f);
  }

  /** Плагин файлын оқу (sandbox протоколы үшін): тек орнатылған қалтаның ішінен, тек тұтастық тізіміндегі файл. */
  readFile(p, rel) {
    if (!M.safePath(rel) || rel === Z.META_FILE) return null;
    if (!p.integrity || !p.integrity.files || !Object.prototype.hasOwnProperty.call(p.integrity.files, rel)) return null;
    const f = path.join(p.dir, ...rel.split('/'));
    if (!path.resolve(f).startsWith(path.resolve(p.dir) + path.sep)) return null;
    try { return fs.readFileSync(f); } catch (e) { return null; }
  }
  iconOf(p) {
    if (!p.manifest || !p.manifest.icon) return null;
    const b = this.readFile(p, p.manifest.icon);
    return b ? iconUrl(p.manifest.icon, b) : null;
  }
}

/** Белгіше — data: URL (<img> ішінде ғана көрсетіледі: SVG ішіндегі скрипт <img>-де орындалмайды). */
function iconUrl(name, buf) {
  if (buf.length > 256 * 1024) return null;
  return 'data:' + (/\.svg$/i.test(name) ? 'image/svg+xml' : 'image/png') + ';base64,' + buf.toString('base64');
}

module.exports = { PluginManager };
