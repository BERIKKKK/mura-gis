/* «Жоспар»: жағдаят белгілерін файлдан импорттау (docs/PLAN-STAGE3.md, 3-кезең, Г жолы).
   Оқылатыны: GeoJSON (WGS 84), KML / KMZ, GPX (WGS 84), DXF (ASCII; AutoCAD, тахеометр — жобаланған не жергілікті жүйе),
   CSV / TXT (нүктелер: атауы, X, Y, H, код — бағандарды пайдаланушы таңдайды).
   Нәтиже бір пішімде: { items: [{ geom: point | line | area | text, group, xy: [x, y, z?] не [[x, y, z?]…], name, value, rot }],
     wgs: true (координаталар WGS 84: x — бойлық, y — ендік) не false (жоспарлы: жүйені пайдаланушы таңдайды) }.
   Топтар (group) — DXF қабаты, CSV коды, GeoJSON/KML геометрия түрі: әр топқа белгі түрі таңдалады.
   DXF пен CSV — DOM-сыз (scripts/test-plan.mjs тексереді); KML / GPX — DOMParser (тек бетте). */
import { FEAT_KINDS } from './sheet.js';

const tx = (kk, ru) => (globalThis.MuraI18n && globalThis.MuraI18n.ru ? ru : kk);
const fin = v => Number.isFinite(v);
const numStr = s => { const t = String(s ?? '').trim().replace(/\s+/g, '').replace(',', '.'); return t === '' || !/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t) ? NaN : Number(t); };
/** Сызықтың барлық төбесінің биіктігі бірдей болса — сол мән (горизонталь); әйтпесе null. */
const flatZ = pts => { const z = pts.map(p => p[2]).filter(fin); return z.length === pts.length && z.length && z.every(v => Math.abs(v - z[0]) < 1e-6) && z[0] !== 0 ? z[0] : null; };

/* ======================= DXF (ASCII) ======================= */
/** DXF-тің кодтауы: $DWGCODEPAGE ANSI_1251 болса — windows-1251, әйтпесе UTF-8 (AutoCAD 2007+). */
export function decodeDxf(bytes) {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 20000)));
  if (/^AutoCAD Binary DXF/.test(head)) throw new Error(tx('Бинарлы DXF оқылмайды — DXF-ті ASCII (мәтін) пішімінде сақтаңыз.', 'Двоичный DXF не поддерживается — сохраните DXF в формате ASCII (текст).'));
  const cp = /\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*(ANSI_\d+)/i.exec(head);
  const enc = cp && /ANSI_(125\d|866)/i.test(cp[1]) ? 'windows-' + cp[1].replace(/\D/g, '') : 'utf-8';
  try { return new TextDecoder(enc === 'windows-866' ? 'ibm866' : enc).decode(bytes); } catch (e) { return new TextDecoder('utf-8').decode(bytes); }
}
/** MTEXT пішімдеу кодтарын алып тастау: \P — жол, {\f…;} т.б. */
const mtext = s => String(s).replace(/\\P/g, ' ').replace(/\\[A-Za-z][^;\\{}]*;/g, '').replace(/[{}]/g, '').replace(/\\~/g, ' ').replace(/\s+/g, ' ').trim();

