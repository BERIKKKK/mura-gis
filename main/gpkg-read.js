/* Бөтен GeoPackage (.gpkg) файлын импорт үшін оқу (тек оқу режимінде — файл өзгермейді).
   Әр кеңістіктік қабат: атрибут бағандары, нысандар саны, геометриясы WGS 84-ке (EPSG:4326) түрлендірілген күйде.
   Координаттар жүйелері: географиялық (WGS 84, ETRS89, NAD83 т.б.), Web Mercator (EPSG:3857), UTM WGS 84 (EPSG:326xx/327xx),
   Пулково 1942 (географиялық және Гаусс-Крюгер аймақтары EPSG:284xx), WKT-да сипатталған кез келген көлденең Меркатор
   (Transverse Mercator) проекциясы. Пулково 1942 → WGS 84: Гельмерт түрлендіруі (дәлдігі шамамен 1–5 м). */
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const MAX_FEATURES = 20000;
const DEG = Math.PI / 180;

/* ======================= Геометрия: WKB → бөліктер ======================= */
function readGpb(buf) {
  if (!buf || buf.length < 8) return null;
  const b = Buffer.from(buf.buffer ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) : buf);
  if (b.toString('ascii', 0, 2) !== 'GP') return null;
  const flags = b.readUInt8(3);
  if (flags & 0x10) return null;
  const envLen = [0, 32, 48, 48, 64][(flags >> 1) & 7] || 0;
  const parts = { pts: [], lines: [], polys: [] };
  readWkb(b, 8 + envLen, parts);
  return parts;
}
function readWkb(b, o, out) {
  const le = b.readUInt8(o) === 1;
  const u32 = k => (le ? b.readUInt32LE(k) : b.readUInt32BE(k));
  const f64 = k => (le ? b.readDoubleLE(k) : b.readDoubleBE(k));
  let t = u32(o + 1); o += 5;
  let dims = 2;
  if (t & 0x80000000 || t & 0x40000000) { dims += (t & 0x80000000 ? 1 : 0) + (t & 0x40000000 ? 1 : 0); t &= 0xffff; }
  if (t > 1000) { dims += Math.floor(t / 1000) === 3 ? 2 : 1; t %= 1000; }
  const pt = () => { const p = [f64(o), f64(o + 8)]; o += 8 * dims; return p; };
  const line = () => { const n = u32(o); o += 4; const a = []; for (let i = 0; i < n; i++) a.push(pt()); return a; };
  if (t === 1) { const p = pt(); if (Number.isFinite(p[0])) out.pts.push(p); }
  else if (t === 2) out.lines.push(line());
  else if (t === 3) { const n = u32(o); o += 4; const rings = []; for (let i = 0; i < n; i++) rings.push(line()); if (rings.length) out.polys.push(rings); }
  else if (t >= 4 && t <= 7) { const n = u32(o); o += 4; for (let i = 0; i < n; i++) o = readWkb(b, o, out); }
  else throw new Error('Геометрия түрі қолдау көрсетілмейді (' + t + ')');
  return o;
}
const ringArea = r => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], c = r[(i + 1) % r.length]; s += a[0] * c[1] - c[0] * a[1]; } return Math.abs(s / 2); };
const lineLen = l => l.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - l[i - 1][0], p[1] - l[i - 1][1]) : 0), 0);

/* ======================= Координаттар жүйелері ======================= */
const ELL = { wgs84: [6378137, 298.257223563], krass: [6378245, 298.3], grs80: [6378137, 298.257222101] };
// Пулково 1942 → WGS 84 (EPSG:1267/15865 тәрізді, «position vector»): dx, dy, dz (м), rx, ry, rz (″), ds (ppm)
const SK42 = [23.57, -140.95, -79.8, 0, 0.35, 0.79, -0.22];

