// Android ↔ жұмыс үстелі үйлесімділігін тексеру: жұмыс үстелінің ӨЗ коды (main/gpkg.js, src/marks/export.js,
// src/routes/tracks.js) Node-та іске қосылады. Тек тестілерде қолданылады (core/src/test/.../DesktopCompatTest.kt).
//   node desktop-compat.mjs read-gpkg <file>         — жұмыс үстелі жобаны ашып, marks/routes қабаттарын JSON ретінде шығарады
//   node desktop-compat.mjs write-gpkg <file>        — жұмыс үстелі коды арқылы жоба жасайды (2 белгі, 1 маршрут)
//   node desktop-compat.mjs marks-geojson            — жұмыс үстеліндегі geojson() экспорты (stdout)
//   node desktop-compat.mjs routes-export            — жұмыс үстеліндегі toGeojson() және toGpx() (stdout, JSON)
//   node desktop-compat.mjs find-path <file.json>    — routes/graph.js: желі құрып, жол іздейді ({routes, marks, queries} → нәтижелер)
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

if (cmd === 'read-gpkg') {
  const { Project } = require(path.join(repo, 'main', 'gpkg.js'));
  const p = Project.open(file);
  const out = { meta: p.meta(), marks: p.load('marks'), routes: p.load('routes'), counts: p.counts() };
  // Жұмыс үстелінің өз тексерулері (MarksStore.clean / RoutesStore.clean) Android жазбаларын қабылдай ма
  const { MarksStore } = require(path.join(repo, 'main', 'marks.js'));
  const { RoutesStore } = require(path.join(repo, 'main', 'routes.js'));
  out.marksValid = out.marks.map(m => { try { MarksStore.clean(m); return true; } catch (e) { return e.message; } });
  out.routesValid = out.routes.map(r => { try { RoutesStore.clean(r); return true; } catch (e) { return e.message; } });
  p.close();
  process.stdout.write(JSON.stringify(out));
} else if (cmd === 'write-gpkg') {
  const { Project } = require(path.join(repo, 'main', 'gpkg.js'));
  const p = Project.create(file, { name: 'Desktop test' });
  p.write('marks', MARKS);
  p.write('routes', ROUTES);
  p.close();
} else if (cmd === 'marks-geojson') {
  const { geojson } = await import(pathToFileURL(path.join(repo, 'src', 'marks', 'export.js')).href);
  process.stdout.write(JSON.stringify(geojson(MARKS, 'test')));
} else if (cmd === 'routes-export') {
  const { toGeojson, toGpx } = await import(pathToFileURL(path.join(repo, 'src', 'routes', 'tracks.js')).href);
  process.stdout.write(JSON.stringify({ geojson: toGeojson(ROUTES), gpx: toGpx(ROUTES.map(r => ({ name: r.name, desc: r.note, pts: r.pts }))) }));
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
} else {
  console.error('Белгісіз команда'); process.exit(2);
}
