/* Синхрондау қозғалтқышының тесті (желісіз): жадтағы «бұлт» және бірнеше «құрылғы».
   Android-тағы SyncEngineTest.kt дәл осы сценарийлерді тексереді — ережелер екі платформада бірдей.
   Іске қосу: node scripts/test-sync.mjs */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../main/sync/engine.js');
const { GoogleDrive } = require('../main/sync/gdrive.js');

let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.error('✗ ' + msg); } else console.log('✓ ' + msg); };

/* ---------- Жадтағы бұлт және құрылғы ---------- */
class MemCloud {
  constructor() { this.files = new Map(); this.rev = 0; this.writes = 0; this.offline = false; }
  async list() { if (this.offline) throw Object.assign(new Error('offline'), { code: 'offline' }); return [...this.files].map(([name, f]) => ({ name, rev: f.rev })); }
  async read(f) { if (this.offline) throw Object.assign(new Error('offline'), { code: 'offline' }); return this.files.get(f.name).text; }
  async write(name, text) { if (this.offline) throw Object.assign(new Error('offline'), { code: 'offline' }); this.writes++; const rev = String(++this.rev); this.files.set(name, { text, rev }); return { name, rev }; }
}
let clock = 0;
const now = () => new Date(Date.UTC(2026, 0, 1) + (++clock) * 1000).toISOString();
const PID = 'aaaaaaaaaaaaaaaa';

class Device {
  constructor(id, cloud) { this.id = id; this.cloud = cloud; this.recs = new Map(); this.meta = { name: 'Жоба', oblast: '', district: '' }; this.state = E.newState(PID, id); }
  get local() {
    const self = this;
    return {
      snapshot: async () => [...self.recs.values()].map(r => JSON.parse(JSON.stringify(r))),
      apply: async ({ puts, dels }) => { for (const p of puts) self.recs.set(p.t + ':' + p.d.id, { t: p.t, id: p.d.id, d: JSON.parse(JSON.stringify(p.d)) }); for (const d of dels) self.recs.delete(d.t + ':' + d.id); },
      meta: async () => ({ ...self.meta }),
      setMeta: async m => { self.meta = { ...m }; },
    };
  }
  put(t, id, d) { this.recs.set(t + ':' + id, { t, id, d: { id, updated_at: now(), ...d } }); }
  del(t, id) { this.recs.delete(t + ':' + id); }
  get(t, id) { const r = this.recs.get(t + ':' + id); return r && r.d; }
  async sync() {
    const files = await this.cloud.list();
    return E.syncProject({ cloud: this.cloud, files, local: this.local, state: this.state, device: { id: this.id, name: this.id, platform: 'test' }, now });
  }
  pending() { return E.pendingCount([...this.recs.values()], this.state); }
  conflicts() { return Object.keys(this.state.conflicts); }
}
const A_ID = '1111111111111111', B_ID = '2222222222222222', C_ID = '3333333333333333';
const X = 'aaaaaaaaaaaa0001', Y = 'aaaaaaaaaaaa0002', Z = 'aaaaaaaaaaaa0003', W = 'aaaaaaaaaaaa0004';
const mark = (name, extra) => ({ name, lat: 50.1, lon: 57.2, type: 'archeo', category: '', status: 'state', ...extra });

/* ---------- Нұсқа векторы ---------- */
ok(E.vvCmp({ a: 1 }, { a: 1 }) === 'eq' && E.vvCmp({ a: 2 }, { a: 1 }) === 'gt' && E.vvCmp({ a: 1 }, { a: 1, b: 1 }) === 'lt' && E.vvCmp({ a: 2 }, { a: 1, b: 1 }) === 'cc', 'нұсқа векторын салыстыру');
ok(JSON.stringify(E.vvMerge({ a: 2, b: 1 }, { b: 3, c: 1 })) === JSON.stringify({ a: 2, b: 3, c: 1 }), 'нұсқа векторларын біріктіру');
ok(E.sameContent({ id: 'x', name: 'A', updated_at: '1', oblast_ru: '' }, { name: 'A', updated_at: '2', lat: undefined }), 'мазмұн: уақыт белгісі мен бос өрістер ескерілмейді');
ok(!E.sameContent({ name: 'A', lat: 50.1 }, { name: 'A', lat: 50.1000002 }) && E.sameContent({ lat: 50.10000001 }, { lat: 50.1 }), 'мазмұн: координата 1e-7 дәлдікпен');
ok(E.parseName('mura.' + PID + '.' + A_ID + '.json').project === PID && E.parseName('mura.index.' + A_ID + '.json').kind === 'index' && !E.parseName('other.json'), 'файл атаулары');

