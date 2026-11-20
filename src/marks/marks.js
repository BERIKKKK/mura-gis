/* Mura GIS: «Белгі қою» — ескерткіштерді картада нүктемен белгілеу (қорғау аймағынан бөлек негізгі функция).
   Қорғау аймағымен үйлесімі:
     • бір карта, бірақ бөлек қабат және бөлек сақтау орны (data/marks.json — main/marks.js);
     • режимдер бірін-бірі өшіреді: «Белгі қою» қосылса — шекара нүктесін қою, сызғыш пен циркуль өшеді, және керісінше;
     • шекара нүктесін қою, сызғыш не циркуль режимінде белгілер басуды өткізіп жібереді (шекараны белгінің үстінен де қоюға болады);
     • белгілер панелі мен «Мәліметтер» / «Сақталған аймақтар» / «Нүктелер» панельдері бірін-бірі жабады.
   Интерфейс бөліктері — marks/marks-dom.js, экспорт — marks/export.js, сұрыптау — marks/sort.js. */
import { parseOne, genitive } from '../qorgau/app.js';
import { sortMarks, arabizeRoman, compareText, compareNames, matchesText } from './sort.js';
import { parseGeoFile, parseGeojsonPoints, isMuraMarks } from './geofiles.js';
import { culledLayer, progressiveList } from './culled.js';
import { TYPES, CATEGORIES, STATUSES, SYMBOL_FILE, typeOf, categoryOf, statusOf, geojson, fromGeojson, docxBlob, pdfHtml, defaultTitle, sections, coordLines, nameCell } from './export.js';

const $ = id => document.getElementById(id);
const L = globalThis.L;
const MM = globalThis.MuraMarks || {};
const map = MM.map;
const API = 'mura://app/marks?v=1';
const app = $('qaApp'), mapEl = $('qaMap'), panelEl = $('mkPanel'), modeBtn = $('mkMode'), listBtn = $('mkListBtn');
const ic = MM.icon || (() => '');
const REG = globalThis.MuraRegions;
const I18N = globalThis.MuraI18n || { ru: false, local: o => o, field: (o, k) => o[k] || '', docLang: () => 'kk', biField: null, missing: () => [] };
const tx = (kk, ru) => (I18N.ru ? ru : kk);
const UI = I18N.ru ? 'ru' : 'kk';
/** Белгі интерфейс тілінде: атауы, мерзімі, жері — сол тілдегі мәні (бос болса — екінші тілдегісі). */
const view = m => I18N.local(m, UI);
const docLang = () => I18N.docLang();
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* жеке режим */ } },
};

let items = [];               // барлық белгілер (сақталғандары)
let sorted = null;            // items құжат ретімен (sortMarks) — items өзгергенде ғана қайта сұрыпталады
let imports = [];             // импортталған, әлі сәйкестендірілмеген нүктелер (KML, KMZ, GPX)
const selected = new Set();   // тізімде таңдалған белгілер (топпен өшіру)
let marking = false;          // «Белгі қою» режимі
let dragging = false;

function toast(msg, err) {
  const t = $('qaToast');
  if (!t) return;
  t.textContent = msg; t.classList.toggle('is-err', !!err); t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, err ? 5000 : 2600);
}
const ask = (msg, o) => (globalThis.QAUI && globalThis.QAUI.confirm ? globalThis.QAUI.confirm(msg, o) : Promise.resolve(confirm(msg)));

/* ======================= Сақтау (main/marks.js) ======================= */
async function api(op, data) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data || {})) fd.append(k, v);
  const r = await fetch(API + '&op=' + op, { method: 'POST', body: fd });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || tx('Сақтау қатесі', 'Ошибка сохранения'));
  if (Array.isArray(j.items)) { items = j.items; sorted = null; render(true); }
  if (Array.isArray(j.imports)) { imports = j.imports; renderImports(true); }
  return j;
}
async function saveMark(m) {
  const j = await api('save', { data: JSON.stringify(m) });
  return items.find(x => x.id === j.id);
}

/* ======================= Карта қабаты ======================= */
/* Шартты белгілер: түрі — symbols/*.svg (QGIS параметрлі SVG), түсі — санатына қарай (6-бап).
   QGIS-тің param(fill) / param(outline) мәндері санат түсімен ауыстырылады, қалған param(…) — әдепкі мәнімен. */
