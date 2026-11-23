/* «Жоспар»: биіктік нүктелерінен горизонтальдар (docs/PLAN-STAGE3.md, 3-кезең, Д жолы). DOM-сыз модуль.
   1) Делоне үшбұрыштауы (Бойер–Ватсон) — метрлік жазықтықта; 2) әр үшбұрыш пен әр деңгей үшін сызықтық интерполяция
   (жалпақ қималар); 3) кесінділерді ортақ қабырғалар арқылы сызықтарға біріктіру; 4) қажет болса — Чайкин тегістеуі.
   Шеткі ұзын үшбұрыштар (дөңес қабықтың «көпірлері») maxEdge-ден ұзын болса алынады — деректер жоқ жерде жалған горизонталь салынбайды. */

export const MAX_POINTS = 6000;

/** Делоне үшбұрыштауы: pts [[x, y]…] → үшбұрыштар [[i, j, k]…] (қайталанған нүктелер алдын ала алынуы керек). */
export function delaunay(pts) {
  const n = pts.length;
  if (n < 3) return [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1]; }
  const d = Math.max(x1 - x0, y1 - y0) || 1, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  // Барлығын қамтитын «супер үшбұрыш»
  const P = pts.concat([[mx - 20 * d, my - d], [mx, my + 20 * d], [mx + 20 * d, my - d]]);
  const circ = (a, b, c) => {
    const A = P[a], B = P[b], C = P[c];
    const D = 2 * (A[0] * (B[1] - C[1]) + B[0] * (C[1] - A[1]) + C[0] * (A[1] - B[1]));
    if (Math.abs(D) < 1e-12) return { x: 0, y: 0, r2: Infinity };
    const a2 = A[0] * A[0] + A[1] * A[1], b2 = B[0] * B[0] + B[1] * B[1], c2 = C[0] * C[0] + C[1] * C[1];
    const x = (a2 * (B[1] - C[1]) + b2 * (C[1] - A[1]) + c2 * (A[1] - B[1])) / D, y = (a2 * (C[0] - B[0]) + b2 * (A[0] - C[0]) + c2 * (B[0] - A[0])) / D;
    return { x, y, r2: (A[0] - x) ** 2 + (A[1] - y) ** 2 };
  };
  let tris = [{ v: [n, n + 1, n + 2], c: circ(n, n + 1, n + 2) }];
  for (let i = 0; i < n; i++) {
    const p = P[i], bad = [], keep = [];
    for (const t of tris) ((p[0] - t.c.x) ** 2 + (p[1] - t.c.y) ** 2 < t.c.r2 ? bad : keep).push(t);
    // Жойылған үшбұрыштардың шекарасы (бір рет кездесетін қабырғалар)
    const edges = new Map();
    for (const t of bad) for (const [a, b] of [[t.v[0], t.v[1]], [t.v[1], t.v[2]], [t.v[2], t.v[0]]]) {
      const k = a < b ? a + ',' + b : b + ',' + a;
      edges.set(k, edges.has(k) ? null : [a, b]);
    }
    for (const e of edges.values()) if (e) keep.push({ v: [e[0], e[1], i], c: circ(e[0], e[1], i) });
    tris = keep;
  }
  return tris.filter(t => t.v.every(k => k < n)).map(t => t.v);
}

