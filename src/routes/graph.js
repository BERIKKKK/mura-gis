/* Mura GIS: маршрут желісі және жол іздеу (DOM-сыз таза есептеу — тестілеуге ыңғайлы).
 *
 * Әр маршрут — сынық сызық (pts: [[lat, lon], …]). Желі былай құрылады:
 *   1. Әр маршрутта «кесу нүктелері» табылады: басы мен соңы; басқа маршруттың ұшы осы маршрутқа SNAP_M-ден
 *      жақын келсе (Т-тәрізді торап); екі маршрут қиылысса (Х-тәрізді торап); ескерткіш маршрутқа MARK_M-ден жақын болса.
 *   2. Бір-біріне SNAP_M-ден жақын кесу нүктелері бір түйінге бірігеді. Түйін ескерткішке MARK_M-ден жақын болса —
 *      сол ескерткіштің түйіні (бір ескерткішке жабысқан түйіндер де бірігеді).
 *   3. Кесу нүктелерінің арасы — желінің қабырғасы (ұзындығы — геодезиялық, метр).
 * Жол іздеу — Дейкстра алгоритмі. Басы/соңы: желі түйіні, ескерткіш не картадағы кез келген нүкте
 * (желіге ең жақын нүктеге дейін «желіден тыс» түзу бөлік болып қосылады).
 * Көлік: car — жеңіл көлік жүретін жолдар ғана; 4x4 — жеңіл көлік және жол талғамайтын көлік жолдары; foot — барлығы.
 * Маусым: wet = true болса — тек құрғақ маусымда өтетін (season: 'dry') жолдар алынбайды. */

export const SNAP_M = 150;          // маршрут ұштары мен тораптардың бірігу қашықтығы
export const MARK_M = 300;          // маршрут ескерткішке осыдан жақын өтсе — ескерткіш желіге қосылады
export const VEHICLES = [
  { v: 'car', label: 'Жеңіл көлік', short: 'жеңіл көлік', speed: 50, color: '#2563a8' },
  { v: '4x4', label: 'Жол талғамайтын көлік', short: 'жол талғамайтын', speed: 30, color: '#b4471f' },
  { v: 'foot', label: 'Жаяу', short: 'жаяу', speed: 4.5, color: '#2f7d45' },
];
export const SEASONS = [
  { v: 'all', label: 'Жыл бойы' },
  { v: 'dry', label: 'Тек құрғақ маусымда' },
];
export const vehicleOf = v => VEHICLES.find(x => x.v === v) || VEHICLES[1];
export const seasonOf = v => SEASONS.find(x => x.v === v) || SEASONS[0];
const RANK = { car: 0, '4x4': 1, foot: 2 };

const R = 6371008.8, RAD = Math.PI / 180;
/** Екі нүкте арасындағы қашықтық (м), [lat, lon]. */
export function dist(a, b) {
  const dLat = (b[0] - a[0]) * RAD, dLon = (b[1] - a[1]) * RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
export function lineLength(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]); return s; }

