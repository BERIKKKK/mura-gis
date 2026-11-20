/* KML, KMZ, GPX файлдарынан нүктелерді оқу (импорт: «Белгілер» панелі → «Импортталғандар»).
   Нәтиже: [{ name, desc, lat, lon, folder, file }].
     KML — Placemark: Point (бірнеше болса — әрқайсысы), Polygon / LineString — орта нүктесі (desc-те белгіленеді);
           атауы — <name>, сипаттамасы — <description> (HTML тегтерінсіз) және ExtendedData; бума — Folder/Document <name>.
     KMZ — ZIP ішіндегі бірінші .kml (әдетте doc.kml).
     GPX — wpt (жол нүктелері), олар жоқ болса — rtept; name, desc, cmt.
     GeoJSON — Point / MultiPoint (әр нүкте), Polygon / LineString — орта нүктесі; атауы — name, атауы, название т.б.,
           қалған қасиеттері — сипаттамаға «кілт: мән» жолдарымен. */

const text = el => (el ? el.textContent.trim() : '');
const child = (el, tag) => { for (const c of el.children) if (c.localName === tag) return c; return null; };
const stripHtml = s => {
  const d = new DOMParser().parseFromString('<!doctype html><body>' + String(s || ''), 'text/html');
  return (d.body.textContent || '').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
};
function parseXml(str, kind) {
  const doc = new DOMParser().parseFromString(String(str || '').replace(/^﻿/, ''), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error(kind + ' файлы оқылмады (XML қатесі).');
  return doc;
}
/** «lon,lat[,alt] lon,lat …» → [{lat, lon}] */
function coords(s) {
  return String(s || '').trim().split(/\s+/).map(t => t.split(',').map(Number)).filter(a => a.length >= 2 && isFinite(a[0]) && isFinite(a[1]))
    .map(a => ({ lon: a[0], lat: a[1] }));
}
const centroid = pts => ({ lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length });

export function parseKml(str, file = '') {
  const doc = parseXml(str, 'KML');
  const out = [];
  for (const pm of doc.getElementsByTagNameNS('*', 'Placemark')) {
    // Бума (Folder / Document) атауы
    let folder = '';
    for (let p = pm.parentElement; p; p = p.parentElement) {
      if (p.localName === 'Folder' || p.localName === 'Document') { const n = text(child(p, 'name')); if (n) { folder = n; break; } }
    }
    const name = text(child(pm, 'name'));
    let desc = stripHtml(text(child(pm, 'description')));
    const ext = [...pm.getElementsByTagNameNS('*', 'Data')].map(d => {
      const v = text(child(d, 'value')); const n = d.getAttribute('name') || '';
      return v ? (n ? n + ': ' : '') + v : '';
    }).concat([...pm.getElementsByTagNameNS('*', 'SimpleData')].map(d => (d.textContent.trim() ? (d.getAttribute('name') || '') + ': ' + d.textContent.trim() : ''))).filter(Boolean);
    if (ext.length) desc = (desc ? desc + '\n' : '') + ext.join('\n');
    const points = [...pm.getElementsByTagNameNS('*', 'Point')].map(p => coords(text(child(p, 'coordinates')))[0]).filter(Boolean);
    if (points.length) { points.forEach((p, i) => out.push({ name: name + (points.length > 1 ? ' (' + (i + 1) + ')' : ''), desc, lat: p.lat, lon: p.lon, folder, file })); continue; }
    // Нүктесі жоқ объект (полигон, сызық) — орта нүктесі
    const shape = [...pm.getElementsByTagNameNS('*', 'coordinates')].map(c => coords(c.textContent)).find(a => a.length);
    if (shape) {
      const c = centroid(shape);
      const kind = pm.getElementsByTagNameNS('*', 'Polygon').length ? 'полигонның' : 'сызықтың';
      out.push({ name, desc: (desc ? desc + '\n' : '') + '(' + kind + ' орта нүктесі)', lat: c.lat, lon: c.lon, folder, file });
    }
  }
  return out;
}

export function parseKmz(bytes, fflate, file = '') {
  let files;
  try { files = fflate.unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)); }
  catch (e) { throw new Error('KMZ файлы ашылмады (ZIP емес).'); }
  const names = Object.keys(files).filter(n => /\.kml$/i.test(n)).sort((a, b) => (/(^|\/)doc\.kml$/i.test(b) ? 1 : 0) - (/(^|\/)doc\.kml$/i.test(a) ? 1 : 0));
  if (!names.length) throw new Error('KMZ ішінде KML файлы жоқ.');
  return names.flatMap(n => parseKml(fflate.strFromU8(files[n]), file));
}

