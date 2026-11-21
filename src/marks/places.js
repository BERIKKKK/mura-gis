/* Mura GIS: «Өзге нысандар» — ескерткіш емес, бірақ далада бағдар болатын нысандар (елді мекен, қыстау, жайлау, күзеу,
   көктеу, тұрақ, құдық, бұлақ т.б.). Жасалуы — «Белгі қою» функциясымен бірдей: картаны басқанда алдымен белгі түрі
   сұралады — «Ескерткіш белгісі» (өрістері өзгеріссіз, marks.js) не «Өзге нысандар» (тек түрі, атауы, координатасы).
   Сақтау — жобаның places қабаты (main/places.js, mura://app/places), ескерткіштерден бөлек: ескерткіштер тізіміне,
   құжаттарына, қорғау аймағына әсер етпейді. Тізім — құралдар жолағындағы «Өзге нысандар» батырмасы ашатын панель.
   Пішімі Android-пен ортақ (android/core: Place, PlaceGeoJson): GeoJSON экспорты/импорты id-ді және барлық өрісті сақтайды.
   Бұл модуль marks.js-тен кейін жүктеледі; сыртқа — globalThis.__places. */
import { parseOne } from '../qorgau/app.js';
import { compareNames, matchesText } from './sort.js';
import { culledLayer, progressiveList } from './culled.js';
import { coordLines, dms } from './export.js';

const $ = id => document.getElementById(id);
const L = globalThis.L;
const map = globalThis.MuraMarks && globalThis.MuraMarks.map;
const API = 'mura://app/places?v=1';
const app = $('qaApp'), mapEl = $('qaMap');
const I18N = globalThis.MuraI18n || { ru: false, biField: null };
const tx = (kk, ru) => (I18N.ru ? ru : kk);
const UI = I18N.ru ? 'ru' : 'kk';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* жеке режим */ } },
};

/** Түрлер: кодтар Android-пен ортақ (main/places.js KINDS); түсі — Android картасындағыдай (SymbolIcons.PLACE_STYLE).
    Таңбасы (i) — Lucide иконкалары (https://lucide.dev, ISC лицензиясы; тізімі — src/vendor/lucide/README.md):
    house, snowflake, sun, leaf, sprout, tent, circle-dot, droplet, circle-small. */
export const KINDS = [
  { v: 'settlement', kk: 'Елді мекен', ru: 'Населённый пункт', c: '#6D4C9F', i: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>' },
  { v: 'qystau', kk: 'Қыстау', ru: 'Зимовка (қыстау)', c: '#8D6E63', i: '<path d="m10 20-1.25-2.5L6 18"/><path d="M10 4 8.75 6.5 6 6"/><path d="m14 20 1.25-2.5L18 18"/><path d="m14 4 1.25 2.5L18 6"/><path d="m17 21-3-6h-4"/><path d="m17 3-3 6 1.5 3"/><path d="M2 12h6.5L10 9"/><path d="m20 10-1.5 2 1.5 2"/><path d="M22 12h-6.5L14 15"/><path d="m4 10 1.5 2L4 14"/><path d="m7 21 3-6-1.5-3"/><path d="m7 3 3 6h4"/>' },
  { v: 'zhailau', kk: 'Жайлау', ru: 'Летнее пастбище (жайлау)', c: '#2E7D32', i: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>' },
  { v: 'kuzeu', kk: 'Күзеу', ru: 'Осеннее стойбище (күзеу)', c: '#E66C00', i: '<path d="M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20"/><path d="M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13"/>' },
  { v: 'kokteu', kk: 'Көктеу', ru: 'Весеннее стойбище (көктеу)', c: '#7CB342', i: '<path d="M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3"/><path d="M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4"/><path d="M5 21h14"/>' },
  { v: 'turaq', kk: 'Тұрақ', ru: 'Стоянка', c: '#546E7A', i: '<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>' },
  { v: 'well', kk: 'Құдық', ru: 'Колодец', c: '#1565C0', i: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="12" r="10"/>' },
  { v: 'spring', kk: 'Бұлақ', ru: 'Родник', c: '#0097A7', i: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>' },
  { v: 'other', kk: 'Басқа', ru: 'Другое', c: '#757575', i: '<circle cx="12" cy="12" r="6"/>' },
];
export const kindOf = v => KINDS.find(k => k.v === v) || KINDS[KINDS.length - 1];
const kindLabel = (v, l = UI) => kindOf(v)[l === 'ru' ? 'ru' : 'kk'];
/** Интерфейс тіліндегі атау; бос болса — екінші тілдегісі, ол да бос болса — түрінің атауы. */
export const titleOf = (p, l = UI) => (l === 'ru' ? p.name_ru || p.name : p.name || p.name_ru) || kindLabel(p.kind, l);
const badge = (v, cls = '') => { const k = kindOf(v); return '<span class="pl-badge' + cls + '" style="--c:' + k.c + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + k.i + '</svg></span>'; };

let items = [];
let sorted = null;

function toast(msg, err) {
  const t = $('qaToast');
  if (!t) return;
  t.textContent = msg; t.classList.toggle('is-err', !!err); t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, err ? 5000 : 2600);
}
const ask = (msg, o) => (globalThis.QAUI && globalThis.QAUI.confirm ? globalThis.QAUI.confirm(msg, o) : Promise.resolve(confirm(msg)));

/* ======================= Сақтау (main/places.js) ======================= */
async function api(op, data) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data || {})) fd.append(k, v);
  const r = await fetch(API + '&op=' + op, { method: 'POST', body: fd });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || tx('Сақтау қатесі', 'Ошибка сохранения'));
  if (Array.isArray(j.items)) { items = j.items; sorted = null; render(true); }
  return j;
}

