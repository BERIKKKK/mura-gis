/* Mura GIS жобасының қабаттары → Plugin API 1 пішімі (Geometry API / Attributes API). Тек оқу: әрқашан жаңа нысан қайтарылады.
   Бағдарлама (main/plugins/host.js) және SDK тестілеу құралы (tools/run.mjs) бірдей түрлендіреді.
   Қабаттар: marks (ескерткіш белгілері, Point), zones (ескерткіш аумағының шекарасы, Polygon — қорғау аймақтары есептелетін
   шама, сақталмайды), routes (LineString), places (өзге нысандар, Point), plan_objects («Жоспар» нысандары, Polygon не Point). */
'use strict';
const GEO = require('./geo.js');

const LAYERS = ['marks', 'zones', 'routes', 'places', 'plan_objects'];
const HEX16 = /^[0-9a-f]{16}$/;
const r8 = v => Math.round(v * 1e8) / 1e8;
const pt = (lon, lat) => (Number.isFinite(+lon) && Number.isFinite(+lat) ? { type: 'Point', coordinates: [r8(+lon), r8(+lat)] } : null);
/** pts: [{ lat, lon }] (аймақ) не [[lat, lon]] (Жоспар) → сыртқы шекарасы CCW, тұйық Polygon. */
const polygon = pts => {
  const ring = (Array.isArray(pts) ? pts : []).map(p => (Array.isArray(p) ? [r8(+p[1]), r8(+p[0])] : [r8(+(p && p.lon)), r8(+(p && p.lat))])).filter(p => p.every(Number.isFinite));
  return ring.length >= 3 ? { type: 'Polygon', coordinates: [GEO.orient(ring, true)] } : null;
};
const omit = (o, keys) => { const r = {}; for (const k of Object.keys(o || {})) if (!keys.includes(k)) r[k] = o[k]; return JSON.parse(JSON.stringify(r)); };

const DEF = {
  marks: { geom: r => pt(r.lon, r.lat), attrs: r => omit(r, ['lat', 'lon']) },
  zones: { geom: r => polygon(r.pts), attrs: r => JSON.parse(JSON.stringify({ ...(r.fields || {}), id: r.id, name: r.name || '', mark_id: r.mark_id || null,
    created_at: r.created_at || '', created_by: r.created_by || '', updated_at: r.updated_at || '', updated_by: r.updated_by || '' })) },
  routes: { geom: r => ((r.pts || []).length >= 2 ? { type: 'LineString', coordinates: r.pts.map(p => [r8(p[1]), r8(p[0])]) } : null), attrs: r => omit(r, ['pts', 'pt_marks']) },
  places: { geom: r => pt(r.lon, r.lat), attrs: r => omit(r, ['lat', 'lon']) },
  plan_objects: { geom: r => (r.shape === 'free' && polygon(r.pts)) || pt(r.lon, r.lat), attrs: r => omit(r, ['pts']) },
};
const geometry = (layer, r) => DEF[layer].geom(r);
const attributes = (layer, r) => DEF[layer].attrs(r);

/** Бағдарлама терезесі берген ағымдағы аймақ (сақталмаған болуы мүмкін) → { layer, id, saved, geometry, attributes }. */
function selection(s) {
  if (!s || typeof s !== 'object' || s.layer !== 'zones') return null;
  const id = HEX16.test(String(s.id || '')) ? s.id : null;
  return { layer: 'zones', id, saved: !!(id && s.saved), geometry: polygon(s.pts),
    attributes: JSON.parse(JSON.stringify({ ...(s.fields && typeof s.fields === 'object' ? s.fields : {}), id, mark_id: HEX16.test(String(s.markId || '')) ? s.markId : null })) };
}

module.exports = { LAYERS, geometry, attributes, selection };
