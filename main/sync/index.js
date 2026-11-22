/* Синхрондау (Desktop): аккаунт, синхрондалатын жобалар тізімі, кезек және кесте.
   Ортақ ережелер — engine.js, сақтау қызметі — gdrive.js (+ google-auth.js). Кейінгі қызметтер (OneDrive, Dropbox)
   PROVIDERS тізіміне өз модулімен қосылады: { auth (signIn/token/signOut), store (list/read/write/account) }.

   Құрылғыдағы файлдар (userData/sync/):
     account.json                 — қосылған қызмет пен аккаунт (id, e-mail, аты); құпия емес;
     <қызмет>.token               — жаңарту токені, safeStorage-пен шифрланған;
     <аккаунт кілті>/registry.json — осы аккаунтта синхрондалатын жобалар: жоба id → .gpkg жолы, соңғы синхрон, күтілетін өзгерістер;
     <аккаунт кілті>/state-<id>.json — жобаның синхрондау күйі (engine.js newState).
   Күй мен кезек сақтау қызметі мен аккаунтқа тиесілі: аккаунт ауысса, жергілікті жобалар жаңа қоймаға тек пайдаланушы
   «Осы жобаны синхрондау» батырмасын басқанда жүктеледі. Жобаның өз id-і — .gpkg ішіндегі mura_project.sync_id (16 hex).
   Синхрондау тек ескерткіштер (marks) мен маршруттарды (routes) және жоба мәліметтерін (атауы, облысы, ауданы) қамтиды. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const E = require('./engine');
const { GoogleDrive } = require('./gdrive');
const { GoogleAuth } = require('./google-auth');

const INTERVAL = 5 * 60 * 1000;      // жұмыс кезінде мерзімді синхрондау
const SOON = 4000;                   // жергілікті өзгерістен кейін
const ONLINE_POLL = 20000;

/* ---------- Файлдар: .tmp → rename, алдыңғы күй .bak ---------- */
function readJson(f, def) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { try { return JSON.parse(fs.readFileSync(f + '.bak', 'utf8')); } catch (e2) { return def; } } }
function writeJson(f, v) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(v));
  try { if (fs.existsSync(f)) fs.copyFileSync(f, f + '.bak'); } catch (e) { /* көшірме — міндетті емес */ }
  fs.renameSync(tmp, f);
}

/* ---------- Ашық не жабық .gpkg жобасы — қозғалтқышқа арналған жергілікті интерфейс ---------- */
const LAYER = { mark: 'marks', route: 'routes' };
function gpkgLocal(project) {
  const valid = r => r && typeof r === 'object' && /^[0-9a-f]{16}$/.test(String(r.id || ''));
  return {
    snapshot() {
      const out = [];
      for (const [t, layer] of Object.entries(LAYER)) {
        for (const r of project.load(layer)) if (valid(r)) out.push({ t, id: r.id, d: r });
      }
      return out;
    },
    apply({ puts, dels }) {
      const by = { mark: { puts: [], dels: new Set() }, route: { puts: [], dels: new Set() } };
      for (const p of puts) if (by[p.t]) by[p.t].puts.push(p.d);
      for (const d of dels) if (by[d.t]) by[d.t].dels.add(d.id);
      project.tx(() => {
        for (const [t, x] of Object.entries(by)) {
          if (!x.puts.length && !x.dels.size) continue;
          const items = project.load(LAYER[t]).filter(r => !x.dels.has(r.id));
          const index = new Map(items.map((r, i) => [r.id, i]));
          for (const d of x.puts) {
            const rec = clean(t, d);
            if (!rec) continue;
            if (index.has(rec.id)) items[index.get(rec.id)] = rec; else { index.set(rec.id, items.length); items.push(rec); }
          }
          project.writeRows(LAYER[t], items);
        }
      });
      if (project.onChange) project.onChange();
    },
    meta() { const m = project.meta(); return { name: m.name || '', oblast: m.oblast || '', district: m.district || '' }; },
    setMeta(m) { project.setMeta({ name: m.name || project.meta().name || '', oblast: m.oblast || '', district: m.district || '' }); },
  };
}
/** Бұлттан келген жазбаның ең аз тексерісі (геометрия жарамды болуы керек); қалған өрістер өзгеріссіз сақталады. */
function clean(t, d) {
  if (!d || typeof d !== 'object') return null;
  const r = JSON.parse(JSON.stringify(d));
  if (t === 'mark') {
    const lat = Number(r.lat), lon = Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    r.lat = lat; r.lon = lon;
    return r;
  }
  const pts = (Array.isArray(r.pts) ? r.pts : []).map(p => [Number(p && p[0]), Number(p && p[1])]).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180);
  if (pts.length < 2) return null;
  r.pts = pts;
  return r;
}

