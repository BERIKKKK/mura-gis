/* Плагиндер жүйесінің бірлік тесттері (Electron-сыз): манифест, .muraplug архивінің қауіпсіз оқылуы, менеджер (орнату,
   тұтастық, жою — жоба деректеріне тимейді), геометрия мен атрибуттар көмекшілері, NIPD үлгі плагині (SDK тестілеу құралы). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const M = require(ROOT + '/plugin-sdk/lib/manifest.cjs');
const Z = require(ROOT + '/plugin-sdk/lib/zip.cjs');
const G = require(ROOT + '/plugin-sdk/lib/geo.js');
const A = require(ROOT + '/plugin-sdk/lib/attrs.js');
const { PluginManager } = require(ROOT + '/main/plugins/manager.js');
const { run } = await import(ROOT + '/plugin-sdk/tools/run.mjs');

let ok = 0, bad = 0;
const t = async (name, fn) => { try { await fn(); ok++; console.log('✓ ' + name); } catch (e) { bad++; console.log('✗ ' + name + '\n   ' + (e.stack || e.message)); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)); };
const throws = (fn, re) => { try { fn(); } catch (e) { if (re && !re.test(e.message)) throw new Error('басқа қате: ' + e.message); return; } throw new Error('қате күтілді'); };
const base = { id: 'kz.test.p', name: 'P', version: '1.0.0', apiVersion: '1', minAppVersion: '2.2.0', author: 'A', entry: 'main.js' };
const mf = o => Buffer.from(JSON.stringify({ ...base, ...o }));
const pack = (files) => Z.writeZip(Object.entries(files).map(([k, v]) => [k, Buffer.isBuffer(v) ? v : Buffer.from(v)]));

/* ---------- Манифест ---------- */
await t('манифест: дұрыс минимал', () => { const v = M.validateManifest({ ...base }); eq(v.ok, true); eq(v.manifest.platforms, ['desktop']); eq(v.manifest.permissions, []); });
await t('манифест: міндетті өрістер мен пішім', () => {
  const v = M.validateManifest({ id: 'BAD', version: '1', apiVersion: 1, entry: '../x.js' });
  eq(v.ok, false);
  for (const k of ['id', 'name', 'version', 'apiVersion', 'minAppVersion', 'author', 'entry']) if (!v.errors.some(e => e.startsWith(k))) throw new Error('қате жоқ: ' + k);
});
await t('манифест: белгісіз рұқсат, кеңейту нүктесі — қате; API 1-де жоқ рұқсат — ескерту, берілмейді', () => {
  eq(M.validateManifest({ ...base, permissions: ['fs.write'] }).ok, false);
  eq(M.validateManifest({ ...base, contributes: { 'main.nav': [] } }).ok, false);
  const v = M.validateManifest({ ...base, permissions: ['attributes.write', 'geometry.read'] });
  eq(v.ok, true); if (!v.warnings.some(w => /attributes.write/.test(w))) throw new Error('ескерту жоқ');
});
await t('үйлесімділік: API, min/max нұсқа, платформа', () => {
  const m = M.validateManifest({ ...base, maxAppVersion: '2.9.0', platforms: ['desktop', 'mobile'] }).manifest;
  eq(M.compatibility(m, { appVersion: '2.2.0' }).ok, true);
  eq(M.compatibility(m, { appVersion: '2.1.9' }).ok, false);
  eq(M.compatibility(m, { appVersion: '3.0.0' }).ok, false);
  eq(M.compatibility({ ...m, apiVersion: '2' }, { appVersion: '2.2.0' }).ok, false);
  eq(M.compatibility({ ...m, platforms: ['mobile'] }, { appVersion: '2.2.0', platform: 'desktop' }).ok, false);
  eq(M.compareVersions('2.2.0-beta', '2.2.0'), -1);
});
await t('баптаулар: түріне келтіру', () => {
  const m = M.validateManifest({ ...base, settings: [{ key: 'a', type: 'select', title: 'A', options: ['x', 'y'], default: 'y' }, { key: 'n', type: 'number', title: 'N', default: 5 }] }).manifest;
  eq(M.settingValue(m.settings[0], 'z'), 'y'); eq(M.settingValue(m.settings[1], '7'), 5); eq(M.settingValue(m.settings[1], 7), 7);
});

