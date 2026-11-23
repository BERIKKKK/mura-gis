/* NIPD GeoJSON Exporter — Mura GIS үлгі плагині (Plugin API 1).
   «Қорғау аймағы → Нәтиже және экспорт → NIPD GeoJSON»: ағымдағы ескерткіш аумағының полигонын ҒАНА (қорғау аймақтарынсыз)
   плагиннің конфигурациясындағы өрістер схемасы бойынша GeoJSON-ға айналдырады, тексереді және сақтайды.
   Плагин оқшауланған ортада жұмыс істейді: тек globalThis.mura API-і, өз файлдары (fetch('config/…')) қолжетімді. */
'use strict';

const t = (k, v) => mura.i18n.t(k, v, LANG.cur);
const LANG = { cur: mura.app.lang };
const fail = (title, lines) => mura.ui.dialog({ title: t('title'), body: [{ type: 'text', tone: 'error', text: title }, ...(lines && lines.length ? [{ type: 'list', items: lines }] : [])] });

/** Екі тілдегі өріс: key — қазақша, key_ru — орысша; бос болса екінші тілдегісі. */
function localized(o, lang) {
  if (!o) return {};
  const r = {};
  for (const k of Object.keys(o)) {
    if (k.endsWith('_ru')) continue;
    const kk = o[k], ru = o[k + '_ru'];
    const empty = v => v == null || String(v).trim() === '';
    r[k] = lang === 'ru' ? (empty(ru) ? kk : ru) : (empty(kk) ? ru : kk);
  }
  return r;
}

async function loadSchema(settings) {
  let schema;
  if (settings.schema && settings.schema.trim()) {
    try { schema = JSON.parse(settings.schema); } catch (e) { throw new Error(t('schemaBad') + ' ' + e.message); }
  } else {
    const r = await fetch('config/nipd-schema.json');
    schema = await r.json();
  }
  const chk = mura.attributes.checkSchema(schema);
  if (!chk.ok) throw Object.assign(new Error(t('schemaBad')), { lines: chk.errors });
  return schema;
}

function centroid(g) {
  const r = g.coordinates[0];
  let x = 0, y = 0;
  for (let i = 0; i < r.length - 1; i++) { x += r[i][0]; y += r[i][1]; }
  return [x / (r.length - 1), y / (r.length - 1)];
}

mura.commands.register('export', async (ctx) => {
  const settings = await mura.settings.get();
  LANG.cur = settings.lang === 'kk' || settings.lang === 'ru' ? settings.lang : (ctx.docLang || mura.app.lang);
  await mura.i18n.load(LANG.cur);
  for (const p of ['geometry.read', 'attributes.read', 'files.export']) if (!mura.hasPermission(p)) { await fail(t('noPermission', { perm: p })); return { saved: false }; }

  let schema;
  try { schema = await loadSchema(settings); } catch (e) { await fail(e.message, e.lines); return { saved: false, error: 'schema' }; }

  // 1. Таңдалған ескерткіш аумағы: тек оның полигоны (қорғау аймақтары API арқылы берілмейді де)
  const sel = await mura.geometry.selection();
  const at = await mura.attributes.selection();
  if (!sel || sel.layer !== 'zones' || !sel.geometry || sel.geometry.type !== 'Polygon') { await fail(t('noSelection')); return { saved: false, error: 'selection' }; }
  const geom = { type: 'Polygon', coordinates: [mura.geometry.orient(sel.geometry.coordinates[0], true)] };
  const gv = mura.geometry.validate(geom);
  if (!gv.ok) { await fail(t('geomBad'), gv.errors); return { saved: false, error: 'geometry', errors: gv.errors }; }

  // 2. Атрибуттар: ескерткіш белгісі (mark_id арқылы сілтеме) + аймақ жазбасы
  const zoneA = at ? at.attributes : {};
  const markId = zoneA.mark_id || (ctx.zone && ctx.zone.markId) || null;
  const markRec = markId ? await mura.attributes.get('marks', markId) : null;
  const mark = localized(markRec ? markRec.attributes : null, LANG.cur);
  const zone = localized(zoneA, LANG.cur);
  const areaHa = Math.round(mura.geometry.area(geom) / 100) / 100;
  const computed = {
    mura_id: markId || sel.id || '', area_ha: areaHa, lang: LANG.cur, export_date: new Date().toISOString().slice(0, 10),
    type_title: mark.type ? t('type.' + mark.type) : '', category_title: mark.category ? t('cat.' + mark.category) : '',
  };
  const record = mura.attributes.map({ mark, zone, computed }, schema);
  const av = mura.attributes.validate(record, schema);

  // 3. Координаттар жүйесі
  let crs = settings.crs && settings.crs !== 'schema' ? settings.crs : (schema.crs || 'EPSG:4326');
  if (crs === 'auto-utm') { const c = centroid(geom); crs = mura.geometry.utmFor(c[0], c[1]); }
  if (!mura.geometry.supported(crs)) { await fail('CRS: ' + crs); return { saved: false, error: 'crs' }; }
  const outGeom = crs === 'EPSG:4326' ? geom : mura.geometry.transform(geom, 'EPSG:4326', crs);
  const fc = {
    type: 'FeatureCollection',
    name: String(record.obj_name || 'nipd').slice(0, 120),
    ...(crs === 'EPSG:4326' ? {} : { crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:' + crs.replace(':', '::') } } }),
    features: [{ type: 'Feature', properties: record, geometry: outGeom }],
  };

  // 4. Қорытынды: тексеру нәтижесі және сақтау
  const notes = [t('only')];
  if (!sel.saved) notes.push(t('unsaved'));
  if (!markRec) notes.push(t('noMark'));
  const body = [
    { type: 'text', text: t('summary', { name: record.obj_name || '—', ha: areaHa, n: geom.coordinates[0].length - 1, crs }) },
    av.ok ? { type: 'text', tone: 'ok', text: t('ok') } : { type: 'text', tone: 'error', text: t('attrsBad') },
    ...(av.ok ? [] : [{ type: 'list', items: av.errors.map(e => e.field + ': ' + e.message) }, { type: 'text', tone: 'warn', text: t('notSaved') }]),
    { type: 'list', items: notes },
    { type: 'heading', text: t('fields') + ' (' + (schema.name || '') + ')' },
    { type: 'table', columns: ['field', 'type', 'value'], rows: schema.fields.map(f => [f.name + (f.required ? ' *' : ''), f.type || 'string', record[f.name] == null ? '—' : String(record[f.name])]) },
  ];
  const r = await mura.ui.dialog({ title: t('title'), width: 'wide', body,
    buttons: av.ok ? [{ id: 'cancel', title: t('cancel') }, { id: 'save', title: t('save'), primary: true }] : [{ id: 'cancel', title: t('cancel'), primary: true }] });
  if (!av.ok || !r || r.button !== 'save') return { saved: false, valid: av.ok, errors: av.errors };
  const safe = String(record.obj_name || 'monument').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'monument';
  const res = await mura.export.saveFile({ suggestedName: 'NIPD_' + safe + '.geojson', data: JSON.stringify(fc, null, 2), filters: [{ name: 'GeoJSON', extensions: ['geojson', 'json'] }] });
  if (res && res.saved) await mura.ui.notify(t('saved', { name: res.name }));
  return { saved: !!(res && res.saved), valid: true, crs, record };
});