/* ======================= Басқарушы ======================= */
class SyncManager {
  /**
   * dir — userData/sync; projects — main/projects.js; Project — main/gpkg.js;
   * crypt — { available(), encrypt(s) → Buffer, decrypt(buf) → s } (safeStorage, async);
   * http — fetch (Electron net.fetch); online() — желі бар ма; openExternal; device — { name, platform, app };
   * prefs — main/prefs.js; config — { google: { clientId, clientSecret } }; authPage(ok) — браузердегі жауап беті;
   * onStatus(status) — интерфейске; onApplied(projectId) — ашық жоба өзгерді.
   */
  constructor(o) {
    Object.assign(this, { dir: o.dir, projects: o.projects, Project: o.Project, crypt: o.crypt, http: o.http, online: o.online, prefs: o.prefs,
      onStatus: o.onStatus || (() => {}), onApplied: o.onApplied || (() => {}) });
    this.deviceInfo = o.device || {};
    this.config = o.config || {};
    this.st = { state: 'off', code: '', detail: '', syncing: false };
    this.cloudList = [];
    this.timer = null; this.soon = null; this.poll = null; this.wasOnline = true;
    this.running = null; this.again = false;
    this.account = readJson(path.join(this.dir, 'account.json'), null);
    this.secure = true;
    Promise.resolve(this.crypt.available()).then(v => { this.secure = !!v; }, () => { this.secure = false; });
    const tokenFile = path.join(this.dir, 'gdrive.token');
    const vault = {
      load: async () => (fs.existsSync(tokenFile) ? this.crypt.decrypt(fs.readFileSync(tokenFile)) : null),
      save: async s => {
        if (!(await this.crypt.available())) throw Object.assign(new Error('secure storage unavailable'), { code: 'vault' });
        const buf = await this.crypt.encrypt(s);
        fs.mkdirSync(this.dir, { recursive: true }); fs.writeFileSync(tokenFile + '.tmp', buf); fs.renameSync(tokenFile + '.tmp', tokenFile);
      },
      clear: async () => fs.rmSync(tokenFile, { force: true }),
    };
    const g = this.config.google || {};
    this.auth = new GoogleAuth({ clientId: g.clientId, clientSecret: g.clientSecret, vault, openExternal: o.openExternal, fetch: this.http, page: o.authPage });
    this.store = new GoogleDrive({ fetch: this.http, token: f => this.auth.token(f) });
  }

  /* ---------- Құрылғы, аккаунт, тізім ---------- */
  device() {
    let d = this.prefs.get('sync_device', null);
    if (!d || !/^[0-9a-f]{16}$/.test(String(d.id || ''))) { d = { id: E.newId() }; this.prefs.set('sync_device', d); }
    return { id: d.id, name: this.deviceInfo.name || '', platform: this.deviceInfo.platform || 'desktop', app: this.deviceInfo.app || '' };
  }
  akey() { return this.account ? this.account.provider + '-' + crypto.createHash('sha1').update(String(this.account.id)).digest('hex').slice(0, 12) : ''; }
  adir() { return path.join(this.dir, this.akey()); }
  registry() { const r = this.account ? readJson(path.join(this.adir(), 'registry.json'), null) : null; return r && r.projects ? r : { projects: {}, index: '' }; }
  saveRegistry(r) { writeJson(path.join(this.adir(), 'registry.json'), r); }
  stateFile(pid) { return path.join(this.adir(), 'state-' + pid + '.json'); }
  loadState(pid) { return E.fixState(readJson(this.stateFile(pid), null), pid, this.device().id); }