const SYM = {};
await Promise.all(Object.entries(SYMBOL_FILE).map(async ([t, f]) => {
  try { SYM[t] = (await (await fetch(new URL('symbols/' + f + '.svg', import.meta.url))).text()).replace(/<!--[\s\S]*?-->/g, '').trim(); }
  catch (e) { SYM[t] = ''; }
}));
const symCache = new Map();
/** Белгінің SVG-і: w — ені (px), биіктігі 64×80 пропорциясымен. */
function symbolSvg(type, category, w = 30) {
  const k = type + '|' + category + '|' + w;
  if (symCache.has(k)) return symCache.get(k);
  const st = categoryOf(category);
  let svg = SYM[type] || SYM.archeo || '';
  svg = svg.replace(/param\(fill\)\s*#[0-9a-f]{3,8}/gi, st.fill).replace(/param\(outline\)\s*#[0-9a-f]{3,8}/gi, st.outline).replace(/param\([\w-]+\)\s*/g, '')
    .replace(/<svg\b[^>]*>/, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 80" width="' + w + '" height="' + Math.round(w * 1.25) + '" aria-hidden="true">');
  symCache.set(k, svg);
  return svg;
}
function pinIcon(m) {
  const w = 30, h = Math.round(w * 1.25);
  return L.divIcon({
    className: 'mk-pin' + (m.status === 'excluded' ? ' is-excl' : ''), iconSize: [w, h], iconAnchor: [w / 2, h - 1], tooltipAnchor: [0, -h + 4],
    html: symbolSvg(m.type, m.category, w),
  });
}
/* Белгілер картаға culled.js арқылы салынады: көрініп тұрған аумақтағысы ғана — SVG белгі, тым көп болса — canvas-тағы дөңгелек.
   Оқиғалар белгінің id-і бойынша ағымдағы жазбаны алады (items жаңарғанда белгі қайта жасалмауы мүмкін). */
const byId = new Map();
const cur = id => byId.get(id);
const passThrough = () => mapEl.classList.contains('is-adding') || mapEl.classList.contains('is-ruler');
const markSig = m => m.lat + ',' + m.lon + '|' + m.type + '|' + m.category + '|' + m.status + '|' + view(m).name;
function makePin(m0) {
  const id = m0.id, labels = $('mkLabels').checked;
  const mk = L.marker([m0.lat, m0.lon], { icon: pinIcon(m0), draggable: marking, keyboard: true, title: '', riseOnHover: true, autoPan: true });
  mk.bindTooltip(esc(view(m0).name), { direction: 'top', permanent: labels, className: 'mk-tip' + (labels ? ' is-perm' : '') });
  mk.on('click', () => { const m = cur(id); if (!dragging && m) openDialog(m); });
  mk.on('contextmenu', ev => { L.DomEvent.preventDefault(ev.originalEvent); const m = cur(id); if (m) globalThis.MuraCtx?.forMark(m, ev); });
  mk.on('dragstart', () => { dragging = true; });
  mk.on('dragend', async () => {
    setTimeout(() => { dragging = false; }, 50);
    const m = cur(id), p = mk.getLatLng();
    if (!m) return;
    try { await saveMark({ ...m, lat: p.lat, lon: p.lng }); toast(tx('«' + view(m).name + '» жылжытылды: ', 'Метка «' + view(m).name + '» перемещена: ') + coordLines({ lat: p.lat, lon: p.lng }).join(', ')); }
    catch (e) { toast(e.message, true); mk.setLatLng([m.lat, m.lon]); }
  });
  return mk;
}
function makeDot(m0, renderer) {
  const st = categoryOf(m0.category), excl = m0.status === 'excluded', id = m0.id;
  const c = L.circleMarker([m0.lat, m0.lon], { renderer, radius: 5, weight: 1.5, color: st.outline, fillColor: st.fill, opacity: excl ? 0.55 : 1, fillOpacity: excl ? 0.45 : 0.95 });
  c.bindTooltip(esc(view(m0).name), { direction: 'top', className: 'mk-tip', offset: [0, -4] });
  // Шекара нүктесін қою / сызғыш режимінде басу картаға өтеді (DOM белгілердегі pointer-events: none сияқты)
  c.on('click', ev => { if (passThrough()) return; L.DomEvent.stopPropagation(ev); const m = cur(id); if (m && !dragging) openDialog(m); });
  c.on('contextmenu', ev => {
    if (passThrough()) return;
    L.DomEvent.stopPropagation(ev); L.DomEvent.preventDefault(ev.originalEvent);
    const m = cur(id); if (m) globalThis.MuraCtx?.forMark(m, ev);
  });
  return c;
}
const marksView = culledLayer(map, { limit: 500, sig: markSig, pin: makePin, dot: makeDot });
const layer = marksView.layer;
function drawMarkers() {
  byId.clear();
  for (const m of items) byId.set(m.id, m);
  marksView.setData(items);
}
function paintLayerVisibility() {
  const on = $('mkShow').checked;
  if (on && !map.hasLayer(layer)) layer.addTo(map);
  if (!on && map.hasLayer(layer)) map.removeLayer(layer);
}

/* ======================= Режим: «Белгі қою» ======================= */
const addBtn = $('qaAddMode'), rulerBtn = $('qaRuler'), compassBtn = $('qaCompass');
const pressed = b => b && b.getAttribute('aria-pressed') === 'true';
function setMarking(on) {
  if (on) {
    // Қорғау аймағының режимдерін өшіреміз (app.js өз батырмасы арқылы — оның күйі дұрыс жаңарады)
    if (pressed(addBtn)) addBtn.click();
    if (pressed(rulerBtn)) rulerBtn.click();
    if (pressed(compassBtn)) compassBtn.click();
    if (!$('mkShow').checked) { $('mkShow').checked = true; paintLayerVisibility(); }
  }
  marking = on;
  modeBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  modeBtn.dataset.tip = on ? 'Белгі қою: қосулы — картаны басыңыз (Esc — өшіру)' : 'Белгі қою: картаны басып ескерткішті белгілеңіз';
  mapEl.classList.toggle('is-marking', on);
  marksView.eachPin(mk => { mk.options.draggable = on; if (mk.dragging) (on ? mk.dragging.enable() : mk.dragging.disable()); });
}
modeBtn.addEventListener('click', () => setMarking(!marking));
// Шекара нүктесін қою, сызғыш не циркуль қосылса — белгі қою өшеді
const modeObs = new MutationObserver(() => { if (marking && (pressed(addBtn) || pressed(rulerBtn) || pressed(compassBtn))) setMarking(false); });
for (const b of [addBtn, rulerBtn, compassBtn]) if (b) modeObs.observe(b, { attributes: true, attributeFilter: ['aria-pressed'] });

map.on('click', e => {
  if (!marking || dragging) return;
  openDialog({ lat: e.latlng.lat, lon: e.latlng.lng });
});

/* ======================= Белгі терезесі (атауы, орналасқан жері, түрі, санаты, мәртебесі) ======================= */
const districtOpts = () => [...($('qaDistrict')?.options || [])].map(o => o.value).filter(Boolean);
const optionsHtml = (list, val) => list.map(x => '<option value="' + esc(x.v) + '"' + (x.v === val ? ' selected' : '') + '>' + esc(x.label) + '</option>').join('');
const lastKey = 'mk-last-v1';            // соңғы таңдалған облыс/аудан/түр/санат/мәртебе — келесі белгіге әдепкі
function lastDefaults() { try { return JSON.parse(store.get(lastKey) || '{}') || {}; } catch (e) { return {}; } }

let dlg = null;
function closeDialog() {
  if (!dlg) return;
  dlg.back.remove();
  document.removeEventListener('keydown', dlg.onKey, true);
  if (dlg.prev && dlg.prev.focus && document.contains(dlg.prev)) dlg.prev.focus({ preventScroll: true });
  if (dlg.temp) map.removeLayer(dlg.temp);
  dlg = null;
}
function parseLatLon(latS, lonS) {
  // Бір өріске жұп қойылса («50.41, 57.04» не «50°24′ N 57°02′ E») — екіге бөлеміз
  if (String(latS).trim() && !String(lonS).trim()) {
    const parts = String(latS).split(/\s*[;\t]\s*|,\s+|\s{2,}|(?<=[NnСс″"'])\s+(?=\d)/).filter(Boolean);
    if (parts.length === 2) { latS = parts[0]; lonS = parts[1]; }
  }
  const a = parseOne(latS), b = parseOne(lonS);
  if (a.err) return { err: tx('Ендік: ', 'Широта: ') + a.err };
  if (b.err) return { err: tx('Бойлық: ', 'Долгота: ') + b.err };
  if (Math.abs(a.v) > 90) return { err: tx('Ендік ±90° аралығында болуы керек', 'Широта должна быть в пределах ±90°') };
  if (Math.abs(b.v) > 180) return { err: tx('Бойлық ±180° аралығында болуы керек', 'Долгота должна быть в пределах ±180°') };
  return { lat: a.v, lon: b.v };
}

function openDialog(m, o = {}) {
  closeDialog();
  globalThis.QAUI?.closePop?.();
  const isNew = !m.id;
  const def = lastDefaults();
  const v = {
    name: '', period: '', place: '', note: '', name_ru: '', period_ru: '', place_ru: '', note_ru: '',
    oblast: REG ? REG.remembered() : (def.oblast || 'Ақтөбе облысы'),
    type: def.type || 'archeo', category: def.category ?? 'local', status: def.status || 'state',
    ...m,
  };
  // Аудан әдепкісі — соңғы таңдалған (сол облыстікі болса ғана)
  // (жоба ауданға байланса — жобаның ауданы)
  if (v.district == null) v.district = (REG && REG.defaultDistrict(v.oblast)) || (def.oblast === v.oblast ? def.district || '' : '');
  const dists = districtOpts();
  if (v.district && !dists.includes(v.district)) dists.push(v.district);
  const back = document.createElement('div');
  back.className = 'qa-dlg-back mk-dlg-back';
  back.innerHTML =
    '<form class="qa-dlg qa-glass mk-dlg" role="dialog" aria-modal="true" aria-labelledby="mkDlgT" novalidate>' +
      '<h3 id="mkDlgT"><span class="mk-sym" id="mkSym"></span>' + esc(o.title || (isNew ? 'Жаңа ескерткіш белгісі' : 'Ескерткіш белгісі')) + '</h3>' +
      // Мәтіндік өрістер екі тілде: ҚАЗ / РУС (құжат қай тілде шықса, сол тілдегісі алынады)
      I18N.biField({ id: 'mkName', name: 'name', label: tx('Атауы', 'Наименование'), req: true, kk: v.name, ru: v.name_ru, max: 200,
        ph: 'Мысалы: Қабантау-V қорғаны', phRu: 'Например: Курган Кабантау-V', hint: '<p class="qa-hint mk-key" id="mkKey" hidden></p>' }) +
      I18N.biField({ id: 'mkPeriod', name: 'period', label: tx('Мерзімі (дәуірі)', 'Датировка (эпоха)'), kk: v.period, ru: v.period_ru, max: 120,
        ph: 'б.з.б. VII–IV ғасырлар', phRu: 'VII–IV века до н. э.' }) +
      '<div class="qa-row2">' +
        '<div class="qa-f"><label for="mkOblast">Облыс / республикалық қала</label>' + (REG
          ? '<select id="mkOblast" name="oblast">' + REG.regionOptions(v.oblast) + '</select>'
          : '<input type="text" id="mkOblast" name="oblast" maxlength="80" value="' + esc(v.oblast) + '">') + '</div>' +
        '<div class="qa-f"><label for="mkDistrict">Аудан / қала</label><select id="mkDistrict" name="district">' + (REG ? REG.unitOptions(v.oblast, v.district) : '<option value="">—</option>' +
          dists.map(d => '<option' + (d === v.district ? ' selected' : '') + '>' + esc(d) + '</option>').join('')) + '</select></div>' +
      '</div>' +
      I18N.biField({ id: 'mkPlace', name: 'place', label: tx('Орналасқан жері', 'Местонахождение'), kk: v.place, ru: v.place_ru, max: 1500, rows: 2,
        ph: 'Қос Естек ауылынан 15,8 шақырым батыста, Егінді жылғасының оң жағалауында', phRu: 'в 15,8 километрах к западу от села Кос Естек, на правом берегу ручья Егинды' }) +
      '<div class="qa-f"><label for="mkType">Түрі <small class="mk-law">(Заңның 5-бабы)</small></label><select id="mkType" name="type">' + optionsHtml(TYPES, v.type) + '</select></div>' +
      '<div class="qa-row2">' +
        '<div class="qa-f"><label for="mkCat">Санаты <small class="mk-law">(6-бап)</small></label><select id="mkCat" name="category">' + optionsHtml(CATEGORIES, v.category) + '</select></div>' +
        '<div class="qa-f"><label for="mkStatus">Мәртебесі <small class="mk-law">(3–5-баптар)</small></label><select id="mkStatus" name="status">' + optionsHtml(STATUSES, v.status) + '</select></div>' +
      '</div>' +
      '<div class="qa-row2 mk-coords">' +
        '<div class="qa-f"><label for="mkLat">Ендік (N)</label><input type="text" id="mkLat" name="lat" autocomplete="off" spellcheck="false" value="' + esc(o.latText ?? (v.lat != null ? (+v.lat).toFixed(7) : '')) + '"></div>' +
        '<div class="qa-f"><label for="mkLon">Бойлық (E)</label><input type="text" id="mkLon" name="lon" autocomplete="off" spellcheck="false" value="' + esc(o.lonText ?? (v.lon != null ? (+v.lon).toFixed(7) : '')) + '"></div>' +
      '</div>' +
      '<p class="qa-hint mk-coordok" id="mkCoordOk"></p>' +
      I18N.biField({ id: 'mkNote', name: 'note', label: tx('Ескертпе', 'Примечание'), kk: v.note, ru: v.note_ru, max: 3000, rows: 2 }) +
      '<p class="mk-err" id="mkErr" role="alert" hidden></p>' +
      '<div class="qa-dlg-btns">' +
        (isNew ? '' : '<button type="button" class="lnk lnk--danger mk-del" id="mkDel">Өшіру</button><button type="button" class="lnk" id="mkGo">Картадан көрсету</button><button type="button" class="lnk" id="mkZone" title="Осы ескерткіштің қорғау аймағын белгілеу">Қорғау аймағы</button>') +
        '<span class="mk-sp"></span>' +
        '<button type="button" class="btn btn--ghost btn--sm" id="mkCancel">Бас тарту</button>' +
        '<button type="submit" class="btn btn--primary btn--sm">' + (isNew ? 'Белгіні сақтау' : 'Сақтау') + '</button>' +
      '</div>' +
    '</form>';
  const form = back.querySelector('form');
  const F = form.elements;
  const err = back.querySelector('#mkErr');
  const showErr = t => { err.textContent = t || ''; err.hidden = !t; };

  // Жаңа белгінің орны картада уақытша көрсетіледі
  const temp = isNew && v.lat != null ? L.marker([v.lat, v.lon], { icon: pinIcon(v), interactive: false, opacity: 0.75 }).addTo(map) : null;

  function paintKey() {
    const nm = (UI === 'ru' ? F.name_ru.value.trim() || F.name.value.trim() : F.name.value.trim() || F.name_ru.value.trim());
    const k = arabizeRoman(nm);
    const el = back.querySelector('#mkKey');
    el.hidden = !nm || k === nm;
    el.textContent = tx('Сұрыптауда: «', 'При сортировке: «') + k + '»';
  }
  function paintCoord() {
    const r = parseLatLon(F.lat.value, F.lon.value);
    const el = back.querySelector('#mkCoordOk');
    if (r.err) { el.textContent = F.lat.value.trim() || F.lon.value.trim() ? r.err : tx('Координатаны енгізіңіз (кез келген пішімде: 50.412345, 50°24′44,4″, 50 24 44.4)', 'Введите координаты (в любом формате: 50.412345, 50°24′44,4″, 50 24 44.4)'); el.classList.toggle('qa-bad', !!(F.lat.value.trim() || F.lon.value.trim())); return r; }
    el.classList.remove('qa-bad');
    el.textContent = '= ' + coordLines(r).join(', ') + ' (WGS 84)';
    if (temp) { temp.setLatLng([r.lat, r.lon]); temp.setIcon(pinIcon({ type: F.type.value, category: F.category.value, status: F.status.value })); }
    return r;
  }
  F.name.addEventListener('input', paintKey);
  F.name_ru.addEventListener('input', paintKey);
  if (REG) {
    F.oblast.addEventListener('change', () => { F.district.innerHTML = REG.unitOptions(F.oblast.value, ''); REG.lock(F.district); });
    REG.lock(F.oblast); REG.lock(F.district);       // жобаның облысы / ауданы — бекітілген
  }
  F.lat.addEventListener('input', paintCoord);
  F.lon.addEventListener('input', paintCoord);
  const paintSym = () => { back.querySelector('#mkSym').innerHTML = symbolSvg(F.type.value, F.category.value, 26); };
  F.type.addEventListener('change', () => { paintCoord(); paintSym(); });
  F.status.addEventListener('change', () => { paintCoord(); paintSym(); });
  F.category.addEventListener('change', () => { paintCoord(); paintSym(); });
  paintSym();
  paintKey(); paintCoord();

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = F.name.value.trim(), nameRu = F.name_ru.value.trim();
    if (!name && !nameRu) { showErr(tx('Ескерткіш атауын енгізіңіз (қазақша не орысша).', 'Введите наименование памятника (по-казахски или по-русски).')); (UI === 'ru' ? F.name_ru : F.name).focus(); return; }
    const c = paintCoord();
    if (c.err) { showErr(c.err); F.lat.focus(); return; }
    const rec = {
      id: m.id || '', name, period: F.period.value.trim(), oblast: F.oblast.value.trim(), district: F.district.value,
      place: F.place.value.trim(), type: F.type.value, category: F.category.value, status: F.status.value, note: F.note.value.trim(),
      name_ru: nameRu, period_ru: F.period_ru.value.trim(), place_ru: F.place_ru.value.trim(), note_ru: F.note_ru.value.trim(),
      lat: c.lat, lon: c.lon,
    };
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const saved = await saveMark(rec);
      store.set(lastKey, JSON.stringify({ oblast: rec.oblast, district: rec.district, type: rec.type, category: rec.category, status: rec.status }));
      if (REG) REG.remember(rec.oblast);          // соңғы облыс — келесі белгіге де, жаңа қорғау аймағына да әдепкі
      closeDialog();
      let synced = '';                            // байланысқан қорғау аймақтары да жаңарады (qorgau/app.js)
      try { const n = isNew ? 0 : await (globalThis.__qa?.syncFromMark?.(saved) || 0); if (n) synced = tx(' Қорғау аймағы да жаңартылды', ' Охранная зона тоже обновлена') + (n > 1 ? ' (' + n + ')' : '') + '.'; }
      catch (ex) { synced = tx(' Қорғау аймағы жаңартылмады: ', ' Охранная зона не обновлена: ') + ex.message; }
      toast((isNew ? tx('Белгі сақталды: «', 'Метка сохранена: «') : tx('Белгі жаңартылды: «', 'Метка обновлена: «')) + view(rec).name + '».' + synced);
      if (o.onSaved) o.onSaved(saved);
      if (saved && !map.getBounds().contains([saved.lat, saved.lon])) map.panTo([saved.lat, saved.lon]);
    } catch (ex) { showErr(ex.message); btn.disabled = false; }
  });
  back.querySelector('#mkCancel').addEventListener('click', closeDialog);
  back.querySelector('#mkDel')?.addEventListener('click', () => removeMark(m));
  back.querySelector('#mkGo')?.addEventListener('click', () => { closeDialog(); flyTo(m); });
  back.querySelector('#mkZone')?.addEventListener('click', () => { closeDialog(); globalThis.MuraZone?.startFromMark(m); });
  back.addEventListener('mousedown', e => { if (e.target === back) back.dataset.down = '1'; });
  back.addEventListener('click', e => { if (e.target === back && back.dataset.down) closeDialog(); delete back.dataset.down; });
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDialog(); } };
  document.addEventListener('keydown', onKey, true);
  dlg = { back, onKey, temp, prev: document.activeElement };
  app.appendChild(back);
  (isNew ? (UI === 'ru' ? F.name_ru : F.name) : form.querySelector('[type=submit]')).focus();
}

