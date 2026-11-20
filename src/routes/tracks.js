/* Mura GIS: маршруттарды файлдан оқу және файлға жазу.
   Оқу (импорт): GPX — trk (әр trkseg — бөлек маршрут) және rte; KML/KMZ — LineString (MultiGeometry ішіндегісі де),
   gx:Track; GeoJSON — LineString / MultiLineString (Mura GIS экспорты болса — қасиеттерімен).
   Нәтиже: [{ name, note, pts: [[lat, lon], …], vehicle?, season?, … }]. Тректер жеңілдетіледі (Дуглас–Пекер, 3 м).
   Жазу (экспорт): GPX 1.1 (әр маршрут — trk) және GeoJSON (LineString, қасиеттерімен). */
import { simplify, lineLength } from './graph.js';

const tx = (kk, ru) => (globalThis.MuraI18n && globalThis.MuraI18n.ru ? ru : kk);
const text = el => (el ? el.textContent.trim() : '');
const child = (el, tag) => { for (const c of el.children) if (c.localName === tag) return c; return null; };
function parseXml(str, kind) {
  const doc = new DOMParser().parseFromString(String(str || '').replace(/^﻿/, ''), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error(kind + tx(' файлы оқылмады (XML қатесі).', ': не удалось прочитать файл (ошибка XML).'));
  return doc;
}
const ok = p => Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;
const clean = pts => {
  const out = [];
  for (const p of pts) if (ok(p) && !(out.length && out[out.length - 1][0] === p[0] && out[out.length - 1][1] === p[1])) out.push(p);
  return out.length >= 2 ? simplify(out, 3) : [];
};

export function parseGpx(str, file = '') {
  const doc = parseXml(str, 'GPX');
  const out = [];
  const ptsOf = (el, tag) => [...el.getElementsByTagNameNS('*', tag)].map(p => [parseFloat(p.getAttribute('lat')), parseFloat(p.getAttribute('lon'))]);
  for (const trk of doc.getElementsByTagNameNS('*', 'trk')) {
    const name = text(child(trk, 'name')), note = [text(child(trk, 'desc')), text(child(trk, 'cmt'))].filter(Boolean).join('\n');
    const segs = [...trk.getElementsByTagNameNS('*', 'trkseg')].map(s => clean(ptsOf(s, 'trkpt'))).filter(s => s.length);
    segs.forEach((pts, i) => out.push({ name: (name || tx('Трек', 'Трек')) + (segs.length > 1 ? ' (' + (i + 1) + ')' : ''), note, pts, file }));
  }
  for (const rte of doc.getElementsByTagNameNS('*', 'rte')) {
    const pts = clean(ptsOf(rte, 'rtept'));
    if (pts.length) out.push({ name: text(child(rte, 'name')) || tx('Маршрут', 'Маршрут'), note: text(child(rte, 'desc')), pts, file });
  }
  return out;
}

export function parseKml(str, file = '') {
  const doc = parseXml(str, 'KML');
  const out = [];
  const coords = s => String(s || '').trim().split(/\s+/).map(t => t.split(',').map(Number)).filter(a => a.length >= 2).map(a => [a[1], a[0]]);
  for (const pm of doc.getElementsByTagNameNS('*', 'Placemark')) {
    const name = text(child(pm, 'name')), note = text(child(pm, 'description')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const lines = [...pm.getElementsByTagNameNS('*', 'LineString')].map(l => clean(coords(text(child(l, 'coordinates')))));
    for (const tr of pm.getElementsByTagNameNS('*', 'Track')) {          // gx:Track — <gx:coord>lon lat alt</gx:coord>
      lines.push(clean([...tr.getElementsByTagNameNS('*', 'coord')].map(c => c.textContent.trim().split(/\s+/).map(Number)).map(a => [a[1], a[0]])));
    }
    const ls = lines.filter(l => l.length);
    ls.forEach((pts, i) => out.push({ name: (name || tx('Сызық', 'Линия')) + (ls.length > 1 ? ' (' + (i + 1) + ')' : ''), note, pts, file }));
  }
  return out;
}

export function parseKmz(bytes, fflate, file = '') {
  let files;
  try { files = fflate.unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)); }
  catch (e) { throw new Error(tx('KMZ файлы ашылмады (ZIP емес).', 'Не удалось открыть файл KMZ (не ZIP).')); }
  const names = Object.keys(files).filter(n => /\.kml$/i.test(n));
  if (!names.length) throw new Error(tx('KMZ ішінде KML файлы жоқ.', 'Внутри KMZ нет файла KML.'));
  return names.flatMap(n => parseKml(fflate.strFromU8(files[n]), file));
}