  /** Ашық жобаның синхрондау id-і (бар болса). */
  currentId() { const p = this.projects.current; const id = p ? String(p.meta().sync_id || '') : ''; return /^[0-9a-f]{16}$/.test(id) ? id : ''; }
  isLinked(pid) { return !!(pid && this.registry().projects[pid]); }

  /* ---------- Күй (интерфейске) ---------- */
  status() {
    const reg = this.registry();
    const cur = this.projects.current;
    const cid = this.currentId();
    const linked = Object.entries(reg.projects).map(([id, x]) => {
      const st = this.loadState(id);
      return { id, name: x.name || '', oblast: x.oblast || '', district: x.district || '', path: x.path || '', exists: !!x.path && fs.existsSync(x.path),
        current: !!cur && samePath(cur.file, x.path || ''), last_sync: st.last_sync || x.last_sync || '', pending: +x.pending || 0, error: x.error || '',
        conflicts: Object.entries(st.conflicts).map(([key, c]) => ({ key, t: c.t, id: c.id, since: c.since, local: summary(c.local), remote: summary(c.remote) })) };
    });
    const lastSync = linked.map(x => x.last_sync).filter(Boolean).sort().pop() || '';
    return {
      providers: [{ id: 'gdrive', name: 'Google Drive', available: true }, { id: 'onedrive', name: 'Microsoft OneDrive', available: false }, { id: 'dropbox', name: 'Dropbox', available: false }],
      provider: 'gdrive', configured: this.auth.configured(), secure: this.secure,
      account: this.account ? { provider: this.account.provider, email: this.account.email, name: this.account.name } : null,
      state: this.st.state, code: this.st.code, detail: this.st.detail, syncing: this.st.syncing,
      last_sync: lastSync, pending: linked.reduce((s, x) => s + x.pending, 0), conflicts: linked.reduce((s, x) => s + x.conflicts.length, 0),
      current: cur ? { id: cid, linked: this.isLinked(cid), name: cur.meta().name || '', path: cur.file, dirty: cur.dirty() } : null,
      projects: linked,
      cloud: this.cloudList.filter(p => !reg.projects[p.id]),
    };
  }
  emit() { try { this.onStatus(this.status()); } catch (e) { /* интерфейс жабық */ } }
  set(state, code = '', detail = '') { this.st.state = state; this.st.code = code; this.st.detail = detail; this.emit(); }

  /* ---------- Қосу / ажырату ---------- */
  async connect() {
    if (!this.auth.configured()) throw Object.assign(new Error('OAuth client not configured'), { code: 'config' });
    if (!(await this.crypt.available())) throw Object.assign(new Error('secure storage unavailable'), { code: 'vault' });
    await this.auth.signIn();
    const a = await this.store.account();
    this.account = { provider: 'gdrive', id: a.id, email: a.email, name: a.name, connected_at: new Date().toISOString() };
    writeJson(path.join(this.dir, 'account.json'), this.account);
    this.start();
    this.syncAll('connect').catch(() => {});
    return this.status();
  }
  cancelConnect() { this.auth.cancel(); }

  /** Ажырату: синхрондау тоқтайды, токен өшіріледі; құрылғыдағы жобалар мен синхрондау күйі сақталады (сол аккаунтқа қайта қосылса — жалғасады). */
  async disconnect() {
    this.stop();
    await this.auth.signOut();
    this.account = null;
    fs.rmSync(path.join(this.dir, 'account.json'), { force: true });
    this.cloudList = [];
    this.set('off');
    return this.status();
  }

