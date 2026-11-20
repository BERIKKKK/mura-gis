/* Маршрут желісінің тесті (src/routes/graph.js): тораптар, жол табу, көлік/маусым сүзгісі, өнімділік. Іске қосу: node scripts/test-graph.mjs */
import { buildNetwork, findPath, dist, lineLength, simplify } from '../src/routes/graph.js';
const ok = (c, m) => { if (!c) { console.log('✗', m); process.exitCode = 1; } else console.log('✓', m); };
const aktobe = [50.2839, 57.1670];
const M1 = { id: 'm1', name: 'Ескерткіш 1', lat: 50.40, lon: 57.60 };
const M2 = { id: 'm2', name: 'Ескерткіш 2', lat: 50.55, lon: 57.90 };
const M3 = { id: 'm3', name: 'Ескерткіш 3', lat: 50.20, lon: 57.95 };
const line = (a, b, n = 10) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
const off = (p, dm) => [p[0] + dm / 111000, p[1]];          // солтүстікке dm метр
const r1 = { id: 'r1', name: 'Ақтөбе — Е1', a_name: 'Ақтөбе қаласы', pts: line(aktobe, off([M1.lat, M1.lon], 200)), vehicle: 'car', season: 'all' };
const r2 = { id: 'r2', name: 'Е1 — Е2', pts: line(off([M1.lat, M1.lon], -90), [M2.lat, M2.lon]), vehicle: '4x4', season: 'dry' };
// r3: Ақтөбе—Е1 жолының ортасынан (Т-торап) Е3-ке
const mid = r1.pts[5];
const r3 = { id: 'r3', name: 'Тармақ — Е3', pts: line(off(mid, 60), [M3.lat, M3.lon]), vehicle: 'car', season: 'all' };
const net = buildNetwork([r1, r2, r3], [M1, M2, M3]);
console.log('nodes', net.nodes.map(n => (n.name || '?') + (n.markId ? '*' : '')).join(', '), '| edges', net.edges.length);
ok(net.nodes.length === 5, '5 түйін: Ақтөбе, Т-торап, Е1, Е2, Е3');
ok(net.markNode.has('m1') && net.markNode.has('m2') && net.markNode.has('m3'), 'ескерткіштер желіге жабысты');
const akt = net.nodes.find(n => n.name === 'Ақтөбе қаласы');
let r = findPath(net, { node: akt.id }, { markId: 'm2', lat: M2.lat, lon: M2.lon }, { vehicle: '4x4' });
ok(r.ok && r.legs.map(l => l.route.id).join('+') === 'r1+r2', 'Ақтөбе → Е2 = маршрут 1 + маршрут 2 (' + (r.ok ? (r.len / 1000).toFixed(1) + ' км' : r.error) + ')');
const direct = lineLength(r1.pts) + lineLength(r2.pts);
ok(r.ok && Math.abs(r.len - direct) < 400, 'ұзындығы ≈ r1 + r2 (' + (direct / 1000).toFixed(1) + ' км)');
r = findPath(net, { node: akt.id }, { markId: 'm2', lat: M2.lat, lon: M2.lon }, { vehicle: 'car' });
ok(!r.ok, 'жеңіл көлікпен Е2-ге жол жоқ (r2 — жол талғамайтын)');
r = findPath(net, { node: akt.id }, { markId: 'm2', lat: M2.lat, lon: M2.lon }, { vehicle: '4x4', wet: true });
ok(!r.ok, 'жаңбырлы маусымда Е2-ге жол жоқ (r2 — тек құрғақта)');
r = findPath(net, { markId: 'm3', lat: M3.lat, lon: M3.lon }, { markId: 'm2', lat: M2.lat, lon: M2.lon }, { vehicle: '4x4' });
ok(r.ok && r.legs.map(l => l.route.id).join('+') === 'r3+r1+r2', 'Е3 → Е2: Т-торап арқылы r3 + r1 + r2 (' + (r.ok ? (r.len / 1000).toFixed(1) + ' км' : r.error) + ')');
// Кез келген нүктеден: r1-дің ортасынан 2 км жерде
const any = [mid[0] - 0.018, mid[1] + 0.01];
r = findPath(net, { lat: any[0], lon: any[1] }, { markId: 'm1', lat: M1.lat, lon: M1.lon }, { vehicle: 'car' });
ok(r.ok && r.offStart && r.offStart.len > 1000, 'кез келген нүктеден: желіге дейін ' + (r.offStart ? (r.offStart.len / 1000).toFixed(2) : '?') + ' км, жалпы ' + (r.ok ? (r.len / 1000).toFixed(1) : '?') + ' км');
// Х-қиылыс
const x1 = { id: 'x1', name: 'X1', pts: line([51, 58], [51.2, 58.2]), vehicle: 'car' };
const x2 = { id: 'x2', name: 'X2', pts: line([51, 58.2], [51.2, 58]), vehicle: 'car' };
const nx = buildNetwork([x1, x2], []);
ok(nx.nodes.length === 5 && nx.edges.length === 4, 'Х-қиылыс: 5 түйін, 4 қабырға (' + nx.nodes.length + ', ' + nx.edges.length + ')');
r = findPath(nx, { lat: 51, lon: 58 }, { lat: 51, lon: 58.2 }, { vehicle: 'car' });
ok(r.ok && r.legs.length === 2, 'Х-қиылыс арқылы бір маршруттан екіншісіне өту');
// Бір қабырғаның ішінде
r = findPath(nx, { lat: 51.02, lon: 58.02 }, { lat: 51.05, lon: 58.05 }, { vehicle: 'car' });
ok(r.ok && r.len > 3000 && r.len < 5000, 'бір қабырға ішіндегі екі нүкте: ' + (r.ok ? (r.len / 1000).toFixed(2) + ' км' : r.error));
// Жеңілдету
const noisy = Array.from({ length: 500 }, (_, i) => [50 + i * 1e-4 + (i % 2 ? 1e-6 : 0), 57]);
ok(simplify(noisy, 5).length === 2, 'Дуглас–Пекер: түзу трек 2 нүктеге дейін');
// Үлкен желі: өнімділік
const many = [];
for (let i = 0; i < 300; i++) many.push({ id: 'g' + i, name: 'g' + i, pts: line([50 + (i % 20) * 0.05, 57 + Math.floor(i / 20) * 0.05], [50 + (i % 20) * 0.05 + 0.05, 57 + Math.floor(i / 20) * 0.05 + 0.05], 40), vehicle: 'car' });
let t0 = Date.now(); const big = buildNetwork(many, []); const tb = Date.now() - t0;
t0 = Date.now(); r = findPath(big, { lat: 50, lon: 57 }, { lat: 50.95, lon: 57.7 }, { vehicle: 'car' }); const tf = Date.now() - t0;
ok(tb < 3000 && tf < 500, 'өнімділік: 300 маршрут × 41 нүкте — желі ' + tb + ' мс, іздеу ' + tf + ' мс (' + big.nodes.length + ' түйін)');