// Жергілікті жазық проекция (lat0 маңында, метр)
const xy = (p, lat0) => [p[1] * RAD * R * Math.cos(lat0 * RAD), p[0] * RAD * R];
const ll = (q, lat0) => [q[1] / R / RAD, q[0] / (R * Math.cos(lat0 * RAD)) / RAD];
/** p нүктесінің [a, b] кесіндісіне проекциясы: { t, point, d } */
function projSeg(p, a, b) {
  const lat0 = p[0];
  const P = xy(p, lat0), A = xy(a, lat0), B = xy(b, lat0);
  const dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy;
  let t = L2 ? ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  const point = ll([A[0] + t * dx, A[1] + t * dy], lat0);
  return { t, point, d: dist(p, point) };
}
/** Сынық сызыққа ең жақын нүкте: { i (кесінді), t, point, d } */
export function nearestOnLine(p, pts) {
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const r = projSeg(p, pts[i], pts[i + 1]);
    if (!best || r.d < best.d) best = { i, t: r.t, point: r.point, d: r.d };
  }
  return best;
}
/** Екі кесіндінің қиылысы: { t, u, point } не null */
function segX(a, b, c, d) {
  const lat0 = a[0];
  const A = xy(a, lat0), B = xy(b, lat0), C = xy(c, lat0), D = xy(d, lat0);
  const r = [B[0] - A[0], B[1] - A[1]], s = [D[0] - C[0], D[1] - C[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const q = [C[0] - A[0], C[1] - A[1]];
  const t = (q[0] * s[1] - q[1] * s[0]) / den, u = (q[0] * r[1] - q[1] * r[0]) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, point: ll([A[0] + t * r[0], A[1] + t * r[1]], lat0) };
}
const bbox = pts => {
  let a = 90, b = 180, c = -90, d = -180;
  for (const p of pts) { if (p[0] < a) a = p[0]; if (p[1] < b) b = p[1]; if (p[0] > c) c = p[0]; if (p[1] > d) d = p[1]; }
  return [a, b, c, d];
};
const PAD = 0.005;     // ≈ 500 м — bbox сүзгісі үшін (SNAP_M, MARK_M-нан үлкен)
const near = (x, y) => !(x[0] > y[2] + PAD || y[0] > x[2] + PAD || x[1] > y[3] + PAD || y[1] > x[3] + PAD);
/** Сынық сызықтың бойындағы орын: кесінді i, t → сызықтың басынан қашықтық бойынша салыстыру үшін */
const pos = c => c.i + c.t;

/* Douglas–Peucker: tol — метр */
export function simplify(pts, tol = 5) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop();
    let md = -1, mi = -1;
    for (let i = a + 1; i < b; i++) { const d = projSeg(pts[i], pts[a], pts[b]).d; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Желіні құру.
 * routes: [{ id, name, a_name, b_name, pts, vehicle, season }]; marks: [{ id, name, lat, lon }]
 * Нәтиже: { nodes: [{ id, lat, lon, name, markId, names }], edges: [{ id, a, b, len, coords, route }], adj, markNode }
 */
export function buildNetwork(routes, marks = []) {
  const rs = routes.filter(r => Array.isArray(r.pts) && r.pts.length >= 2);
  const boxes = rs.map(r => bbox(r.pts));
  const cuts = rs.map(r => [
    { i: 0, t: 0, point: r.pts[0], end: 'a' },
    { i: r.pts.length - 2, t: 1, point: r.pts[r.pts.length - 1], end: 'b' },
  ]);
  const nearEnd = (r, c) => dist(c.point, r.pts[0]) < SNAP_M || dist(c.point, r.pts[r.pts.length - 1]) < SNAP_M;

  // Т-тәрізді тораптар: бір маршруттың ұшы екіншісінің ортасына жақын
  rs.forEach((r1, k1) => {
    for (const e of [r1.pts[0], r1.pts[r1.pts.length - 1]]) {
      rs.forEach((r2, k2) => {
        if (k1 === k2 || !near([e[0], e[1], e[0], e[1]], boxes[k2])) return;
        const n = nearestOnLine(e, r2.pts);
        if (n && n.d < SNAP_M && !nearEnd(r2, n)) cuts[k2].push({ i: n.i, t: n.t, point: n.point });
      });
    }
  });
  // Х-тәрізді тораптар: екі маршрут қиылысады
  for (let k1 = 0; k1 < rs.length; k1++) {
    for (let k2 = k1 + 1; k2 < rs.length; k2++) {
      if (!near(boxes[k1], boxes[k2])) continue;
      const p1 = rs[k1].pts, p2 = rs[k2].pts;
      for (let i = 0; i < p1.length - 1; i++) {
        const sb = bbox([p1[i], p1[i + 1]]);
        for (let j = 0; j < p2.length - 1; j++) {
          if (!near(sb, bbox([p2[j], p2[j + 1]]))) continue;
          const x = segX(p1[i], p1[i + 1], p2[j], p2[j + 1]);
          if (!x) continue;
          const c1 = { i, t: x.t, point: x.point }, c2 = { i: j, t: x.u, point: x.point };
          if (!nearEnd(rs[k1], c1)) cuts[k1].push(c1);
          if (!nearEnd(rs[k2], c2)) cuts[k2].push(c2);
        }
      }
    }
  }
  // Маршрут ескерткіштің жанынан өтеді
  for (const m of marks) {
    const p = [m.lat, m.lon];
    rs.forEach((r, k) => {
      if (!near([p[0], p[1], p[0], p[1]], boxes[k])) return;
      const n = nearestOnLine(p, r.pts);
      if (n && n.d < MARK_M && !(dist(p, r.pts[0]) < MARK_M || dist(p, r.pts[r.pts.length - 1]) < MARK_M)) cuts[k].push({ i: n.i, t: n.t, point: n.point, mark: m.id });
    });
  }

  // Кесу нүктелерін түйіндерге біріктіру (union–find)
  const all = [];
  cuts.forEach((cs, k) => cs.forEach(c => { c.k = k; c.n = all.length; all.push(c); }));
  const par = all.map((_, i) => i);
  const find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) par[b] = a; };
  const cell = p => Math.floor(p[0] / 0.002) + ':' + Math.floor(p[1] / 0.003);      // ≈ 220 × 210–330 м
  const grid = new Map();
  all.forEach(c => { const k = cell(c.point); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(c); });
  for (const c of all) {
    const a = Math.floor(c.point[0] / 0.002), b = Math.floor(c.point[1] / 0.003);
    for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
      for (const o of grid.get((a + da) + ':' + (b + db)) || []) if (o.n > c.n && dist(o.point, c.point) < SNAP_M) join(c.n, o.n);
    }
  }
  // Ескерткіштер: түйін ескерткішке MARK_M-ден жақын болса — сол ескерткіштікі
  const groups = new Map();
  all.forEach(c => { const g = find(c.n); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); });
  const markOf = new Map();          // топ → ескерткіш
  for (const [g, cs] of groups) {
    const hinted = cs.find(c => c.mark);
    if (hinted) { markOf.set(g, marks.find(m => m.id === hinted.mark)); continue; }
    const cen = [cs.reduce((s, c) => s + c.point[0], 0) / cs.length, cs.reduce((s, c) => s + c.point[1], 0) / cs.length];
    let best = null, bd = MARK_M;
    for (const m of marks) { const d = dist(cen, [m.lat, m.lon]); if (d < bd) { bd = d; best = m; } }
    if (best) markOf.set(g, best);
  }
  // Бір ескерткішке жабысқан топтар бірігеді
  const byMark = new Map();
  for (const [g, m] of markOf) { if (byMark.has(m.id)) join(byMark.get(m.id), g); else byMark.set(m.id, g); }

  const nodes = [], nodeOf = new Map();
  for (const c of all) {
    const g = find(c.n);
    if (!nodeOf.has(g)) {
      nodeOf.set(g, nodes.length);
      nodes.push({ id: nodes.length, pts: [], names: new Set(), markId: '' });
    }
    const nd = nodes[nodeOf.get(g)];
    nd.pts.push(c.point);
    const r = rs[c.k];
    if (c.end === 'a' && r.a_name) nd.names.add(r.a_name);
    if (c.end === 'b' && r.b_name) nd.names.add(r.b_name);
    c.node = nd.id;
  }
  for (const [g, m] of markOf) { const nd = nodes[nodeOf.get(find(g))]; if (nd && !nd.markId) { nd.markId = m.id; nd.mark = m; } }
  for (const nd of nodes) {
    if (nd.mark) { nd.lat = nd.mark.lat; nd.lon = nd.mark.lon; nd.name = nd.mark.name; }
    else { nd.lat = nd.pts.reduce((s, p) => s + p[0], 0) / nd.pts.length; nd.lon = nd.pts.reduce((s, p) => s + p[1], 0) / nd.pts.length; nd.name = [...nd.names][0] || ''; }
    nd.names = [...nd.names];
    delete nd.pts; delete nd.mark;
  }

  // Қабырғалар: әр маршрут кесу нүктелерімен бөліктерге бөлінеді
  const edges = [];
  rs.forEach((r, k) => {
    const cs = cuts[k].slice().sort((a, b) => pos(a) - pos(b));
    let prev = cs[0];
    for (let q = 1; q < cs.length; q++) {
      const c = cs[q];
      if (c.node === prev.node && q < cs.length - 1) continue;      // бір түйінге жататын қатар нүктелер
      const coords = [prev.point];
      for (let i = prev.i + 1; i <= c.i; i++) coords.push(r.pts[i]);
      coords.push(c.point);
      const len = lineLength(coords);
      if (c.node !== prev.node || len > 2 * SNAP_M) edges.push({ id: edges.length, a: prev.node, b: c.node, len, coords, route: r });
      prev = c;
    }
  });
  const adj = nodes.map(() => []);
  for (const e of edges) { adj[e.a].push(e); if (e.b !== e.a) adj[e.b].push(e); }
  const markNode = new Map(nodes.filter(n => n.markId).map(n => [n.markId, n.id]));
  return { nodes, edges, adj, markNode };
}