/* ---------- Архив ---------- */
await t('zip: жазу → оқу, CRC', () => { const { files } = Z.readPlugin(pack({ 'manifest.json': mf({}), 'main.js': 'x', 'a/b.json': '{}' })); eq([...files.keys()], ['manifest.json', 'main.js', 'a/b.json']); });
const rawZip = (name, data, o = {}) => {        // қолмен ZIP (жазушы бұл жолдарға рұқсат бермейді)
  const nm = Buffer.from(name), comp = o.store ? data : zlib.deflateRawSync(data);
  const crc = o.crc != null ? o.crc : Z.crc32(data);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800 | (o.flags || 0), 6); lh.writeUInt16LE(o.store ? 0 : 8, 8);
  lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(o.made || 20, 4); ch.writeUInt16LE(0x800 | (o.flags || 0), 8); ch.writeUInt16LE(o.store ? 0 : 8, 10);
  ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(o.ext || 0, 38);
  const cd = Buffer.concat([ch, nm]);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(30 + nm.length + comp.length, 16);
  return Buffer.concat([lh, nm, comp, cd, end]);
};
await t('zip: «..», абсолют жол, кері қиғаш сызық, диск — бұғатталады', () => {
  for (const n of ['../evil.js', 'a/../../evil.js', '/etc/x.js', 'a\\b.js', 'C:/x.js', 'con.js', 'a/./b.js']) throws(() => Z.readPlugin(rawZip(n, Buffer.from('x'))));
});
await t('zip: символдық сілтеме, шифр, бөтен түр (.exe, .node, .html), CRC бұзылуы, ZIP-бомба', () => {
  throws(() => Z.readPlugin(rawZip('link.js', Buffer.from('/etc/passwd'), { made: 0x031e, ext: (0o120777 << 16) >>> 0 })), /символдық/);
  throws(() => Z.readPlugin(rawZip('a.js', Buffer.from('x'), { flags: 1 })), /Шифр/);
  for (const n of ['run.exe', 'x.node', 'ui.html', 'a.sh', 'noext']) throws(() => Z.readPlugin(rawZip(n, Buffer.from('x'))), /түрдегі/);
  throws(() => Z.readPlugin(rawZip('a.js', Buffer.from('hello'), { crc: 12345 })), /CRC/);
  throws(() => Z.readPlugin(rawZip('big.txt', Buffer.alloc(5 * 1024 * 1024))), /коэффициент/);
  throws(() => Z.readPlugin(Buffer.from('not a zip at all, definitely not')), /ZIP/);
});
await t('zip: аттас файлдар (регистрге қарамай) және қызметтік атау', () => {
  throws(() => Z.readPlugin(pack({ 'A.js': 'x', 'a.js': 'y' })), /аттас/);
  throws(() => Z.readPlugin(rawZip(Z.META_FILE, Buffer.from('{}'))), /қызметтік/);
});