/** ASCII DXF → items (жоспарлы координаталар). POINT, LINE, LWPOLYLINE, POLYLINE/VERTEX, TEXT, MTEXT, CIRCLE (орталығы — нүкте). */
export function parseDxf(str) {
  const L = String(str).split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i + 1 < L.length; i += 2) pairs.push([parseInt(L[i], 10), L[i + 1].replace(/\s+$/, '')]);
  if (!pairs.some(p => p[0] === 0 && p[1] === 'SECTION')) throw new Error(tx('DXF файлы оқылмады (SECTION жоқ).', 'Не удалось прочитать DXF (нет SECTION).'));
  // ENTITIES бөлімі (блоктар — BLOCKS — алынбайды)
  let i = pairs.findIndex((p, k) => p[0] === 2 && p[1] === 'ENTITIES' && pairs[k - 1] && pairs[k - 1][1] === 'SECTION');
  if (i < 0) throw new Error(tx('DXF-те ENTITIES бөлімі жоқ.', 'В DXF нет раздела ENTITIES.'));
  const ents = [];
  let cur = null;
  for (i++; i < pairs.length; i++) {
    const [c, v] = pairs[i];
    if (c === 0) {
      if (cur) ents.push(cur);
      if (v === 'ENDSEC') { cur = null; break; }
      cur = { type: v, g: [] };
    } else if (cur) cur.g.push([c, v]);
  }
  const items = [];
  const get = (e, c, d) => { const x = e.g.find(p => p[0] === c); return x ? x[1] : d; };
  const num = (e, c, d = NaN) => { const x = get(e, c, null); return x == null ? d : parseFloat(x); };
  const layer = e => get(e, 8, '0');
  let poly = null;          // POLYLINE … VERTEX … SEQEND
  const flush = () => {
    if (!poly) return;
    const pts = poly.pts.filter(p => fin(p[0]) && fin(p[1]));
    if (pts.length >= 2) items.push({ geom: poly.closed && pts.length >= 3 ? 'area' : 'line', group: poly.layer, xy: pts, value: flatZ(pts) });
    poly = null;
  };
  for (const e of ents) {
    if (e.type === 'VERTEX') { if (poly) poly.pts.push([num(e, 10), num(e, 20), num(e, 30, poly.elev)]); continue; }
    if (e.type === 'SEQEND') { flush(); continue; }
    flush();
    if (e.type === 'POINT') items.push({ geom: 'point', group: layer(e), xy: [num(e, 10), num(e, 20), num(e, 30)] });
    else if (e.type === 'CIRCLE') items.push({ geom: 'point', group: layer(e), xy: [num(e, 10), num(e, 20), num(e, 30)] });
    else if (e.type === 'LINE') {
      const pts = [[num(e, 10), num(e, 20), num(e, 30)], [num(e, 11), num(e, 21), num(e, 31)]];
      items.push({ geom: 'line', group: layer(e), xy: pts, value: flatZ(pts) });
    } else if (e.type === 'LWPOLYLINE') {
      const elev = num(e, 38, NaN), pts = [];
      let p = null;
      for (const [c, v] of e.g) {
        if (c === 10) { p = [parseFloat(v), NaN, elev]; pts.push(p); } else if (c === 20 && p) p[1] = parseFloat(v);
      }
      const closed = (parseInt(get(e, 70, '0'), 10) & 1) === 1;
      const ok = pts.filter(q => fin(q[0]) && fin(q[1]));
      if (ok.length >= 2) items.push({ geom: closed && ok.length >= 3 ? 'area' : 'line', group: layer(e), xy: ok, value: fin(elev) && elev !== 0 ? elev : null });
    } else if (e.type === 'POLYLINE') {
      poly = { layer: layer(e), closed: (parseInt(get(e, 70, '0'), 10) & 1) === 1, elev: num(e, 30, NaN), pts: [] };
    } else if (e.type === 'TEXT' || e.type === 'MTEXT') {
      const t = e.type === 'MTEXT' ? mtext(e.g.filter(p => p[0] === 3 || p[0] === 1).map(p => p[1]).join('')) : String(get(e, 1, '')).trim();
      // TEXT: туралау нүктесі (11/21) берілсе — сол; бұрыш — 50 (сағат тіліне қарсы, °)
      const al = parseInt(get(e, 72, '0'), 10) || parseInt(get(e, 73, '0'), 10);
      const x = al && fin(num(e, 11)) ? num(e, 11) : num(e, 10), y = al && fin(num(e, 21)) ? num(e, 21) : num(e, 20);
      if (t) items.push({ geom: 'text', group: layer(e), xy: [x, y], name: t, rot: -(num(e, 50, 0) || 0) });
    }
  }
  flush();
  return { items: items.filter(it => it.geom === 'point' || it.geom === 'text' ? fin(it.xy[0]) && fin(it.xy[1]) : true), wgs: false };
}