async function removeMark(m) {
  if (!(await ask(tx('«' + view(m).name + '» белгісін өшіру керек пе? Бұл әрекетті қайтару мүмкін емес.', 'Удалить метку «' + view(m).name + '»? Это действие нельзя отменить.'), { ok: tx('Өшіру', 'Удалить'), danger: true }))) return;
  try { await api('delete', { id: m.id }); closeDialog(); toast(tx('Белгі өшірілді: «', 'Метка удалена: «') + view(m).name + '».'); }
  catch (e) { toast(e.message, true); }
}
function flyTo(m) {
  if (!$('mkShow').checked) { $('mkShow').checked = true; paintLayerVisibility(); }
  map.once('moveend', () => { marksView.syncNow(); marksView.pin(m.id)?.openTooltip(); });
  map.flyTo([m.lat, m.lon], Math.max(map.getZoom(), 15), { duration: 0.6 });
}

/* Координата панелі: «Белгі» — енгізілген координатадан жаңа белгі */
$('mkFromCoord')?.addEventListener('click', () => {
  const latS = $('qaInLat').value, lonS = $('qaInLon').value;
  const r = parseLatLon(latS, lonS);
  if (r.err) { openDialog({}, { latText: latS, lonText: lonS }); return; }
  openDialog({ lat: r.lat, lon: r.lon });
  map.panTo([r.lat, r.lon]);
});