/** Чайкин тегістеуі (ұштары орнында қалады; тұйық сызықта — тұйық күйі сақталады). */
function chaikin(line, closed, iter = 2) {
  let p = line;
  for (let k = 0; k < iter; k++) {
    const out = closed ? [] : [p[0]];
    const m = closed ? p.length - 1 : p.length - 1;
    for (let i = 0; i < m; i++) {
      const a = p[i], b = p[i + 1];
      out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    if (closed) out.push(out[0]); else out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}

/** Жиі кездесетін қабырға ұзындығы (медиана) — maxEdge-ді автоматты таңдау үшін. */
export function medianEdge(pts, tris) {
  const L = [];
  for (const t of tris) for (let k = 0; k < 3; k++) { const a = pts[t[k]], b = pts[t[(k + 1) % 3]]; L.push(Math.hypot(a[0] - b[0], a[1] - b[1])); }
  L.sort((a, b) => a - b);
  return L.length ? L[Math.floor(L.length / 2)] : 0;
}

/**
 * Горизонтальдар: pts [[x, y, z]…] (метр), o — { step (м), maxEdge (м; 0 — автоматты: медиананың 4 еселігі), smooth (bool), base (0) }.
 * Нәтиже: { lines: [{ value, pts: [[x, y]…], closed }], tris, zmin, zmax, maxEdge }.
 */
export function contours(pts, o = {}) {
  const step = +o.step;
  if (!(step > 0)) throw new Error('step');
  // Бірдей нүктелер (1 мм дәлдікпен) — біреуі қалады
  const seen = new Set(), P = [];
  for (const p of pts) {
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) continue;
    const k = Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000);
    if (!seen.has(k)) { seen.add(k); P.push(p); }
  }
  const tris0 = delaunay(P);
  const maxEdge = o.maxEdge > 0 ? +o.maxEdge : 4 * medianEdge(P, tris0);
  const len = (a, b) => Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1]);
  const tris = tris0.filter(t => len(t[0], t[1]) <= maxEdge && len(t[1], t[2]) <= maxEdge && len(t[2], t[0]) <= maxEdge);
  let zmin = Infinity, zmax = -Infinity;
  for (const p of P) { if (p[2] < zmin) zmin = p[2]; if (p[2] > zmax) zmax = p[2]; }
  const base = +o.base || 0, lines = [];
  if (!tris.length) return { lines, tris, zmin, zmax, maxEdge };
  // Деңгейдегі нүкте қиманы екіұдай етпеуі үшін биіктік сәл ығыстырылады (z === L → z + ε)
  const eps = step * 1e-7;
  // Ең төменгі не ең биік нүктенің деңгейіндегі горизонталь нүктеге айналады — алынбайды
  for (let L = Math.ceil((zmin - base) / step) * step + base; L < zmax - 1e-9; L += step) {
    const lv = Math.round(L * 1e6) / 1e6;
    if (lv <= zmin + 1e-9) continue;
    const zz = i => (P[i][2] === lv ? lv + eps : P[i][2]);
    const at = (a, b) => { const t = (lv - zz(a)) / (zz(b) - zz(a)); return [P[a][0] + t * (P[b][0] - P[a][0]), P[a][1] + t * (P[b][1] - P[a][1])]; };
    // Кесінділер: қабырғаның кілті → нүкте; әр үшбұрыштан бір кесінді (екі қабырға арасы)
    const pos = new Map(), link = new Map();
    const ek = (a, b) => (a < b ? a + ',' + b : b + ',' + a);
    for (const t of tris) {
      const cut = [];
      for (let k = 0; k < 3; k++) {
        const a = t[k], b = t[(k + 1) % 3];
        if ((zz(a) - lv) * (zz(b) - lv) < 0) { const key = ek(a, b); if (!pos.has(key)) pos.set(key, at(a, b)); cut.push(key); }
      }
      if (cut.length !== 2) continue;
      for (const [u, v] of [[cut[0], cut[1]], [cut[1], cut[0]]]) { if (!link.has(u)) link.set(u, []); link.get(u).push(v); }
    }
    // Сызықтарға біріктіру: алдымен ашық сызықтар (ұштары — бір көршісі бар қабырғалар), содан кейін тұйықтары
    const used = new Set();
    const walk = start => {
      const chain = [start];
      used.add(start);
      let cur = start;
      for (;;) {
        const nx = (link.get(cur) || []).find(x => !used.has(x));
        if (!nx) break;
        used.add(nx); chain.push(nx); cur = nx;
      }
      return chain;
    };
    const emit = (chain, closed) => {
      let p = chain.map(k => pos.get(k));
      if (closed) p.push(p[0]);
      if (p.length < 2) return;
      if (o.smooth && p.length >= 3) p = chaikin(p, closed);
      lines.push({ value: lv, pts: p, closed });
    };
    for (const [k, nb] of link) if (nb.length === 1 && !used.has(k)) emit(walk(k), false);
    for (const k of link.keys()) if (!used.has(k)) emit(walk(k), true);
  }
  return { lines, tris, zmin, zmax, maxEdge };
}