/* ======================= CSV / TXT ======================= */
/** Мәтінді кестеге бөлу: бөлгіш — таб, «;», «,» не бос орын (жиі кездесетіні); бірінші жолда сан жоқ болса — тақырып. */
export function parseCsv(str) {
  const lines = String(str).replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  if (!lines.length) throw new Error(tx('Файл бос.', 'Файл пуст.'));
  const sample = lines.slice(0, 20);
  const cands = ['\t', ';', ',', ' '];
  const split = (l, d) => (d === ' ' ? l.split(/\s+/) : l.split(d).map(s => s.trim()));
  // Бөлгіш: үлгі жолдарда бағандар саны бірдей және ≥ 3 болатыны (үтір — ондық бөлгіш болуы мүмкін, сондықтан соңында)
  let delim = ' ';
  for (const d of cands) {
    const n = sample.map(l => split(l, d).length);
    if (n[0] >= 3 && n.every(k => k === n[0])) { delim = d; break; }
  }
  let rows = lines.map(l => split(l, delim));
  const header = rows[0].filter(c => fin(numStr(c))).length < 2 ? rows[0] : null;
  if (header) rows = rows.slice(1);
  const cols = Math.max(...rows.map(r => r.length), header ? header.length : 0);
  return { header: header || Array.from({ length: cols }, (_, k) => tx('Баған ', 'Столбец ') + (k + 1)), rows, delim, hasHeader: !!header };
}
/** Бағандарды болжау: { name, e, n, h, code } (бағанның нөмірі не -1). Тақырып атауларынан, болмаса — сан бағандарының ретінен
    (тахеометр экспорттарында жиі: № X Y H — мұнда X — солтүстік, Y — шығыс, геодезиялық шарт). */
export function guessColumns(t) {
  const h = t.header.map(s => String(s).toLowerCase().trim());
  const find = re => h.findIndex(s => re.test(s));
  const m = { name: find(/^(name|id|pt|point|№|n|no|nr|номер|атау|атауы|нүкте|точка|имя)$/), e: find(/^(e|east|easting|y|lon|long|lng|бойлық|долгота)$/), n: find(/^(n|north|northing|x|lat|ендік|широта)$/), h: find(/^(h|z|elev|elevation|height|alt|altitude|биіктік|высота|отметка)$/), code: find(/^(code|код|desc|description|сипаттама)$/) };
  if (m.name === m.n) m.name = -1;
  // Тақырып жоқ не анықталмаса: сан бағандары → X(солтүстік), Y(шығыс), H; бірінші сан емес баған — атауы
  const numCols = t.header.map((_, k) => t.rows.slice(0, 20).every(r => fin(numStr(r[k]))));
  const nums = numCols.map((v, k) => (v ? k : -1)).filter(k => k >= 0);
  if (m.e < 0 || m.n < 0) {
    const rest = nums.filter(k => k !== m.h && k !== m.name);
    // Бірінші баған бүтін сан (нүкте нөмірі) болса және 4 сан бағаны болса — ол атауы
    if (rest.length >= 4 && m.name < 0 && t.rows.slice(0, 20).every(r => Number.isInteger(numStr(r[rest[0]])))) m.name = rest.shift();
    if (rest.length >= 2) { m.n = rest[0]; m.e = rest[1]; if (m.h < 0 && rest.length >= 3) m.h = rest[2]; }
  }
  if (m.name < 0) m.name = numCols.findIndex((v, k) => !v && k !== m.code);
  if (m.code === m.name) m.code = -1;
  return m;
}
/** Кесте + бағандар → items (нүктелер; код берілсе — топ коды бойынша). */
export function csvItems(t, m) {
  const items = [];
  let bad = 0;
  for (const r of t.rows) {
    const x = numStr(r[m.e]), y = numStr(r[m.n]), z = m.h >= 0 ? numStr(r[m.h]) : NaN;
    if (!fin(x) || !fin(y)) { bad++; continue; }
    items.push({ geom: 'point', group: m.code >= 0 ? String(r[m.code] || '').trim() || '—' : tx('Нүктелер', 'Точки'), xy: [x, y, z], name: m.name >= 0 ? String(r[m.name] || '').trim() : '' });
  }
  return { items, bad };
}

