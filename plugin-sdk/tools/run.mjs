#!/usr/bin/env node
/* Жергілікті тестілеу құралы: плагинді Mura GIS-сіз іске қосып, команданы орындау.
     node tools/run.mjs <плагин қалтасы> <команда> [--fixture деректер.json] [--point zone.export] [--grant all|p1,p2] [--out қалта]
   Плагинге Plugin API 1-дің жалған (mock) нұсқасы беріледі: деректер — fixture-ден, диалогтар автоматты жауап береді
   (answers.dialog: "primary" не батырма id-і; answers.values — диалог өрістерінің мәндері), export.saveFile файлды --out қалтасына жазады, барлық шақыру журналға шығады.
   Рұқсаттар Mura GIS-тегідей тексеріледі (әдепкі — манифестте сұралғанның бәрі берілген). Желі — тек network.access берілсе.
   НАЗАР: бұл құрал плагинді node:vm ішінде орындайды — бұл ҚАУІПСІЗДІК ШЕКАРАСЫ ЕМЕС, тек өз кодыңызды тексеруге арналған.
   Нағыз оқшаулау (бөлек процесс, sandbox, желі бұғаты) — тек Mura GIS бағдарламасының ішінде. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const M = require('../lib/manifest.cjs');
const GEO = require('../lib/geo.js');
const AT = require('../lib/attrs.js');
const LY = require('../lib/layers.cjs');
const HERE = path.dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const opt = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const [dir, command] = pos;

export async function run({ dir, command, fixture, point, grant, out, quiet }) {
  const log = (...a) => { if (!quiet) console.log(...a); };
  const v = M.validateManifest(JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')));
  if (!v.ok) throw new Error('Манифест қатесі:\n  ' + v.errors.join('\n  '));
  const m = v.manifest;
  const fx = fixture || JSON.parse(fs.readFileSync(path.join(HERE, 'fixture.json'), 'utf8'));
  const granted = grant && grant !== 'all' ? grant.split(',').filter(p => m.permissions.includes(p)) : m.permissions.filter(p => M.PERMISSIONS[p].available);
  const settings = {};
  for (const s of m.settings) settings[s.key] = M.settingValue(s, fx.settings ? fx.settings[s.key] : undefined);
  const pt = point || Object.keys(m.contributes).find(k => m.contributes[k].some(c => c.command === command)) || 'tools.menu';
  if (!(m.contributes[pt] || []).some(c => c.command === command)) throw new Error('«' + command + '» командасы манифестте ' + pt + ' үшін жарияланбаған.');
  const calls = [], saved = [], storage = JSON.parse(JSON.stringify(fx.storage || {}));     // fixture.storage — бастапқы mura.storage
  const panelFns = [];
  let lastPanel = null;
  const key = k => { if (typeof k !== 'string' || !/^[\w.\-:]{1,128}$/.test(k)) throw new Error('storage: кілт — 1–128 таңбалы жол (латын әріп, сан, _ . - :)'); return k; };
  const need = p => { if (!granted.includes(p)) { const e = new Error('Рұқсат жоқ: ' + p); e.code = 'permission'; throw e; } };
  const rows = l => { if (!LY.LAYERS.includes(l)) throw new Error('Белгісіз қабат: ' + l); return (fx.layers && fx.layers[l]) || []; };
  const clone = o => JSON.parse(JSON.stringify(o === undefined ? null : o));
  const sel = () => LY.selection(fx.selection);
  const call = async (name, fn) => { calls.push(name); log('  → mura.' + name); return clone(await fn()); };
  const ans = JSON.parse(JSON.stringify(fx.answers || {}));
  const dialogAnswer = spec => {
    const btns = (spec && spec.buttons) || [{ id: 'ok', primary: true }];
    const seq = Array.isArray(ans.buttons) && ans.buttons.length ? ans.buttons.shift() : null;     // answers.buttons — диалогтар бойынша кезек
    const id = seq || (ans.dialog === 'primary' || !ans.dialog ? (btns.find(b => b.primary) || btns[0]).id : ans.dialog);
    const values = {};
    for (const b of (spec && spec.body) || []) if (b.type === 'field') values[b.key] = ans.values && Object.prototype.hasOwnProperty.call(ans.values, b.key) ? ans.values[b.key] : b.value;
    log('    [диалог] ' + M.localize(spec && spec.title, fx.lang) + ' → ' + id);
    for (const b of (spec && spec.body) || []) if (b.type === 'text' || b.type === 'heading') log('      ' + b.text); else if (b.type === 'list') b.items.forEach(x => log('      • ' + x));
    return { button: id, values };
  };
  const dicts = {};
  const readOwn = rel => { const f = path.resolve(dir, String(rel).replace(/^\/+/, '')); if (!f.startsWith(path.resolve(dir) + path.sep)) throw new Error('Плагин қалтасынан тыс файл'); return fs.readFileSync(f); };
  const loadLocale = async l => { if (!dicts[l]) { try { dicts[l] = JSON.parse(readOwn('locales/' + l + '.json')); } catch (e) { dicts[l] = {}; } } return dicts[l]; };
  await loadLocale(fx.lang || 'kk');
  const mura = {
    apiVersion: '1',
    app: Object.freeze({ version: fx.appVersion || '2.2.0', platform: 'desktop', lang: fx.lang || 'kk', docLang: fx.docLang || fx.lang || 'kk' }),
    plugin: Object.freeze({ id: m.id, version: m.version, permissions: granted }),
    hasPermission: p => granted.includes(p),
    commands: { register: (n, fn) => { commands.set(n, fn); } },
    settings: { get: () => call('settings.get', () => settings) },
    storage: { get: k => call('storage.get', () => storage[key(k)] ?? null), set: (k, val) => call('storage.set', () => { storage[key(k)] = clone(val); return true; }), remove: k => call('storage.remove', () => { delete storage[key(k)]; return true; }), keys: () => call('storage.keys', () => Object.keys(storage)) },
    project: { info: () => call('project.info', () => { need('project.metadata'); return fx.project || { open: false }; }) },
    geometry: {
      selection: () => call('geometry.selection', () => { need('geometry.read'); const s = sel(); return s && { layer: s.layer, id: s.id, saved: s.saved, geometry: s.geometry }; }),
      list: (l, o = {}) => call('geometry.list', () => { need('geometry.read'); return rows(l).map(r => ({ id: r.id, geometry: LY.geometry(l, r) })).filter(x => x.geometry).slice(o.offset || 0, (o.offset || 0) + (o.limit || 5000)); }),
      get: (l, id) => call('geometry.get', () => { need('geometry.read'); const r = rows(l).find(x => x.id === id); return r ? { id: r.id, geometry: LY.geometry(l, r) } : null; }),
      type: GEO.type, bbox: GEO.bbox, area: GEO.area, orient: GEO.orient, validate: GEO.validate, transform: GEO.transform, supported: GEO.supported, utmFor: GEO.utmFor,
    },
    attributes: {
      selection: () => call('attributes.selection', () => { need('attributes.read'); const s = sel(); return s && { layer: s.layer, id: s.id, saved: s.saved, attributes: s.attributes }; }),
      list: (l, o = {}) => call('attributes.list', () => { need('attributes.read'); return rows(l).slice(o.offset || 0, (o.offset || 0) + (o.limit || 5000)).map(r => ({ id: r.id, attributes: LY.attributes(l, r) })); }),
      get: (l, id) => call('attributes.get', () => { need('attributes.read'); const r = rows(l).find(x => x.id === id); return r ? { id: r.id, attributes: LY.attributes(l, r) } : null; }),
      map: AT.map, validate: AT.validate, checkSchema: AT.checkSchema,
    },
    map: Object.fromEntries(['addLayer', 'removeLayer', 'clearLayers', 'showTemporary', 'clearTemporary', 'registerSymbol', 'pick'].map(k => [k, (...a) => call('map.' + k, () => { need('map.layers'); return k === 'pick' ? (ans.pick || null) : true; })])),
    export: {
      saveFile: o => call('export.saveFile', () => {
        need('files.export');
        const name = String(o && o.suggestedName || 'export').replace(/[\\/:*?"<>|]+/g, '_');
        const dest = path.join(out, name);
        fs.mkdirSync(out, { recursive: true });
        const d = o.data;
        fs.writeFileSync(dest, typeof d === 'string' ? d : d instanceof ArrayBuffer ? Buffer.from(d) : ArrayBuffer.isView(d) ? Buffer.from(d.buffer, d.byteOffset, d.byteLength) : JSON.stringify(d));
        saved.push(dest); log('    [файл] ' + dest);
        return { saved: true, name };
      }),
    },
    files: {
      // files.import: тестте «Ашу» терезесінің орнына fixture.files (жолдар тізімі) беріледі
      // (JSON көшірмесінсіз: бағдарламадағыдай data — Uint8Array)
      open: async () => { calls.push('files.open'); log('  → mura.files.open'); need('files.import'); return (fx.files || []).map(p => { const b = fs.readFileSync(path.resolve(fx.__dir || process.cwd(), p)); return { name: path.basename(p), size: b.length, data: new Uint8Array(b) }; }); },
    },
    ui: {
      notify: (t) => call('ui.notify', () => { log('    [хабар] ' + t); return true; }),
      confirm: (t) => call('ui.confirm', () => { log('    [растау] ' + t + ' → ' + (ans.confirm !== false)); return ans.confirm !== false; }),
      dialog: spec => call('ui.dialog', () => dialogAnswer(spec)),
      panel: { open: spec => call('ui.panel.open', () => { lastPanel = spec; log('    [панель] ' + M.localize(spec && spec.title, fx.lang)); return { id: 'p1' }; }).then(r => ({ id: r.id, update: async s => { lastPanel = s; return true; }, close: async () => true, onAction(fn) { if (typeof fn === 'function') panelFns.push(fn); }, onClose() {} })) },
    },
    i18n: {
      t: (k, vars, l) => { let s = (dicts[l || fx.lang || 'kk'] || {})[k] ?? k; if (vars) s = String(s).replace(/\{(\w+)\}/g, (_, x) => vars[x] ?? ''); return s; },
      ready: async () => true, load: loadLocale,
    },
    log: { info: (...a) => log('    [log] ' + a.join(' ')), warn: (...a) => log('    [warn] ' + a.join(' ')), error: (...a) => log('    [error] ' + a.join(' ')) },
  };
  const commands = new Map();
  const ownFetch = async (u) => {
    const s = String(u);
    if (/^https?:/i.test(s)) { if (!granted.includes('network.access')) throw new TypeError('Failed to fetch (network.access рұқсаты жоқ)'); return fetch(s); }
    const b = readOwn(s);
    return { ok: true, status: 200, json: async () => JSON.parse(b.toString('utf8')), text: async () => b.toString('utf8'), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  };
  const ctxObj = { mura: Object.freeze(mura), fetch: ownFetch, console, setTimeout, clearTimeout, TextEncoder, TextDecoder, URL, btoa, atob, structuredClone,
    DecompressionStream, CompressionStream, performance };
  ctxObj.globalThis = ctxObj;
  const context = vm.createContext(ctxObj);
  // Плагин өз файлдарын <script> арқылы қоса алады (браузердегідей): тестте сол файл осы ортада орындалады
  ctxObj.document = {
    createElement: () => ({}),
    head: { appendChild: s => { setTimeout(() => { try { vm.runInContext(readOwn(s.src).toString('utf8'), context, { filename: String(s.src) }); if (s.onload) s.onload(); } catch (e) { if (s.onerror) s.onerror(e); else throw e; } }, 0); return s; } },
  };
  vm.runInContext(fs.readFileSync(path.join(dir, m.entry), 'utf8'), context, { filename: m.entry });
  const fn = commands.get(command);
  if (!fn) throw new Error('Плагин «' + command + '» командасын тіркемеді (mura.commands.register).');
  log('▶ ' + m.id + ' · ' + pt + ' · ' + command + ' · рұқсаттар: ' + (granted.join(', ') || 'жоқ'));
  const ctx = Object.freeze({ point: pt, lang: fx.lang || 'kk', docLang: fx.docLang || fx.lang || 'kk', ...(pt === 'zone.export' && fx.selection ? { zone: { id: fx.selection.id || null, markId: fx.selection.markId || null, saved: !!fx.selection.saved } } : {}) });
  const result = await fn(ctx);
  // answers.panel — панель батырмаларын кезекпен басу (мыс. ["load"]); answers.panelValues — өрістер мәні
  for (const b of (ans.panel || [])) for (const f of panelFns) await f({ button: b, values: ans.panelValues || {} });
  log('✓ Нәтиже: ' + JSON.stringify(result));
  return { result, calls, saved, storage, panel: lastPanel };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!dir || !command) { console.error('Қолдану: node run.mjs <плагин қалтасы> <команда> [--fixture f.json] [--point zone.export] [--grant all|p1,p2] [--out қалта]'); process.exit(2); }
  const fixture = opt('fixture') ? { ...JSON.parse(fs.readFileSync(opt('fixture'), 'utf8')), __dir: path.dirname(path.resolve(opt('fixture'))) } : null;
  run({ dir, command, fixture, point: opt('point'), grant: opt('grant'), out: opt('out') || path.join(dir, 'out') })
    .catch(e => { console.error('✗ ' + (e.stack || e.message)); process.exit(1); });
}