  /** Ашық жобаны синхрондауға қосу (пайдаланушы келісімімен): жоба файлына sync_id жазылады. */
  async linkCurrent() {
    const p = this.projects.current;
    if (!p || !this.account) throw new Error('no project');
    let id = this.currentId();
    if (!id) { id = E.newId(); p.setMeta({ sync_id: id }); }
    const reg = this.registry();
    const m = p.meta();
    reg.projects[id] = { path: p.file, name: m.name || '', oblast: m.oblast || '', district: m.district || '', linked_at: new Date().toISOString(), pending: 0 };
    this.saveRegistry(reg);
    this.syncAll('link').catch(() => {});
    return this.status();
  }
  /** Жобаны синхрондаудан шығару: жергілікті файл да, бұлттағы көшірме де өзгермейді. */
  unlink(pid) {
    const reg = this.registry();
    delete reg.projects[pid];
    this.saveRegistry(reg);
    fs.rmSync(this.stateFile(pid), { force: true });
    this.syncAll('unlink').catch(() => {});
    return this.status();
  }
  /** Бұлттағы жобаны осы компьютерге алу: жаңа .gpkg құрылып, синхрондалады. */
  async download(pid, file) {
    const c = this.cloudList.find(x => x.id === pid) || { id: pid, name: '' };
    const p = this.Project.create(file, { format: 'mura-gis-project/1', created_at: new Date().toISOString(), name: c.name || path.basename(file, '.gpkg'), oblast: c.oblast || '', district: c.district || '', sync_id: pid, app_version: this.deviceInfo.app || '' });
    p.close();
    const reg = this.registry();
    reg.projects[pid] = { path: path.resolve(file), name: c.name || '', oblast: c.oblast || '', district: c.district || '', linked_at: new Date().toISOString(), pending: 0 };
    this.saveRegistry(reg);
    await this.syncAll('download');
    return path.resolve(file);
  }
  /** Жоба файлы жылжытылса — жаңа жолын көрсету. */
  relink(pid, file) {
    const reg = this.registry();
    if (!reg.projects[pid]) return this.status();
    const p = this.Project.open(file);
    try { if (String(p.meta().sync_id || '') !== pid) throw Object.assign(new Error('another project'), { code: 'mismatch' }); } finally { p.close(); }
    reg.projects[pid].path = path.resolve(file);
    this.saveRegistry(reg);
    this.syncAll('relink').catch(() => {});
    return this.status();
  }

  /* ---------- Кесте ---------- */
  start() {
    this.stop();
    if (!this.account) return;
    this.timer = setInterval(() => this.syncAll('timer').catch(() => {}), INTERVAL);
    this.wasOnline = this.online();
    this.poll = setInterval(() => {
      const on = this.online();
      if (on && !this.wasOnline) this.syncAll('online').catch(() => {});
      else if (!on && this.wasOnline && this.st.state !== 'syncing') this.set('offline', 'offline');
      this.wasOnline = on;
    }, ONLINE_POLL);
  }
  stop() { clearInterval(this.timer); clearInterval(this.poll); clearTimeout(this.soon); this.timer = this.poll = this.soon = null; }

  /** Ашық жобада жергілікті өзгеріс болды: күтілетін санды жаңартып, біраздан кейін синхрондау. */
  localChanged() {
    if (!this.account) return;
    const pid = this.currentId();
    if (!this.isLinked(pid)) return;
    try {
      const reg = this.registry();
      reg.projects[pid].pending = E.pendingCount(gpkgLocal(this.projects.current).snapshot(), this.loadState(pid));
      this.saveRegistry(reg);
    } catch (e) { /* санау — міндетті емес */ }
    this.emit();
    clearTimeout(this.soon);
    this.soon = setTimeout(() => this.syncAll('change').catch(() => {}), SOON);
  }

  /** Барлық синхрондалатын жобаны синхрондау (бір уақытта біреуі; қатар сұралса — аяқталған соң тағы бір рет). */
  async syncAll(reason) {
    if (!this.account) return;
    if (this.running) { this.again = true; return this.running; }
    this.running = this.run(reason).finally(() => { this.running = null; if (this.again) { this.again = false; this.syncAll('again').catch(() => {}); } });
    return this.running;
  }

