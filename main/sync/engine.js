/* Mura GIS: синхрондаудың ортақ қозғалтқышы — бұлт қызметіне (Google Drive, кейін OneDrive, Dropbox…) тәуелсіз.
   Android-та дәл осы ережелер: android/core/.../core/sync/SyncEngine.kt (екеуінің ортақ тест сценарийлері:
   scripts/test-sync.mjs және SyncEngineTest.kt, пішімнің кросс-тексеруі — DesktopCompatTest + scripts/sync-compat.mjs).

   Бұлттағы файлдар (қолданбаның жеке аумағы, мыс. Drive appDataFolder):
     mura.<жоба id>.<құрылғы id>.json — бір құрылғының бір жобадағы күйі: жоба мәліметтері және әр жазбаның
       соңғы нұсқасы (өшірілгендері — «tombstone»). Әр файлды тек өз құрылғысы жазады — бұлтта қатар жазу қайшылығы болмайды.
     mura.index.<құрылғы id>.json — құрылғы синхрондайтын жобалар тізімі (атауы, облысы) — «Бұлттағы жобалар» үшін.
   Жазба нұсқасы — нұсқа векторы (vv: { құрылғы id: санауыш }): бір нұсқа екіншісін «қамтыса» — жаңасы қабылданады,
   қатар (cc) өзгерген болса — қайшылық: екі нұсқа да сақталады, пайдаланушы таңдайды. Өшіру де нұсқа, сондықтан
   офлайн тұрған құрылғы өшірілген жазбаны қайта тірілтпейді, ал «өшірілді ↔ өңделді» қатар болса — қайшылық.
   Жергілікті өзгерісті табу — соңғы синхрондалған күймен салыстыру (мазмұн хеші): жазу жолына тәуелді емес,
   QGIS-те өңделген жоба да синхрондалады. */
'use strict';
const crypto = require('node:crypto');

const FORMAT = 'mura-sync/1';
const TYPES = ['mark', 'route'];
/** Мазмұнға кірмейтін өрістер: уақыт белгісі ғана өзгерсе — өзгеріс емес. */
const META = new Set(['id', 'created_at', 'created_by', 'updated_at', 'updated_by']);
const ID = /^[0-9a-f]{16}$/;

/* ======================= Нұсқа векторы ======================= */
/** a мен b-ны салыстыру: 'eq' — бірдей, 'gt' — a жаңа, 'lt' — b жаңа, 'cc' — қатар өзгерген. */
function vvCmp(a, b) {
  a = a || {}; b = b || {};
  let gt = false, lt = false;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = +a[k] || 0, y = +b[k] || 0;
    if (x > y) gt = true; else if (x < y) lt = true;
  }
  return gt && lt ? 'cc' : gt ? 'gt' : lt ? 'lt' : 'eq';
}
function vvMerge(a, b) {
  const o = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {})) o[k] = Math.max(+o[k] || 0, +v || 0);
  return o;
}
function vvBump(vv, dev) { const o = { ...(vv || {}) }; o[dev] = (+o[dev] || 0) + 1; return o; }

/* ======================= Мазмұн ======================= */
/** Салыстыруға арналған тұрақты мәтін: кілттер сұрыпталған, бос мәндер ('' / null / []) алынған, сандар 1e-7-ге дейін. */
function canon(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 1e7) / 1e7) : 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  const keys = Object.keys(v).filter(k => !isEmpty(v[k])).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}
const isEmpty = x => x === null || x === undefined || x === '' || (Array.isArray(x) && !x.length);
function content(d) {
  const o = {};
  for (const [k, v] of Object.entries(d || {})) if (!META.has(k)) o[k] = v;
  return canon(o);
}
const hashContent = d => crypto.createHash('sha1').update(content(d)).digest('hex');
const sameContent = (a, b) => content(a) === content(b);

/* ======================= Файл атаулары ======================= */
const dataName = (project, device) => 'mura.' + project + '.' + device + '.json';
const indexName = device => 'mura.index.' + device + '.json';
function parseName(name) {
  const m = /^mura\.([0-9a-f]{16}|index)\.([0-9a-f]{16})\.json$/.exec(String(name || ''));
  if (!m) return null;
  return m[1] === 'index' ? { kind: 'index', device: m[2] } : { kind: 'data', project: m[1], device: m[2] };
}
const keyOf = (t, id) => t + ':' + id;
const splitKey = k => { const i = k.indexOf(':'); return { t: k.slice(0, i), id: k.slice(i + 1) }; };