/* ======================= GeoJSON, KML, GPX (WGS 84) ======================= */
const muraKind = pr => { const k = String(pr.kind || pr.mura_kind || ''); return FEAT_KINDS.some(x => x.v === k) ? k : ''; };
export function parseGeojson(str) {
  let o;
  try { o = JSON.parse(String(str).replace(/^﻿/, '')); } catch (e) { throw new Error(tx('GeoJSON оқылмады (JSON емес).', 'Не удалось прочитать GeoJSON (не JSON).')); }
  const feats = o.type === 'FeatureCollection' ? o.features || [] : o.type === 'Feature' ? [o] : [{ geometry: o, properties: {} }];
  const items = [];
  const nameOf = pr => String(pr.name ?? pr.Name ?? pr.title ?? pr.label ?? '').trim();
  const valOf = pr => { for (const k of ['value', 'elev', 'elevation', 'height', 'ELEV', 'Z', 'z', 'h', 'contour']) { const v = numStr(pr[k]); if (fin(v)) return v; } return null; };
  const add = (g, pr) => {
    if (!g) return;
    const kind = muraKind(pr), grp = kind ? 'kind:' + kind : '';
    const base = { name: nameOf(pr), name_ru: String(pr.name_ru || '').trim(), value: valOf(pr), rot: numStr(pr.rot), kind };
    const P = c => [Number(c[0]), Number(c[1]), c.length > 2 ? Number(c[2]) : NaN];
    if (g.type === 'Point') items.push({ ...base, geom: kind === 'text' ? 'text' : 'point', group: grp || 'Point', xy: P(g.coordinates) });
    else if (g.type === 'MultiPoint') for (const c of g.coordinates || []) items.push({ ...base, geom: 'point', group: grp || 'Point', xy: P(c) });
    else if (g.type === 'LineString' || g.type === 'MultiLineString') {
      for (const l of g.type === 'LineString' ? [g.coordinates] : g.coordinates || []) { const pts = (l || []).map(P); items.push({ ...base, geom: 'line', group: grp || 'LineString', xy: pts, value: base.value ?? flatZ(pts) }); }
    } else if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      for (const pg of g.type === 'Polygon' ? [g.coordinates] : g.coordinates || []) if (pg && pg[0]) items.push({ ...base, geom: 'area', group: grp || 'Polygon', xy: pg[0].map(P) });
    } else if (g.type === 'GeometryCollection') for (const x of g.geometries || []) add(x, pr);
  };
  for (const f of feats) add(f && f.geometry, (f && f.properties) || {});
  return { items, wgs: true };
}
function parseXml(str, kind) {
  const doc = new DOMParser().parseFromString(String(str || '').replace(/^﻿/, ''), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error(kind + tx(' файлы оқылмады (XML қатесі).', ': не удалось прочитать файл (ошибка XML).'));
  return doc;
}
const kids = (el, tag) => [...el.getElementsByTagNameNS('*', tag)];
const txt = (el, tag) => { const c = [...el.children].find(x => x.localName === tag); return c ? c.textContent.trim() : ''; };
export function parseKml(str) {
  const doc = parseXml(str, 'KML');
  const items = [];
  const coords = s => String(s || '').trim().split(/\s+/).map(t => t.split(',').map(Number)).filter(a => a.length >= 2 && fin(a[0]) && fin(a[1])).map(a => [a[0], a[1], a.length > 2 ? a[2] : NaN]);
  for (const pm of kids(doc, 'Placemark')) {
    const name = txt(pm, 'name');
    for (const p of kids(pm, 'Point')) { const c = coords(kids(p, 'coordinates')[0]?.textContent)[0]; if (c) items.push({ geom: 'point', group: 'Point', xy: c, name }); }
    for (const l of kids(pm, 'LineString')) { const pts = coords(kids(l, 'coordinates')[0]?.textContent); if (pts.length >= 2) items.push({ geom: 'line', group: 'LineString', xy: pts, name, value: null }); }
    for (const pg of kids(pm, 'Polygon')) {
      const ob = kids(pg, 'outerBoundaryIs')[0], pts = coords(kids(ob || pg, 'coordinates')[0]?.textContent);
      if (pts.length >= 3) items.push({ geom: 'area', group: 'Polygon', xy: pts, name });
    }
  }
  return { items, wgs: true };
}
export function parseKmz(bytes, fflate) {
  let files;
  try { files = fflate.unzipSync(bytes); } catch (e) { throw new Error(tx('KMZ файлы ашылмады (ZIP емес).', 'Не удалось открыть файл KMZ (не ZIP).')); }
  const names = Object.keys(files).filter(n => /\.kml$/i.test(n));
  if (!names.length) throw new Error(tx('KMZ ішінде KML файлы жоқ.', 'Внутри KMZ нет файла KML.'));
  return { items: names.flatMap(n => parseKml(fflate.strFromU8(files[n])).items), wgs: true };
}
export function parseGpx(str) {
  const doc = parseXml(str, 'GPX');
  const items = [];
  const P = el => [parseFloat(el.getAttribute('lon')), parseFloat(el.getAttribute('lat')), parseFloat(txt(el, 'ele'))];
  for (const w of kids(doc, 'wpt')) items.push({ geom: 'point', group: 'wpt', xy: P(w), name: txt(w, 'name') });
  for (const t of kids(doc, 'trk')) for (const s of kids(t, 'trkseg')) { const pts = kids(s, 'trkpt').map(P); if (pts.length >= 2) items.push({ geom: 'line', group: 'trk', xy: pts, name: txt(t, 'name'), value: null }); }
  for (const r of kids(doc, 'rte')) { const pts = kids(r, 'rtept').map(P); if (pts.length >= 2) items.push({ geom: 'line', group: 'rte', xy: pts, name: txt(r, 'name'), value: null }); }
  return { items, wgs: true };
}

/* ======================= Топтар мен белгі түрлері ======================= */
const catOf = g => (g === 'text' ? 'text' : g);
/** Топтар: { key, geom, count, kind (ұсынылған түр) } — бір топта бір геометрия түрі. */
export function groupsOf(items) {
  const map = new Map();
  for (const it of items) {
    const key = it.group + '\u0001' + it.geom;
    if (!map.has(key)) map.set(key, { key, label: it.group, geom: it.geom, count: 0, z: 0, val: 0, kind: it.kind || '' });
    const g = map.get(key);
    g.count++;
    if (it.geom === 'point' && fin(it.xy[2])) g.z++;
    if (it.geom === 'line' && it.value != null) g.val++;
  }
  for (const g of map.values()) if (!g.kind) g.kind = suggestKind(g);
  return [...map.values()];
}
/** Топтың атауы мен дерегіне қарап белгі түрін ұсыну (DXF қабаттарының жиі атаулары). */
export function suggestKind(g) {
  const s = String(g.label || '').toLowerCase();
  const has = re => re.test(s);
  if (g.geom === 'text') return 'text';
  if (g.geom === 'point') {
    if (has(/дерев|ағаш|tree/)) return 'tree';
    if (has(/тригон|триангул|геодез|пункт|trig/)) return 'trig';
    if (has(/вышк|мұнар|tower|мачт/)) return 'tower';
    return g.z ? 'height' : 'point';
  }
  if (g.geom === 'area') {
    if (has(/пашн|егіс|arable|пахот/)) return 'arable';
    if (has(/лес|орман|forest/)) return 'forest';
    if (has(/куст|бұта|shrub/)) return 'shrub';
    if (has(/болот|батпақ|swamp/)) return 'swamp';
    if (has(/вод|озер|көл|water|lake/)) return 'water';
    if (has(/песк|песок|құм|sand/)) return 'sand';
    return 'area';
  }
  if (has(/горизонт|contour|изолин|рельеф/) || g.val === g.count && g.count > 0) return 'contour';
  if (has(/лэп|эбж|power|электр/)) return 'power';
  if (has(/асфальт|шосс|автодор|road/)) return 'road';
  if (has(/грунт|полев|дала|track/)) return 'track';
  if (has(/троп|соқпақ|path/)) return 'path';
  if (has(/забор|огражд|шарбақ|fence/)) return 'fence';
  if (has(/канав|канал|арық|ditch/)) return 'ditch';
  if (has(/рек|ручей|өзен|river|stream/)) return 'river';
  if (has(/овраг|жыра|ravine/)) return 'ravine';
  if (has(/дорог|жол/)) return 'track';
  return 'line';
}
/** Топқа таңдауға болатын түрлер (геометриясына сай; нүкте — нүктелік белгі не жазу). */
export const kindsFor = geom => FEAT_KINDS.filter(k => k.cat === catOf(geom) || (geom === 'point' && k.cat === 'text'));

/** Сынық сызықты n төбеге дейін сирету (сақтау шегі — 2000 төбе). */
export function thin(pts, max = 2000) {
  if (pts.length <= max) return pts;
  const k = (pts.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => pts[Math.round(i * k)]);
}

/**
 * items + топтардың таңдауы + түрлендіргіш → plan_features жазбалары.
 * sel: { [group.key]: kind | '' (алынбайды) }; tf(x, y) → [lat, lon]; rotAdd — жергілікті тордың бұрылуы (жазулардың бұрышына қосылады).
 * Нәтиже: { recs, skipped }.
 */
export function toRecords(items, sel, tf, markId, rotAdd = 0) {
  const recs = [];
  let skipped = 0;
  const ll = p => { const r = tf(p[0], p[1]); return [Math.round(r[0] * 1e8) / 1e8, Math.round(r[1] * 1e8) / 1e8]; };
  for (const it of items) {
    const kind = sel[it.group + '\u0001' + it.geom];
    if (!kind) continue;
    const cat = (FEAT_KINDS.find(k => k.v === kind) || {}).cat;
    const rec = { mark_id: markId, kind, name: it.name || '', name_ru: it.name_ru || '', src: 'import' };
    try {
      if (cat === 'line' || cat === 'area') {
        if (it.geom === 'point' || it.geom === 'text') { skipped++; continue; }
        rec.pts = thin(it.xy.filter(p => fin(p[0]) && fin(p[1])).map(ll));
        if (rec.pts.length < (cat === 'area' ? 3 : 2)) { skipped++; continue; }
        if (kind === 'contour') rec.value = it.value ?? null;
      } else {
        const p = it.geom === 'point' || it.geom === 'text' ? it.xy : it.xy[0];
        [rec.lat, rec.lon] = ll(p);
        if (kind === 'height') { const z = it.value ?? p[2]; if (!fin(z)) { skipped++; continue; } rec.value = z; }
        if (kind === 'text') { if (!rec.name) { skipped++; continue; } rec.rot = (fin(it.rot) ? it.rot : 0) + rotAdd; }
      }
    } catch (e) { skipped++; continue; }
    if ((rec.lat != null && !(Math.abs(rec.lat) <= 90 && Math.abs(rec.lon) <= 180)) || (rec.pts && rec.pts.some(p => !(Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180)))) { skipped++; continue; }
    recs.push(rec);
  }
  return { recs, skipped };
}
/** Барлық жоспарлы координаттар (жүйені болжау үшін). */
export function allXY(items) {
  const xs = [], ys = [];
  for (const it of items) for (const p of it.geom === 'point' || it.geom === 'text' ? [it.xy] : it.xy) if (fin(p[0]) && fin(p[1])) { xs.push(p[0]); ys.push(p[1]); }
  return { xs, ys };
}
