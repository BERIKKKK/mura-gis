/* «Жоспар»: координаталар мен масштаб есептері (DOM-сыз — scripts/test-plan.mjs тексереді).
   • Координаталар WGS 84-те (бағдарламаның жүйесі) сақталады; өлшеу мен сызба үшін — ескерткіш маңындағы метрлік
     жергілікті жазықтық: x — шығысқа, y — солтүстікке, метр (эллипсоидтың M және N радиустары; main/plan-geom.js-пен бірдей).
     Бірнеше жүз метрлік аумақта бұрмалануы 10⁻⁷-ден аз — экран пикселі не градус метр ретінде қолданылмайды.
   • Елді мекенге дейінгі қашықтық пен бастапқы азимут — WGS 84 эллипсоидындағы геодезиялық кері есеп (Винсенти).
   • Қағаздағы өлшем: нақты ұзындық (м) × 1000 ÷ масштаб бөлімі = мм. */
const A = 6378137, F = 1 / 298.257223563, B = A * (1 - F), E2 = F * (2 - F), DEG = Math.PI / 180;

/** Жергілікті метрлік жазықтық (орталығы lat0, lon0). */
export function plane(lat0, lon0) {
  const s = Math.sin(lat0 * DEG), w = 1 - E2 * s * s;
  const M = A * (1 - E2) / Math.pow(w, 1.5), N = A / Math.sqrt(w);
  const kx = N * Math.cos(lat0 * DEG) * DEG, ky = M * DEG;
  return {
    lat0, lon0,
    fwd: (lat, lon) => [(lon - lon0) * kx, (lat - lat0) * ky],
    inv: (x, y) => [lat0 + y / ky, lon0 + x / kx],
  };
}

/** Эллипс жазықтықта [[x, y]…]: cx, cy — орталығы, a, b — толық осьтер, az — үлкен осьтің азимуты (°). */
export function ellipseXY(cx, cy, a, b, az = 0, n = 72) {
  const t = az * DEG, out = [];
  for (let i = 0; i < n; i++) {
    const q = 2 * Math.PI * i / n, u = a / 2 * Math.cos(q), v = b / 2 * Math.sin(q);
    out.push([cx + u * Math.sin(t) + v * Math.cos(t), cy + u * Math.cos(t) - v * Math.sin(t)]);
  }
  return out;
}

/** Нысанның контуры жазықтықта [[x, y]…] (контуры жоқ болса — null). */
export function contourXY(o, P) {
  const c = P.fwd(+o.lat, +o.lon);
  if (o.shape === 'circle' && o.diam > 0) return ellipseXY(c[0], c[1], +o.diam, +o.diam);
  if (o.shape === 'ellipse' && o.ax_a > 0 && o.ax_b > 0) return ellipseXY(c[0], c[1], +o.ax_a, +o.ax_b, +o.ax_az || 0);
  if (o.shape === 'free' && Array.isArray(o.pts) && o.pts.length >= 3) return o.pts.map(p => P.fwd(+p[0], +p[1]));
  return null;
}
/** Нысанның контуры WGS 84-те [[lat, lon]…] (карта үшін). */
export function contourLL(o) {
  if (o.shape === 'free') return Array.isArray(o.pts) && o.pts.length >= 3 ? o.pts : null;
  const P = plane(+o.lat, +o.lon), xy = contourXY(o, P);
  return xy ? xy.map(p => P.inv(p[0], p[1])) : null;
}
export const hasContour = o => !!(o && (o.shape === 'circle' ? o.diam > 0 : o.shape === 'ellipse' ? o.ax_a > 0 && o.ax_b > 0 : o.shape === 'free' ? Array.isArray(o.pts) && o.pts.length >= 3 : false));

/** Жазықтықтағы екі нүктенің арасы, м. */
export const dist2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
/** Жазықтықтағы бағыт: a-дан b-ға азимут (солтүстіктен сағат тілімен, °). */
export const azXY = (a, b) => ((Math.atan2(b[0] - a[0], b[1] - a[1]) / DEG) + 360) % 360;