/* ---------- Менеджер ---------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mura-plug-'));
const mgr = new PluginManager(path.join(tmp, 'plugins'), { appVersion: '2.2.0' });
const projectFile = path.join(tmp, 'project.gpkg');
fs.writeFileSync(projectFile, 'PROJECT-DATA');
await t('менеджер: тексеру (inspect) дискіге жазбайды; орнату — растаудан кейін', () => {
  const r = mgr.inspectBuffer(pack({ 'manifest.json': mf({ permissions: ['geometry.read', 'network.access'] }), 'main.js': 'mura.commands.register("x",()=>1)', 'permissions.json': '{"geometry.read":"керек"}' }), 'p.muraplug');
  eq(r.ok, true); eq(!!r.token, true); eq(r.reasons, { 'geometry.read': 'керек' });
  eq(fs.existsSync(path.join(tmp, 'plugins', 'installed')), false, 'inspect дискіге жазды');
  const p = mgr.install(r.token, ['geometry.read', 'network.access', 'files.export']);
  eq(p.granted, ['geometry.read', 'network.access'], 'тек сұралған рұқсаттар');
  eq(mgr.verify(p), '');
  throws(() => mgr.install(r.token, []), /сеансы/);
});
await t('менеджер: үйлесімсіз плагинге токен берілмейді', () => {
  const r = mgr.inspectBuffer(pack({ 'manifest.json': mf({ id: 'kz.test.new', minAppVersion: '9.0.0' }), 'main.js': '' }), 'n.muraplug');
  eq(r.ok, true); eq(r.compat.ok, false); eq(r.token, null);
});
await t('менеджер: entry жоқ, __mura/ жолы — орнатылмайды', () => {
  eq(mgr.inspectBuffer(pack({ 'manifest.json': mf({ entry: 'nope.js' }) }), 'x').ok, false);
  throws(() => mgr.inspectBuffer(pack({ 'manifest.json': mf({}), 'main.js': '', '__mura/runtime.js': 'x' }), 'x'), /__mura/);
});
await t('менеджер: орнатылған файл өзгертілсе не бөтен файл қосылса — тұтастық қатесі', () => {
  const p = mgr.get('kz.test.p');
  fs.writeFileSync(path.join(p.dir, 'main.js'), 'evil()');
  if (!/өзгертілген/.test(mgr.verify(mgr.get('kz.test.p')))) throw new Error('өзгеріс анықталмады');
  const r = mgr.inspectBuffer(pack({ 'manifest.json': mf({}), 'main.js': 'ok' }), 'p');
  mgr.install(r.token, []);
  fs.writeFileSync(path.join(mgr.get('kz.test.p').dir, 'extra.js'), 'x');
  if (!/бөтен/.test(mgr.verify(mgr.get('kz.test.p')))) throw new Error('бөтен файл анықталмады');
  fs.rmSync(path.join(mgr.get('kz.test.p').dir, 'extra.js'));
  eq(mgr.readFile(mgr.get('kz.test.p'), '../../state.json'), null, 'қалтадан шығу');
  eq(mgr.readFile(mgr.get('kz.test.p'), Z.META_FILE), null, 'қызметтік файл');
});
await t('менеджер: қосу/өшіру, рұқсат, баптау, жалпы тоқтату; жою жоба файлына тимейді', () => {
  mgr.setEnabled('kz.test.p', false); eq(mgr.runnable(mgr.get('kz.test.p')), false);
  mgr.setEnabled('kz.test.p', true); eq(mgr.runnable(mgr.get('kz.test.p')), true);
  mgr.setSuspended(true); eq(mgr.runnable(mgr.get('kz.test.p')), false); mgr.setSuspended(false);
  mgr.storageWrite('kz.test.p', { a: 1 });
  mgr.uninstall('kz.test.p', { data: false });
  eq(mgr.get('kz.test.p'), null); eq(mgr.storageRead('kz.test.p'), { a: 1 }, 'жеке деректер сақталды');
  eq(fs.readFileSync(projectFile, 'utf8'), 'PROJECT-DATA', 'жоба файлы');
  eq(fs.existsSync(path.join(tmp, 'plugins', 'state.json.bak')), true, 'күйдің .bak көшірмесі');
});

/* ---------- Геометрия, атрибуттар ---------- */
await t('geo: аудан, бағыт (RFC 7946), тексеру, түрлендіру', () => {
  const sq = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]];
  const o = G.orient(sq, true);
  eq(o[1], [1, 0], 'CCW');
  if (Math.abs(G.area({ type: 'Polygon', coordinates: [sq] }) / 1e6 - 12391.4) > 5) throw new Error('аудан');
  eq(G.validate({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1]]] }).ok, false);
  eq(G.validate({ type: 'Point', coordinates: [200, 0] }).ok, false);
  const u = G.transform({ type: 'Point', coordinates: [68.304, 42.8515] }, 'EPSG:4326', 'EPSG:32642');
  if (Math.abs(u.coordinates[0] - 443133.65) > 1 || Math.abs(u.coordinates[1] - 4744559.2) > 1) throw new Error('UTM ' + u.coordinates);
  eq(G.transform(u, 'EPSG:32642', 'EPSG:4326').coordinates, [68.304, 42.8515]);
  eq(G.utmFor(68.3, 42.8), 'EPSG:32642');
  throws(() => G.transform(u, 'EPSG:28473', 'EPSG:4326'), /Қолдау/);
});
await t('attrs: сәйкестендіру және тексеру', () => {
  const s = { fields: [{ name: 'n', type: 'string', required: true, source: ['a.x', 'b.x'] }, { name: 'h', type: 'number', min: 0, source: 'c' }, { name: 'k', value: 'Mura' }] };
  const r = A.map({ a: { x: '' }, b: { x: 'B' }, c: '1,5' }, s);
  eq(r, { n: 'B', h: 1.5, k: 'Mura' });
  eq(A.validate(r, s).ok, true);
  eq(A.validate({ n: '', h: -1, extra: 1 }, s).errors.map(e => e.field), ['n', 'h', 'extra']);
});