/** Қабырғаны маршруттың сүзгісімен тексеру. */
export function allowed(route, opt = {}) {
  const need = RANK[route.vehicle] ?? 1, have = RANK[opt.vehicle || '4x4'] ?? 1;
  if (need > have) return false;
  if (opt.wet && route.season === 'dry') return false;
  return true;
}
const speedOf = (route, opt) => (opt.vehicle === 'foot' ? 4.5 : vehicleOf(route.vehicle).speed) * 1000 / 3600;   // м/с

/** p нүктесіне ең жақын рұқсат етілген қабырға: { edge, i, t, point, d } */
export function nearestEdge(net, p, opt = {}) {
  let best = null;
  for (const e of net.edges) {
    if (!allowed(e.route, opt)) continue;
    const n = nearestOnLine(p, e.coords);
    if (n && (!best || n.d < best.d)) best = { edge: e, ...n };
  }
  return best;
}

/** Нүктенің желідегі орны: түйін (id) не қабырғаның ортасындағы уақытша нүкте. */
function locate(net, end, opt) {
  if (end.node != null) { const n = net.nodes[end.node]; return n ? { node: n.id, at: [n.lat, n.lon], off: 0 } : null; }
  if (end.markId && net.markNode.has(end.markId)) return { node: net.markNode.get(end.markId), at: [end.lat, end.lon], off: 0 };
  const p = [end.lat, end.lon];
  const ne = nearestEdge(net, p, opt);
  if (!ne) return null;
  const e = ne.edge;
  // Қабырға ұшына жақын болса — сол түйін
  const toA = [...e.coords.slice(0, ne.i + 1), ne.point], toB = [ne.point, ...e.coords.slice(ne.i + 1)];
  const la = lineLength(toA), lb = lineLength(toB);
  if (la < SNAP_M) return { node: e.a, at: p, off: ne.d, offPt: ne.point };
  if (lb < SNAP_M) return { node: e.b, at: p, off: ne.d, offPt: ne.point };
  return { edge: e, toA, toB, la, lb, at: p, off: ne.d, offPt: ne.point };
}

