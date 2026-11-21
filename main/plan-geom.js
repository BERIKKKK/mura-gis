/* «Жоспар» нысандарының контуры GeoPackage геометриясы үшін (main/gpkg.js → plan_objects қабаты).
   Шеңбер мен эллипс енгізілген өлшемдерден (орталық, диаметр / осьтер, азимут) метрлік жергілікті жазықтықта құрылады:
   WGS 84 эллипсоидының орталық нүктедегі меридиан (M) және бірінші вертикал (N) қисықтық радиустары.
   Бағдарламаның өз есептері (сызба, масштаб) — src/plan/geo.js: формула бірдей. */
const A = 6378137, F = 1 / 298.257223563, E2 = F * (2 - F), DEG = Math.PI / 180;
const SEG = 72;

/** Орталық (lat0, lon0) маңындағы метрлік жазықтық: x — шығысқа, y — солтүстікке, метр. */
function plane(lat0, lon0) {
  const s = Math.sin(lat0 * DEG), w = 1 - E2 * s * s;
  const M = A * (1 - E2) / Math.pow(w, 1.5), N = A / Math.sqrt(w);
  const kx = N * Math.cos(lat0 * DEG) * DEG, ky = M * DEG;
  return { fwd: (lat, lon) => [(lon - lon0) * kx, (lat - lat0) * ky], inv: (x, y) => [lat0 + y / ky, lon0 + x / kx] };
}

/** Эллипс төбелері [[lat, lon]…]: a, b — толық осьтер (м), az — үлкен осьтің азимуты (солтүстіктен сағат тілімен, °). */
function ellipse(lat, lon, a, b, az = 0, n = SEG) {
  const P = plane(lat, lon), t = az * DEG, out = [];
  for (let i = 0; i < n; i++) {
    const q = 2 * Math.PI * i / n, u = a / 2 * Math.cos(q), v = b / 2 * Math.sin(q);
    out.push(P.inv(u * Math.sin(t) + v * Math.cos(t), u * Math.cos(t) - v * Math.sin(t)));
  }
  return out;
}

/** Нысанның контуры GeoPackage сақинасы ретінде [[lon, lat]…, бірінші нүкте]; контуры жоқ болса — null. */
function ring(r) {
  let pts = null;
  const lat = Number(r.lat), lon = Number(r.lon);
  if (r.shape === 'circle' && r.diam > 0 && Number.isFinite(lat)) pts = ellipse(lat, lon, +r.diam, +r.diam);
  else if (r.shape === 'ellipse' && r.ax_a > 0 && r.ax_b > 0 && Number.isFinite(lat)) pts = ellipse(lat, lon, +r.ax_a, +r.ax_b, +r.ax_az || 0);
  else if (r.shape === 'free' && Array.isArray(r.pts) && r.pts.length >= 3) pts = r.pts;
  if (!pts) return null;
  const out = pts.map(p => [+p[1], +p[0]]);
  out.push(out[0]);
  return out;
}

module.exports = { plane, ellipse, ring };