/* ---------- NIPD үлгі плагині (SDK тестілеу құралы арқылы) ---------- */
const NIPD = ROOT + '/plugin-sdk/examples/nipd-exporter';
const fixture = JSON.parse(fs.readFileSync(ROOT + '/plugin-sdk/tools/fixture.json', 'utf8'));
const schema = JSON.parse(fs.readFileSync(NIPD + '/config/nipd-schema.json', 'utf8'));
const sample = JSON.parse(fs.readFileSync(NIPD + '/config/nipd-sample.geojson', 'utf8'));
const fx = o => ({ ...JSON.parse(JSON.stringify(fixture)), ...o });
await t('NIPD: схема нақты НИПД үлгісіне сәйкес (эталон файлы өтеді)', () => {
  for (const f of sample.features) eq(A.validate(f.properties, schema), { ok: true, errors: [] }, f.properties.name);
});
await t('NIPD: ағымдағы аймақ — тек аумақ полигоны, үлгідегідей құрылым, ортақ өрістер, QazTRF-23 белгісі', async () => {
  const r = await run({ dir: NIPD, command: 'export', fixture, out: path.join(tmp, 'out1'), quiet: true });
  eq(r.result.saved, true);
  const fc = JSON.parse(fs.readFileSync(r.saved[0], 'utf8'));
  eq(Object.keys(fc), Object.keys(sample).filter(k => k !== '$comment'), 'жоғарғы деңгей');
  eq(fc.crs, sample.crs, 'crs');
  eq(fc.features.length, 1); eq(fc.features[0].geometry.type, 'Polygon');
  eq(fc.features[0].geometry.coordinates[0].length, 5, '4 нүкте + тұйықтау');
  eq(Object.keys(fc.features[0].properties), Object.keys(sample.features[0].properties), 'өрістер мен реті');
  const p = fc.features[0].properties;
  eq([p.name, p.category_level, p.type, p.monument_kind, p.inclusion_date], ['Городище Отырар', 'Республиканского значения', 'Археологический', 'Городище', '2020-08-18T00:00:00Z']);
  eq(fc.features[0].id, '0123456789abcdef', 'Mura id — Feature.id');
});
await t('NIPD: барлық сақталған аймақтар бір файлға; қатесі барлары түзетуге ұсынылады, тек дұрыстары сақталады', async () => {
  const f1 = fx({ answers: { ...fixture.answers, buttons: ['next', 'save'], values: { ...fixture.answers.values, __scope: 'all' } } });
  const r1 = await run({ dir: NIPD, command: 'export', fixture: f1, out: path.join(tmp, 'out2'), quiet: true });
  eq(r1.result.count, 1, 'тек дұрысы сақталды (екінші аймақтың санаты, түрі жоқ)');
  // Түзету: екінші аймаққа түр енгізіліп, «Қайта тексеру»; санат белгісіз болғандықтан ол бәрібір қате — дұрысы ғана сақталады
  const f2 = fx({ answers: { ...fixture.answers, buttons: ['next', 'recheck', 'save'], values: { ...fixture.answers.values, __scope: 'all', 'fix:1:monument_kind': 'Курган' } } });
  const r2 = await run({ dir: NIPD, command: 'export', fixture: f2, out: path.join(tmp, 'out3'), quiet: true });
  eq(r2.calls.filter(c => c === 'ui.dialog').length, 3, 'қайта тексеру');
  eq(r2.calls.includes('storage.set'), true, 'түзету сақталды');
  const fc = JSON.parse(fs.readFileSync(r2.saved[0], 'utf8'));
  eq(fc.features.length, 1);
});
await t('NIPD: баптау бойынша қазақша деректер және UTM; рұқсат жоқ — экспорт жоқ', async () => {
  const r = await run({ dir: NIPD, command: 'export', fixture: fx({ settings: { lang: 'kk', crs: 'auto-utm' } }), out: path.join(tmp, 'out4'), quiet: true });
  const fc = JSON.parse(fs.readFileSync(r.saved[0], 'utf8'));
  eq(fc.features[0].properties.name, 'Отырар қалашығы');
  eq(fc.crs.properties.name, 'urn:ogc:def:crs:EPSG::32642');
  if (!(fc.features[0].geometry.coordinates[0][0][0] > 400000)) throw new Error('UTM координатасы емес');
  const r2 = await run({ dir: NIPD, command: 'export', fixture, grant: 'geometry.read,attributes.read', out: path.join(tmp, 'out5'), quiet: true });
  eq(r2.saved.length, 0); eq(r2.calls.includes('export.saveFile'), false);
});
await t('NIPD: ортақ өріс бос болса — сақталмайды', async () => {
  const r = await run({ dir: NIPD, command: 'export', fixture: fx({ answers: { dialog: 'primary', values: {} } }), out: path.join(tmp, 'out6'), quiet: true });
  eq(r.result.saved, false); eq(r.saved.length, 0);
  if (!r.result.errors[0].errors.some(e => /inclusion_date/.test(e))) throw new Error('inclusion_date қатесі жоқ');
});
await t('attrs: valueMap және datetime', () => {
  const s = { fields: [{ name: 'c', source: 'm', valueMap: { local: 'Местного значения' } }, { name: 'd', type: 'datetime', source: 'x' }] };
  const r = A.map({ m: 'local', x: '2020-08-18' }, s);
  eq(r, { c: 'Местного значения', d: '2020-08-18T00:00:00Z' }); eq(A.validate(r, s).ok, true);
  eq(A.validate({ c: 'x', d: '2020-08-18' }, s).ok, false);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + ok + '/' + (ok + bad) + ' өтті');
process.exit(bad ? 1 : 0);