/* ======================= Күй ======================= */
/** Бір жобаның (бір сақтау қызметі мен аккаунттағы) синхрондау күйі — құрылғыда сақталады. */
function newState(project, device) {
  return { v: 1, project, device, base: {}, unpub: {}, seen: {}, conflicts: {}, skipped: {}, meta: null, republish: false, last_sync: '' };
}
function fixState(s, project, device) {
  if (!s || typeof s !== 'object' || s.project !== project || s.device !== device) return newState(project, device);
  for (const k of ['base', 'unpub', 'seen', 'conflicts', 'skipped']) if (!s[k] || typeof s[k] !== 'object') s[k] = {};
  return s;
}

/** Жергілікті өзгерістерді табу (күйді өзгертпей): кілт → { vv, h, del } жаңа нұсқа. */
function detect(snapshot, state, at = '') {
  const me = state.device, base = state.base, cur = new Map(), changed = new Map();
  for (const s of snapshot) cur.set(keyOf(s.t, s.id), s);
  for (const [k, s] of cur) {
    const h = hashContent(s.d), b = base[k];
    if (!b) changed.set(k, { vv: vvBump({}, me), h, del: false });
    else if (b.del || b.h !== h) changed.set(k, { vv: vvBump(b.vv, me), h, del: false });
  }
  for (const [k, b] of Object.entries(base)) if (!b.del && !cur.has(k)) changed.set(k, { vv: vvBump(b.vv, me), h: '', del: true, at });
  return { cur, changed };
}

/** Жіберілуі күтіліп тұрған өзгерістер саны (желісіз де есептеледі). */
function pendingCount(snapshot, state) {
  const { changed } = detect(snapshot, state);
  const keys = new Set([...changed.keys(), ...Object.keys(state.unpub || {})]);
  return keys.size;
}

/** Жоба мәліметтері (атауы, облысы, ауданы): соңғы өзгергені қалады. */
const metaHash = m => canon({ name: m && m.name || '', oblast: m && m.oblast || '', district: m && m.district || '' });

/**
 * Бір жобаны синхрондау.
 *   cloud  — { read(file) → мәтін, write(name, мәтін) → { name, rev } } (бұлт модулі);
 *   files  — cloud.list() нәтижесі [{ name, rev }] (бір циклде бір рет алынады);
 *   local  — { snapshot() → [{ t, id, d }], apply({ puts: [{ t, d }], dels: [{ t, id }] }), meta(), setMeta(m), adopt?(keys) };
 *   state  — newState()/fixState() нысаны (орнында өзгертіледі); persist(state) — құрылғыға сақтау;
 *   device — { id, name, platform, app }.
 * Рет: жүктеу → жергілікті өзгерістер → біріктіру → құрылғыға жазу → күйді сақтау → өз файлын жариялау → күйді сақтау.
 */