/** Екілік үйме (min-heap) */
class Heap {
  constructor() { this.a = []; }
  push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  }
  get size() { return this.a.length; }
}

/**
 * Жол іздеу. from, to: { node } | { markId, lat, lon } | { lat, lon }.
 * Нәтиже: { ok, error, legs: [{ route, len, coords, from, to }], len, time, coords, offStart, offEnd }
 */
export function findPath(net, from, to, opt = {}) {
  const A = locate(net, from, opt), B = locate(net, to, opt);
  if (!A || !B) return { ok: false, error: 'Желіде маршрут жоқ (не таңдалған көлікке сай маршрут жоқ).' };
  const N = net.nodes.length, S = N, T = N + 1;     // уақытша басы мен соңы
  const extra = new Map();                           // уақытша қабырғалар: түйін → [{ to, len, coords, route }]
  const addX = (u, v, len, coords, route) => {
    if (!extra.has(u)) extra.set(u, []);
    if (!extra.has(v)) extra.set(v, []);
    extra.get(u).push({ to: v, len, coords, route });
    extra.get(v).push({ to: u, len, coords: coords.slice().reverse(), route });
  };
  const src = A.node != null ? A.node : S, dst = B.node != null ? B.node : T;
  if (A.edge) { addX(S, A.edge.a, A.la, A.toA.slice().reverse(), A.edge.route); addX(S, A.edge.b, A.lb, A.toB, A.edge.route); }
  if (B.edge) { addX(T, B.edge.a, B.la, B.toA.slice().reverse(), B.edge.route); addX(T, B.edge.b, B.lb, B.toB, B.edge.route); }
  // Екеуі бір қабырғада болса — тікелей бөлік
  if (A.edge && B.edge && A.edge === B.edge) {
    const e = A.edge, pa = A.toA.length, pb = B.toA.length;
    const sub = pa <= pb ? [A.offPt, ...e.coords.slice(pa - 1, pb - 1), B.offPt] : [A.offPt, ...e.coords.slice(pb - 1, pa - 1).reverse(), B.offPt];
    addX(S, T, lineLength(sub), sub, e.route);
  }
  const cost = (len, route) => len / speedOf(route, opt);
  const best = new Map([[src, 0]]), prev = new Map();
  const h = new Heap();
  h.push(0, src);
  while (h.size) {
    const [d, u] = h.pop();
    if (d > (best.get(u) ?? Infinity)) continue;
    if (u === dst) break;
    const outs = [];
    if (u < N) for (const e of net.adj[u]) { if (allowed(e.route, opt)) outs.push({ to: e.a === u ? e.b : e.a, len: e.len, coords: e.a === u ? e.coords : e.coords.slice().reverse(), route: e.route }); }
    for (const x of extra.get(u) || []) outs.push(x);
    for (const o of outs) {
      const nd = d + cost(o.len, o.route);
      if (nd < (best.get(o.to) ?? Infinity)) { best.set(o.to, nd); prev.set(o.to, { from: u, ...o }); h.push(nd, o.to); }
    }
  }
  if (src !== dst && !prev.has(dst)) return { ok: false, error: 'Бұл екі нүктені жалғайтын маршрут желіде жоқ (таңдалған көлік пен маусымға сай).', A, B };
  // Жолды қалпына келтіру: маршрут бойынша бөліктерге біріктіреміз
  const steps = [];
  for (let v = dst; v !== src;) { const p = prev.get(v); steps.unshift(p); v = p.from; }
  const legs = [];
  for (const s of steps) {
    const last = legs[legs.length - 1];
    if (last && last.route === s.route) { last.coords.push(...s.coords.slice(1)); last.len += s.len; last.to = s.to; }
    else legs.push({ route: s.route, len: s.len, coords: s.coords.slice(), from: s.from, to: s.to });
  }
  const coords = legs.flatMap((l, i) => (i ? l.coords.slice(1) : l.coords));
  const len = legs.reduce((s, l) => s + l.len, 0);
  const time = legs.reduce((s, l) => s + cost(l.len, l.route), 0);
  return {
    ok: true, legs, len, time, coords,
    offStart: A.off > 1 ? { from: A.at, to: A.offPt || A.at, len: A.off } : null,
    offEnd: B.off > 1 ? { from: B.offPt || B.at, to: B.at, len: B.off } : null,
    A, B,
  };
}