export function parseGpx(str, file = '') {
  const doc = parseXml(str, 'GPX');
  let pts = [...doc.getElementsByTagNameNS('*', 'wpt')];
  if (!pts.length) pts = [...doc.getElementsByTagNameNS('*', 'rtept')];
  const md = doc.getElementsByTagNameNS('*', 'metadata')[0];
  const folder = md ? text(child(md, 'name')) : '';
  return pts.map((p, i) => {
    const lat = parseFloat(p.getAttribute('lat')), lon = parseFloat(p.getAttribute('lon'));
    const desc = [text(child(p, 'desc')), text(child(p, 'cmt'))].filter((v, k, a) => v && a.indexOf(v) === k).map(stripHtml).join('\n');
    return { name: text(child(p, 'name')) || 'Нүкте ' + (i + 1), desc, lat, lon, folder, file };
  }).filter(p => isFinite(p.lat) && isFinite(p.lon));
}

const NAME_KEYS = ['name', 'Name', 'NAME', 'атауы', 'Атауы', 'атау', 'название', 'Название', 'наименование', 'Наименование', 'title', 'Title', 'label'];
export function parseGeojsonPoints(o, file = '') {
  const feats = o && o.type === 'FeatureCollection' ? o.features : o && o.type === 'Feature' ? [o] : [];
  const out = [];
  (feats || []).forEach((f, i) => {
    const g = f && f.geometry, p = (f && f.properties) || {};
    if (!g || !Array.isArray(g.coordinates)) return;
    const nk = NAME_KEYS.find(k => p[k] != null && String(p[k]).trim());
    const name = nk ? String(p[nk]).trim() : 'Нүкте ' + (i + 1);
    const rest = Object.entries(p).filter(([k, v]) => k !== nk && v != null && typeof v !== 'object' && String(v).trim()).map(([k, v]) => k + ': ' + String(v).trim());
    const ll = c => ({ lon: +c[0], lat: +c[1] });
    let pts = [], note = '';
    if (g.type === 'Point') pts = [ll(g.coordinates)];
    else if (g.type === 'MultiPoint') pts = g.coordinates.map(ll);
    else if (g.type === 'LineString') { pts = [centroid(g.coordinates.map(ll))]; note = '(сызықтың орта нүктесі)'; }
    else if (g.type === 'Polygon' && g.coordinates[0]) { pts = [centroid(g.coordinates[0].map(ll))]; note = '(полигонның орта нүктесі)'; }
    else if (g.type === 'MultiPolygon' && g.coordinates[0] && g.coordinates[0][0]) { pts = [centroid(g.coordinates[0][0].map(ll))]; note = '(полигонның орта нүктесі)'; }
    for (const q of pts) if (isFinite(q.lat) && isFinite(q.lon)) out.push({ name, desc: [...rest, note].filter(Boolean).join('\n'), lat: q.lat, lon: q.lon, folder: o.name || '', file });
  });
  return out;
}
/** Mura GIS-тің өз белгілер экспорты ма (әр нүктеде id, type_kk, status_kk) — ондай файл бірден белгілерге қайтарылады. */
export function isMuraMarks(o) {
  const feats = o && o.type === 'FeatureCollection' ? o.features : [];
  return !!feats && feats.length > 0 && feats.every(f => {
    const p = f && f.properties || {};
    return /^[0-9a-f]{16}$/.test(String(p.id || '')) && p.type_kk != null && p.status_kk != null;
  });
}

/** Файл кеңейтуі бойынша оқу. fflate — KMZ үшін. */
export async function parseGeoFile(f, fflate) {
  const ext = (f.name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
  if (ext === 'kml') return parseKml(await f.text(), f.name);
  if (ext === 'gpx') return parseGpx(await f.text(), f.name);
  if (ext === 'kmz') return parseKmz(new Uint8Array(await f.arrayBuffer()), fflate, f.name);
  throw new Error('Белгісіз файл түрі: ' + f.name);
}