/* ======================= Белгілер панелі ======================= */
let open = false;
const cssNum = k => parseFloat(getComputedStyle(app).getPropertyValue(k)) || 0;
function applyRight() {
  if (!open) return;
  const mobile = globalThis.QAUI?.isMobile?.();
  const g = cssNum('--qa-gap') || 10;
  app.style.setProperty('--qa-right', (mobile ? g : panelEl.offsetWidth + 2 * g) + 'px');
}
function openPanel() {
  globalThis.QAUI?.closePanel?.();          // қорғау аймағының панельдері жабылады
  globalThis.QAUI?.closePop?.();
  panelEl.hidden = false; open = true;
  listBtn.setAttribute('aria-expanded', 'true');
  applyRight();
  render();
  renderImports();
}
function closePanel() {
  if (!open) return;
  panelEl.hidden = true; open = false;
  listBtn.setAttribute('aria-expanded', 'false');
  globalThis.QAUI?.measure?.();
}
listBtn.addEventListener('click', () => (open ? closePanel() : openPanel()));
panelEl.addEventListener('click', e => { if (e.target.closest('[data-mkclose]')) closePanel(); });
app.addEventListener('qa:panel', e => { if (e.detail && e.detail.name) closePanel(); });
new ResizeObserver(() => requestAnimationFrame(applyRight)).observe($('qaStage'));
new ResizeObserver(() => requestAnimationFrame(applyRight)).observe(panelEl);
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || e.defaultPrevented || dlg) return;
  if (document.querySelector('.qa-pop:not([hidden])')) return;
  if (open) { closePanel(); listBtn.focus(); return; }
  if (marking) setMarking(false);
});

// Сүзгілер
const fillSel = (id, list) => { $(id).insertAdjacentHTML('beforeend', list.map(x => '<option value="' + esc(x.v) + '">' + esc(x.label) + '</option>').join('')); };
fillSel('mkFType', TYPES);
fillSel('mkFStatus', STATUSES);
fillSel('mkFCat', CATEGORIES.slice().sort((a, b) => a.order - b.order).map(c => ({ v: c.v || '—', label: c.label })));
/** Іздеу өрісі: әр әріпте емес, теру тоқтағанда (мыңдаған белгіде тізім әр басуда қайта салынбайды). */
const debounce = (fn, ms) => { let t = 0; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };
for (const id of ['mkQ', 'mkFCat', 'mkFOblast', 'mkFDistrict', 'mkFType', 'mkFStatus']) $(id).addEventListener(id === 'mkQ' ? 'input' : 'change', id === 'mkQ' ? debounce(() => render(), 180) : () => render());
$('mkShow').addEventListener('change', paintLayerVisibility);
$('mkLabels').addEventListener('change', () => { store.set('mk-labels', $('mkLabels').checked ? '1' : '0'); marksView.rebuild(); });
$('mkLabels').checked = store.get('mk-labels') === '1';