/** Тұйық сынық сызықтың өзімен қиылысуы (main/plans.js-пен бірдей). */
export function selfIntersects(p) {
  const n = p.length;
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const hit = (a, b, c, d) => {
    const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) continue;
    if (hit(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return true;
  }
  return false;
}

/**
 * Геодезиялық кері есеп (Винсенти, WGS 84): { dist (м), az (бастапқы азимут, °) }.
 * Жинақталмаса (антипод маңы) — сфералық есеп (бұл жағдай жоспарда кездеспейді).
 */
export function inverse(lat1, lon1, lat2, lon2) {
  if (lat1 === lat2 && lon1 === lon2) return { dist: 0, az: 0 };
  const L = (lon2 - lon1) * DEG;
  const U1 = Math.atan((1 - F) * Math.tan(lat1 * DEG)), U2 = Math.atan((1 - F) * Math.tan(lat2 * DEG));
  const sU1 = Math.sin(U1), cU1 = Math.cos(U1), sU2 = Math.sin(U2), cU2 = Math.cos(U2);
  let lam = L, prev, sS, cS, sig, sA, c2A, c2Sm, it = 0;
  do {
    const sl = Math.sin(lam), cl = Math.cos(lam);
    sS = Math.sqrt((cU2 * sl) ** 2 + (cU1 * sU2 - sU1 * cU2 * cl) ** 2);
    if (sS === 0) return { dist: 0, az: 0 };
    cS = sU1 * sU2 + cU1 * cU2 * cl;
    sig = Math.atan2(sS, cS);
    sA = cU1 * cU2 * sl / sS;
    c2A = 1 - sA * sA;
    c2Sm = c2A !== 0 ? cS - 2 * sU1 * sU2 / c2A : 0;
    const C = F / 16 * c2A * (4 + F * (4 - 3 * c2A));
    prev = lam;
    lam = L + (1 - C) * F * sA * (sig + C * sS * (c2Sm + C * cS * (-1 + 2 * c2Sm * c2Sm)));
  } while (Math.abs(lam - prev) > 1e-12 && ++it < 200);
  if (it >= 200) {
    const p1 = lat1 * DEG, p2 = lat2 * DEG, dl = L;
    const d = 2 * 6371008.8 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2));
    const az = Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl));
    return { dist: d, az: (az / DEG + 360) % 360 };
  }
  const u2 = c2A * (A * A - B * B) / (B * B);
  const AA = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
  const BB = u2 / 1024 * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  const dS = BB * sS * (c2Sm + BB / 4 * (cS * (-1 + 2 * c2Sm * c2Sm) - BB / 6 * c2Sm * (-3 + 4 * sS * sS) * (-3 + 4 * c2Sm * c2Sm)));
  const dist = B * AA * (sig - dS);
  const sl = Math.sin(lam), cl = Math.cos(lam);
  const az = Math.atan2(cU2 * sl, cU1 * sU2 - sU1 * cU2 * cl);
  return { dist, az: (az / DEG + 360) % 360 };
}

/* ======================= Масштаб ======================= */
/** Таңдауға болатын масштабтар (1:N) — ірісінен ұсағына қарай. */
export const SCALES = [20, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 25000, 50000];
/** Нақты ұзындық (м) → қағаздағы өлшем (мм). */
export const toMm = (m, scale) => m * 1000 / scale;

/** Сызықтық масштабтың қадамы: 5 бөлік, жалпы ұзындығы қағазда ~55 мм-ге жақын (35–75 мм). */
export function scaleBarStep(scale) {
  let best = null;
  for (let k = -2; k <= 6; k++) for (const m of [1, 2, 2.5, 5]) {
    const s = m * 10 ** k, len = toMm(5 * s, scale);
    if (len < 30 || len > 80) continue;
    const d = Math.abs(len - 55);
    if (!best || d < best.d) best = { s, d };
  }
  return best ? best.s : 10;
}

/* ======================= Жазу пішімі ======================= */
/** Сан: ондық бөлшек үтірмен, артық нөлсіз (0,7; 13; 9,25). */
export function fmtNum(v, digits = 2) {
  if (v === null || v === undefined || !Number.isFinite(+v)) return '—';
  const s = (+v).toFixed(digits).replace(/\.?0+$/, '');
  return (s === '-0' ? '0' : s).replace('.', ',');
}
/** Өлшенбеген мән — «—» (енгізілген 0 — «0»). */
export const fmtMeasure = v => (v === null || v === undefined || v === '' ? '—' : fmtNum(v));
/** Қашықтық: 1 км-ден қысқа — бүтін метр, 1 км-ден бастап — шақырымның ондық үлесіне дейін. */
export function fmtDist(m) {
  if (!Number.isFinite(m)) return '—';
  if (m < 999.5) return Math.round(m) + ' м';
  return (Math.round(m / 100) / 10).toFixed(1).replace('.', ',') + ' км';
}
/** Енгізілген мәтін → сан (үтір не нүкте); бос — null; оқылмаса — NaN. */
export function parseNum(s) {
  const t = String(s ?? '').trim().replace(/\s+/g, '').replace(',', '.');
  if (!t) return null;
  return /^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(t) ? Number(t) : NaN;
}
/** Нөмірлерді табиғи ретпен салыстыру (2 < 10, 1а < 2). */
export const cmpNum = (a, b) => String(a.num ?? a).localeCompare(String(b.num ?? b), 'kk', { numeric: true, sensitivity: 'base' });
