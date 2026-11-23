/* «Жоспар»: импорттағы координаттар жүйелері (docs/PLAN-STAGE3.md, 3-кезең). DOM-сыз модуль.
   Ішкі шарт: x — шығыс (Easting; геодезияда Y), y — солтүстік (Northing; геодезияда X). Нәтиже — [lat, lon] (WGS 84).
     wgs84 — x = бойлық, y = ендік (градус);
     utm   — UTM WGS 84, солтүстік жарты шар, аймағы 38–46 (Қазақстан — 39–45);
     sk42  — Пулково 1942, Гаусс–Крюгер 6°, аймағы 7–15 (x аймақ нөмірімен «8 500 000» не онсыз «500 000» болуы мүмкін);
             Пулково 1942 → WGS 84 — Гельмерт түрлендіруі (дәлдігі ≈ 1–5 м; параметрлері main/gpkg-read.js-пен бірдей);
     local — тахеометрдің жергілікті жүйесі: бір тірек нүктесінің жергілікті координатасы мен WGS 84 орны, торды бұру бұрышы
             (тордың солтүстігі шын солтүстіктен сағат тілімен, °); масштаб 1. Шағын аумақ үшін (бірнеше км) — метрлік жазықтық.
   Көлденең Меркатор формулалары (Снайдер) main/gpkg-read.js-тегі tmInverse/tmForward-пен бірдей: ол негізгі процесте, бұл — бетте. */
import { plane } from './geo.js';

const DEG = Math.PI / 180;
const ELL = { wgs84: [6378137, 298.257223563], krass: [6378245, 298.3] };
// Пулково 1942 → WGS 84 («position vector»): dx, dy, dz (м), rx, ry, rz (″), ds (ppm)
const SK42 = [23.57, -140.95, -79.8, 0, 0.35, 0.79, -0.22];

export const CRS_LIST = [
  { v: 'wgs84', kk: 'WGS 84 — ендік / бойлық (градус)', ru: 'WGS 84 — широта / долгота (градусы)' },
  { v: 'utm', kk: 'UTM (WGS 84), солтүстік аймақ', ru: 'UTM (WGS 84), северная зона' },
  { v: 'sk42', kk: 'СК-42 (Пулково 1942), Гаусс–Крюгер', ru: 'СК-42 (Пулково 1942), Гаусс–Крюгер' },
  { v: 'local', kk: 'Жергілікті жүйе (тахеометр) — тірек нүктесі бойынша', ru: 'Местная система (тахеометр) — по опорной точке' },
];

function meridian(a, e2) {
  return phi => a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi) +
    (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi) - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi));
}
/** Көлденең Меркатор, кері есеп: (x, y) → [lon, lat] градус. */
export function tmInverse(o) {
  const [a, rf] = o.ell, f = 1 / rf, e2 = f * (2 - f), ep2 = e2 / (1 - e2), e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  return (x, y) => {
    const M = y / o.k0, mu = M / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
    const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) +
      (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
    const s = Math.sin(p1), c = Math.cos(p1), T = Math.tan(p1) ** 2, C = ep2 * c * c;
    const N = a / Math.sqrt(1 - e2 * s * s), R = a * (1 - e2) / (1 - e2 * s * s) ** 1.5, D = (x - o.fe) / (N * o.k0);
    const lat = p1 - (N * Math.tan(p1) / R) * (D * D / 2 - (5 + 3 * T + 10 * C - 4 * C * C - 9 * ep2) * D ** 4 / 24 +
      (61 + 90 * T + 298 * C + 45 * T * T - 252 * ep2 - 3 * C * C) * D ** 6 / 720);
    const lon = o.lon0 * DEG + (D - (1 + 2 * T + C) * D ** 3 / 6 + (5 - 2 * C + 28 * T - 3 * C * C + 8 * ep2 + 24 * T * T) * D ** 5 / 120) / c;
    return [lon / DEG, lat / DEG];
  };
}
/** Көлденең Меркатор, тура есеп: (lon, lat) → [x, y] (тесттер мен жүйені болжау үшін). */
export function tmForward(o) {
  const [a, rf] = o.ell, f = 1 / rf, e2 = f * (2 - f), ep2 = e2 / (1 - e2), Mf = meridian(a, e2);
  return (lon, lat) => {
    const p = lat * DEG, s = Math.sin(p), c = Math.cos(p), T = Math.tan(p) ** 2, C = ep2 * c * c, A = (lon - o.lon0) * DEG * c;
    const N = a / Math.sqrt(1 - e2 * s * s), M = Mf(p);
    const x = o.fe + o.k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120);
    const y = o.k0 * (M + N * Math.tan(p) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
    return [x, y];
  };
}
/** Гельмерт (геоцентрлік, «position vector»): эллипсоид ell-дегі (lon, lat) → WGS 84 [lon, lat]; inverse — кері бағыт (тесттер үшін). */
export function helmert(lon, lat, ell, p, inverse = false) {
  const toXYZ = (lo, la, [a, rf]) => {
    const f = 1 / rf, e2 = f * (2 - f), N = a / Math.sqrt(1 - e2 * Math.sin(la * DEG) ** 2);
    return [N * Math.cos(la * DEG) * Math.cos(lo * DEG), N * Math.cos(la * DEG) * Math.sin(lo * DEG), N * (1 - e2) * Math.sin(la * DEG)];
  };
  const toGeo = (X, Y, Z, [a, rf]) => {
    const f = 1 / rf, e2 = f * (2 - f), pp = Math.hypot(X, Y);
    let phi = Math.atan2(Z, pp * (1 - e2));
    for (let i = 0; i < 6; i++) { const n = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2); phi = Math.atan2(Z + e2 * n * Math.sin(phi), pp); }
    return [Math.atan2(Y, X) / DEG, phi / DEG];
  };
  const k = inverse ? -1 : 1;
  const [X, Y, Z] = toXYZ(lon, lat, inverse ? ELL.wgs84 : ell);
  const [dx, dy, dz, rx, ry, rz, ds] = p.map(v => v * k), s = 1 + ds * 1e-6, r = v => v / 3600 * DEG;
  const X2 = dx + s * (X - r(rz) * Y + r(ry) * Z), Y2 = dy + s * (r(rz) * X + Y - r(rx) * Z), Z2 = dz + s * (-r(ry) * X + r(rx) * Y + Z);
  return toGeo(X2, Y2, Z2, inverse ? ell : ELL.wgs84);
}

