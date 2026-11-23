/* NIPD GeoJSON Exporter — Mura GIS үлгі плагині (Plugin API 1).
   «Қорғау аймағы → Нәтиже және экспорт → NIPD GeoJSON»: қорғау аймақтарынан ТЕК ескерткіш аумағының полигонын алып,
   config/nipd-schema.json (НИПД атрибуттар кестесі) бойынша сәйкестендіреді, тексереді және бір GeoJSON файлына жазады.
     • ағымдағы аймақ не барлық сақталған аймақтар — бір FeatureCollection;
     • қайталанатын өрістер (schema: "common": true) — бір рет енгізіледі, облыс бойынша есте сақталады;
     • түзетілетін өрістер ("editable": true, мыс. monument_kind) — атаудан анықталады, анықталмаса тексеру терезесінде
       енгізіледі және ескерткіш id-і бойынша есте қалады.
   Плагин оқшауланған ортада жұмыс істейді: тек globalThis.mura API-і және өз файлдары (fetch('config/…')). */
'use strict';

const LANG = { cur: mura.app.lang };
const t = (k, v) => mura.i18n.t(k, v, LANG.cur);
const loc = v => (v && typeof v === 'object' ? (v[LANG.cur] || v.kk || v.ru || '') : (v || ''));
const empty = v => v == null || String(v).trim() === '';
const fail = (title, lines) => mura.ui.dialog({ title: t('title'), body: [{ type: 'text', tone: 'error', text: title }, ...(lines && lines.length ? [{ type: 'list', items: lines }] : [])] });

/** Екі тілдегі өріс: key — қазақша, key_ru — орысша; бос болса екінші тілдегісі. */
function localized(o, lang) {
  if (!o) return {};
  const r = {};
  for (const k of Object.keys(o)) {
    if (k.endsWith('_ru')) continue;
    const kk = o[k], ru = o[k + '_ru'];
    r[k] = lang === 'ru' ? (empty(ru) ? kk : ru) : (empty(kk) ? ru : kk);
  }
  return r;
}

async function loadSchema(settings) {
  let schema;
  if (settings.schema && settings.schema.trim()) {
    try { schema = JSON.parse(settings.schema); } catch (e) { throw new Error(t('schemaBad') + ' ' + e.message); }
  } else schema = await (await fetch('config/nipd-schema.json')).json();
  const chk = mura.attributes.checkSchema(schema);
  if (!chk.ok) throw Object.assign(new Error(t('schemaBad')), { lines: chk.errors });
  return schema;
}

/** Атаудан ескерткіш түрін анықтау (schema.kinds: [{ value, match: [түбірлер] }]). Атаулар басымдық ретімен қаралады:
    алдымен ескерткіш белгісінің атауы (екі тілде), содан кейін ғана аймақ атауы. */
function guessKind(schema, ...names) {
  for (const n of names) {
    const text = String(n || '').toLowerCase();
    if (!text) continue;
    for (const k of schema.kinds || []) if ((k.match || []).some(m => text.includes(String(m).toLowerCase()))) return k.value;
  }
  return '';
}

function centroid(g) {
  const r = g.coordinates[0];
  let x = 0, y = 0;
  for (let i = 0; i < r.length - 1; i++) { x += r[i][0]; y += r[i][1]; }
  return [x / (r.length - 1), y / (r.length - 1)];
}

/** Экспортталатын аймақтар: [{ key, id, markId, saved, geometry, zone (атрибуттар) }]. */
async function collect(scope, sel, selAttrs) {
  if (scope === 'current') {
    return [{ key: sel.id || 'current', id: sel.id, saved: sel.saved, geometry: sel.geometry, zone: selAttrs ? selAttrs.attributes : {}, markId: selAttrs && selAttrs.attributes.mark_id }];
  }
  const geoms = new Map((await mura.geometry.list('zones', { limit: 10000 })).map(x => [x.id, x.geometry]));
  const attrs = await mura.attributes.list('zones', { limit: 10000 });
  return attrs.map(a => ({ key: a.id, id: a.id, saved: true, geometry: geoms.get(a.id) || null, zone: a.attributes, markId: a.attributes.mark_id }));
}