function filtered() {
  const fo = $('mkFOblast').value, fc = $('mkFCat').value;
  const q = $('mkQ').value.trim().toLocaleLowerCase('kk'), fd = $('mkFDistrict').value, ft = $('mkFType').value, fs = $('mkFStatus').value;
  if (!sorted) sorted = sortMarks(items.map(view));
  return sorted.filter(m => {
    if (fc && (m.category || '—') !== fc) return false;
    if (fo && (m.oblast || '') !== fo) return false;
    if (fd && (fd === '—' ? m.district : m.district !== fd)) return false;
    if (ft && m.type !== ft) return false;
    if (fs && m.status !== fs) return false;
    if (q && !matchesText([m.name, m.name_ru, m.period, m.period_ru, m.place, m.place_ru, m.district].filter(Boolean).join(' '), q)) return false;
    return true;
  });
}

let titleAuto = true;
function paintTitle(list) {
  const secs = sections(list.length ? list : items, '', genitive, docLang());
  const multi = secs.length > 1;
  $('mkTitle').disabled = multi;
  $('mkTitleMulti').hidden = !multi;
  $('mkTitleMulti').textContent = multi ? tx('Санаттар бойынша ' + secs.length + ' бөлек кесте, әрқайсысы жаңа беттен: ', 'По категориям — отдельных таблиц: ' + secs.length + ', каждая с новой страницы: ') + secs.map(x => '«' + x.title + '» (' + x.marks.length + ')').join('; ') + '.' : '';
  if (multi) { $('mkTitle').value = ''; $('mkTitle').placeholder = tx('Атаулары санат бойынша өзі құрастырылады', 'Названия составляются автоматически по категориям'); return; }
  $('mkTitle').placeholder = '';
  if (titleAuto || !$('mkTitle').value) $('mkTitle').value = (secs[0] ? secs[0].title : '').replace(/^./, c => c.toUpperCase());
}
$('mkTitle').addEventListener('input', () => { titleAuto = false; });
$('mkTitleAuto').addEventListener('click', () => { titleAuto = true; paintTitle(filtered()); });
// Құжат тілі ауысса — тізім атауы сол тілде қайта құрастырылады
document.addEventListener('mura:doclang', () => { titleAuto = true; paintTitle(filtered()); });

const paintMarkList = progressiveList($('mkList'));
/** changed — items өзгерді (картадағы белгілер жаңарады); сүзгі өзгергенде тек панель тізімі қайта салынады. */
function render(changed) {
  $('mkCount').textContent = items.length;
  $('mkTabN').textContent = items.length;
  if (changed) drawMarkers();
  // Облыс сүзгісі (бірден көп облыс болса ғана көрінеді) және аудан сүзгісі — бар белгілердің мәндері
  const os = $('mkFOblast'), oc = os.value;
  const obs = [...new Set(items.map(m => m.oblast).filter(Boolean))].sort(compareText);
  os.innerHTML = '<option value="">Барлық облыс</option>' + obs.map(o => '<option value="' + esc(o) + '"' + (o === oc ? ' selected' : '') + '>' + esc(REG ? REG.show(o) : o) + '</option>').join('');
  if (![...os.options].some(o => o.value === oc)) os.value = '';
  os.hidden = obs.length < 2 && !os.value;
  $('mkFilters').classList.toggle('has-ob', !os.hidden);
  const sel = $('mkFDistrict'), cur = sel.value, inOb = items.filter(m => !os.value || m.oblast === os.value);
  const ds = [...new Set(inOb.map(m => m.district).filter(Boolean))].sort(compareText);
  const hasNone = inOb.some(m => !m.district);
  sel.innerHTML = '<option value="">Барлық аудан</option>' + ds.map(d => '<option value="' + esc(d) + '"' + (d === cur ? ' selected' : '') + '>' + esc(REG ? REG.show(d, os.value) : d) + '</option>').join('') +
    (hasNone ? '<option value="—"' + (cur === '—' ? ' selected' : '') + '>Ауданы көрсетілмеген</option>' : '');
  if (![...sel.options].some(o => o.value === cur)) sel.value = '';
  if (!open) return;
  const list = filtered();
  for (const id of [...selected]) if (!items.some(m => m.id === id)) selected.delete(id);
  paintSel(list);
  $('mkInfo').textContent = (list.length === items.length ? items.length : list.length + ' / ' + items.length) + tx(' белгі', ' меток');
  for (const id of ['mkGeo', 'mkDocx', 'mkPdf']) $(id).disabled = !list.length;
  paintTitle(list);
  const box = $('mkList');
  if (!items.length) { box.innerHTML = '<div class="qa-empty">Әзірге белгі жоқ. Құралдар жолағындағы «Белгі қою» батырмасын басып, картадан ескерткіштің орнын белгілеңіз.</div>'; return; }
  if (!list.length) { box.innerHTML = '<div class="qa-empty">Сүзгіге сай белгі табылмады.</div>'; return; }
  // Карточкалар бөлшектеп салынады (progressiveList): мыңдаған карточка бірден DOM-ға қосылмайды
  // (генератор: карточканың HTML-і тек көрсетілерде ғана құрастырылады)
  const multiOb = new Set(list.map(m => m.oblast || '')).size > 1;
  const multiC = new Set(list.map(m => categoryOf(m.category).v)).size > 1;
  let lastD = null, lastC = null;
  paintMarkList((function* () { for (const m of list) {
    let html = '';
    const c = categoryOf(m.category);
    if (multiC && c.v !== lastC) { html += '<div class="mk-chead"><i style="background:' + c.fill + ';border-color:' + c.outline + '"></i>' + esc(c.label) + '</div>'; lastC = c.v; lastD = null; }
    const sh = (n, r) => (REG ? REG.show(n, r) : n);
    const d = (multiOb && m.oblast ? sh(m.oblast) + ' · ' : '') + (m.district ? sh(m.district, m.oblast) : (multiOb ? tx('ауданы көрсетілмеген', 'район не указан') : tx('Ауданы көрсетілмеген', 'Район не указан')));
    if (d !== lastD) { html += '<div class="mk-dhead">' + esc(d) + '</div>'; lastD = d; }
    html += '<div class="qa-sc mk-card' + (selected.has(m.id) ? ' is-sel' : '') + '" data-id="' + esc(m.id) + '">' +
      '<input type="checkbox" data-sel' + (selected.has(m.id) ? ' checked' : '') + ' aria-label="' + esc(m.name) + tx(' — таңдау', ' — выбрать') + '">' +
      '<span class="mk-sym' + (m.status === 'excluded' ? ' is-excl' : '') + '" title="' + esc(categoryOf(m.category).label) + '">' + symbolSvg(m.type, m.category, 22) + '</span>' +
      '<div class="qa-sc-main"><button type="button" class="qa-sc-title" data-act="go" title="Картадан көрсету">' + esc(nameCell(m)) + '</button>' +
      '<div class="qa-sc-meta">' + esc(typeOf(m.type).label) + (categoryOf(m.category).adj ? ' · ' + esc(categoryOf(m.category).adj) : '') +
        ' · <span class="mk-st mk-st--' + esc(m.status) + '">' + esc(statusOf(m.status).short) + '</span></div>' +
      (m.place ? '<p class="qa-sc-desc">' + esc(m.place) + '</p>' : '') +
      '<div class="qa-sc-meta mk-cc">' + esc(coordLines(m).join(', ')) + '</div>' +
      '<div class="qa-sc-act"><button type="button" class="lnk" data-act="edit">Өңдеу</button><button type="button" class="lnk" data-act="go">Картадан көрсету</button>' +
      '<button type="button" class="lnk" data-act="zone" title="Осы ескерткіштің қорғау аймағын белгілеу: мәліметтері белгіден алынады">Қорғау аймағы</button>' +
      '<button type="button" class="lnk lnk--danger" data-act="del">Өшіру</button></div></div></div>';
    yield html;
  } })(), list.length);
}
/* ---------- Таңдау және топпен өшіру ---------- */
function paintSel(list = filtered()) {
  const vis = list.filter(m => selected.has(m.id)).length, n = selected.size;
  const all = $('mkSelAll');
  all.checked = list.length > 0 && vis === list.length;
  all.indeterminate = vis > 0 && vis < list.length;
  all.disabled = !list.length;
  $('mkSelBar').hidden = !items.length;
  $('mkSelInfo').textContent = n ? 'Таңдалды: ' + n + (vis < n ? ' (сүзгіден тыс ' + (n - vis) + ')' : '') : '';
  const del = $('mkSelDel');
  del.hidden = !n;
  del.textContent = 'Таңдалғандарды өшіру (' + n + ')';
}
$('mkList').addEventListener('change', e => {
  const c = e.target.closest('[data-sel]'), card = e.target.closest('[data-id]');
  if (!c || !card) return;
  if (c.checked) selected.add(card.dataset.id); else selected.delete(card.dataset.id);
  card.classList.toggle('is-sel', c.checked);
  paintSel();
});
$('mkSelAll').addEventListener('change', e => {
  for (const m of filtered()) { if (e.target.checked) selected.add(m.id); else selected.delete(m.id); }   // сүзгі бар болса — тек көрінетіндері
  render();
});
$('mkSelDel').addEventListener('click', async () => {
  const ids = [...selected].filter(id => items.some(m => m.id === id));
  if (!ids.length) return;
  const names = ids.slice(0, 5).map(id => '«' + view(items.find(m => m.id === id)).name + '»').join(', ') + (ids.length > 5 ? tx(' және тағы ', ' и ещё ') + (ids.length - 5) : '');
  if (!(await ask(tx(ids.length + ' ескерткіш белгісі өшіріледі: ' + names + '. Бұл әрекетті қайтару мүмкін емес. Жалғастырасыз ба?', 'Будут удалены метки памятников (' + ids.length + '): ' + names + '. Это действие нельзя отменить. Продолжить?'), { ok: tx('Өшіру', 'Удалить') + ' (' + ids.length + ')', danger: true }))) return;
  try {
    const j = await api('delete', { id: ids.join(',') });
    ids.forEach(id => selected.delete(id));
    render();
    toast(tx((j.removed ?? ids.length) + ' белгі өшірілді.', 'Удалено меток: ' + (j.removed ?? ids.length) + '.'));
  } catch (err) { toast(err.message, true); }
});