function helmert(lon, lat, ell, p) {
  const [a, rf] = ell, f = 1 / rf, e2 = f * (2 - f);
  const la = lat * DEG, lo = lon * DEG, N = a / Math.sqrt(1 - e2 * Math.sin(la) ** 2);
  const X = N * Math.cos(la) * Math.cos(lo), Y = N * Math.cos(la) * Math.sin(lo), Z = N * (1 - e2) * Math.sin(la);
  const [dx, dy, dz, rx, ry, rz, ds] = p, s = 1 + ds * 1e-6, r = v => v / 3600 * DEG;
  const X2 = dx + s * (X - r(rz) * Y + r(ry) * Z), Y2 = dy + s * (r(rz) * X + Y - r(rx) * Z), Z2 = dz + s * (-r(ry) * X + r(rx) * Y + Z);
  const [A, RF] = ELL.wgs84, F = 1 / RF, E2 = F * (2 - F), pp = Math.hypot(X2, Y2);
  let phi = Math.atan2(Z2, pp * (1 - E2));
  for (let i = 0; i < 6; i++) { const n = A / Math.sqrt(1 - E2 * Math.sin(phi) ** 2); phi = Math.atan2(Z2 + E2 * n * Math.sin(phi), pp); }
  return [Math.atan2(Y2, X2) / DEG, phi / DEG];
}

/** Көлденең Меркатор: кері есеп (Снайдер), жазық → [lon, lat] градус. */
function tmInverse(o) {
  const [a, rf] = o.ell, f = 1 / rf, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const Mf = phi => a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi) +
    (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi) - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi));
  const M0 = Mf((o.lat0 || 0) * DEG), e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  return (x, y) => {
    const M = M0 + (y - o.fn) / o.k0, mu = M / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
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
/** Тек тест үшін: тура есеп (lon, lat → x, y). */
function tmForward(o) {
  const [a, rf] = o.ell, f = 1 / rf, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const Mf = phi => a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi) +
    (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi) - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi));
  return (lon, lat) => {
    const p = lat * DEG, s = Math.sin(p), c = Math.cos(p), T = Math.tan(p) ** 2, C = ep2 * c * c, A = (lon - o.lon0) * DEG * c;
    const N = a / Math.sqrt(1 - e2 * s * s), M = Mf(p), M0 = Mf((o.lat0 || 0) * DEG);
    const x = o.fe + o.k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120);
    const y = o.fn + o.k0 * (M - M0 + N * Math.tan(p) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
    return [x, y];
  };
}

/** WKT-дан параметр (WKT1 / WKT2 атаулары). */
function wktParam(wkt, names) {
  for (const n of names) {
    const m = new RegExp('PARAMETER\\[\\s*"' + n + '"\\s*,\\s*(-?[\\d.eE+-]+)', 'i').exec(wkt);
    if (m) return parseFloat(m[1]);
  }
  return null;
}
function wktEllipsoid(wkt) {
  const m = /(?:SPHEROID|ELLIPSOID)\[\s*"([^"]*)"\s*,\s*([\d.eE+-]+)\s*,\s*([\d.eE+-]+)/i.exec(wkt);
  if (!m) return null;
  return [parseFloat(m[2]), parseFloat(m[3])];
}
const isPulkovo = wkt => /pulkovo|krassow|SK-?42|S-42/i.test(wkt);
function wktTowgs(wkt) {
  const m = /TOWGS84\[\s*([^\]]+)\]/i.exec(wkt);
  if (!m) return null;
  const v = m[1].split(',').map(Number);
  return v.length >= 3 && v.every(Number.isFinite) ? [...v, 0, 0, 0, 0].slice(0, 7) : null;
}