/* ======================= Карта қабаты ======================= */
const byId = new Map();
const passThrough = () => mapEl.classList.contains('is-adding') || mapEl.classList.contains('is-ruler') || mapEl.classList.contains('is-pjmap');
const pinIcon = p => L.divIcon({ className: 'pl-pin', iconSize: [22, 22], iconAnchor: [11, 11], tooltipAnchor: [0, -11], html: badge(p.kind) });
function menuFor(id) {
  return ev => {
    const p = byId.get(id);
    if (!p) return;
    const oe = ev.originalEvent;
    L.DomEvent.preventDefault(oe);
    const c = p.lat.toFixed(7) + ', ' + p.lon.toFixed(7);
    globalThis.MuraCtx?.openMenu(oe.clientX, oe.clientY, esc(titleOf(p)) + '<small>' + esc(kindLabel(p.kind)) + '</small>', [
      { label: tx('Өңдеу', 'Изменить'), icon: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>', run: () => openDialog(p) },
      { label: tx('Координатаны көшіру', 'Копировать координаты'), hint: c, icon: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
        run: () => (globalThis.mura?.clipWrite ? globalThis.mura.clipWrite(c) : navigator.clipboard.writeText(c)) },
      { label: tx('Осы нысанға жол табу', 'Найти путь к этому объекту'), icon: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
        run: () => globalThis.MuraRoutes?.findPath?.('to', { placeId: p.id, lat: p.lat, lon: p.lon, label: titleOf(p) }) },
      'sep',
      { label: tx('Өшіру', 'Удалить'), icon: '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', run: () => removePlace(p) },
    ]);
  };
}
function makePin(p0) {
  const id = p0.id, labels = $('plLabels').checked;
  const mk = L.marker([p0.lat, p0.lon], { icon: pinIcon(p0), keyboard: true, title: '', riseOnHover: true });
  mk.bindTooltip(esc(titleOf(p0)) + '<small>' + esc(kindLabel(p0.kind)) + '</small>', { direction: 'top', permanent: labels, className: 'mk-tip pl-tip' + (labels ? ' is-perm' : '') });
  mk.on('click', () => { const p = byId.get(id); if (p) openDialog(p); });
  mk.on('contextmenu', menuFor(id));
  return mk;
}
function makeDot(p0, renderer) {
  const k = kindOf(p0.kind), id = p0.id;
  const c = L.circleMarker([p0.lat, p0.lon], { renderer, radius: 4.5, weight: 1.5, color: '#fff', fillColor: k.c, fillOpacity: 0.95 });
  c.bindTooltip(esc(titleOf(p0)), { direction: 'top', className: 'mk-tip', offset: [0, -4] });
  c.on('click', ev => { if (passThrough()) return; L.DomEvent.stopPropagation(ev); const p = byId.get(id); if (p) openDialog(p); });
  c.on('contextmenu', ev => { if (passThrough()) return; L.DomEvent.stopPropagation(ev); menuFor(id)(ev); });
  return c;
}
const view = culledLayer(map, { limit: 500, sig: p => p.lat + ',' + p.lon + '|' + p.kind + '|' + titleOf(p), pin: makePin, dot: makeDot });
const layer = view.layer;
/** Сүзгі (тізім мен — «Картада тек сүзгідегілер» қосулы болса — картаға ортақ). */
const FILTER_IDS = ['plQ', 'plFKind'];
const filterActive = () => FILTER_IDS.some(id => $(id).value.trim());
/** Сүзгіге сай келмесе де картада көрсетілетіндер: жаңа не өңделген нысан, «Картадан көрсету» басылғаны. */
const keepShown = new Set();
function draw() {
  byId.clear();
  for (const p of items) byId.set(p.id, p);
  let data = items;
  if ($('plMapF').checked && filterActive()) {
    const ids = new Set(filtered().map(p => p.id));
    data = items.filter(p => ids.has(p.id) || keepShown.has(p.id));
  }
  view.setData(data);
  const n = data.length === items.length ? items.length : data.length + '/' + items.length;
  $('plCount').textContent = n;
  $('plListBtn').classList.toggle('is-filtered', data.length !== items.length);
}
function paintVisibility() {
  const on = $('plShow').checked;
  if (on && !map.hasLayer(layer)) layer.addTo(map);
  if (!on && map.hasLayer(layer)) map.removeLayer(layer);
}

/* ======================= Белгі түрін таңдау ======================= */
/** Жаңа белгі: алдымен түрі сұралады. onMonument — ескерткіш белгісінің терезесі (marks.js openDialog). */
function choose(pt, onMonument) {
  closeDialog();
  const back = document.createElement('div');
  back.className = 'qa-dlg-back mk-dlg-back';
  back.innerHTML =
    '<div class="qa-dlg qa-glass mk-dlg pl-choose" role="dialog" aria-modal="true" aria-labelledby="plChT">' +
      '<h3 id="plChT">' + tx('Қандай белгі қоямыз?', 'Какую метку поставить?') + '</h3>' +
      '<button type="button" class="pl-opt" data-k="mark"><span class="pl-opt-ic">' + (globalThis.__marks?.symbolSvg?.('archeo', 'local', 26) || '') + '</span>' +
        '<span><b>' + tx('Ескерткіш белгісі', 'Метка памятника') + '</b><small>' + tx('Тарихи-мәдени мұра объектісі: атауы, мерзімі, түрі, санаты, мәртебесі…', 'Объект историко-культурного наследия: наименование, период, вид, категория, статус…') + '</small></span></button>' +
      '<button type="button" class="pl-opt" data-k="place"><span class="pl-opt-ic">' + badge('qystau') + '</span>' +
        '<span><b>' + tx('Өзге нысандар', 'Прочие объекты') + '</b><small>' + tx('Елді мекен, қыстау, жайлау, тұрақ, құдық т.б.: түрі, атауы, координатасы', 'Населённый пункт, зимовка, пастбище, стоянка, колодец и др.: вид, название, координаты') + '</small></span></button>' +
      '<div class="qa-dlg-btns"><span class="mk-sp"></span><button type="button" class="btn btn--ghost btn--sm" data-k="cancel">' + tx('Бас тарту', 'Отмена') + '</button></div>' +
    '</div>';
  const temp = pt && pt.lat != null ? L.circleMarker([pt.lat, pt.lon], { radius: 7, color: '#e8178a', weight: 3, fillOpacity: 0.2, interactive: false }).addTo(map) : null;
  const done = () => { back.remove(); document.removeEventListener('keydown', onKey, true); if (temp) map.removeLayer(temp); dlg = null; };
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(); } };
  back.addEventListener('click', e => {
    const b = e.target.closest('[data-k]');
    if (!b && e.target !== back) return;
    const k = b ? b.dataset.k : 'cancel';
    done();
    if (k === 'mark') onMonument(pt);
    else if (k === 'place') openDialog(pt || {});
  });
  document.addEventListener('keydown', onKey, true);
  dlg = { back, onKey, temp };
  app.appendChild(back);
  back.querySelector('[data-k="mark"]').focus();
}