$('mkList').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'), card = e.target.closest('[data-id]');
  if (!b || !card) return;
  const m = items.find(x => x.id === card.dataset.id);
  if (!m) return;
  if (b.dataset.act === 'go') flyTo(m);
  else if (b.dataset.act === 'edit') openDialog(m);
  else if (b.dataset.act === 'del') removeMark(m);
  else if (b.dataset.act === 'zone') globalThis.MuraZone?.startFromMark(m);
});

/* ======================= Экспорт ======================= */
function download(data, type, name) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function loadFflate() {
  if (globalThis.fflate) return Promise.resolve(globalThis.fflate);
  return new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = globalThis.QA_FFLATE || 'vendor/fflate.js';
    sc.onload = () => (globalThis.fflate ? res(globalThis.fflate) : rej(new Error('fflate жүктелмеді')));
    sc.onerror = () => rej(new Error('fflate жүктелмеді'));
    document.head.appendChild(sc);
  });
}
const exportTitle = () => $('mkTitle').value.trim() || defaultTitle(filtered(), genitive, docLang());
/** Экспорт бөлімдері: санат бойынша бөлек кестелер (бір санат болса — панельдегі атаумен); тілі — «Құжат тілі» (интерфейстен тәуелсіз).
    Деректер түпнұсқа жазбалардан (екі тілдегі өрістерімен) алынады. */
const raw = list => list.map(m => items.find(x => x.id === m.id) || m);
const exportSections = (list = filtered(), lang = docLang()) => sections(raw(list), $('mkTitle').disabled ? '' : $('mkTitle').value.trim(), genitive, lang);
const docTitle = (secs, lang = docLang()) => secs.length === 1 ? secs[0].title : (lang === 'ru' ? 'Список памятников истории и культуры' : 'Тарих және мәдениет ескерткіштерінің тізімі');
/** Құжат тілінде толтырылмаған өрістер — ескерту (бос өріс екінші тілдегі мәнмен алынады). */
function warnMissing(list, lang) {
  const n = raw(list).filter(m => I18N.missing(m, ['name', 'period', 'place'], lang).length).length;
  if (n) toast(lang === 'ru'
    ? tx(n + ' ескерткіштің орысша мәліметтері толық емес — олардың орнына қазақшасы алынды.', 'У ' + n + ' памятников не заполнены русские сведения — вместо них взяты казахские.')
    : tx(n + ' ескерткіштің қазақша мәліметтері толық емес — олардың орнына орысшасы алынды.', 'У ' + n + ' памятников не заполнены казахские сведения — вместо них взяты русские.'), true);
}
const fileName = ext => 'eskertkishter_tizimi_' + new Date().toISOString().slice(0, 10) + '.' + ext;
async function busy(label, fn) {
  const el = $('mkBusy');
  el.textContent = label;
  try { await fn(); el.textContent = ''; }
  catch (e) { el.textContent = ''; toast(e.message || String(e), true); }
}
async function buildDocx(list = filtered(), lang = docLang()) { const secs = exportSections(list, lang); warnMissing(list, lang); return docxBlob(secs, docTitle(secs, lang), await loadFflate(), lang); }
async function buildPdf(list = filtered(), lang = docLang()) {
  const secs = exportSections(list, lang);
  warnMissing(list, lang);
  if (!globalThis.mura || !globalThis.mura.pdf) throw new Error(tx('PDF тек Mura GIS бағдарламасында жасалады.', 'PDF создаётся только в программе Mura GIS.'));
  const bytes = await globalThis.mura.pdf(pdfHtml(secs, docTitle(secs, lang), lang));
  return new Blob([bytes], { type: 'application/pdf' });
}
$('mkGeo').addEventListener('click', () => {
  const list = filtered();
  download(JSON.stringify(geojson(raw(list), exportTitle()), null, 2), 'application/geo+json', fileName('geojson'));
  toast('GeoJSON: ' + list.length + tx(' нүкте.', ' точек.'));
});
$('mkDocx').addEventListener('click', () => busy(tx('Word құжаты жасалуда…', 'Создаётся документ Word…'), async () => { download(await buildDocx(), '', fileName('docx')); }));
$('mkPdf').addEventListener('click', () => busy(tx('PDF жасалуда…', 'Создаётся PDF…'), async () => { download(await buildPdf(), '', fileName('pdf')); }));

