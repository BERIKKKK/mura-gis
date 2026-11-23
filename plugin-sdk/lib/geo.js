/* Mura GIS Plugin API: геометрия көмекшілері (Geometry API-дің рұқсат талап етпейтін бөлігі).
   Плагиннің оқшауланған ортасында (mura.geo) және SDK тестілеу құралында (Node.js) бірдей жұмыс істейді:
   тек есептеу, ешқандай деректерге не желіге қатынамайды. Геометрия — GeoJSON (RFC 7946): [бойлық, ендік].
   Координаттар жүйелері: EPSG:4326 (WGS 84), EPSG:3857 (Web Mercator), EPSG:326NN / 327NN (WGS 84 / UTM, NN = 1…60). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MuraGeo = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var A = 6378137, F = 1 / 298.257223563, E2 = F * (2 - F), K0 = 0.9996;
  var D2R = Math.PI / 180;

  function geomOf(g) {
    if (!g || typeof g !== 'object') return null;
    if (g.type === 'Feature') return g.geometry || null;
    return g;
  }
  /** Геометрия түрі: 'Point' | 'LineString' | 'Polygon' | 'MultiPoint' | 'MultiLineString' | 'MultiPolygon' | null. */
  function type(g) { g = geomOf(g); return g && typeof g.type === 'string' ? g.type : null; }

  function eachPos(c, fn) {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === 'number') { fn(c); return; }
    for (var i = 0; i < c.length; i++) eachPos(c[i], fn);
  }
  function mapPos(c, fn) {
    if (!Array.isArray(c)) return c;
    if (typeof c[0] === 'number') return fn(c);
    return c.map(function (x) { return mapPos(x, fn); });
  }
  /** [minX, minY, maxX, maxY] не null. */
  function bbox(g) {
    g = geomOf(g);
    if (!g) return null;
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    var add = function (p) { if (p[0] < b[0]) b[0] = p[0]; if (p[1] < b[1]) b[1] = p[1]; if (p[0] > b[2]) b[2] = p[0]; if (p[1] > b[3]) b[3] = p[1]; };
    if (g.type === 'FeatureCollection') (g.features || []).forEach(function (f) { var x = bbox(f); if (x) { add([x[0], x[1]]); add([x[2], x[3]]); } });
    else if (g.type === 'GeometryCollection') (g.geometries || []).forEach(function (x0) { var x = bbox(x0); if (x) { add([x[0], x[1]]); add([x[2], x[3]]); } });
    else eachPos(g.coordinates, add);
    return isFinite(b[0]) ? b : null;
  }

  /* ---------- Аудан (WGS 84 сферасы, м²) ---------- */
  function ringArea(r) {
    var s = 0;
    for (var i = 0, n = r.length; i < n - 1; i++) {
      var p = r[i], q = r[i + 1];
      s += (q[0] - p[0]) * D2R * (2 + Math.sin(p[1] * D2R) + Math.sin(q[1] * D2R));
    }
    return s * A * A / 2;     // таңбасы: оң — сағат тілімен (CW), теріс — сағат тіліне қарсы (CCW)
  }
  /** Геодезиялық аудан, м² (Polygon, MultiPolygon; координаттар EPSG:4326). */
  function area(g) {
    g = geomOf(g);
    if (!g) return 0;
    var poly = function (rings) { return rings.reduce(function (s, r, i) { return s + (i ? -1 : 1) * Math.abs(ringArea(r)); }, 0); };
    if (g.type === 'Polygon') return Math.abs(poly(g.coordinates));
    if (g.type === 'MultiPolygon') return g.coordinates.reduce(function (s, p) { return s + Math.abs(poly(p)); }, 0);
    return 0;
  }
  /** Сақинаны тұйықтау және бағыттау (RFC 7946: сыртқы — CCW, тесік — CW). */
  function orient(ring, ccw) {
    var r = ring.map(function (p) { return p.slice(); });
    if (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) r.push(r[0].slice());
    if ((ringArea(r) < 0) !== !!ccw) r.reverse();
    return r;
  }

  /* ---------- Тексеру ---------- */
  function segX(a, b, c, d) {
    var o = function (p, q, r) { var v = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); return v > 1e-15 ? 1 : v < -1e-15 ? -1 : 0; };
    var o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    return o1 !== o2 && o3 !== o4 && o1 && o2 && o3 && o4;
  }
  function checkRing(r, where, errs, geo) {
    if (!Array.isArray(r) || r.length < 4) { errs.push(where + ': сақинада кемінде 4 позиция керек (тұйық: бірінші = соңғы).'); return; }
    var f = r[0], l = r[r.length - 1];
    if (f[0] !== l[0] || f[1] !== l[1]) errs.push(where + ': сақина тұйықталмаған (бірінші және соңғы нүкте бірдей болуы керек).');
    var n = r.length - 1;
    if (n <= 1500) {
      for (var i = 0; i < n; i++) for (var j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        if (segX(r[i], r[i + 1], r[j], r[j + 1])) { errs.push(where + ': шекара өзін-өзі қиып өтеді (' + (i + 1) + '–' + (i + 2) + ' және ' + (j + 1) + '–' + (j + 2) + ' қабырғалары).'); return; }
      }
    }
    if (geo && Math.abs(ringArea(r)) < 1e-6) errs.push(where + ': ауданы нөлге тең.');
  }
  /** Геометрияны тексеру: { ok, errors: [...] }. opts.crs — 'EPSG:4326' (әдепкі) болса, ендік/бойлық шегі де тексеріледі. */
  function validate(g, opts) {
    var errs = [];
    var geo = !opts || !opts.crs || /4326|CRS84/i.test(opts.crs);
    g = geomOf(g);
    if (!g || typeof g.type !== 'string') return { ok: false, errors: ['Геометрия жоқ.'] };
    var bad = false;
    eachPos(g.coordinates, function (p) {
      if (p.length < 2 || !isFinite(p[0]) || !isFinite(p[1])) bad = true;
      else if (geo && (Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)) bad = true;
    });
    if (bad) errs.push(geo ? 'Координата дұрыс емес не WGS 84 шегінен тыс (бойлық ±180, ендік ±90).' : 'Координата сан емес.');
    var t = g.type, c = g.coordinates;
    if (!Array.isArray(c)) errs.push('coordinates жоқ.');
    else if (t === 'Point') { if (typeof c[0] !== 'number') errs.push('Point: [x, y] керек.'); }
    else if (t === 'LineString') { if (c.length < 2) errs.push('LineString: кемінде 2 нүкте керек.'); }
    else if (t === 'Polygon') { if (!c.length) errs.push('Polygon: сақина жоқ.'); c.forEach(function (r, i) { checkRing(r, i ? (i + '-тесік') : 'Сыртқы шекара', errs, geo); }); }
    else if (t === 'MultiPolygon') c.forEach(function (p, k) { p.forEach(function (r, i) { checkRing(r, (k + 1) + '-полигон, ' + (i ? i + '-тесік' : 'сыртқы шекара'), errs, geo); }); });
    else if (t !== 'MultiPoint' && t !== 'MultiLineString') errs.push('Қолдау көрсетілмейтін геометрия түрі: ' + t);
    return { ok: !errs.length, errors: errs };
  }

  /* ---------- Координаттарды түрлендіру ---------- */
  function utmZone(code) {
    var m = /^EPSG:(32[67])(\d\d)$/.exec(code);
    if (!m) return null;
    var z = +m[2];
    return z >= 1 && z <= 60 ? { zone: z, south: m[1] === '327' } : null;
  }
  function norm(code) {
    var s = String(code || '').toUpperCase().replace(/\s+/g, '');
    if (s === 'WGS84' || s === 'CRS84' || s === 'OGC:CRS84' || s === 'URN:OGC:DEF:CRS:OGC:1.3:CRS84' || s === '4326') return 'EPSG:4326';
    if (s === '3857' || s === 'EPSG:900913') return 'EPSG:3857';
    var m = /^(?:URN:OGC:DEF:CRS:)?EPSG:{1,2}(\d+)$/.exec(s);
    return m ? 'EPSG:' + m[1] : s;
  }
  /** Қолдау көрсетілетін жүйе ме. */
  function supported(code) { code = norm(code); return code === 'EPSG:4326' || code === 'EPSG:3857' || !!utmZone(code); }

  function toUtm(lon, lat, zone, south) {
    var lon0 = ((zone - 1) * 6 - 180 + 3) * D2R, phi = lat * D2R, lam = lon * D2R;
    var ep2 = E2 / (1 - E2), sin = Math.sin(phi), cos = Math.cos(phi), tan = Math.tan(phi);
    var N = A / Math.sqrt(1 - E2 * sin * sin), T = tan * tan, C = ep2 * cos * cos, Aa = cos * (lam - lon0);
    var M = A * ((1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * E2 * E2 * E2 / 256) * phi - (3 * E2 / 8 + 3 * E2 * E2 / 32 + 45 * E2 * E2 * E2 / 1024) * Math.sin(2 * phi) +
      (15 * E2 * E2 / 256 + 45 * E2 * E2 * E2 / 1024) * Math.sin(4 * phi) - (35 * E2 * E2 * E2 / 3072) * Math.sin(6 * phi));
    var x = K0 * N * (Aa + (1 - T + C) * Math.pow(Aa, 3) / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * Math.pow(Aa, 5) / 120) + 500000;
    var y = K0 * (M + N * tan * (Aa * Aa / 2 + (5 - T + 9 * C + 4 * C * C) * Math.pow(Aa, 4) / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * Math.pow(Aa, 6) / 720));
    if (south) y += 10000000;
    return [x, y];
  }
  function fromUtm(x, y, zone, south) {
    var ep2 = E2 / (1 - E2), lon0 = ((zone - 1) * 6 - 180 + 3) * D2R;
    x -= 500000; if (south) y -= 10000000;
    var M = y / K0, mu = M / (A * (1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * E2 * E2 * E2 / 256));
    var e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
    var phi1 = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu) +
      (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu) + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);
    var sin = Math.sin(phi1), cos = Math.cos(phi1), tan = Math.tan(phi1);
    var N1 = A / Math.sqrt(1 - E2 * sin * sin), T1 = tan * tan, C1 = ep2 * cos * cos, R1 = A * (1 - E2) / Math.pow(1 - E2 * sin * sin, 1.5), Dd = x / (N1 * K0);
    var lat = phi1 - (N1 * tan / R1) * (Dd * Dd / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * Math.pow(Dd, 4) / 24 +
      (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * Math.pow(Dd, 6) / 720);
    var lon = lon0 + (Dd - (1 + 2 * T1 + C1) * Math.pow(Dd, 3) / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * Math.pow(Dd, 5) / 120) / cos;
    return [lon / D2R, lat / D2R];
  }
  function toWgs(p, code) {
    if (code === 'EPSG:4326') return [p[0], p[1]];
    if (code === 'EPSG:3857') return [p[0] / A / D2R, (2 * Math.atan(Math.exp(p[1] / A)) - Math.PI / 2) / D2R];
    var u = utmZone(code);
    return fromUtm(p[0], p[1], u.zone, u.south);
  }
  function fromWgs(p, code) {
    if (code === 'EPSG:4326') return [p[0], p[1]];
    if (code === 'EPSG:3857') { var lat = Math.max(-85.05112878, Math.min(85.05112878, p[1])); return [p[0] * D2R * A, Math.log(Math.tan(Math.PI / 4 + lat * D2R / 2)) * A]; }
    var u = utmZone(code);
    return toUtm(p[0], p[1], u.zone, u.south);
  }
  /** Геометрияны (не Feature, FeatureCollection) бір жүйеден екіншісіне көшіру. opts.precision — бөлшек таңба саны. */
  function transform(g, from, to, opts) {
    from = norm(from); to = norm(to);
    if (!supported(from)) throw new Error('Қолдау көрсетілмейтін координаттар жүйесі: ' + from);
    if (!supported(to)) throw new Error('Қолдау көрсетілмейтін координаттар жүйесі: ' + to);
    var dp = opts && opts.precision != null ? opts.precision : (to === 'EPSG:4326' ? 8 : 3);
    var k = Math.pow(10, dp);
    var fn = function (p) { var w = fromWgs(toWgs(p, from), to); var out = [Math.round(w[0] * k) / k, Math.round(w[1] * k) / k]; if (p.length > 2) out.push(p[2]); return out; };
    var one = function (geom) {
      if (!geom) return geom;
      if (geom.type === 'Feature') return Object.assign({}, geom, { geometry: one(geom.geometry) });
      if (geom.type === 'FeatureCollection') return Object.assign({}, geom, { features: (geom.features || []).map(one) });
      if (geom.type === 'GeometryCollection') return Object.assign({}, geom, { geometries: (geom.geometries || []).map(one) });
      return Object.assign({}, geom, { coordinates: mapPos(geom.coordinates, fn) });
    };
    return one(g);
  }
  /** Бойлыққа сәйкес UTM аймағы (солтүстік жарты шар): мыс. 68° → EPSG:32642. */
  function utmFor(lon, lat) {
    var z = Math.max(1, Math.min(60, Math.floor((lon + 180) / 6) + 1));
    return 'EPSG:' + (lat < 0 ? '327' : '326') + (z < 10 ? '0' : '') + z;
  }

  return { type: type, bbox: bbox, area: area, orient: orient, validate: validate, transform: transform, supported: supported, normCrs: norm, utmFor: utmFor };
});