/* ======================= Нысан терезесі: түрі, атауы, координатасы ======================= */
let dlg = null;
function closeDialog() {
  if (!dlg) return;
  dlg.back.remove();
  document.removeEventListener('keydown', dlg.onKey, true);
  if (dlg.temp) map.removeLayer(dlg.temp);
  dlg = null;
}
function parseLatLon(latS, lonS) {
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
const lastKey = 'pl-last-kind-v1';

/** o.title — терезе атауы, o.onSaved — сақталғаннан кейін (мыс. импортталған нүктені тізімнен алу). */
function openDialog(p, o = {}) {
  closeDialog();
  globalThis.QAUI?.closePop?.();
  const isNew = !p.id;
  const v = { name: '', name_ru: '', kind: store.get(lastKey) || 'settlement', ...p };
  const back = document.createElement('div');
  back.className = 'qa-dlg-back mk-dlg-back';
  back.innerHTML =
    '<form class="qa-dlg qa-glass mk-dlg pl-dlg" role="dialog" aria-modal="true" aria-labelledby="plDlgT" novalidate>' +
      '<h3 id="plDlgT"><span id="plSym">' + badge(v.kind) + '</span>' + esc(o.title || (isNew ? tx('Жаңа өзге нысан', 'Новый объект') : tx('Өзге нысан', 'Прочий объект'))) + '</h3>' +
      '<div class="qa-f"><label>' + tx('Түрі', 'Вид') + '</label><div class="pl-kinds" role="radiogroup">' +
        KINDS.map(k => '<label class="pl-kind"><input type="radio" name="kind" value="' + k.v + '"' + (k.v === v.kind ? ' checked' : '') + '>' + badge(k.v) + '<span>' + esc(UI === 'ru' ? k.ru : k.kk) + '</span></label>').join('') +
      '</div></div>' +
      (I18N.biField ? I18N.biField({ id: 'plName', name: 'name', label: tx('Атауы (міндетті емес)', 'Название (необязательно)'), kk: v.name, ru: v.name_ru, max: 200,
        ph: 'Мысалы: Ақбұлақ', phRu: 'Например: Акбулак', hint: '<p class="qa-hint">' + tx('Атауы бос болса, картада және тізімде түрі көрсетіледі.', 'Если название не указано, на карте и в списке показывается вид объекта.') + '</p>' })
        : '<div class="qa-f"><label for="plName">Атауы</label><input type="text" id="plName" name="name" maxlength="200" value="' + esc(v.name) + '"><input type="hidden" name="name_ru" value="' + esc(v.name_ru) + '"></div>') +
      '<div class="qa-row2 mk-coords">' +
        '<div class="qa-f"><label for="plLat">Ендік (N)</label><input type="text" id="plLat" name="lat" autocomplete="off" spellcheck="false" value="' + esc(o.latText ?? (v.lat != null ? (+v.lat).toFixed(7) : '')) + '"></div>' +
        '<div class="qa-f"><label for="plLon">Бойлық (E)</label><input type="text" id="plLon" name="lon" autocomplete="off" spellcheck="false" value="' + esc(o.lonText ?? (v.lon != null ? (+v.lon).toFixed(7) : '')) + '"></div>' +
      '</div>' +
      '<p class="qa-hint mk-coordok" id="plCoordOk"></p>' +
      '<p class="mk-err" id="plErr" role="alert" hidden></p>' +
      '<div class="qa-dlg-btns">' +
        (isNew ? '' : '<button type="button" class="lnk lnk--danger" id="plDel">' + tx('Өшіру', 'Удалить') + '</button><button type="button" class="lnk" id="plGo">' + tx('Картадан көрсету', 'Показать на карте') + '</button>') +
        '<span class="mk-sp"></span>' +
        '<button type="button" class="btn btn--ghost btn--sm" id="plCancel">' + tx('Бас тарту', 'Отмена') + '</button>' +
        '<button type="submit" class="btn btn--primary btn--sm">' + (isNew ? tx('Нысанды сақтау', 'Сохранить объект') : tx('Сақтау', 'Сохранить')) + '</button>' +
      '</div>' +
    '</form>';
  const form = back.querySelector('form');
  const F = form.elements;
  const err = back.querySelector('#plErr');
  const showErr = t => { err.textContent = t || ''; err.hidden = !t; };
  const kindNow = () => (form.querySelector('input[name="kind"]:checked') || {}).value || 'other';
  const temp = isNew && v.lat != null ? L.marker([v.lat, v.lon], { icon: pinIcon(v), interactive: false, opacity: 0.8 }).addTo(map) : null;
  function paintCoord() {
    const r = parseLatLon(F.lat.value, F.lon.value);
    const el = back.querySelector('#plCoordOk');
    if (r.err) {
      el.textContent = F.lat.value.trim() || F.lon.value.trim() ? r.err : tx('Координатаны енгізіңіз (кез келген пішімде: 50.412345, 50°24′44,4″, 50 24 44.4)', 'Введите координаты (в любом формате: 50.412345, 50°24′44,4″, 50 24 44.4)');
      el.classList.toggle('qa-bad', !!(F.lat.value.trim() || F.lon.value.trim()));
      return r;
    }
    el.classList.remove('qa-bad');
    el.textContent = '= ' + coordLines(r).join(', ') + ' (WGS 84)';
    if (temp) { temp.setLatLng([r.lat, r.lon]); temp.setIcon(pinIcon({ kind: kindNow() })); }
    return r;
  }
  F.lat.addEventListener('input', paintCoord);
  F.lon.addEventListener('input', paintCoord);
  form.querySelector('.pl-kinds').addEventListener('change', () => { back.querySelector('#plSym').innerHTML = badge(kindNow()); paintCoord(); });
  paintCoord();

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const c = paintCoord();
    if (c.err) { showErr(c.err); F.lat.focus(); return; }
    const rec = { id: p.id || '', kind: kindNow(), name: F.name.value.trim(), name_ru: (F.name_ru && F.name_ru.value || '').trim(), lat: c.lat, lon: c.lon };
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const j = await api('save', { data: JSON.stringify(rec) });
      if (j.id && !keepShown.has(j.id)) { keepShown.add(j.id); draw(); }   // сүзгіден тыс болса да картадан жоғалмайды
      store.set(lastKey, rec.kind);
      closeDialog();
      toast((isNew ? tx('Нысан сақталды: «', 'Объект сохранён: «') : tx('Нысан жаңартылды: «', 'Объект обновлён: «')) + titleOf(rec) + '».');
      if (o.onSaved) o.onSaved(items.find(x => x.id === j.id));
      if (!$('plShow').checked) { $('plShow').checked = true; paintVisibility(); }
      if (!map.getBounds().contains([rec.lat, rec.lon])) map.panTo([rec.lat, rec.lon]);
    } catch (ex) { showErr(ex.message); btn.disabled = false; }
  });
  back.querySelector('#plCancel').addEventListener('click', closeDialog);
  back.querySelector('#plDel')?.addEventListener('click', () => removePlace(p));
  back.querySelector('#plGo')?.addEventListener('click', () => { closeDialog(); flyTo(p); });
  back.addEventListener('mousedown', e => { if (e.target === back) back.dataset.down = '1'; });
  back.addEventListener('click', e => { if (e.target === back && back.dataset.down) closeDialog(); delete back.dataset.down; });
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDialog(); } };
  document.addEventListener('keydown', onKey, true);
  dlg = { back, onKey, temp, prev: document.activeElement };
  app.appendChild(back);
  (isNew ? (UI === 'ru' && F.name_ru ? F.name_ru : F.name) : form.querySelector('[type=submit]')).focus();
}