/* ======================= Импорт ======================= */
// KML, KMZ, GPX және сырттағы GeoJSON — «Импортталғандарға»: «Сәйкестендіру» басылмайынша белгі емес.
// Тек Mura GIS-тің өз белгілер экспорты (GeoJSON: әр нүктеде id, type_kk, status_kk) бірден белгілерге қайтарылады.
$('mkImport').addEventListener('click', () => $('mkGeoFile').click());
$('mkGeoFile').addEventListener('change', async e => {
  const files = [...(e.target.files || [])];
  e.target.value = '';
  for (const f of files) {
    await busy(tx('Импортталуда: ', 'Импорт: ') + f.name + '…', async () => {
      if (/\.(kml|kmz|gpx)$/i.test(f.name)) {
        const pts = await parseGeoFile(f, /\.kmz$/i.test(f.name) ? await loadFflate() : null);
        if (!pts.length) throw new Error(f.name + tx(': нүкте табылмады.', ': точки не найдены.'));
        const r = await api('iadd', { data: JSON.stringify(pts) });
        toast(f.name + ': ' + r.added + ' нүкте импортталды' + (r.skipped ? ', ' + r.skipped + ' қайталанған не қате нүкте алынбады' : '') + '. Оларды «Импортталғандар» қойындысынан сәйкестендіріңіз.');
        setTab('imp');
        const fresh = imports.filter(x => x.file === f.name);
        if (fresh.length) map.fitBounds(L.latLngBounds(fresh.map(x => [x.lat, x.lon])).pad(0.2), { maxZoom: 15 });
        return;
      }
      let o;
      try { o = JSON.parse(await f.text()); } catch (ex) { throw new Error(f.name + tx(': файл оқылмады (JSON емес).', ': не удалось прочитать файл (не JSON).')); }
      if (!isMuraMarks(o)) {
        const pts = parseGeojsonPoints(o, f.name);
        if (!pts.length) throw new Error(f.name + tx(': нүкте не полигон табылмады.', ': точки или полигоны не найдены.'));
        const r = await api('iadd', { data: JSON.stringify(pts) });
        toast(f.name + ': ' + r.added + ' нүкте импортталды' + (r.skipped ? ', ' + r.skipped + ' қайталанған не қате нүкте алынбады' : '') + '. Оларды «Импортталғандар» қойындысынан сәйкестендіріңіз.');
        setTab('imp');
        const fresh = imports.filter(x => x.file === f.name);
        if (fresh.length) map.fitBounds(L.latLngBounds(fresh.map(x => [x.lat, x.lon])).pad(0.2), { maxZoom: 15 });
        return;
      }
      const list = fromGeojson(o).filter(m => m.name && isFinite(m.lat) && isFinite(m.lon));
      if (!list.length) throw new Error(f.name + tx(': атауы бар нүкте (Point) табылмады.', ': не найдены точки (Point) с наименованием.'));
      const r = await api('import', { data: JSON.stringify(list) });
      toast(tx('Қосылды: ', 'Добавлено: ') + r.added + tx(', жаңартылды: ', ', обновлено: ') + r.updated + (r.skipped ? tx(', қабылданбады: ', ', не принято: ') + r.skipped : '') + '.');
      setTab('marks');
    });
  }
});

/* ---------- Қойындылар: Белгілер | Импортталғандар ---------- */
let tab = 'marks';
function setTab(t) {
  tab = t === 'imp' ? 'imp' : 'marks';
  if (!open) openPanel();
  $('mkTabMarks').hidden = tab !== 'marks';
  $('mkTabImp').hidden = tab !== 'imp';
  $('mkTabMarksB').setAttribute('aria-selected', tab === 'marks' ? 'true' : 'false');
  $('mkTabImpB').setAttribute('aria-selected', tab === 'imp' ? 'true' : 'false');
  for (const id of ['mkGeo', 'mkDocx', 'mkPdf']) $(id).hidden = tab !== 'marks';
  $('mkIDelAll').hidden = tab !== 'imp' || !imports.length;
  if (tab === 'imp' && !$('mkImpShow').checked) { $('mkImpShow').checked = true; paintImpVisibility(); }
  renderImports();
}
panelEl.addEventListener('click', e => { const b = e.target.closest('[data-mktab]'); if (b) setTab(b.dataset.mktab); });