/** srs жолы → { name, fn(x, y) → [lon, lat] } не { error }. */
function transformer(srs) {
  if (!srs) return { error: 'Координаттар жүйесі көрсетілмеген' };
  const org = String(srs.organization || '').toUpperCase(), code = Number(srs.organization_coordsys_id), wkt = String(srs.definition || '');
  const name = (srs.srs_name || (org + ':' + code)) + (org && code > 0 ? ' (' + org + ':' + code + ')' : '');
  const id = (x, y) => [x, y];
  const geo = (ell, shift) => (shift ? (x, y) => helmert(x, y, ell, shift) : id);
  if (org === 'EPSG') {
    if ([4326, 4258, 4269, 4167, 4979, 4617, 4283].includes(code)) return { name, fn: id };
    if (code === 4284) return { name, fn: geo(ELL.krass, SK42) };
    if (code === 3857 || code === 900913 || code === 3785) return { name, fn: (x, y) => [x / 6378137 / DEG, (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) / DEG] };
    if (code > 32600 && code <= 32660) return { name, fn: tmInverse({ ell: ELL.wgs84, k0: 0.9996, lon0: (code - 32600) * 6 - 183, fe: 500000, fn: 0 }) };
    if (code > 32700 && code <= 32760) return { name, fn: tmInverse({ ell: ELL.wgs84, k0: 0.9996, lon0: (code - 32700) * 6 - 183, fe: 500000, fn: 10000000 }) };
    if (code >= 28404 && code <= 28432) {
      const z = code - 28400, tm = tmInverse({ ell: ELL.krass, k0: 1, lon0: z * 6 - 3, fe: z * 1e6 + 500000, fn: 0 });
      return { name, fn: (x, y) => { const g = tm(x, y); return helmert(g[0], g[1], ELL.krass, SK42); } };
    }
  }
  if (org === 'NONE' || code <= 0 || !wkt || wkt === 'undefined') {
    if (Number(srs.srs_id) === 0) return { name: 'Анықталмаған географиялық жүйе (WGS 84 деп алынды)', fn: id };
    return { error: 'Координаттар жүйесі анықталмаған (' + (srs.srs_name || srs.srs_id) + ')' };
  }
  const shift = wktTowgs(wkt) || (isPulkovo(wkt) ? SK42 : null);
  const ell = wktEllipsoid(wkt) || (isPulkovo(wkt) ? ELL.krass : ELL.wgs84);
  if (/^\s*(GEOGCS|GEOGCRS|GEODCRS|GEOGRAPHICCRS)\b/i.test(wkt)) return { name, fn: geo(ell, shift) };
  if (/transverse[_ ]mercator|gauss|"Transverse Mercator"/i.test(wkt)) {
    const o = {
      ell, k0: wktParam(wkt, ['scale_factor', 'Scale factor at natural origin']) ?? 1,
      lon0: wktParam(wkt, ['central_meridian', 'Longitude of natural origin']) ?? 0,
      lat0: wktParam(wkt, ['latitude_of_origin', 'Latitude of natural origin']) ?? 0,
      fe: wktParam(wkt, ['false_easting', 'False easting']) ?? 0, fn: wktParam(wkt, ['false_northing', 'False northing']) ?? 0,
    };
    const tm = tmInverse(o);
    return { name, fn: shift ? (x, y) => { const g = tm(x, y); return helmert(g[0], g[1], ell, shift); } : tm };
  }
  if (/pseudo[- _]?mercator|popular visualisation/i.test(wkt)) return { name, fn: (x, y) => [x / 6378137 / DEG, (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) / DEG] };
  return { error: 'Координаттар жүйесі қолдау көрсетілмейді: ' + name + '. QGIS-те қабатты EPSG:4326 не UTM жүйесіне экспорттап, қайта импорттаңыз.' };
}