/** Аймақ нөмірі: UTM — 6° аймақ (1-аймақ 180° W-тен), Гаусс–Крюгер — 6° аймақ (1-аймақ 0°-тан). */
export const utmZone = lon => Math.floor((lon + 180) / 6) + 1;
export const gkZone = lon => Math.floor(lon / 6) + 1;

/**
 * Түрлендіргіш: o — { crs, zone, anchor: { x, y, lat, lon }, rot } → (x, y) => [lat, lon] не қате (Error, field).
 * СК-42: x аймақ нөмірімен берілсе (> 1 000 000) — аймақ x-тен алынады.
 */
export function makeTransform(o = {}) {
  const bad = (field, kk, ru) => { const e = new Error(kk); e.field = field; e.ru = ru; return e; };
  if (o.crs === 'wgs84') return (x, y) => [y, x];
  if (o.crs === 'utm') {
    const z = Math.round(+o.zone);
    if (!(z >= 1 && z <= 60)) throw bad('zone', 'UTM аймағы 1–60 болуы керек.', 'Зона UTM должна быть от 1 до 60.');
    const tm = tmInverse({ ell: ELL.wgs84, k0: 0.9996, lon0: z * 6 - 183, fe: 500000 });
    return (x, y) => { const g = tm(x, y); return [g[1], g[0]]; };
  }
  if (o.crs === 'sk42') {
    const z0 = Math.round(+o.zone);
    return (x, y) => {
      const z = x >= 1e6 ? Math.floor(x / 1e6) : z0;
      const tm = tmInverse({ ell: ELL.krass, k0: 1, lon0: z * 6 - 3, fe: (x >= 1e6 ? z * 1e6 : 0) + 500000 });
      const g = tm(x, y), w = helmert(g[0], g[1], ELL.krass, SK42);
      return [w[1], w[0]];
    };
  }
  if (o.crs === 'local') {
    const a = o.anchor || {};
    if (![a.x, a.y, a.lat, a.lon].every(v => Number.isFinite(+v))) throw bad('anchor', 'Тірек нүктесінің координаталарын толтырыңыз.', 'Заполните координаты опорной точки.');
    const P = plane(+a.lat, +a.lon), t = (+o.rot || 0) * DEG, c = Math.cos(t), s = Math.sin(t);
    // Тор бұрылған болса: жергілікті (dx, dy) → шын солтүстікке қатысты (e, n)
    return (x, y) => { const dx = x - a.x, dy = y - a.y; return P.inv(dx * c + dy * s, -dx * s + dy * c); };
  }
  throw bad('crs', 'Координаттар жүйесін таңдаңыз.', 'Выберите систему координат.');
}

/** Деректің ауқымына қарап жүйені болжау: { crs, zone } (lon0 — ескерткіштің бойлығы, аймақты табу үшін). */
export function guessCrs(xs, ys, lon0) {
  const mn = a => Math.min(...a), mx = a => Math.max(...a);
  if (!xs.length) return { crs: 'local' };
  const x0 = mn(xs), x1 = mx(xs), y0 = mn(ys), y1 = mx(ys);
  if (x0 >= -180 && x1 <= 180 && y0 >= -90 && y1 <= 90 && (x1 - x0) < 5 && (y1 - y0) < 5) return { crs: 'wgs84' };
  if (x0 > 1e6 && x1 < 61e6 && y0 > 3.5e6 && y1 < 7e6) return { crs: 'sk42', zone: Math.floor(x0 / 1e6) };
  if (x0 > 100000 && x1 < 900000 && y0 > 3.5e6 && y1 < 7e6) return { crs: 'utm', zone: Number.isFinite(lon0) ? utmZone(lon0) : 41 };
  return { crs: 'local' };
}