/* ---------- Импортталған нүктелер: карта қабаты ---------- */
const impIcon = L.divIcon({ className: 'mk-imp', iconSize: [18, 18], iconAnchor: [9, 9], tooltipAnchor: [0, -9], html: '<span>?</span>' });
const impById = new Map();
const impTip = x => esc(x.name || '(атаусыз)') + '<small>импортталған · сәйкестендірілмеген</small>';
function impMenu(id) {
  return ev => {
    const x = impById.get(id);
    if (!x) return;
    const oe = ev.originalEvent;
    L.DomEvent.preventDefault(oe);
    globalThis.MuraCtx?.openMenu(oe.clientX, oe.clientY, esc(x.name || '(атаусыз)'), [
      { label: 'Сәйкестендіру', hint: 'белгі ретінде мәліметтерін толтыру', icon: '<path d="M6 21V4"/><path d="M6 4.5h11l-2.2 3.8L17 12H6"/>', run: () => identify(x) },
      { label: 'Координатаны көшіру', hint: x.lat.toFixed(7) + ', ' + x.lon.toFixed(7), icon: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>', run: () => (globalThis.mura?.clipWrite ? globalThis.mura.clipWrite(x.lat.toFixed(7) + ', ' + x.lon.toFixed(7)) : navigator.clipboard.writeText(x.lat.toFixed(7) + ', ' + x.lon.toFixed(7))) },
      'sep',
      { label: 'Импорттан өшіру', icon: '<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6 7l1 13h10l1-13"/>', run: () => removeImport(x) },
    ]);
  };
}
function makeImpPin(x) {
  const labels = $('mkImpLabels').checked, menuAt = impMenu(x.id);
  const mk = L.marker([x.lat, x.lon], { icon: impIcon, keyboard: false, riseOnHover: true });
  mk.bindTooltip(impTip(x), { direction: 'top', permanent: labels, className: 'mk-tip mk-imptip' + (labels ? ' is-perm' : '') });
  mk.on('click', menuAt);
  mk.on('contextmenu', menuAt);
  return mk;
}
function makeImpDot(x, renderer) {
  const c = L.circleMarker([x.lat, x.lon], { renderer, radius: 4, weight: 1.5, color: '#2f6db5', fillColor: '#fff', fillOpacity: 0.9 });
  c.bindTooltip(impTip(x), { direction: 'top', className: 'mk-tip mk-imptip', offset: [0, -3] });
  const menuAt = impMenu(x.id);
  for (const t of ['click', 'contextmenu']) c.on(t, ev => { if (passThrough()) return; L.DomEvent.stopPropagation(ev); menuAt(ev); });
  return c;
}
const impView = culledLayer(map, { limit: 500, sig: x => x.lat + ',' + x.lon + '|' + x.name, pin: makeImpPin, dot: makeImpDot });
const impLayer = impView.layer;
function drawImports() {
  impById.clear();
  for (const x of imports) impById.set(x.id, x);
  impView.setData(imports);
}
function paintImpVisibility() {
  const on = $('mkImpShow').checked;
  if (on && !map.hasLayer(impLayer)) impLayer.addTo(map);
  if (!on && map.hasLayer(impLayer)) map.removeLayer(impLayer);
}
$('mkImpShow').addEventListener('change', paintImpVisibility);
$('mkImpLabels').addEventListener('change', () => impView.rebuild());
for (const id of ['mkIQ', 'mkIFile']) $(id).addEventListener(id === 'mkIQ' ? 'input' : 'change', id === 'mkIQ' ? debounce(() => renderImports(), 180) : () => renderImports());

/** Сәйкестендіру: импортталған нүкте — жаңа белгі терезесі (атауы, сипаттамасы, координатасы алдын ала толтырылған);
    сақталғанда нүкте импорттан алынады. */
function identify(x) {
  const note = [x.desc, 'Импорт: ' + [x.file, x.folder].filter(Boolean).join(' / ')].filter(Boolean).join('\n');
  // Импортталған атау мен сипаттама — интерфейс тіліндегі өріске
  openDialog(UI === 'ru' ? { name_ru: x.name || '', note_ru: note, lat: x.lat, lon: x.lon } : { name: x.name || '', note, lat: x.lat, lon: x.lon }, {
    title: tx('Импортталған нүктені сәйкестендіру', 'Сопоставление импортированной точки'),
    onSaved: async () => { try { await api('idel', { id: x.id }); } catch (e) { toast(e.message, true); } },
  });
}
async function removeImport(x) {
  try { await api('idel', { id: x.id }); toast(tx('Импорттан өшірілді: «', 'Удалено из импорта: «') + (x.name || tx('(атаусыз)', '(без названия)')) + '».'); }
  catch (e) { toast(e.message, true); }
}
$('mkIDelAll').addEventListener('click', async () => {
  if (!(await ask(tx('Барлық импортталған нүкте (' + imports.length + ') тізімнен өшірілсін бе? Сәйкестендірілген белгілерге әсер етпейді.', 'Удалить из списка все импортированные точки (' + imports.length + ')? Сопоставленные метки не затрагиваются.'), { ok: tx('Өшіру', 'Удалить'), danger: true }))) return;
  try { await api('idel', { id: 'all' }); toast(tx('Импортталғандар тазаланды.', 'Импортированные точки удалены.')); } catch (e) { toast(e.message, true); }
});

function filteredImports() {
  const q = $('mkIQ').value.trim().toLocaleLowerCase('kk'), ff = $('mkIFile').value;
  return imports.filter(x => (!ff || x.file === ff) && (!q || (x.name + ' ' + x.desc + ' ' + x.file + ' ' + x.folder).toLocaleLowerCase('kk').includes(q)))
    .sort((a, b) => compareText(a.file, b.file) || compareText(a.folder, b.folder) || compareNames(a.name, b.name));
}
const paintImpList = progressiveList($('mkImpList'));
function renderImports(changed) {
  $('mkTabI').textContent = imports.length;
  $('mkTabImpB').classList.toggle('has-new', imports.length > 0);
  if (changed) drawImports();
  const fs = $('mkIFile'), cur = fs.value, files = [...new Set(imports.map(x => x.file).filter(Boolean))].sort(compareText);
  fs.innerHTML = '<option value="">Барлық файл</option>' + files.map(f => '<option' + (f === cur ? ' selected' : '') + '>' + esc(f) + '</option>').join('');
  fs.hidden = files.length < 2;
  if (!open || tab !== 'imp') return;
  $('mkIDelAll').hidden = !imports.length;
  const list = filteredImports();
  $('mkIInfo').textContent = (list.length === imports.length ? imports.length : list.length + ' / ' + imports.length) + tx(' нүкте', ' точек');
  const box = $('mkImpList');
  if (!imports.length) { box.innerHTML = '<div class="qa-empty">Импортталған нүкте жоқ. Құралдар жолағындағы «Импорт» арқылы KML, KMZ, GPX не GeoJSON файлын таңдаңыз.</div>'; return; }
  if (!list.length) { box.innerHTML = '<div class="qa-empty">Сүзгіге сай нүкте табылмады.</div>'; return; }
  let last = null;
  const shown = list.slice(0, 1000);
  paintImpList((function* () { for (const x of shown) {
    let html = '';
    const g = x.file + (x.folder ? ' · ' + x.folder : '');
    if (g !== last) { html += '<div class="mk-dhead">' + esc(g || 'Файл көрсетілмеген') + '</div>'; last = g; }
    html += '<div class="qa-sc mk-card mk-impcard" data-iid="' + esc(x.id) + '"><span class="mk-imp mk-imp--inline"><span>?</span></span>' +
      '<div class="qa-sc-main"><button type="button" class="qa-sc-title" data-iact="go" title="Картадан көрсету">' + esc(x.name || '(атаусыз)') + '</button>' +
      (x.desc ? '<p class="qa-sc-desc">' + esc(x.desc) + '</p>' : '') +
      '<div class="qa-sc-meta mk-cc">' + esc(coordLines(x).join(', ')) + '</div>' +
      '<div class="qa-sc-act"><button type="button" class="lnk mk-ident" data-iact="ident">Сәйкестендіру</button><button type="button" class="lnk" data-iact="go">Картадан көрсету</button>' +
      '<button type="button" class="lnk lnk--danger" data-iact="del">Өшіру</button></div></div></div>';
    yield html;
  } })(), shown.length, list.length > 1000 ? '<div class="qa-empty">' + tx('Тағы ' + (list.length - 1000) + ' нүкте — іздеу не файл сүзгісін қолданыңыз.', 'Ещё точек: ' + (list.length - 1000) + ' — воспользуйтесь поиском или фильтром по файлу.') + '</div>' : '');
}
$('mkImpList').addEventListener('click', e => {
  const b = e.target.closest('[data-iact]'), card = e.target.closest('[data-iid]');
  if (!b || !card) return;
  const x = imports.find(i => i.id === card.dataset.iid);
  if (!x) return;
  if (b.dataset.iact === 'go') {
    if (!$('mkImpShow').checked) { $('mkImpShow').checked = true; paintImpVisibility(); }
    map.flyTo([x.lat, x.lon], Math.max(map.getZoom(), 15), { duration: 0.6 });
  } else if (b.dataset.iact === 'ident') identify(x);
  else if (b.dataset.iact === 'del') removeImport(x);
});

/* Мәртебе түстерінің шартты белгісі (панельде) */
$('mkLegend').innerHTML = CATEGORIES.slice().sort((a, b) => a.order - b.order).map(c => '<span><i style="background:' + c.fill + ';border-color:' + c.outline + '"></i>' + esc(c.label) + '</span>').join('');

/* ======================= Іске қосу ======================= */
paintLayerVisibility();
paintImpVisibility();
api('list').catch(e => { toast(tx('Белгілер жүктелмеді: ', 'Метки не загружены: ') + e.message, true); render(); });

globalThis.__marks = { symbolSvg, exportSections, get imports() { return imports; }, setTab, identify, get items() { return items; }, api, filtered, buildDocx, buildPdf, geojson, pdfHtml, setMarking, openDialog, openPanel, closePanel, get marking() { return marking; } };
