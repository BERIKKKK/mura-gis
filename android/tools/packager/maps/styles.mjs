// Mura GIS офлайн векторлық карталарының стильдері (MapLibre Style Spec v8).
// Іске қосу: node styles.mjs <шығыс қалта>  →  style-base.json, style-topo.json
// Сілтемелер mura:// — құрылғыда жергілікті серверге ауыстырылады (core: MapPackage.resolveStyle).
// Жазулар: "name_kk" өрісі орыс тіліндегі интерфейсте "name_ru"-ға ауыстырылады.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] || '.';
const R = ['Noto Sans Regular'], B = ['Noto Sans Bold'], I = ['Noto Sans Italic'];
const NAME = ['coalesce', ['get', 'name_kk'], ['get', 'name_ru']];
const z = (...stops) => ['interpolate', ['linear'], ['zoom'], ...stops];

function style(topo) {
  const C = topo
    ? { bg: '#F4F1E8', water: '#9FC6DD', waterLine: '#5E9BC4', wood: '#CFE0BC', grass: '#E6EBCF', farm: '#EFE9D2', res: '#E6DED3',
        major: '#E8A35C', secondary: '#F2CF7A', minor: '#FFFFFF', casing: '#9C8F80', track: '#8C6A45' }
    : { bg: '#F2EFE6', water: '#AACBE2', waterLine: '#6FA6CC', wood: '#D3E5C3', grass: '#E3ECCF', farm: '#F0EBD9', res: '#E4DDD4',
        major: '#F0A35E', secondary: '#F6D27E', minor: '#FFFFFF', casing: '#B2A79B', track: '#9A7B5A' };
  const sources = {
    osm: {
      type: 'vector', tiles: ['mura://tiles/{z}/{x}/{y}'], minzoom: 4, maxzoom: 14,
      attribution: topo ? '© OpenStreetMap contributors · Copernicus DEM GLO-30 © DLR e.V., Airbus Defence and Space (ESA, EU)'
        : '© OpenStreetMap contributors',
    },
  };
  if (topo) sources.hillshade = { type: 'raster', tiles: ['mura://set/hillshade/{z}/{x}/{y}'], tileSize: 256, minzoom: 6, maxzoom: 12 };

  const L = [];
  L.push({ id: 'background', type: 'background', paint: { 'background-color': C.bg } });
  const lu = (id, cls, color, minzoom = 9, extra = {}) => L.push({ id, type: 'fill', source: 'osm', 'source-layer': 'landuse', minzoom,
    filter: ['in', ['get', 'class'], ['literal', cls]], paint: { 'fill-color': color, ...extra } });
  lu('landuse-farm', ['farmland'], C.farm, 11);
  lu('landuse-grass', ['grass'], C.grass, 11);
  lu('landuse-wood', ['wood'], C.wood, 10);
  lu('landuse-wetland', ['wetland'], '#D7E6E0', 10);
  lu('landuse-sand', ['sand'], '#EFE3C4', 11);
  lu('landuse-industrial', ['industrial'], '#E2DBE0', 11);
  lu('landuse-cemetery', ['cemetery'], '#D9E2CF', 12);
  lu('landuse-residential', ['residential'], C.res, 9, { 'fill-opacity': z(9, 0.6, 13, 1) });
  if (topo) L.push({ id: 'hillshade', type: 'raster', source: 'hillshade', paint: { 'raster-opacity': z(6, 0.6, 10, 0.85, 14, 0.7), 'raster-fade-duration': 0 } });
  if (topo) {
    L.push({ id: 'contour', type: 'line', source: 'osm', 'source-layer': 'contour', filter: ['!=', ['get', 'idx'], 1], minzoom: 12,
      paint: { 'line-color': '#C49A6C', 'line-width': z(12, 0.5, 15, 0.9), 'line-opacity': 0.8 } });
    L.push({ id: 'contour-index', type: 'line', source: 'osm', 'source-layer': 'contour', filter: ['==', ['get', 'idx'], 1],
      paint: { 'line-color': '#B07F4E', 'line-width': z(9, 0.6, 12, 1, 15, 1.6), 'line-opacity': 0.9 } });
  }
  L.push({ id: 'water', type: 'fill', source: 'osm', 'source-layer': 'water',
    paint: { 'fill-color': C.water, 'fill-opacity': ['case', ['==', ['get', 'intermittent'], 1], 0.55, 1] } });
  // line-dasharray мәліметке тәуелді бола алмайды — тұрақты және маусымдық ағындар бөлек қабат
  const wwWidth = ['interpolate', ['linear'], ['zoom'], 7, ['match', ['get', 'class'], 'river', 0.8, 0.3], 11, ['match', ['get', 'class'], 'river', 1.6, 0.6],
    14, ['match', ['get', 'class'], 'river', 3, 1.2]];
  L.push({ id: 'waterway', type: 'line', source: 'osm', 'source-layer': 'waterway', filter: ['!=', ['get', 'intermittent'], 1],
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.waterLine, 'line-width': wwWidth } });
  L.push({ id: 'waterway-intermittent', type: 'line', source: 'osm', 'source-layer': 'waterway', filter: ['==', ['get', 'intermittent'], 1],
    paint: { 'line-color': C.waterLine, 'line-width': wwWidth, 'line-dasharray': [3, 2] } });
  L.push({ id: 'building', type: 'fill', source: 'osm', 'source-layer': 'building', minzoom: 14,
    paint: { 'fill-color': '#D6CBBE', 'fill-outline-color': '#BFB2A3' } });

  // Шекаралар
  L.push({ id: 'boundary-district', type: 'line', source: 'osm', 'source-layer': 'boundary', filter: ['==', ['get', 'admin_level'], 6], minzoom: 7,
    paint: { 'line-color': '#9A7AA6', 'line-width': z(7, 0.8, 12, 1.6), 'line-dasharray': [4, 2] } });
  L.push({ id: 'boundary-region', type: 'line', source: 'osm', 'source-layer': 'boundary', filter: ['==', ['get', 'admin_level'], 4],
    paint: { 'line-color': '#8A5C99', 'line-width': z(4, 0.8, 12, 2), 'line-dasharray': [5, 2, 1, 2] } });
  L.push({ id: 'boundary-country', type: 'line', source: 'osm', 'source-layer': 'boundary', filter: ['==', ['get', 'admin_level'], 2],
    paint: { 'line-color': '#7A3E8E', 'line-width': z(4, 1.2, 12, 3), 'line-opacity': 0.85 } });

  // Жолдар (алдымен жиегі, сосын өзі)
  const road = (cls) => ['in', ['get', 'class'], ['literal', cls]];
  L.push({ id: 'road-track', type: 'line', source: 'osm', 'source-layer': 'transportation', filter: road(['track']), minzoom: 11,
    paint: { 'line-color': C.track, 'line-width': z(11, 0.6, 15, 1.6), 'line-dasharray': [3, 2] } });
  L.push({ id: 'road-path', type: 'line', source: 'osm', 'source-layer': 'transportation', filter: road(['path']), minzoom: 13,
    paint: { 'line-color': '#8D7B68', 'line-width': 1, 'line-dasharray': [1.5, 1.5] } });
  const W = { minor: z(10, 0.6, 14, 4, 16, 9), tertiary: z(9, 0.8, 14, 5, 16, 11), secondary: z(8, 1, 14, 6, 16, 12), major: z(5, 0.8, 10, 2.5, 14, 7, 16, 14) };
  const roads = [['minor', ['minor'], C.minor, 10], ['tertiary', ['tertiary'], '#FFF6D8', 9], ['secondary', ['secondary'], C.secondary, 8], ['major', ['major'], C.major, 5]];
  for (const [id, cls, color, mz] of roads) L.push({ id: `road-${id}-casing`, type: 'line', source: 'osm', 'source-layer': 'transportation', filter: road(cls), minzoom: Math.max(mz, 9),
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.casing, 'line-gap-width': W[id], 'line-width': z(9, 0.5, 14, 1) } });
  for (const [id, cls, color, mz] of roads) L.push({ id: `road-${id}`, type: 'line', source: 'osm', 'source-layer': 'transportation', filter: road(cls), minzoom: mz,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': color, 'line-width': W[id], ...(id === 'minor' || id === 'tertiary' ? {} : {}) } });
  L.push({ id: 'road-unpaved', type: 'line', source: 'osm', 'source-layer': 'transportation', minzoom: 12,
    filter: ['all', road(['minor', 'tertiary', 'secondary']), ['==', ['get', 'unpaved'], 1]],
    paint: { 'line-color': '#D8C7A8', 'line-width': z(12, 1, 16, 4), 'line-dasharray': [2, 2] } });
  L.push({ id: 'rail', type: 'line', source: 'osm', 'source-layer': 'transportation', filter: road(['rail']),
    paint: { 'line-color': '#6E6E6E', 'line-width': z(7, 0.8, 14, 2.2) } });
  L.push({ id: 'rail-ties', type: 'line', source: 'osm', 'source-layer': 'transportation', filter: road(['rail']), minzoom: 11,
    paint: { 'line-color': '#FFFFFF', 'line-width': z(11, 0.6, 14, 1.4), 'line-dasharray': [3, 3] } });

  // Жазулар
  if (topo) L.push({ id: 'contour-label', type: 'symbol', source: 'osm', 'source-layer': 'contour', minzoom: 12, filter: ['==', ['get', 'idx'], 1],
    layout: { 'symbol-placement': 'line', 'text-field': ['concat', ['to-string', ['get', 'ele']], ' м'], 'text-font': R, 'text-size': 10, 'symbol-spacing': 350 },
    paint: { 'text-color': '#8E623A', 'text-halo-color': C.bg, 'text-halo-width': 1.5 } });
  L.push({ id: 'waterway-label', type: 'symbol', source: 'osm', 'source-layer': 'waterway', minzoom: 10,
    filter: ['==', ['get', 'class'], 'river'],
    layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': I, 'text-size': z(10, 11, 14, 13), 'symbol-spacing': 400 },
    paint: { 'text-color': '#2F6E9A', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.2 } });
  L.push({ id: 'water-label', type: 'symbol', source: 'osm', 'source-layer': 'water_name', minzoom: 11,
    layout: { 'text-field': NAME, 'text-font': I, 'text-size': 12, 'text-max-width': 8 },
    paint: { 'text-color': '#2F6E9A', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.2 } });
  L.push({ id: 'road-label', type: 'symbol', source: 'osm', 'source-layer': 'transportation', minzoom: 13,
    filter: ['!', road(['rail', 'path', 'track'])],
    layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': R, 'text-size': 11 },
    paint: { 'text-color': '#4A4036', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.4 } });
  L.push({ id: 'road-ref', type: 'symbol', source: 'osm', 'source-layer': 'transportation', minzoom: 8,
    filter: ['all', road(['major', 'secondary']), ['has', 'ref']],
    layout: { 'symbol-placement': 'line', 'text-field': ['get', 'ref'], 'text-font': B, 'text-size': 10, 'symbol-spacing': 500, 'text-rotation-alignment': 'viewport' },
    paint: { 'text-color': '#5A3A1C', 'text-halo-color': '#FFF4D6', 'text-halo-width': 2 } });
  const poiIcon = ['match', ['get', 'class'], 'peak', 'peak', 'spring', 'spring', 'well', 'well', 'tower', 'tower', 'worship', 'worship',
    'station', 'station', 'cemetery', 'cemetery', 'historic', 'historic', 'attraction', 'attraction', 'historic'];
  L.push({ id: 'poi', type: 'symbol', source: 'osm', 'source-layer': 'poi', minzoom: topo ? 11 : 12,
    layout: {
      'icon-image': poiIcon, 'icon-size': 1, 'text-field': ['case', ['all', ['==', ['get', 'class'], 'peak'], ['has', 'ele']],
        ['concat', NAME, '\n', ['to-string', ['get', 'ele']], ' м'], NAME],
      'text-font': R, 'text-size': 11, 'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-optional': true, 'text-max-width': 8,
    },
    paint: { 'text-color': '#5A4636', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.3 } });
  const place = (id, cls, font, size, minzoom, color) => L.push({ id, type: 'symbol', source: 'osm', 'source-layer': 'place', minzoom,
    filter: ['in', ['get', 'class'], ['literal', cls]],
    layout: { 'text-field': NAME, 'text-font': font, 'text-size': size, 'text-max-width': 8,
      ...(id === 'place-village' ? { 'icon-image': 'settlement', 'icon-size': z(9, 0.6, 12, 0.8), 'text-offset': [0, 0.8], 'text-anchor': 'top' } : {}) },
    paint: { 'text-color': color, 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.6 } });
  place('place-other', ['locality', 'isolated_dwelling', 'farm'], I, 11, 12, '#6A5D50');
  place('place-hamlet', ['hamlet'], R, z(11, 11, 14, 13), 11, '#3C3530');
  place('place-village', ['village'], R, z(9, 12, 14, 15), 9, '#2B2622');
  place('place-town', ['town', 'city'], B, z(6, 12, 12, 18), 6, '#231F1C');

  return {
    version: 8, name: topo ? 'Mura GIS — топокарта' : 'Mura GIS — негізгі карта',
    glyphs: 'mura://glyphs/{fontstack}/{range}.pbf', sprite: 'mura://sprite',
    sources, layers: L,
  };
}

writeFileSync(join(out, 'style-base.json'), JSON.stringify(style(false)));
writeFileSync(join(out, 'style-topo.json'), JSON.stringify(style(true)));
console.log('styles written to', out);