async function removePlace(p) {
  if (!(await ask(tx('«' + titleOf(p) + '» нысанын өшіру керек пе? Бұл әрекетті қайтару мүмкін емес.', 'Удалить объект «' + titleOf(p) + '»? Это действие нельзя отменить.'), { ok: tx('Өшіру', 'Удалить'), danger: true }))) return;
  try { await api('delete', { id: p.id }); closeDialog(); toast(tx('Нысан өшірілді: «', 'Объект удалён: «') + titleOf(p) + '».'); }
  catch (e) { toast(e.message, true); }
}
function flyTo(p) {
  if (!$('plShow').checked) { $('plShow').checked = true; paintVisibility(); }
  if (!keepShown.has(p.id) && !view.has(p.id)) { keepShown.add(p.id); draw(); }
  map.once('moveend', () => { view.syncNow(); view.pin(p.id)?.openTooltip(); });
  map.flyTo([p.lat, p.lon], Math.max(map.getZoom(), 15), { duration: 0.6 });
}

/* ======================= «Өзге нысандар» қойындысы ======================= */
$('plFKind').insertAdjacentHTML('beforeend', KINDS.map(k => '<option value="' + k.v + '">' + esc(UI === 'ru' ? k.ru : k.kk) + '</option>').join(''));
const debounce = (fn, ms) => { let t = 0; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };
/** Сүзгі өзгерді: тізім мен (қосулы болса) картадағы нысандар жаңарады. */
const onFilter = () => { keepShown.clear(); render(true); };
$('plQ').addEventListener('input', debounce(onFilter, 180));
$('plFKind').addEventListener('change', onFilter);
$('plMapF').checked = store.get('pl-map-filter') !== '0';
$('plMapF').addEventListener('change', () => { store.set('pl-map-filter', $('plMapF').checked ? '1' : '0'); onFilter(); });
$('plFReset').addEventListener('click', () => { for (const id of FILTER_IDS) $(id).value = ''; onFilter(); });
$('plShow').addEventListener('change', paintVisibility);
$('plLabels').addEventListener('change', () => { store.set('pl-labels', $('plLabels').checked ? '1' : '0'); view.rebuild(); });
$('plLabels').checked = store.get('pl-labels') === '1';

