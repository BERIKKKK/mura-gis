// Android ↔ жұмыс үстелі үйлесімділігін тексеру: жұмыс үстелінің ӨЗ коды (main/gpkg.js, src/marks/export.js,
// src/routes/tracks.js) Node-та іске қосылады. Тек тестілерде қолданылады (core/src/test/.../DesktopCompatTest.kt).
//   node desktop-compat.mjs read-gpkg <file>         — жұмыс үстелі жобаны ашып, marks/routes қабаттарын JSON ретінде шығарады
//   node desktop-compat.mjs write-gpkg <file>        — жұмыс үстелі коды арқылы жоба жасайды (2 белгі, 1 маршрут)
//   node desktop-compat.mjs marks-geojson            — жұмыс үстеліндегі geojson() экспорты (stdout)
//   node desktop-compat.mjs routes-export            — жұмыс үстеліндегі toGeojson() және toGpx() (stdout, JSON)
//   node desktop-compat.mjs regions                  — src/js/regions.js: облыстар, аудандар және олардың орысша атаулары (JSON)
//   node desktop-compat.mjs find-path <file.json>    — routes/graph.js: желі құрып, жол іздейді ({routes, marks, queries} → нәтижелер)
//   node desktop-compat.mjs sync <dir> <gpkg> <edit.json> — main/sync/engine.js: қалтадағы «бұлтпен» синхрондау (Android ↔ жұмыс үстелі)
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const require = createRequire(import.meta.url);
const [cmd, file] = process.argv.slice(2);