export function parseGeojson(str, file = '') {
  let o;
  try { o = JSON.parse(str); } catch (e) { throw new Error(tx('GeoJSON оқылмады (JSON емес).', 'Не удалось прочитать GeoJSON (не JSON).')); }
  const feats = o.type === 'FeatureCollection' ? o.features || [] : o.type === 'Feature' ? [o] : [{ geometry: o, properties: {} }];
  const out = [];
  for (const f of feats) {
    const g = f && f.geometry, pr = (f && f.properties) || {};
    if (!g) continue;
    const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    lines.forEach((c, i) => {
      const pts = (c || []).map(a => [Number(a[1]), Number(a[0])]).filter(ok);
      if (pts.length < 2) return;
      out.push({
        id: pr.mura_id || '', name: (pr.name || tx('Сызық', 'Линия')) + (lines.length > 1 ? ' (' + (i + 1) + ')' : ''), a_name: pr.from || '', b_name: pr.to || '',
        vehicle: pr.vehicle || '', season: pr.season || '', checked: pr.checked || '', note: pr.note || '',
        updated_at: pr.updated_at || '', pts, file,
      });
    });
  }
  return out;
}

/** Файл кеңейтуі бойынша оқу. fflate — KMZ үшін. */
export async function parseTrackFile(f, fflate) {
  const ext = (f.name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
  if (ext === 'gpx') return parseGpx(await f.text(), f.name);
  if (ext === 'kml') return parseKml(await f.text(), f.name);
  if (ext === 'kmz') return parseKmz(new Uint8Array(await f.arrayBuffer()), fflate, f.name);
  if (ext === 'geojson' || ext === 'json') return parseGeojson(await f.text(), f.name);
  throw new Error(tx('Белгісіз файл түрі: ', 'Неизвестный тип файла: ') + f.name);
}

/* ---------- Экспорт ---------- */
const x = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
/** GPX 1.1: tracks — [{ name, desc, pts }] */
export function toGpx(tracks, title = tx('Mura GIS маршруттары', 'Маршруты Mura GIS')) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<gpx version="1.1" creator="Mura GIS" xmlns="http://www.topografix.com/GPX/1/1">\n' +
    '  <metadata><name>' + x(title) + '</name><time>' + new Date().toISOString() + '</time></metadata>\n' +
    tracks.map(t => '  <trk><name>' + x(t.name) + '</name>' + (t.desc ? '<desc>' + x(t.desc) + '</desc>' : '') + '\n    <trkseg>\n' +
      t.pts.map(p => '      <trkpt lat="' + p[0].toFixed(7) + '" lon="' + p[1].toFixed(7) + '"/>').join('\n') + '\n    </trkseg>\n  </trk>\n').join('') +
    '</gpx>\n';
}
/** GeoJSON: routes — сақталған маршруттар (қасиеттерімен; қайта импорттауға жарайды). */
export function toGeojson(routes, title = tx('Mura GIS маршруттары', 'Маршруты Mura GIS')) {
  return {
    type: 'FeatureCollection', name: title,
    features: routes.map(r => ({
      type: 'Feature',
      properties: { mura_id: r.id, name: r.name, from: r.a_name || '', to: r.b_name || '', vehicle: r.vehicle, season: r.season, checked: r.checked || '',
        note: r.note || '', length_km: Math.round(lineLength(r.pts) / 10) / 100, updated_at: r.updated_at || '' },
      geometry: { type: 'LineString', coordinates: r.pts.map(p => [p[1], p[0]]) },
    })),
  };
}