async function syncProject({ cloud, files, local, state, device, persist, now = () => new Date().toISOString() }) {
  const pid = state.project, me = device.id;
  const mine = dataName(pid, me);
  const rep = { pulled: 0, applied: 0, deleted: 0, conflicts: 0, pushed: false, skipped: 0 };
  const seenNext = { ...state.seen };

  /* 1. Басқа құрылғылардың өзгерген файлдары (өз файлымыз — тек күй жоғалғанда) */
  const remote = new Map();
  let remoteMeta = null;
  for (const f of files) {
    const p = parseName(f.name);
    if (!p || p.kind !== 'data' || p.project !== pid) continue;
    if (state.seen[f.name] === f.rev) continue;
    if (p.device === me && state.seen[f.name]) continue;
    let doc;
    try { doc = JSON.parse(await cloud.read(f)); } catch (e) { if (e && e.code) throw e; continue; }   // бүлінген файл — өткіземіз
    seenNext[f.name] = f.rev;
    if (!doc || doc.format !== FORMAT || !Array.isArray(doc.records)) continue;
    rep.pulled++;
    const dev = String(doc.device && doc.device.id || p.device), dn = String(doc.device && doc.device.name || '');
    if (doc.project && doc.project.updated_at && (!remoteMeta || String(doc.project.updated_at) > String(remoteMeta.updated_at))) remoteMeta = doc.project;
    for (const r of doc.records) {
      if (!r || !TYPES.includes(r.t) || !ID.test(String(r.id)) || !r.vv || typeof r.vv !== 'object') continue;
      if (!r.del && (!r.d || typeof r.d !== 'object')) continue;
      const k = keyOf(r.t, r.id);
      if (!remote.has(k)) remote.set(k, []);
      remote.get(k).push({ vv: r.vv, del: !!r.del, d: r.del ? null : { ...r.d, id: r.id }, dev, dn, at: r.del ? String(r.at || '') : String(r.d.updated_at || '') });
    }
  }
  if (local.adopt && remote.size) await local.adopt([...remote.keys()].map(splitKey));

  /* 2. Жергілікті өзгерістер: нұсқа векторында осы құрылғының санауышы өседі */
  let snap = await local.snapshot();
  const { cur, changed } = detect(snap, state, now());
  for (const [k, v] of changed) {
    state.base[k] = v; state.unpub[k] = 1;
    if (state.conflicts[k]) { const c = state.conflicts[k]; c.local = { vv: v.vv, del: v.del, d: v.del ? null : cur.get(k).d, at: v.del ? v.at : String(cur.get(k).d.updated_at || '') }; }
  }

  /* 3. Біріктіру */
  const puts = new Map(), dels = new Map();
  const accept = (k, R) => {
    const { t, id } = splitKey(k);
    if (R.del) {
      if (cur.has(k)) dels.set(k, { t, id });
      puts.delete(k);
      state.base[k] = { vv: R.vv, h: '', del: true, at: R.at };
    } else { dels.delete(k); puts.set(k, { t, d: R.d }); state.base[k] = { vv: R.vv, h: '', del: false }; }
    delete state.conflicts[k]; delete state.unpub[k]; delete state.skipped[k];
  };
  for (const [k, list] of remote) {
    for (const R of list) {
      const L = state.base[k];
      if (!L) { if (R.del) state.base[k] = { vv: R.vv, h: '', del: true, at: R.at }; else accept(k, R); continue; }
      const c = vvCmp(L.vv, R.vv);
      if (c === 'eq' || c === 'gt') continue;
      if (c === 'lt') { accept(k, R); continue; }
      // Қатар өзгерген: мазмұны бірдей болса — қайшылық емес
      const ld = puts.has(k) ? puts.get(k).d : cur.has(k) ? cur.get(k).d : null;
      if (L.del === R.del && (L.del || sameContent(ld, R.d))) {
        state.base[k] = { ...L, vv: vvMerge(L.vv, R.vv) }; state.unpub[k] = 1; delete state.conflicts[k];
        continue;
      }
      const old = state.conflicts[k];
      state.conflicts[k] = {
        t: splitKey(k).t, id: splitKey(k).id, since: old ? old.since : now(),
        local: { vv: L.vv, del: L.del, d: L.del ? null : ld, at: L.del ? String(L.at || '') : String(ld && ld.updated_at || '') },
        remote: { vv: R.vv, del: R.del, d: R.d, dev: R.dev, dn: R.dn, at: R.at },
      };
    }
  }
  rep.conflicts = Object.keys(state.conflicts).length;

  /* 4. Құрылғыға жазу; жазылғанын қайта оқып, мазмұн хешін сақтау (келесі жолы «жергілікті өзгеріс» болып көрінбеуі үшін) */
  if (puts.size || dels.size) {
    await local.apply({ puts: [...puts.values()], dels: [...dels.values()] });
    rep.applied = puts.size; rep.deleted = dels.size;
  }
  if (remoteMeta && String(remoteMeta.updated_at) > String(state.meta && state.meta.updated_at || '')) {
    const m = await local.meta();
    if (metaHash(m) !== metaHash(remoteMeta)) await local.setMeta({ name: String(remoteMeta.name || ''), oblast: String(remoteMeta.oblast || ''), district: String(remoteMeta.district || '') });
    state.meta = { h: metaHash(await local.meta()), updated_at: String(remoteMeta.updated_at) };
  }
  if (puts.size || dels.size) {
    snap = await local.snapshot();
    const after = new Map(snap.map(s => [keyOf(s.t, s.id), s]));
    for (const k of puts.keys()) {
      const s = after.get(k);
      // Құрылғы жазбаны қабылдамаса (мыс. id басқа жобада бар) — оны «жергілікті өшірілді» деп таратпаймыз
      if (s) state.base[k].h = hashContent(s.d);
      else { state.skipped[k] = state.base[k].vv; delete state.base[k]; rep.skipped++; }
    }
    cur.clear(); for (const [k, s] of after) cur.set(k, s);
  }
  const m = await local.meta();
  if (!state.meta || state.meta.h !== metaHash(m)) { state.meta = { h: metaHash(m), updated_at: now() }; state.republish = true; }
  if (persist) await persist(state);

  /* 5. Өз файлын жариялау: әр жазбаның осы құрылғыдағы соңғы нұсқасы (толық сурет — жаңа құрылғыға жеткілікті) */
  const haveMine = files.some(f => f.name === mine);
  if (Object.keys(state.unpub).length || state.republish || !haveMine) {
    const records = [];
    for (const [k, b] of Object.entries(state.base)) {
      const { t, id } = splitKey(k);
      if (b.del) records.push({ t, id, vv: b.vv, del: true, at: String(b.at || '') });
      else if (cur.has(k)) records.push({ t, id, vv: b.vv, d: cur.get(k).d });
    }
    const doc = {
      format: FORMAT,
      project: { id: pid, name: String(m.name || ''), oblast: String(m.oblast || ''), district: String(m.district || ''), updated_at: state.meta.updated_at },
      device: { id: me, name: String(device.name || ''), platform: String(device.platform || ''), app: String(device.app || '') },
      written_at: now(), records,
    };
    const w = await cloud.write(mine, JSON.stringify(doc));
    if (w && w.rev) seenNext[mine] = w.rev;
    state.unpub = {}; state.republish = false; rep.pushed = true;
  }
  state.seen = seenNext;
  state.last_sync = now();
  if (persist) await persist(state);
  return rep;
}