function filtered() {
  if (!sorted) sorted = items.slice().sort((a, b) => compareNames(titleOf(a), titleOf(b)) || KINDS.indexOf(kindOf(a.kind)) - KINDS.indexOf(kindOf(b.kind)));
  const q = $('plQ').value.trim(), fk = $('plFKind').value;
  return sorted.filter(p => (!fk || p.kind === fk) && (!q || matchesText([p.name, p.name_ru, kindLabel(p.kind, 'kk'), kindLabel(p.kind, 'ru')].filter(Boolean).join(' '), q)));
}
const paintList = progressiveList($('plList'));
const shown = () => !$('mkPanel').hidden && !$('mkTabPlaces').hidden;
function render(changed) {
  if (changed) draw();
  $('plFReset').hidden = !filterActive();
  if (!shown()) return;
  const list = filtered();
  $('plInfo').textContent = (list.length === items.length ? items.length : list.length + ' / ' + items.length) + tx(' нысан', ' объектов');
  $('plGeo').disabled = !items.length;
  const box = $('plList');
  if (!items.length) { box.innerHTML = '<div class="qa-empty">' + tx('Әзірге нысан жоқ. «Белгі қою» батырмасын басып, картадан орнын белгілеңіз де, «Өзге нысандар» түрін таңдаңыз.', 'Пока объектов нет. Нажмите «Поставить метку», укажите место на карте и выберите тип «Прочие объекты».') + '</div>'; return; }
  if (!list.length) { box.innerHTML = '<div class="qa-empty">' + tx('Сүзгіге сай нысан табылмады.', 'Объекты по фильтру не найдены.') + '</div>'; return; }
  paintList((function* () { for (const p of list) {
    yield '<div class="qa-sc mk-card pl-card" data-pid="' + esc(p.id) + '">' + badge(p.kind, ' pl-badge--list') +
      '<div class="qa-sc-main"><button type="button" class="qa-sc-title" data-pact="go" title="' + tx('Картадан көрсету', 'Показать на карте') + '">' + esc(titleOf(p)) + '</button>' +
      '<div class="qa-sc-meta">' + esc(kindLabel(p.kind)) + '</div>' +
      '<div class="qa-sc-meta mk-cc">' + esc(coordLines(p).join(', ')) + '</div>' +
      '<div class="qa-sc-act"><button type="button" class="lnk" data-pact="edit">' + tx('Өңдеу', 'Изменить') + '</button><button type="button" class="lnk" data-pact="go">' + tx('Картадан көрсету', 'Показать на карте') + '</button>' +
      '<button type="button" class="lnk" data-pact="route">' + tx('Жол табу', 'Найти путь') + '</button>' +
      '<button type="button" class="lnk lnk--danger" data-pact="del">' + tx('Өшіру', 'Удалить') + '</button></div></div></div>';
  } })(), list.length);
}
$('plList').addEventListener('click', e => {
  const b = e.target.closest('[data-pact]'), card = e.target.closest('[data-pid]');
  if (!b || !card) return;
  const p = items.find(x => x.id === card.dataset.pid);
  if (!p) return;
  if (b.dataset.pact === 'go') flyTo(p);
  else if (b.dataset.pact === 'edit') openDialog(p);
  else if (b.dataset.pact === 'del') removePlace(p);
  else if (b.dataset.pact === 'route') globalThis.MuraRoutes?.findPath?.('to', { placeId: p.id, lat: p.lat, lon: p.lon, label: titleOf(p) });
});
// «Нысан қосу»: келесі басу — жаңа өзге нысанның орны (түрі сұралмайды)
$('plAdd').addEventListener('click', () => {
  globalThis.__marks?.setMarking?.(false);
  mapEl.classList.add('is-marking');
  toast(tx('Картадан нысанның орнын басыңыз (Esc — бас тарту).', 'Щёлкните по карте в месте объекта (Esc — отмена).'));
  const off = () => { mapEl.classList.remove('is-marking'); map.off('click', at); document.removeEventListener('keydown', esc1, true); };
  const at = ev => { off(); openDialog({ lat: ev.latlng.lat, lon: ev.latlng.lng }); };
  const esc1 = ev => { if (ev.key === 'Escape') { ev.preventDefault(); off(); } };
  map.once('click', at);
  document.addEventListener('keydown', esc1, true);
});