/* ======================= Файлды оқу ======================= */
function inspect(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const has = t => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
    if (!has('gpkg_contents') || !has('gpkg_geometry_columns')) throw new Error('Бұл файл GeoPackage емес (gpkg_contents кестесі жоқ).');
    const isMura = has('mura_project');
    const srsRows = has('gpkg_spatial_ref_sys') ? db.prepare('SELECT * FROM gpkg_spatial_ref_sys').all() : [];
    const srsOf = id => srsRows.find(r => Number(r.srs_id) === Number(id)) || null;
    const rows = db.prepare("SELECT c.table_name AS t, c.identifier AS title, g.column_name AS gc, g.geometry_type_name AS gt, g.srs_id AS srs " +
      "FROM gpkg_contents c JOIN gpkg_geometry_columns g ON g.table_name = c.table_name WHERE c.data_type = 'features' ORDER BY c.table_name").all();
    const layers = [];
    for (const r of rows) {
      const L = { table: r.t, title: r.title || r.t, declared: String(r.gt || '').toUpperCase(), columns: [], count: 0, features: [], truncated: false, error: '', multi: 0, holes: 0 };
      layers.push(L);
      try {
        const tr = transformer(srsOf(r.srs));
        L.srs = tr.name || ('srs ' + r.srs);
        if (tr.error) { L.error = tr.error; continue; }
        const q = s => '"' + String(s).replace(/"/g, '""') + '"';
        const info = db.prepare('PRAGMA table_info(' + q(r.t) + ')').all();
        L.columns = info.filter(c => c.name !== r.gc && !c.pk && !/BLOB/i.test(c.type || '') && !(isMura && c.name === 'props')).map(c => c.name);
        L.count = db.prepare('SELECT count(*) AS n FROM ' + q(r.t)).get().n;
        L.truncated = L.count > MAX_FEATURES;
        const sel = db.prepare('SELECT ' + [q(r.gc) + ' AS __g', ...L.columns.map(q), ...(isMura && info.some(c => c.name === 'props') ? ['props AS __props'] : [])].join(', ') + ' FROM ' + q(r.t) + ' LIMIT ' + MAX_FEATURES);
        const kinds = new Set();
        for (const row of sel.iterate()) {
          let g;
          try { g = readGpb(row.__g); } catch (e) { g = null; }
          if (!g) continue;
          const p = {};
          for (const c of L.columns) if (row[c] != null) p[c] = typeof row[c] === 'bigint' ? String(row[c]) : row[c];
          const T = pt => tr.fn(pt[0], pt[1]);
          const f = { p };
          if (g.polys.length) {
            if (g.polys.length > 1) L.multi++;
            const best = g.polys.reduce((m, rings) => (ringArea(rings[0]) > ringArea(m[0]) ? rings : m), g.polys[0]);
            if (best.length > 1) L.holes++;
            f.g = best[0].map(T); kinds.add('Polygon');
          } else if (g.lines.length) {
            if (g.lines.length > 1) L.multi++;
            f.g = g.lines.reduce((m, l) => (lineLen(l) > lineLen(m) ? l : m), g.lines[0]).map(T); kinds.add('LineString');
          } else if (g.pts.length) {
            f.g = T(g.pts[0]); kinds.add('Point');
          } else continue;
          if (row.__props) { try { const j = JSON.parse(row.__props); if (j && j.custom) f.custom = j.custom; } catch (e) { /* елемейміз */ } }
          L.features.push(f);
        }
        L.geom = kinds.size === 1 ? [...kinds][0] : /POINT/.test(L.declared) ? 'Point' : /LINE/.test(L.declared) ? 'LineString' : /POLYGON|SURFACE/.test(L.declared) ? 'Polygon' : [...kinds][0] || '';
        if (kinds.size > 1) L.features = L.features.filter(f => (L.geom === 'Point' ? !Array.isArray(f.g[0]) : Array.isArray(f.g[0])));
        if (!L.features.length && !L.error) L.error = L.count ? 'Геометриясы оқылмады' : 'Қабат бос';
      } catch (e) { L.error = e.message; }
    }
    return { file, name: path.basename(file), isMura, layers };
  } finally { db.close(); }
}

/** Mura GIS жобасы ма (mura_project кестесі бар ма) — жобаны ашарда бөтен файлды ажырату үшін. */
function isMuraProject(file) {
  let db;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'mura_project'").get();
  } catch (e) { return true; } finally { try { db && db.close(); } catch (e) { /* елемейміз */ } }
}

module.exports = { inspect, isMuraProject, transformer, tmForward, tmInverse, ELL };