/**
 * Қайшылықты шешу: choice = 'local' (осы құрылғыдағы нұсқа) не 'remote' (басқа құрылғыныкі).
 * Жаңа нұсқа екеуін де қамтиды (vv біріктіріліп, осы құрылғының санауышы өседі) — барлық құрылғы оны қабылдайды.
 */
async function resolveConflict({ local, state, key, choice, persist }) {
  const c = state.conflicts[key];
  if (!c) return false;
  const b = state.base[key] || { vv: c.local.vv, h: '', del: c.local.del };
  const vv = vvBump(vvMerge(b.vv, c.remote.vv), state.device);
  if (choice === 'remote') {
    const { t, id } = splitKey(key);
    if (c.remote.del) { await local.apply({ puts: [], dels: [{ t, id }] }); state.base[key] = { vv, h: '', del: true }; }
    else {
      await local.apply({ puts: [{ t, d: { ...c.remote.d, id } }], dels: [] });
      const s = (await local.snapshot()).find(x => x.t === t && x.id === id);
      state.base[key] = { vv, h: s ? hashContent(s.d) : '', del: false };
    }
  } else state.base[key] = { ...b, vv };
  state.unpub[key] = 1;
  delete state.conflicts[key];
  if (persist) await persist(state);
  return true;
}

/** Құрылғының жобалар тізімі (mura.index.<құрылғы>.json). */
function indexDoc(device, projects, now = () => new Date().toISOString()) {
  return JSON.stringify({ format: FORMAT, device: { id: device.id, name: String(device.name || ''), platform: String(device.platform || ''), app: String(device.app || '') }, written_at: now(),
    projects: projects.map(p => ({ id: p.id, name: String(p.name || ''), oblast: String(p.oblast || ''), district: String(p.district || ''), updated_at: String(p.updated_at || '') })) });
}

/** Бұлттағы жобалар: барлық құрылғылардың тізімдері біріктіріледі (соңғы өзгерген атауы); тізімде жоқ, бірақ файлы бар жоба да қосылады. */
async function cloudProjects(cloud, files) {
  const out = new Map();
  for (const f of files) {
    const p = parseName(f.name);
    if (p && p.kind === 'data' && !out.has(p.project)) out.set(p.project, { id: p.project, name: '', oblast: '', district: '', updated_at: '', devices: [] });
  }
  for (const f of files) {
    const p = parseName(f.name);
    if (!p || p.kind !== 'index') continue;
    let doc;
    try { doc = JSON.parse(await cloud.read(f)); } catch (e) { if (e && e.code) throw e; continue; }
    for (const x of (doc && Array.isArray(doc.projects) ? doc.projects : [])) {
      if (!x || !ID.test(String(x.id)) || !out.has(x.id)) continue;   // деректер файлы жоқ жоба — көрсетілмейді
      const o = out.get(x.id);
      o.devices.push(String(doc.device && doc.device.name || ''));
      if (String(x.updated_at || '') >= o.updated_at) Object.assign(o, { name: String(x.name || ''), oblast: String(x.oblast || ''), district: String(x.district || ''), updated_at: String(x.updated_at || '') });
    }
  }
  return [...out.values()];
}

const newId = () => crypto.randomBytes(8).toString('hex');

module.exports = {
  FORMAT, TYPES, vvCmp, vvMerge, vvBump, canon, hashContent, sameContent, dataName, indexName, parseName, keyOf, splitKey,
  newState, fixState, detect, pendingCount, syncProject, resolveConflict, indexDoc, cloudProjects, newId,
};