/* ======================= GeoJSON: экспорт және импорт ======================= */
/** Android-пен ортақ пішім (android/core PlaceGeoJson): name — қазақша, name_ru — орысша, kind + kind_kk/kind_ru, mura_layer. */
export function geojson(list, title) {
  return {
    type: 'FeatureCollection', name: title || 'ozge-nysandar',
    features: list.map(p => ({
      type: 'Feature', id: p.id,
      geometry: { type: 'Point', coordinates: [+(+p.lon).toFixed(8), +(+p.lat).toFixed(8)] },
      properties: {
        id: p.id, name: p.name || '', name_ru: p.name_ru || '', kind: p.kind, kind_kk: kindLabel(p.kind, 'kk'), kind_ru: kindLabel(p.kind, 'ru'),
        lat: p.lat, lon: p.lon, lat_dms: dms(p.lat) + ' N', lon_dms: dms(p.lon) + ' E',
        created_at: p.created_at || '', created_by: p.created_by || '', updated_at: p.updated_at || '', updated_by: p.updated_by || '', mura_layer: 'places',
      },
    })),
  };
}
/** Mura GIS-тің өзге нысандар файлы ма (әр нүктеде 16 таңбалы id және kind_kk) — ескерткіштер файлымен шатаспайды. */
export function isMuraPlaces(o) {
  const feats = o && o.type === 'FeatureCollection' ? o.features : [];
  return !!feats && feats.length > 0 && feats.every(f => {
    const p = f && f.properties || {};
    return /^[0-9a-f]{16}$/.test(String(p.id || '')) && p.kind_kk != null;
  });
}
/** GeoJSON → жазбалар (Android экспортында name_kk бар — ол қазақша атау). */
export function fromGeojson(o) {
  const out = [];
  for (const f of (o && o.features) || []) {
    const g = f && f.geometry;
    if (!g || g.type !== 'Point' || !Array.isArray(g.coordinates)) continue;
    const p = f.properties || {};
    const kind = KINDS.some(k => k.v === p.kind) ? p.kind : (KINDS.find(k => k.kk === p.kind_kk || k.ru === p.kind_ru) || { v: 'other' }).v;
    out.push({ id: String(p.id || f.id || ''), name: String(p.name_kk ?? p.name ?? ''), name_ru: String(p.name_ru ?? ''), kind,
      lat: +g.coordinates[1], lon: +g.coordinates[0], created_at: p.created_at || '', created_by: p.created_by || '', updated_at: p.updated_at || '', updated_by: p.updated_by || '' });
  }
  return out;
}
function download(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/geo+json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
$('plGeo').addEventListener('click', () => {
  const list = filtered();
  download(JSON.stringify(geojson(list, tx('Өзге нысандар', 'Прочие объекты')), null, 2), (UI === 'ru' ? 'Прочие_объекты_' : 'Өзге_нысандар_') + new Date().toISOString().slice(0, 10) + '.geojson');
  toast('GeoJSON: ' + list.length + tx(' нысан.', ' объектов.'));
});

/** Импорттың мақсатын сұрау (KML, KMZ, GPX, бөтен GeoJSON): ескерткіштерге («Импортталғандар» → сәйкестендіру)
    не өзге нысандарға (бірден, таңдалған түрмен). Нәтиже: { target: 'marks' | 'places', kind } не null (бас тартты). */
function askImportTarget(file, n) {
  return new Promise(resolve => {
    const back = document.createElement('div');
    back.className = 'qa-dlg-back mk-dlg-back';
    back.innerHTML =
      '<form class="qa-dlg qa-glass mk-dlg pl-choose" role="dialog" aria-modal="true" aria-labelledby="plImpT">' +
        '<h3 id="plImpT">' + esc(file) + ': ' + n + tx(' нүкте — қайда импорттау керек?', ' точек — куда импортировать?') + '</h3>' +
        '<label class="pl-opt"><input type="radio" name="t" value="marks" checked><span><b>' + tx('Ескерткіштерге', 'В памятники') + '</b><small>' +
          tx('«Импортталғандар» қойындысына — әр нүктені ескерткіш ретінде сәйкестендіресіз (атауы, түрі, санаты, мәртебесі…).', 'Во вкладку «Импортированные» — каждую точку вы сопоставите как памятник (наименование, вид, категория, статус…).') + '</small></span></label>' +
        '<label class="pl-opt"><input type="radio" name="t" value="places"><span><b>' + tx('Өзге нысандарға', 'В прочие объекты') + '</b><small>' +
          tx('Бірден өзге нысан ретінде сақталады: атауы — нүктенің атауы, түрі — төменде таңдалғаны.', 'Сразу сохраняются как прочие объекты: название — имя точки, вид — выбранный ниже.') + '</small></span></label>' +
        '<div class="qa-f pl-impkind" hidden><label for="plImpKind">' + tx('Түрі', 'Вид') + '</label><select id="plImpKind">' +
          KINDS.map(k => '<option value="' + k.v + '"' + (k.v === 'other' ? ' selected' : '') + '>' + esc(UI === 'ru' ? k.ru : k.kk) + '</option>').join('') + '</select></div>' +
        '<div class="qa-dlg-btns"><span class="mk-sp"></span><button type="button" class="btn btn--ghost btn--sm" data-x>' + tx('Бас тарту', 'Отмена') + '</button>' +
          '<button type="submit" class="btn btn--primary btn--sm">' + tx('Импорттау', 'Импортировать') + '</button></div>' +
      '</form>';
    const form = back.querySelector('form');
    const end = r => { back.remove(); document.removeEventListener('keydown', onKey, true); resolve(r); };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(null); } };
    form.addEventListener('change', () => { back.querySelector('.pl-impkind').hidden = form.elements.t.value !== 'places'; });
    form.addEventListener('submit', e => { e.preventDefault(); end({ target: form.elements.t.value, kind: back.querySelector('#plImpKind').value }); });
    back.querySelector('[data-x]').addEventListener('click', () => end(null));
    document.addEventListener('keydown', onKey, true);
    app.appendChild(back);
    form.querySelector('[type=submit]').focus();
  });
}
/** Бөтен нүктелерді (pts: [{ name, desc, lat, lon }]) өзге нысан ретінде қосу; атауы — интерфейс тіліндегі өріске. */
async function importPoints(pts, kind) {
  const list = pts.map(x => ({ kind, name: UI === 'ru' ? '' : x.name || '', name_ru: UI === 'ru' ? x.name || '' : '', lat: x.lat, lon: x.lon }));
  const r = await api('import', { data: JSON.stringify(list) });
  if (list.length) {
    if (!$('plShow').checked) { $('plShow').checked = true; paintVisibility(); }
    map.fitBounds(L.latLngBounds(list.map(x => [x.lat, x.lon])).pad(0.2), { maxZoom: 15 });
  }
  return r;
}
/** Импортталған нүктені өзге нысан ретінде сақтау («Сәйкестендіру» сияқты): сақталғанда нүкте импорттан алынады. */
function identifyAsPlace(x) {
  openDialog(UI === 'ru' ? { name_ru: x.name || '', lat: x.lat, lon: x.lon, kind: 'other' } : { name: x.name || '', lat: x.lat, lon: x.lon, kind: 'other' }, {
    title: tx('Импортталған нүкте → өзге нысан', 'Импортированная точка → прочий объект'),
    onSaved: async () => { try { await globalThis.__marks?.api('idel', { id: x.id }); } catch (e) { toast(e.message, true); } },
  });
}

/* ======================= Іске қосу ======================= */
paintVisibility();
api('list').catch(e => { toast(tx('Өзге нысандар жүктелмеді: ', 'Прочие объекты не загружены: ') + e.message, true); render(); });

globalThis.__places = {
  get items() { return items; }, api, render, openDialog, choose, askImportTarget, importPoints, identifyAsPlace, geojson, fromGeojson, isMuraPlaces,
  KINDS, titleOf, kindLabel, badge, filtered,
};