/* ---------- 1. Қосу, қайта синхрондау көшірме жасамайды ---------- */
{
  const cloud = new MemCloud(), A = new Device(A_ID, cloud), B = new Device(B_ID, cloud);
  A.put('mark', X, mark('Қорған'));
  A.put('route', Y, { name: 'Маршрут', pts: [[50, 57], [50.1, 57.1]] });
  ok(A.pending() === 2, 'желісіз: жіберілуі күтілетін өзгерістер — 2');
  await A.sync();
  ok(A.pending() === 0, 'жіберілгеннен кейін күтілетін өзгеріс жоқ');
  await B.sync();
  ok(B.get('mark', X)?.name === 'Қорған' && B.get('route', Y)?.pts.length === 2, 'телефонда қосылған нүкте мен маршрут екінші құрылғыда пайда болды');
  const w = cloud.writes;
  await A.sync(); await B.sync(); await A.sync(); await B.sync();
  ok(B.recs.size === 2 && A.recs.size === 2, 'қайта синхрондау көшірме жазба жасамайды');
  ok(cloud.writes === w, 'өзгеріс жоқ кезде бұлтқа қайта жазылмайды (' + (cloud.writes - w) + ')');
  ok(B.pending() === 0 && !B.conflicts().length, 'қабылданған жазба «жергілікті өзгеріс» болып саналмайды');

  /* 2. Өңдеу екі бағытта */
  B.put('route', Y, { name: 'Маршрут', pts: [[50, 57], [50.2, 57.2], [50.3, 57.3]] });
  await B.sync(); await A.sync();
  ok(A.get('route', Y).pts.length === 3, 'компьютерде өзгертілген маршрут телефонда жаңарды');

  /* 3. Өшіру: офлайн құрылғы қосылғанда өшірілген жазба қайта пайда болмайды */
  const C = new Device(C_ID, cloud);
  await C.sync();
  ok(C.get('mark', X), 'үшінші құрылғы барлық жазбаны алды');
  A.del('mark', X);
  await A.sync();
  await C.sync();
  ok(!C.get('mark', X), 'өшіру офлайн болған құрылғыға таралды');
  await C.sync(); await A.sync(); await B.sync(); await A.sync();
  ok(!A.get('mark', X) && !B.get('mark', X) && !C.get('mark', X), 'өшірілген жазба ешбір құрылғыда қайта тірілмеді');
  A.put('mark', Z, mark('Z'));
  await A.sync(); await B.sync(); await C.sync();
  ok(!B.get('mark', X) && B.get('mark', Z), 'келесі өзгерістер де дұрыс таралады');
}