mura.commands.register('export', async (ctx) => {
  const settings = await mura.settings.get();
  for (const p of ['geometry.read', 'attributes.read', 'files.export']) {
    if (!mura.hasPermission(p)) { await mura.i18n.load(mura.app.lang); LANG.cur = mura.app.lang; await fail(t('noPermission', { perm: p })); return { saved: false }; }
  }
  let schema;
  try { schema = await loadSchema(settings); } catch (e) { await fail(e.message, e.lines); return { saved: false, error: 'schema' }; }
  // Деректер тілі: баптау → схема (НИПД — орысша) → құжат тілі. Терезелердің тілі — интерфейс тілі.
  const dataLang = settings.lang === 'kk' || settings.lang === 'ru' ? settings.lang : settings.lang === 'auto' ? (ctx.docLang || mura.app.lang) : (schema.lang || ctx.docLang || 'ru');
  LANG.cur = mura.app.lang;
  await mura.i18n.load(LANG.cur);

  const sel = await mura.geometry.selection();
  const selAttrs = await mura.attributes.selection();
  const hasCur = !!(sel && sel.geometry);
  const zonesAll = await mura.attributes.list('zones', { limit: 10000 });
  if (!hasCur && !zonesAll.length) { await fail(t('nothing')); return { saved: false, error: 'selection' }; }

  // 1. Қамту және ортақ өрістер (бір рет енгізіледі)
  const curName = hasCur ? (selAttrs && (selAttrs.attributes.name || selAttrs.attributes.name_ru)) || '—' : '';
  const oblast = (selAttrs && selAttrs.attributes.oblast) || (zonesAll[0] && zonesAll[0].attributes.oblast) || '';
  const commonByOblast = (await mura.storage.get('common')) || {};      // { облыс: { өріс: мән } } — облыс бойынша есте сақталады
  const store = commonByOblast[oblast || '-'] || commonByOblast.__last || {};
  const commons = schema.fields.filter(f => f.common);
  const scopeOpts = [...(hasCur ? [{ value: 'current', title: t('scope.current', { name: curName }) }] : []), ...(zonesAll.length ? [{ value: 'all', title: t('scope.all', { n: zonesAll.length }) }] : [])];
  const d1 = await mura.ui.dialog({
    title: t('title'), width: 'wide',
    body: [
      { type: 'field', key: '__scope', kind: 'select', label: t('scope'), options: scopeOpts, value: ctx.scope || scopeOpts[0].value },
      { type: 'text', tone: 'muted', text: t('only') },
      { type: 'heading', text: t('common', { oblast: oblast || '—' }) },
      ...commons.map(f => ({ type: 'field', key: f.name, kind: 'string', label: (loc(f.label) || f.name) + ' — ' + f.name, required: !!f.required,
        value: store[f.name] != null ? store[f.name] : (f.default != null ? f.default : '') })),
      { type: 'field', key: '__collection', kind: 'string', label: t('collection'), value: store.__collection || schema.collectionName || 'Mura GIS' },
    ],
    buttons: [{ id: 'cancel', title: t('cancel') }, { id: 'next', title: t('next'), primary: true }],
  });
  if (!d1 || d1.button !== 'next') return { saved: false };
  const common = {};
  for (const f of commons) common[f.name] = String(d1.values[f.name] == null ? '' : d1.values[f.name]).trim();
  const keep = { ...common, __collection: String(d1.values.__collection || '').trim() };
  await mura.storage.set('common', { ...commonByOblast, [oblast || '-']: keep, __last: keep });

  // 2. Аймақтар → НИПД жазбалары
  const items = await collect(d1.values.__scope === 'all' ? 'all' : 'current', sel, selAttrs);
  const markIds = [...new Set(items.map(i => i.markId).filter(Boolean))];
  const marks = new Map();
  for (const id of markIds) { const r = await mura.attributes.get('marks', id); if (r) marks.set(id, r.attributes); }
  const editable = schema.fields.filter(f => f.editable);
  const overrides = (await mura.storage.get('overrides')) || {};
  let crs = settings.crs && settings.crs !== 'schema' ? settings.crs : (schema.crs || 'EPSG:4326');
  const crsName = settings.crs && settings.crs !== 'schema' ? null : schema.crsName;

  const build = () => items.map(it => {
    const errors = [], notes = [];
    const raw = it.markId ? marks.get(it.markId) : null;
    if (!raw) notes.push(t('noMark'));
    if (!it.saved) notes.push(t('unsaved'));
    const mark = localized(raw, dataLang), zone = localized(it.zone, dataLang);
    let geom = it.geometry && it.geometry.type === 'Polygon' ? { type: 'Polygon', coordinates: [mura.geometry.orient(it.geometry.coordinates[0], true)] } : null;
    const gv = geom ? mura.geometry.validate(geom) : { ok: false, errors: [t('noGeom')] };
    if (!gv.ok) { errors.push(...gv.errors.map(e => 'geometry: ' + e)); geom = null; }
    const ov = overrides[it.markId || it.id || it.key] || {};
    const computed = { monument_kind: guessKind(schema, mark.name, raw && raw.name, raw && raw.name_ru, zone.name) };
    const record = mura.attributes.map({ mark, zone, common, override: ov, computed }, schema);
    const av = mura.attributes.validate(record, schema);
    errors.push(...av.errors.map(e => e.field + ': ' + e.message));
    return { it, record, geom, errors, notes, label: record.name || zone.name || it.id || '—', badFields: av.errors.map(e => e.field) };
  });

  // 3. Тексеру терезесі: қатесі бар нысандарды осында түзетуге болады (editable өрістер), «Қайта тексеру»
  for (;;) {
    const rows = build();
    const good = rows.filter(r => !r.errors.length);
    const bad = rows.filter(r => r.errors.length);
    if (crs === 'auto-utm') { const g = (good[0] || rows[0]).geom; crs = g ? mura.geometry.utmFor(...centroid(g)) : 'EPSG:4326'; }
    const fixable = bad.filter(r => r.badFields.some(f => editable.some(e => e.name === f))).slice(0, 40);
    const body = [
      { type: 'text', text: t('summary', { n: rows.length, ok: good.length, bad: bad.length, crs: crsName ? crsName.replace(/^urn:ogc:def:crs:/, '') : crs }) },
      bad.length ? { type: 'text', tone: 'error', text: t('errors') } : { type: 'text', tone: 'ok', text: t('ok') },
      ...(bad.length ? [{ type: 'list', items: bad.slice(0, 200).map(r => r.label + ': ' + r.errors.join('; ') + (r.notes.length ? ' (' + r.notes.join('; ') + ')' : '')) }] : []),
      ...(fixable.length ? [{ type: 'heading', text: t('edit') }] : []),
      ...fixable.flatMap((r, i) => editable.filter(e => r.badFields.includes(e.name)).map(e => ({ type: 'field', key: 'fix:' + rows.indexOf(r) + ':' + e.name, kind: 'string',
        label: r.label + ' — ' + (loc(e.label) || e.name), value: r.record[e.name] || '' }))),
      { type: 'heading', text: t('fields') + ' (' + (schema.name || '') + ')' },
      { type: 'table', columns: schema.fields.map(f => f.name + (f.required ? ' *' : '')), rows: rows.slice(0, 300).map(r => schema.fields.map(f => r.record[f.name] == null ? '—' : String(r.record[f.name]))) },
    ];
    const buttons = [{ id: 'cancel', title: t('cancel') }];
    if (fixable.length) buttons.push({ id: 'recheck', title: t('recheck') });
    if (!bad.length && good.length) buttons.push({ id: 'save', title: t('saveAll'), primary: true });
    else if (good.length) buttons.push({ id: 'save', title: t('saveValid', { n: good.length }), primary: !fixable.length });
    const d2 = await mura.ui.dialog({ title: t('title'), width: 'wide', body, buttons });
    if (!d2 || d2.button === 'cancel' || !d2.button) return { saved: false, valid: !bad.length, count: rows.length, errors: bad.map(r => ({ name: r.label, errors: r.errors })) };
    // Түзетулер — ескерткіш id-і бойынша есте сақталады
    let changed = false;
    for (const [k, v] of Object.entries(d2.values || {})) {
      const m = /^fix:(\d+):(.+)$/.exec(k);
      if (!m || empty(v)) continue;
      const r = rows[+m[1]], key = r.it.markId || r.it.id || r.it.key;
      overrides[key] = { ...(overrides[key] || {}), [m[2]]: String(v).trim() };
      changed = true;
    }
    if (changed) await mura.storage.set('overrides', overrides);
    if (d2.button === 'recheck') continue;

    // 4. Сақтау
    const feats = (changed ? build() : rows).filter(r => !r.errors.length).map(r => ({
      type: 'Feature',
      ...(settings.featureId !== false && (r.it.markId || r.it.id) ? { id: r.it.markId || r.it.id } : {}),
      properties: r.record,
      geometry: crs === 'EPSG:4326' ? r.geom : mura.geometry.transform(r.geom, 'EPSG:4326', crs),
    }));
    if (!feats.length) continue;
    const fc = {
      type: 'FeatureCollection',
      name: keep.__collection || schema.collectionName || 'Mura GIS',
      crs: { type: 'name', properties: { name: crsName || ('urn:ogc:def:crs:' + crs.replace(':', '::')) } },
      features: feats,
    };
    const base = String(fc.name).replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'nipd';
    const res = await mura.export.saveFile({ suggestedName: base + '.geojson', data: JSON.stringify(fc), filters: [{ name: 'GeoJSON', extensions: ['geojson', 'json'] }] });
    if (res && res.saved) await mura.ui.notify(t('saved', { name: res.name, n: feats.length }));
    return { saved: !!(res && res.saved), valid: !bad.length, count: feats.length, crs: fc.crs.properties.name, records: feats.map(f => f.properties) };
  }
});