const MARKS = [
  { id: '0123456789abcdef', name: 'Сүткент қалашығы', period: 'IX–XV ғғ.', oblast: 'Түркістан облысы', district: 'Байдібек ауданы', place: 'Сүткент ауылынан 2 км',
    type: 'archeo', category: 'rep', status: 'state', note: 'ескертпе', lat: 42.6512345, lon: 68.1234567, created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-02-01T00:00:00.000Z' },
  { id: 'fedcba9876543210', name: 'Қабантау-ІҮ қорғаны', period: 'б.з.б. V ғ.', oblast: 'Түркістан облысы', district: '', place: '',
    type: 'sacred', category: '', status: 'prelim', note: '', lat: 43.1, lon: 69.2, created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-03-01T00:00:00.000Z' },
];
const ROUTES = [{ id: 'aaaaaaaaaaaaaaaa', name: 'Шымкент — Сүткент', a_name: 'Шымкент', b_name: 'Сүткент', vehicle: 'car', season: 'dry', checked: '2025-05-01', note: 'жол',
  pts: [[42.3, 69.6], [42.5, 68.9], [42.6512345, 68.1234567]], updated_at: '2025-04-01T00:00:00.000Z' }];

// Өзге нысандар — жұмыс үстеліндегі жазба пішімі (main/places.js): name — қазақша, name_ru — орысша
const PLACES = [{ id: 'bbbbbbbbbbbbbbbb', name: 'Ақбұлақ', name_ru: 'Акбулак', kind: 'spring', lat: 49.1234567, lon: 57.7654321,
  created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-05-01T00:00:00.000Z' }];

if (cmd === 'read-gpkg') {
  const { Project } = require(path.join(repo, 'main', 'gpkg.js'));
  const p = Project.open(file);
  const out = { meta: p.meta(), marks: p.load('marks'), routes: p.load('routes'), places: p.load('places'), counts: p.counts() };
  // Жұмыс үстелінің өз тексерулері (MarksStore.clean / RoutesStore.clean) Android жазбаларын қабылдай ма
  const { MarksStore } = require(path.join(repo, 'main', 'marks.js'));
  const { RoutesStore } = require(path.join(repo, 'main', 'routes.js'));
  out.marksValid = out.marks.map(m => { try { MarksStore.clean(m); return true; } catch (e) { return e.message; } });
  out.routesValid = out.routes.map(r => { try { RoutesStore.clean(r); return true; } catch (e) { return e.message; } });
  const { PlacesStore } = require(path.join(repo, 'main', 'places.js'));
  out.placesValid = out.places.map(x => { try { return PlacesStore.clean(x).kind === x.kind; } catch (e) { return e.message; } });
  p.close();
  process.stdout.write(JSON.stringify(out));
} else if (cmd === 'write-gpkg') {
  const { Project } = require(path.join(repo, 'main', 'gpkg.js'));
  const p = Project.create(file, { name: 'Desktop test' });
  p.write('marks', MARKS);
  p.write('routes', ROUTES);
  p.write('places', PLACES);
  p.close();
} else if (cmd === 'marks-geojson') {
  const { geojson } = await import(pathToFileURL(path.join(repo, 'src', 'marks', 'export.js')).href);
  process.stdout.write(JSON.stringify(geojson(MARKS, 'test')));
} else if (cmd === 'routes-export') {
  const { toGeojson, toGpx } = await import(pathToFileURL(path.join(repo, 'src', 'routes', 'tracks.js')).href);
  process.stdout.write(JSON.stringify({ geojson: toGeojson(ROUTES), gpx: toGpx(ROUTES.map(r => ({ name: r.name, desc: r.note, pts: r.pts }))) }));
} else if (cmd === 'regions') {
  const fs = await import('node:fs');
  const vm = await import('node:vm');
  const ctx = { window: {}, document: { getElementById: () => null }, localStorage: { getItem: () => null, setItem() {} } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(repo, 'src', 'js', 'regions.js'), 'utf8'), ctx);
  const R = ctx.window.MuraRegions;
  process.stdout.write(JSON.stringify(R.list.map(r => ({ kk: r.name, ru: R.ru(r.name), city: !!r.city,
    units: r.units.map(u => ({ kk: u.v, ru: R.ru(u.v, r.name), note: u.note || '' })) }))));
} else if (cmd === 'find-path') {
  const { buildNetwork, findPath } = await import(pathToFileURL(path.join(repo, 'src', 'routes', 'graph.js')).href);
  const fs = await import('node:fs');
  const inp = JSON.parse(fs.readFileSync(file, 'utf8'));
  const net = buildNetwork(inp.routes, inp.marks);
  const out = inp.queries.map(q => {
    const r = findPath(net, q.from, q.to, q.opt);
    return r.ok ? { ok: true, len: r.len, time: r.time, n: r.coords.length, legs: r.legs.map(l => l.route.id),
      offStart: r.offStart ? r.offStart.len : 0, offEnd: r.offEnd ? r.offEnd.len : 0 } : { ok: false };
  });
  process.stdout.write(JSON.stringify({ nodes: net.nodes.length, edges: net.edges.length, results: out }));
} else if (cmd === 'sync') {
  // Синхрондау: <dir> — «бұлт» (файлдар қалтасы), <gpkg> — жұмыс үстелінің жобасы (жоқ болса құрылады), <edit> — JSON
  // { project, device, marks?: [жаңа/өзгерген белгілер], del?: [id] }. Жұмыс үстелінің ӨЗ қозғалтқышы (main/sync/engine.js)
  // Android жазған файлдарды оқиды, өз өзгерісін жариялайды; stdout — жобаның marks/routes қабаттары мен күйі.
  const fs = require('node:fs');
  const [gpkgFile, editFile] = process.argv.slice(4);
  const E = require(path.join(repo, 'main', 'sync', 'engine.js'));
  const { gpkgLocal } = require(path.join(repo, 'main', 'sync', 'index.js'));
  const { Project } = require(path.join(repo, 'main', 'gpkg.js'));
  const { MarksStore } = require(path.join(repo, 'main', 'marks.js'));
  const edit = JSON.parse(fs.readFileSync(editFile, 'utf8'));
  const dir = file;
  const crypto = require('node:crypto');
  const rev = t => crypto.createHash('sha1').update(t).digest('hex');      // нұсқа — мазмұн хеші (Kotlin тестіндегідей)
  const cloud = {
    list: async () => fs.readdirSync(dir).filter(n => n.endsWith('.json')).map(n => ({ name: n, rev: rev(fs.readFileSync(path.join(dir, n))) })),
    read: async f => fs.readFileSync(path.join(dir, f.name), 'utf8'),
    write: async (name, text) => { fs.writeFileSync(path.join(dir, name), text); return { name, rev: rev(Buffer.from(text)) }; },
  };
  const p = fs.existsSync(gpkgFile) ? Project.open(gpkgFile) : Project.create(gpkgFile, { name: 'Жұмыс үстелі', sync_id: edit.project });
  const stFile = gpkgFile + '.state.json';
  const state = E.fixState(fs.existsSync(stFile) ? JSON.parse(fs.readFileSync(stFile, 'utf8')) : null, edit.project, edit.device);
  const persist = s => fs.writeFileSync(stFile, JSON.stringify(s));
  const run = async () => E.syncProject({ cloud, files: await cloud.list(), local: gpkgLocal(p), state, device: { id: edit.device, name: 'PC', platform: 'desktop' }, persist });
  const r1 = await run();
  const ms = new MarksStore(p.table('marks'), p.table('imports'));
  for (const m of edit.marks || []) {
    const cur = ms.list().find(x => x.id === m.id);
    ms.save(JSON.stringify({ ...(cur || {}), ...m }));
  }
  if ((edit.del || []).length) ms.remove(edit.del.join(','));
  const r2 = await run();
  process.stdout.write(JSON.stringify({ marks: p.load('marks'), routes: p.load('routes'), meta: p.meta(), conflicts: Object.keys(state.conflicts), r1, r2 }));
  p.close();
} else {
  console.error('Белгісіз команда'); process.exit(2);
}