/* ---------- 4. Қатар өңдеу — қайшылық, екі нұсқа сақталады ---------- */
{
  const cloud = new MemCloud(), A = new Device(A_ID, cloud), B = new Device(B_ID, cloud);
  A.put('mark', X, mark('Бастапқы'));
  A.put('mark', Z, mark('Басқа'));
  await A.sync(); await B.sync();
  A.put('mark', X, mark('Компьютерде'));
  B.put('mark', X, mark('Телефонда'));
  B.put('mark', Z, mark('Басқа — телефонда'));
  await A.sync(); await B.sync(); await A.sync();
  ok(A.conflicts().length === 1 && B.conflicts().length === 1, 'қатар өзгерген жазба екі құрылғыда да қайшылық ретінде көрсетілді');
  ok(A.get('mark', X).name === 'Компьютерде' && B.get('mark', X).name === 'Телефонда', 'қайшылық шешілгенше әр құрылғыда өз нұсқасы қалды');
  ok(A.state.conflicts['mark:' + X].remote.d.name === 'Телефонда', 'екінші нұсқа да сақталды');
  ok(A.get('mark', Z).name === 'Басқа — телефонда', 'бір жазбадағы қайшылық басқа жазбаның жаңаруына кедергі емес');
  await E.resolveConflict({ local: A.local, state: A.state, key: 'mark:' + X, choice: 'remote' });
  ok(A.get('mark', X).name === 'Телефонда' && !A.conflicts().length, 'қайшылық шешілді: басқа құрылғының нұсқасы таңдалды');
  await A.sync(); await B.sync(); await A.sync();
  ok(!B.conflicts().length && B.get('mark', X).name === 'Телефонда' && !A.conflicts().length, 'шешім екінші құрылғыға таралды, қайшылық жабылды');

  /* 5. Бірі өшірді, екіншісі офлайн өңдеді — қайшылық */
  B.put('mark', Y, mark('Y'));
  await B.sync(); await A.sync();
  A.del('mark', Y);
  B.put('mark', Y, mark('Y — өңделді'));
  await A.sync(); await B.sync(); await A.sync();
  const cb = B.state.conflicts['mark:' + Y];
  ok(cb && cb.remote.del && !cb.local.del, 'өшіру ↔ өңдеу: қайшылық (екі нұсқа да сақталды)');
  ok(B.get('mark', Y).name === 'Y — өңделді', 'өңделген нұсқа шешілгенше жоғалмады');
  await E.resolveConflict({ local: B.local, state: B.state, key: 'mark:' + Y, choice: 'local' });
  await B.sync(); await A.sync();
  ok(A.get('mark', Y)?.name === 'Y — өңделді' && !A.conflicts().length, 'шешім: өңделген нұсқа қалды, өшірген құрылғыда қалпына келді');
  /* өшіруді таңдау */
  A.put('mark', Y, mark('A нұсқасы'));
  B.del('mark', Y);
  await A.sync(); await B.sync(); await A.sync();
  await E.resolveConflict({ local: A.local, state: A.state, key: 'mark:' + Y, choice: 'remote' });
  await A.sync(); await B.sync();
  ok(!A.get('mark', Y) && !B.get('mark', Y) && !A.conflicts().length && !B.conflicts().length, 'шешім: өшіру таңдалды — екі құрылғыда да өшірілді');

  /* 6. Екеуі бірдей өзгерткен — қайшылық емес */
  A.put('mark', Z, mark('Бірдей'));
  B.put('mark', Z, mark('Бірдей'));
  await A.sync(); await B.sync(); await A.sync();
  ok(!A.conflicts().length && !B.conflicts().length, 'бірдей өзгеріс қайшылық тудырмайды');
  /* Тек уақыт белгісі өзгерсе — өзгеріс емес */
  A.put('mark', Z, mark('Бірдей'));
  ok(A.pending() === 0, 'тек updated_at өзгерсе — жіберілетін өзгеріс жоқ');
}

/* ---------- 7. Алғашқы біріктіру: екі құрылғыда бұрыннан бар жазбалар ---------- */
{
  const cloud = new MemCloud(), A = new Device(A_ID, cloud), B = new Device(B_ID, cloud);
  A.put('mark', W, mark('Ортақ', { note: '' }));
  B.put('mark', W, mark('Ортақ', { oblast_ru: '' }));
  A.put('mark', X, mark('Тек компьютерде'));
  B.put('mark', Y, mark('Тек телефонда'));
  B.put('mark', Z, mark('Z телефонда'));
  A.put('mark', Z, mark('Z компьютерде'));
  await A.sync(); await B.sync(); await A.sync();
  ok(A.recs.size === 4 && B.recs.size === 4, 'алғашқы қосылу: жазбалар id бойынша біріктірілді, көшірме жоқ');
  ok(!A.state.conflicts['mark:' + W] && !B.state.conflicts['mark:' + W], 'мазмұны бірдей жазба қайшылық емес');
  ok(A.state.conflicts['mark:' + Z] && A.get('mark', Z).name === 'Z компьютерде', 'id бірдей, мазмұны өзге — қайшылық (екеуі де сақталды)');
}

/* ---------- 8. Күй жоғалса (қайта орнату / аккаунт ауысуы) — көшірме жоқ ---------- */
{
  const cloud = new MemCloud(), A = new Device(A_ID, cloud), B = new Device(B_ID, cloud);
  A.put('mark', X, mark('X')); A.put('mark', Y, mark('Y'));
  await A.sync(); await B.sync();
  const B2 = new Device(C_ID, cloud);        // сол деректер, жаңа құрылғы id-і, бос күй
  B2.recs = new Map(JSON.parse(JSON.stringify([...B.recs])));
  await B2.sync(); await A.sync();
  ok(B2.recs.size === 2 && A.recs.size === 2 && !B2.conflicts().length, 'күйсіз қайта қосылу: көшірме де, қайшылық та жоқ');
  ok(E.fixState({ project: PID, device: 'other' }, PID, A_ID).base && Object.keys(E.fixState({ project: PID, device: 'other' }, PID, A_ID).base).length === 0, 'басқа құрылғының күйі қабылданбайды');
}