  async run() {
    if (!this.online()) { this.set('offline', 'offline'); return; }
    this.st.syncing = true; this.set('syncing');
    const device = this.device();
    let first = null;
    try {
      const files = await this.store.list();
      const reg = this.registry();
      let applied = false;
      for (const [pid, x] of Object.entries(reg.projects)) {
        x.error = '';
        const cur = this.projects.current;
        const isCur = !!cur && samePath(cur.file, x.path || '');
        if (!isCur && !(x.path && fs.existsSync(x.path))) { x.error = 'missing'; continue; }
        if (isCur && cur.dirty()) { x.error = 'unsaved'; continue; }      // авто сақтау өшік, сақталмаған өзгеріс бар — сақтағаннан кейін
        const p = isCur ? cur : this.Project.open(x.path);
        try {
          if (String(p.meta().sync_id || '') !== pid) { x.error = 'mismatch'; continue; }
          const local = gpkgLocal(p);
          const state = this.loadState(pid);
          const rep = await E.syncProject({ cloud: this.store, files, local, state, device, persist: s => writeJson(this.stateFile(pid), s) });
          const m = local.meta();
          Object.assign(x, { name: m.name, oblast: m.oblast, district: m.district, last_sync: state.last_sync, pending: 0 });
          if (isCur && (rep.applied || rep.deleted)) applied = true;
        } catch (e) {
          x.error = e.code || 'error';
          if (!first) first = e;
          if (['offline', 'auth', 'quota', 'rate', 'server'].includes(e.code)) break;   // қалған жобалар — келесі жолы
        } finally { if (!isCur) p.close(); }
      }
      this.saveRegistry(reg);
      if (applied) this.onApplied(this.currentId());
      if (!first) {
        // Құрылғының жобалар тізімі (басқа құрылғыларда «Бұлттағы жобалар» үшін)
        const list = Object.entries(reg.projects).map(([id, x]) => ({ id, name: x.name, oblast: x.oblast, district: x.district, updated_at: x.last_sync }));
        const h = E.canon(list.map(x => [x.id, x.name, x.oblast, x.district]));
        const mine = E.indexName(device.id);
        if (reg.index !== h || !files.some(f => f.name === mine)) {
          await this.store.write(mine, E.indexDoc(device, list));
          reg.index = h; this.saveRegistry(reg);
        }
        this.cloudList = await E.cloudProjects(this.store, files);
      }
    } catch (e) { first = first || e; }
    this.st.syncing = false;
    if (first) this.set(stateOf(first), first.code || 'error', first.message || '');
    else this.set('idle');
  }

  async resolve(pid, key, choice) {
    const reg = this.registry();
    const x = reg.projects[pid];
    if (!x) throw new Error('not linked');
    const cur = this.projects.current;
    const isCur = !!cur && samePath(cur.file, x.path || '');
    const p = isCur ? cur : this.Project.open(x.path);
    try {
      const state = this.loadState(pid);
      await E.resolveConflict({ local: gpkgLocal(p), state, key, choice: choice === 'remote' ? 'remote' : 'local', persist: s => writeJson(this.stateFile(pid), s) });
      if (isCur && choice === 'remote') this.onApplied(pid);
    } finally { if (!isCur) p.close(); }
    this.syncAll('resolve').catch(() => {});
    return this.status();
  }
}

const stateOf = e => ({ offline: 'offline', auth: 'auth', quota: 'quota', rate: 'error', server: 'error', config: 'error', vault: 'error' }[e && e.code] || 'error');
const samePath = (a, b) => (process.platform === 'linux' ? path.resolve(a) === path.resolve(b) : path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase());
/** Қайшылықтағы бір нұсқаның қысқаша сипаты (интерфейске). */
function summary(v) {
  if (!v) return null;
  if (v.del) return { del: true, at: v.at || '', dev: v.dn || '' };
  const d = v.d || {};
  return { del: false, at: v.at || d.updated_at || '', dev: v.dn || '', by: d.updated_by || '', name: d.name || d.name_ru || '', lat: d.lat, lon: d.lon,
    pts: Array.isArray(d.pts) ? d.pts.length : undefined, note: String(d.note || '').slice(0, 200), period: d.period || '' };
}

module.exports = { SyncManager, gpkgLocal };