/* ---------- 9. Бүлінген файл, желі жоқ, жоба мәліметтері ---------- */
{
  const cloud = new MemCloud(), A = new Device(A_ID, cloud), B = new Device(B_ID, cloud);
  A.put('mark', X, mark('X'));
  await A.sync();
  cloud.files.set(E.dataName(PID, C_ID), { text: '{бүлінген', rev: '99' });
  await B.sync();
  ok(B.get('mark', X), 'бүлінген файл өткізіледі, қалғаны оқылады');
  cloud.offline = true;
  B.put('mark', Y, mark('офлайн'));
  let err = null;
  try { await B.sync(); } catch (e) { err = e; }
  ok(err && err.code === 'offline' && B.pending() === 1, 'желі жоқ: өзгеріс құрылғыда кезекте қалды');
  cloud.offline = false;
  await B.sync(); await A.sync();
  ok(A.get('mark', Y)?.name === 'офлайн' && B.pending() === 0, 'байланыс қалпына келгенде кезектегі өзгеріс жіберілді');
  A.meta = { name: 'Жаңа атау', oblast: 'Ақтөбе облысы', district: '' };
  await A.sync(); await B.sync();
  ok(B.meta.name === 'Жаңа атау' && B.meta.oblast === 'Ақтөбе облысы', 'жоба мәліметтері таралды');
  const files = await cloud.list();
  const list = await E.cloudProjects(cloud, files.concat([]));
  ok(list.length === 1 && list[0].id === PID, 'бұлттағы жобалар тізімі (файл атауларынан)');
  await cloud.write(E.indexName(A_ID), E.indexDoc({ id: A_ID, name: 'PC' }, [{ id: PID, name: 'Жаңа атау', updated_at: now() }], now));
  const list2 = await E.cloudProjects(cloud, await cloud.list());
  ok(list2[0].name === 'Жаңа атау', 'бұлттағы жобаның атауы құрылғы тізімінен алынады');
}

/* ---------- 10. Құрылғы жазбаны қабылдамаса — ол «өшірілді» болып таралмайды ---------- */
{
  const cloud = new MemCloud(), A = new Device(A_ID, cloud), B = new Device(B_ID, cloud);
  A.put('mark', X, mark('X'));
  await A.sync();
  const la = B.local;
  B.local2 = { ...la, apply: async () => {} };            // мыс. id басқа жобада бар
  Object.defineProperty(B, 'local', { get() { return B.local2; } });
  await B.sync();
  await B.sync(); await A.sync();
  ok(A.get('mark', X) && B.state.skipped['mark:' + X], 'қабылданбаған жазба өшірілмейді, күйде белгіленеді');
}

/* ---------- Нақты .gpkg жобалары (Desktop): екі компьютер, бір бұлт ---------- */
{
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const { Project } = require('../main/gpkg.js');
  const { MarksStore } = require('../main/marks.js');
  const { RoutesStore } = require('../main/routes.js');
  const { gpkgLocal } = require('../main/sync/index.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mura-sync-'));
  const cloud = new MemCloud();
  const pa = Project.create(path.join(tmp, 'a.gpkg'), { name: 'Қобда', oblast: 'Ақтөбе облысы', sync_id: PID });
  const pb = Project.create(path.join(tmp, 'b.gpkg'), { name: 'Қобда', sync_id: PID });
  const sa = E.newState(PID, A_ID), sb = E.newState(PID, B_ID);
  const run = (p, s, id) => cloud.list().then(files => E.syncProject({ cloud, files, local: gpkgLocal(p), state: s, device: { id }, now }));
  const ma = new MarksStore(pa.table('marks'), pa.table('imports'));
  const id = ma.save(JSON.stringify({ name: 'Ақжар қорымы', name_ru: 'Могильник Акжар', oblast: 'Ақтөбе облысы', type: 'archeo', lat: 50.12345678, lon: 57.1 }));
  new RoutesStore(pa.table('routes')).save(JSON.stringify({ name: 'Қобда — Ақжар', pts: [[50, 57], [50.12345678, 57.1]] }));
  await run(pa, sa, A_ID); await run(pb, sb, B_ID);
  const mb = new MarksStore(pb.table('marks'), pb.table('imports'));
  ok(mb.list().length === 1 && mb.list()[0].id === id && mb.list()[0].name_ru === 'Могильник Акжар' && mb.list()[0].lat === 50.12345678, 'gpkg: белгі id-імен, барлық атрибутымен екінші жобаға келді');
  ok(new RoutesStore(pb.table('routes')).list()[0]?.pts.length === 2 && pb.meta().oblast === 'Ақтөбе облысы', 'gpkg: маршрут пен жоба мәліметтері келді');
  // Android қосқан өріс (oblast_ru) компьютерде өңдегенде жоғалмайды
  const phone = new Device(C_ID, cloud);
  await phone.sync();
  phone.put('mark', id, { ...phone.get('mark', id), oblast_ru: 'Актюбинская область', name: 'Ақжар' });
  await phone.sync();
  await run(pa, sa, A_ID);
  ok(ma.list()[0].oblast_ru === 'Актюбинская область' && ma.list()[0].name === 'Ақжар', 'gpkg: Android өзгерісі қабылданды');
  ma.save(JSON.stringify({ ...ma.list()[0], note: 'компьютерде толықтырылды' }));
  ok(ma.list()[0].oblast_ru === 'Актюбинская область' && ma.list()[0].note === 'компьютерде толықтырылды', 'gpkg: белгісіз өріс (oblast_ru) компьютерде өңдегенде сақталды');
  await run(pa, sa, A_ID); await run(pb, sb, B_ID);
  ok(mb.list()[0].note === 'компьютерде толықтырылды' && sb.base['mark:' + id] && !Object.keys(sb.conflicts).length, 'gpkg: өңдеу екінші компьютерге жетті');
  ma.remove(id);
  await run(pa, sa, A_ID); await run(pb, sb, B_ID); await run(pa, sa, A_ID);
  ok(!mb.list().length && !ma.list().length, 'gpkg: өшіру таралды, қайта пайда болмады');
  pa.close(); pb.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

/* ---------- Google Drive модулі (fetch ауыстырылған) ---------- */
{
  const calls = [];
  const resp = (status, body, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: k => headers[k.toLowerCase()] || null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), json: async () => body });
  const fetch = async (url, o = {}) => {
    calls.push({ url: String(url), method: o.method || 'GET', body: o.body, headers: o.headers || {} });
    if (url.includes('/files?') && (o.method || 'GET') === 'GET') return resp(200, { files: [{ id: 'f1', name: 'mura.index.' + A_ID + '.json', version: '7' }] });
    if (url.includes('/upload/') && o.method === 'POST') return resp(200, { id: 'f2', name: 'x', version: '1' });
    if (url.includes('/upload/') && o.method === 'PATCH') return resp(403, { error: { code: 403, errors: [{ reason: 'storageQuotaExceeded' }], message: 'quota' } });
    if (url.includes('alt=media')) return resp(200, '{"ok":1}');
    return resp(404, {});
  };
  const d = new GoogleDrive({ fetch, token: async () => 'tok' });
  const files = await d.list();
  ok(files.length === 1 && files[0].rev === '7' && calls[0].url.includes('spaces=appDataFolder') && calls[0].headers.Authorization === 'Bearer tok', 'Drive: тізім тек appDataFolder-ден, токенмен');
  ok((await d.read(files[0])) === '{"ok":1}', 'Drive: файлды оқу');
  await d.write('mura.new.json', '{}');
  const up = calls.find(c => c.method === 'POST');
  ok(up && /uploadType=multipart/.test(up.url) && String(up.body).includes('"parents":["appDataFolder"]'), 'Drive: жаңа файл appDataFolder-ге жасалады');
  let qe = null;
  try { await d.write('mura.index.' + A_ID + '.json', '{}'); } catch (e) { qe = e; }
  ok(qe && qe.code === 'quota', 'Drive: бос орын жетпесе — «quota» қатесі');
  const d2 = new GoogleDrive({ fetch: async () => { throw new TypeError('fetch failed'); }, token: async () => 'tok' });
  let ne = null;
  try { await d2.list(); } catch (e) { ne = e; }
  ok(ne && ne.code === 'offline', 'Drive: желі жоқ — «offline» қатесі');
  const d3 = new GoogleDrive({ fetch: async () => resp(401, { error: { code: 401 } }), token: async () => 'tok' });
  let ae = null;
  try { await d3.list(); } catch (e) { ae = e; }
  ok(ae && ae.code === 'auth', 'Drive: рұқсат қайтарылса — «auth» қатесі');
}

console.log(`\n${n - fails}/${n} өтті`);
if (fails) process.exit(1);
