/* Mura GIS: «Жоспар» қызметі — ескерткіштің құрамындағы нысандарды (қорғандар т.б.) тіркеу, контурын сызу, өлшемдері,
   елді мекенге бағыттауыш, «Салтақ-III қорымы» үлгісімен жалпы және жеке жоспарды масштабты PDF-ке шығару.
   • Ескерткіш — қолданыстағы белгі (marks): мұнда тек оның id-і пайдаланылады; оның негізгі координатасы жоспардан өзгермейді.
   • Нысандар мен жоспар баптаулары — жобаның plan_objects және plans қабаттары (main/plans.js, mura://app/plans).
   • Карта режимдері (ескерткішті / тірек нүктесін / елді мекенді картадан таңдау, контур сызу, редакциялау) кезінде
     картадағы белгілер басуды картаға өткізеді (.is-pjmap).
   Интерфейс бөліктері — plan/plan-dom.js, есептер — plan/geo.js, бет үлгісі — plan/sheet.js. */
import { plane, contourLL, hasContour, inverse, dist2, azXY, selfIntersects, fmtNum, fmtDist, parseNum, cmpNum, SCALES } from './geo.js';
import { renderPage, pdfHtml, objTitle, pointerValues, KINDS, MATERIALS, SUBTYPES, STATES, materialLabel, subtypeLabel, stateLabel, glyph, isStage2, explOf, PAPERS, paperSize } from './sheet.js';
import { parseOne } from '../qorgau/app.js';

const $ = id => document.getElementById(id);
const L = globalThis.L;
const map = globalThis.MuraMarks && globalThis.MuraMarks.map;
const API = 'mura://app/plans?v=1';
const app = $('qaApp'), mapEl = $('qaMap'), panelEl = $('pjPanel');
const IC = globalThis.MuraPlanIcon || {};
const svgIc = globalThis.MuraPlanSvg || (() => '');
const I18N = globalThis.MuraI18n || { ru: false, field: (o, k) => o[k] || '', docLang: () => 'kk', biField: null };
const REG = globalThis.MuraRegions;
const tx = (kk, ru) => (I18N.ru ? ru : kk);
const UI = I18N.ru ? 'ru' : 'kk';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* жеке режим */ } },
};
const SHAPES = [
  { v: '', kk: 'Тек нүкте (контурсыз)', ru: 'Только точка (без контура)' },
  { v: 'circle', kk: 'Шеңбер', ru: 'Окружность' },
  { v: 'ellipse', kk: 'Эллипс', ru: 'Эллипс' },
  { v: 'rect', kk: 'Тіктөртбұрыш', ru: 'Прямоугольник' },
  { v: 'free', kk: 'Еркін контур', ru: 'Свободный контур' },
];
const optList = (list, val, empty) => (empty ? '<option value="">' + esc(empty) + '</option>' : '') +
  list.map(k => '<option value="' + k.v + '"' + (k.v === (val || '') ? ' selected' : '') + '>' + esc(UI === 'ru' ? k.ru : k.kk) + '</option>').join('');
const lbl = (list, v) => { const x = list.find(k => k.v === v) || list[0]; return UI === 'ru' ? x.ru : x.kk; };

function toast(msg, err) {
  const t = $('qaToast');
  if (!t) return;
  t.textContent = msg; t.classList.toggle('is-err', !!err); t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, err ? 5000 : 2800);
}
const ask = (msg, o) => (globalThis.QAUI && globalThis.QAUI.confirm ? globalThis.QAUI.confirm(msg, o) : Promise.resolve(confirm(msg)));
function download(data, type, name) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const fileSafe = s => String(s || 'жоспар').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 80);

/* ======================= Деректер ======================= */
let objects = [], plans = [];
let markId = store.get('pj-mark') || '';
let selId = '';
async function api(op, data) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data || {})) fd.append(k, v);
  const r = await fetch(API + '&op=' + op, { method: 'POST', body: fd });
  const j = await r.json();
  if (!j.ok) { const e = new Error(j.error || tx('Сақтау қатесі', 'Ошибка сохранения')); e.field = j.field || ''; throw e; }
  if (Array.isArray(j.objects)) objects = j.objects;
  if (Array.isArray(j.plans)) plans = j.plans;
  render();
  return j;
}
const marks = () => (globalThis.__marks && globalThis.__marks.items) || [];
const places = () => (globalThis.__places && globalThis.__places.items) || [];
const curMark = () => marks().find(m => m.id === markId) || null;
const markObjects = (id = markId) => objects.filter(o => o.mark_id === id).sort(cmpNum);
const curPlan = () => plans.find(p => p.mark_id === markId) || null;
const curObj = () => objects.find(o => o.id === selId && o.mark_id === markId) || null;
const markName = (m, l = UI) => (m ? I18N.field(m, 'name', l) || tx('Атаусыз ескерткіш', 'Памятник без названия') : '');
const objName = (o, l = UI) => objTitle(o, l) + (I18N.field(o, 'name', l) ? ' — ' + I18N.field(o, 'name', l) : '');
const nextNum = () => { const ns = markObjects().map(o => parseInt(o.num, 10)).filter(Number.isFinite); return String(ns.length ? Math.max(...ns) + 1 : 1); };

/** Жоспар баптауларын сақтау (бар жазбаға өзгерістер қосылады). */
async function savePlan(patch) {
  const p = curPlan() || { mark_id: markId, lang: I18N.docLang ? I18N.docLang() : 'kk', scale_general: 0, scale_detail: 0, ptr: null };
  return api('plan', { data: JSON.stringify({ ...p, ...patch, mark_id: markId }) });
}

/* ======================= Карта қабаты ======================= */
const layer = L.featureGroup();
const tempLayer = L.layerGroup();
const ST = { fill: '#9c4f1c', line: '#221d16', sel: '#e8178a' };
function drawLayer() {
  layer.clearLayers();
  if (!markId) return;
  for (const o of markObjects()) {
    const sel = o.id === selId;
    const ll = hasContour(o) ? contourLL(o) : null;
    const kurgan = !o.kind || o.kind === 'kurgan' || o.kind === 'other';
    // Контур: қорған — қоңыр, қорымның құрылыстары — сұр, қоршау — толтырусыз; контурсыз қорым нысаны — жоспардағы белгісі
    const shape = ll
      ? L.polygon(ll, { color: sel ? ST.sel : ST.line, weight: sel ? 3 : 1.5, fillColor: kurgan ? ST.fill : '#8a8070', fillOpacity: o.kind === 'korshau' ? 0 : 0.55,
        dashArray: o.kind === 'korshau' ? '6 4' : null, className: 'pj-shape' })
      : kurgan
        ? L.circleMarker([o.lat, o.lon], { radius: sel ? 6 : 4.5, color: sel ? ST.sel : '#fff', weight: 2, fillColor: ST.line, fillOpacity: 1, className: 'pj-shape' })
        : L.marker([o.lat, o.lon], { keyboard: false, icon: L.divIcon({ className: 'pj-shape pj-glyph' + (sel ? ' is-sel' : ''), iconSize: [18, 18], iconAnchor: [9, 9],
          html: '<svg viewBox="-2.6 -2.6 5.2 5.2" width="18" height="18" aria-hidden="true">' + glyph(o.kind, 0, 0) + '</svg>' }) });
    shape.bindTooltip(esc(o.num), { permanent: true, direction: 'right', offset: [ll ? 0 : 6, 0], className: 'pj-num' + (sel ? ' is-sel' : '') });
    shape.on('click', ev => { if (mode) return; L.DomEvent.stop(ev); select(o.id); });
    shape.on('dblclick', ev => { if (mode) return; L.DomEvent.stop(ev); openObjDialog(o); });
    shape.addTo(layer);
  }
  const v = pointerValues(ctxFor(UI));
  if (v) {
    const p = curPlan();
    L.polyline([[v.origin.lat, v.origin.lon], [p.ptr.lat, p.ptr.lon]], { color: '#1f5f99', weight: 2, dashArray: '6 6', interactive: false }).addTo(layer);
    L.circleMarker([p.ptr.lat, p.ptr.lon], { radius: 5, color: '#1f5f99', weight: 2, fillColor: '#fff', fillOpacity: 1 })
      .bindTooltip(esc(ptrName(p, UI) || '') + '<small>' + fmtDist(v.dist) + ', ' + fmtNum(v.az, 1) + '°</small>', { className: 'mk-tip' })
      .on('click', ev => { if (mode) return; L.DomEvent.stop(ev); openPtrDialog(); }).addTo(layer);
  }
}
function paintVisibility() {
  const on = globalThis.MuraSvc?.get?.() === 'plan';
  if (on && !map.hasLayer(layer)) layer.addTo(map);
  if (!on && map.hasLayer(layer)) map.removeLayer(layer);
  if (!map.hasLayer(tempLayer)) tempLayer.addTo(map);
}
function fitObjects(ids) {
  const list = ids ? objects.filter(o => ids.includes(o.id)) : markObjects();
  const pts = [];
  for (const o of list) pts.push(...(contourLL(o) || [[o.lat, o.lon]]));
  const m = curMark();
  if (!pts.length && m) pts.push([m.lat, m.lon]);
  if (!pts.length) return;
  const p = globalThis.QAUI?.pad?.();
  // «Жоспар» панелі ашық болса, нысандар оның астына түспейтіндей оң жақ шегініс панельдің енімен есептеледі
  const br = p?.br ? p.br.slice() : [24, 24];
  if (open && !globalThis.QAUI?.isMobile?.()) br[0] = Math.max(br[0], panelEl.offsetWidth + 2 * (cssNum('--qa-gap') || 10) + 24);
  map.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 19, paddingTopLeft: p?.tl, paddingBottomRight: br });
}

/* ======================= Таңдау және көрсету ======================= */
function setMark(id, o = {}) {
  markId = id || '';
  store.set('pj-mark', markId);
  selId = '';
  render();
  if (markId && o.fit !== false) fitObjects();
}
function select(id, o = {}) {
  selId = id || '';
  render();
  if (selId && o.fit !== false) fitObjects([selId]);
}

function render() {
  const m = curMark();
  if (markId && !m && marks().length) { markId = ''; }        // ескерткіш өшірілген (оның нысандары жобада сақталады)
  const list = markObjects();
  if (selId && !list.some(o => o.id === selId)) selId = '';
  // Құралдар жолағы
  $('pjMarkName').textContent = m ? markName(m) : tx('Ескерткіш таңдау', 'Выбрать памятник');
  $('pjPick').title = m ? tx('Ескерткіш: ', 'Памятник: ') + markName(m) + tx(' — басқасын таңдау', ' — выбрать другой') : '';
  $('pjCount').textContent = list.length;
  const has = !!m, any = has && list.length > 0, sel = has && !!curObj();
  for (const [id, on] of [['pjListBtn', has], ['pjAdd', has], ['pjDraw', sel || mode?.kind === 'edit'], ['pjDims', sel], ['pjPtr', has], ['pjPreview', any], ['pjPdf', any],
    ['pjAdd2', has], ['pjPtr2', has], ['pjPreview2', any], ['pjPdf2', any]]) { const b = $(id); if (b) b.disabled = !on; }
  $('pjListBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
  $('pjPtr2').textContent = curPlan()?.ptr ? tx('Бағыттауыш', 'Указатель') : tx('Елді мекенге бағыт қосу', 'Добавить направление на населённый пункт');
  renderPanel(m, list);
  drawLayer();
  paintVisibility();
  // QAUI.measure ортақ панельдерді ғана біледі: «Жоспар» панелі ашық болса, оң жақ шегіністі қайта қоямыз
  // (әйтпесе карта қабаттары батырмасы т.б. панельдің астында қалады)
  globalThis.QAUI?.measure?.();
  applyRight();
}

/* ======================= Панель ======================= */
let open = false;
const cssNum = k => parseFloat(getComputedStyle(app).getPropertyValue(k)) || 0;
function applyRight() {
  if (!open) return;
  const g = cssNum('--qa-gap') || 10;
  app.style.setProperty('--qa-right', (globalThis.QAUI?.isMobile?.() ? g : panelEl.offsetWidth + 2 * g) + 'px');
}
function openPanel() {
  globalThis.QAUI?.closePanel?.();
  globalThis.QAUI?.closePop?.();
  globalThis.__marks?.closePanel?.();
  globalThis.MuraRoutes?.closePanel?.();
  panelEl.hidden = false; open = true;
  render();
  applyRight();
}
function closePanel() {
  if (!open) return;
  panelEl.hidden = true; open = false;
  render();
  globalThis.QAUI?.measure?.();
}
panelEl.querySelector('[data-pjclose]').addEventListener('click', closePanel);
new ResizeObserver(() => requestAnimationFrame(applyRight)).observe(panelEl);
// Терезе не координата панелі өзгергенде QAUI.measure қайта есептейді — содан кейін шегіністі қалпына келтіреміз
new ResizeObserver(() => requestAnimationFrame(applyRight)).observe($('qaStage'));
for (const id of ['mkPanel', 'rtPanel']) { const el = $(id); if (el) new MutationObserver(() => { if (!el.hidden) closePanel(); }).observe(el, { attributes: true, attributeFilter: ['hidden'] }); }

function objMeta(o) {
  const parts = [];
  if (o.shape === 'circle') parts.push(tx('шеңбер', 'окружность') + ' Ø ' + fmtNum(o.diam) + ' м');
  else if (o.shape === 'ellipse') parts.push(tx('эллипс', 'эллипс') + ' ' + fmtNum(o.ax_a) + ' × ' + fmtNum(o.ax_b) + ' м');
  else if (o.shape === 'rect') parts.push(tx('тіктөртбұрыш', 'прямоугольник') + ' ' + fmtNum(o.ax_a) + ' × ' + fmtNum(o.ax_b) + ' м');
  else if (o.shape === 'free') parts.push(tx('еркін контур', 'свободный контур') + (o.diam ? ' Ø ' + fmtNum(o.diam) + ' м' : ''));
  else parts.push(tx('тек нүкте — контур жоқ', 'только точка — контура нет'));
  if (o.height != null || !o.kind || o.kind === 'kurgan') parts.push(tx('биіктігі ', 'высота ') + (o.height == null ? '—' : fmtNum(o.height) + ' м'));
  if (o.material) parts.push(materialLabel(o.material, UI).toLocaleLowerCase());
  if (o.subtype) parts.push(subtypeLabel(o.subtype, UI));
  if (o.state) parts.push(stateLabel(o.state, UI));
  return parts.join(' · ');
}
function renderPanel(m, list) {
  if (!open) return;
  $('pjMarkBox').innerHTML = m
    ? '<div class="pj-mtitle"><b>' + esc(markName(m)) + '</b><button type="button" class="lnk" data-pjact="pick">' + tx('Ауыстыру', 'Сменить') + '</button></div>' +
      '<div class="qa-sc-meta">' + esc([m.district, m.oblast].filter(Boolean).join(', ')) + ' · ' + (+m.lat).toFixed(6) + ', ' + (+m.lon).toFixed(6) + '</div>'
    : '<p class="qa-empty">' + tx('Ескерткіш таңдалмаған.', 'Памятник не выбран.') + ' <button type="button" class="lnk" data-pjact="pick">' + tx('Ескерткіш таңдау', 'Выбрать памятник') + '</button></p>';
  $('pjInfo').textContent = m ? tx('Құрамындағы нысандар: ', 'Объектов в составе: ') + list.length : '';
  $('pjObjList').innerHTML = !m ? '' : !list.length
    ? '<div class="qa-empty">' + tx('Нысан әлі жоқ. «Нысан қосу» батырмасымен қорғандарды тіркеңіз.', 'Объектов пока нет. Добавьте курганы кнопкой «Добавить объект».') + '</div>'
    : list.map(o => '<div class="qa-sc pj-card' + (o.id === selId ? ' is-current' : '') + '" data-id="' + esc(o.id) + '">' +
      '<span class="pj-cnum">' + esc(o.num) + '</span><div class="qa-sc-main">' +
      '<button type="button" class="qa-sc-title" data-pjact="sel">' + esc(objName(o)) + '</button>' +
      '<div class="qa-sc-meta">' + esc(objMeta(o)) + '</div>' +
      '<div class="qa-sc-act"><button type="button" class="lnk" data-pjact="edit">' + tx('Өңдеу', 'Изменить') + '</button>' +
      '<button type="button" class="lnk" data-pjact="draw">' + tx('Сызу', 'Начертить') + '</button>' +
      (hasContour(o) ? '<button type="button" class="lnk" data-pjact="detail">' + tx('Жеке жоспар', 'Индивидуальный план') + '</button>' : '') +
      '<button type="button" class="lnk lnk--danger" data-pjact="del">' + tx('Өшіру', 'Удалить') + '</button></div></div></div>').join('');
  // Таңдалған нысанның жеке жоспары (кішірейтілген бет)
  const o = curObj();
  $('pjThumbSec').hidden = !o;
  if (o) {
    $('pjThumbT').textContent = objTitle(o, UI) + ' — ' + tx('жеке жоспар', 'индивидуальный план');
    $('pjThumb').innerHTML = hasContour(o)
      ? renderPage(ctxFor(UI), 'detail', o, curPlan()?.scale_detail || 0).svg
      : '<p class="qa-hint">' + tx('Жеке сызба шығару үшін контур қажет: «Сызу» не «Өңдеу» арқылы шеңбер, эллипс не еркін контур қосыңыз. Жалпы жоспарда нысан нүкте мен нөмір арқылы көрсетіледі.',
        'Для индивидуального чертежа нужен контур: добавьте окружность, эллипс или свободный контур через «Начертить» или «Изменить». На общем плане объект показывается точкой и номером.') + '</p>';
  }
}
panelEl.addEventListener('click', async e => {
  const b = e.target.closest('[data-pjact]');
  if (!b) return;
  const card = b.closest('[data-id]'), o = card ? objects.find(x => x.id === card.dataset.id) : null;
  const act = b.dataset.pjact;
  if (act === 'pick') openMarkPicker();
  else if (act === 'sel' && o) select(o.id);
  else if (act === 'edit' && o) openObjDialog(o);
  else if (act === 'draw' && o) { select(o.id, { fit: false }); drawMenu(b); }
  else if (act === 'detail' && o) { select(o.id, { fit: false }); openPreview({ kind: 'detail', id: o.id }); }
  else if (act === 'del' && o) removeObj(o);
});
$('pjThumb').addEventListener('click', () => { const o = curObj(); if (o && hasContour(o)) openPreview({ kind: 'detail', id: o.id }); });
$('pjThumb').addEventListener('keydown', e => { if (e.key === 'Enter') $('pjThumb').click(); });
async function removeObj(o) {
  if (!(await ask(tx('№' + o.num + ' нысанын өшіру керек пе? Оның контуры мен өлшемдері де өшеді.', 'Удалить объект №' + o.num + '? Его контур и размеры тоже будут удалены.'), { ok: tx('Өшіру', 'Удалить') }))) return;
  try { await api('delete', { id: o.id }); toast(tx('№' + o.num + ' өшірілді.', 'Объект №' + o.num + ' удалён.')); } catch (e) { toast(e.message, true); }
}

/* ======================= Құралдар жолағы ======================= */
$('pjPick').addEventListener('click', () => openMarkPicker());
$('pjListBtn').addEventListener('click', () => (open ? closePanel() : openPanel()));
for (const id of ['pjAdd', 'pjAdd2']) $(id).addEventListener('click', () => openObjDialog(null));
$('pjDraw').addEventListener('click', e => { if (mode?.kind === 'edit') { stopMode(); return; } drawMenu(e.currentTarget); });
$('pjDims').addEventListener('click', () => { const o = curObj(); if (o) openObjDialog(o, { focus: 'dims' }); });
for (const id of ['pjPtr', 'pjPtr2']) $(id).addEventListener('click', () => openPtrDialog());
for (const id of ['pjPreview', 'pjPreview2']) $(id).addEventListener('click', () => openPreview({ kind: 'general' }));
for (const id of ['pjPdf', 'pjPdf2']) $(id).addEventListener('click', () => openPdfDialog());

/* ======================= Ескерткіш таңдау ======================= */
let dlg = null;
function closeDialog() {
  if (!dlg) return;
  dlg.back.remove();
  document.removeEventListener('keydown', dlg.onKey, true);
  if (dlg.prev && dlg.prev.focus && document.contains(dlg.prev)) dlg.prev.focus({ preventScroll: true });
  dlg = null;
}
/** Терезе: класы, мазмұны; Esc — жабу; қайтарады — терезенің түбірі. */
function dialog(cls, html, o = {}) {
  closeDialog();
  globalThis.QAUI?.closePop?.();
  const back = document.createElement('div');
  back.className = 'qa-dlg-back pj-dlg-back';
  back.innerHTML = '<div class="qa-dlg qa-glass pj-dlg ' + cls + '" role="dialog" aria-modal="true">' + html + '</div>';
  const prev = document.activeElement;
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDialog(); o.onCancel?.(); } };
  document.addEventListener('keydown', onKey, true);
  back.addEventListener('mousedown', e => { if (e.target === back) { closeDialog(); o.onCancel?.(); } });
  document.body.appendChild(back);
  dlg = { back, onKey, prev };
  return back;
}

function openMarkPicker() {
  const all = marks();
  if (!all.length) { toast(tx('Жобада ескерткіш жоқ. Алдымен «Белгі қою» арқылы ескерткішті белгілеңіз.', 'В проекте нет памятников. Сначала нанесите памятник через «Поставить метку».'), true); return; }
  const back = dialog('pj-pickdlg',
    '<h3>' + svgIc(IC.pick) + tx('Ескерткіш таңдау', 'Выбор памятника') + '</h3>' +
    '<div class="pj-pickrow"><input type="search" id="pjMQ" placeholder="' + tx('Іздеу: атауы, ауданы…', 'Поиск: название, район…') + '" autocomplete="off">' +
    '<button type="button" class="btn btn--ghost btn--sm" id="pjMMap">' + svgIc(IC.crosshair, 16) + ' ' + tx('Картадан таңдау', 'Выбрать на карте') + '</button></div>' +
    '<div class="pj-mlist" id="pjMList" role="listbox"></div>' +
    '<div class="qa-dlg-btns"><button type="button" class="btn btn--ghost btn--sm" data-x>' + tx('Бас тарту', 'Отмена') + '</button></div>');
  const q = back.querySelector('#pjMQ'), list = back.querySelector('#pjMList');
  const cnt = id => objects.filter(o => o.mark_id === id).length;
  const paint = () => {
    const s = q.value.trim().toLocaleLowerCase(UI);
    const rows = all.filter(m => !s || [markName(m), m.name, m.name_ru, m.district, m.oblast].join(' ').toLocaleLowerCase(UI).includes(s))
      .sort((a, b) => markName(a).localeCompare(markName(b), UI)).slice(0, 300);
    list.innerHTML = rows.map(m => '<button type="button" class="pj-mrow' + (m.id === markId ? ' is-cur' : '') + '" data-mid="' + esc(m.id) + '"><b>' + esc(markName(m)) + '</b>' +
      '<small>' + esc([m.district, m.oblast].filter(Boolean).join(', ')) + (cnt(m.id) ? ' · ' + tx('нысан: ', 'объектов: ') + cnt(m.id) : '') + '</small></button>').join('') ||
      '<div class="qa-empty">' + tx('Табылмады', 'Не найдено') + '</div>';
  };
  paint();
  q.addEventListener('input', paint);
  list.addEventListener('click', e => { const b = e.target.closest('[data-mid]'); if (b) { closeDialog(); setMark(b.dataset.mid); openPanel(); } });
  back.querySelector('[data-x]').addEventListener('click', closeDialog);
  back.querySelector('#pjMMap').addEventListener('click', () => { closeDialog(); startMode({ kind: 'pickMark' }); });
  q.focus();
}

/** Ескерткіштің карточкасынан «Жоспарды ашу»: «Жоспар» режимі қосылып, сол ескерткіш бірден таңдалады. */
function openForMark(m) {
  globalThis.__marks?.closePanel?.();
  globalThis.MuraSvc?.set?.('plan');
  setMark(m.id);
  openPanel();
}

/* ======================= Карта режимдері ======================= */
let mode = null;       // { kind: pickMark | pickAnchor | pickPtr | draw | edit, shape, draft, pts, after }
const hud = document.createElement('div');
hud.className = 'qa-hud pj-hud'; hud.hidden = true;
$('qaStage').appendChild(hud);
function setHud(main, sub) { hud.hidden = !main; hud.innerHTML = main ? '<div><b>' + esc(main) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>' : ''; }
const pressed = id => { const b = $(id); return !!b && b.getAttribute('aria-pressed') === 'true'; };
function startMode(m) {
  stopMode(true);
  globalThis.QAUI?.closePop?.();
  // Басқа қызметтердің карта режимдері өшеді
  for (const id of ['qaAddMode', 'mkMode', 'qaRuler', 'qaCompass']) if (pressed(id)) $(id).click();
  globalThis.MuraRoutes?.stop?.();
  mode = { pts: [], ...m };
  mapEl.classList.add('is-pjmap');
  if (m.kind === 'draw' && m.shape === 'free') map.doubleClickZoom.disable();
  $('pjDraw').setAttribute('aria-pressed', m.kind === 'draw' || m.kind === 'edit' ? 'true' : 'false');
  if (m.kind === 'edit') startEdit();
  paintHud();
  render();
}
function stopMode(silent) {
  if (!mode) return;
  const m = mode;
  mode = null;
  tempLayer.clearLayers();
  mapEl.classList.remove('is-pjmap');
  map.doubleClickZoom.enable();
  $('pjDraw').setAttribute('aria-pressed', 'false');
  setHud('');
  if (!silent) { if (m.after) m.after(null); render(); }
}
const near = (a, b, px) => map.latLngToContainerPoint(a).distanceTo(map.latLngToContainerPoint(b)) <= px;
function nearestOf(list, ll, px = 26) {
  let best = null, bd = Infinity;
  const p = map.latLngToContainerPoint(ll);
  for (const x of list) {
    const d = map.latLngToContainerPoint([x.lat, x.lon]).distanceTo(p);
    if (d < bd) { bd = d; best = x; }
  }
  return bd <= px ? best : null;
}

function paintHud(ll) {
  if (!mode) return setHud('');
  const k = mode.kind, n = mode.pts.length;
  if (k === 'pickMark') return setHud(tx('Картадан ескерткішті басыңыз', 'Щёлкните памятник на карте'), 'Esc — ' + tx('бас тарту', 'отмена'));
  if (k === 'pickAnchor') return setHud(tx('Тірек нүктесін картадан басыңыз', 'Щёлкните опорную точку на карте'), 'Esc — ' + tx('бас тарту', 'отмена'));
  if (k === 'pickPtr') return setHud(tx('Елді мекенді картадан таңдаңыз', 'Выберите населённый пункт на карте'), tx('Өзге нысандағы елді мекенді не кез келген нүктені басыңыз · Esc — бас тарту', 'Щёлкните населённый пункт из прочих объектов или любую точку · Esc — отмена'));
  if (k === 'edit') return setHud(tx('Контурды редакциялау: тұтқаларды сүйреңіз', 'Редактирование контура: перетаскивайте маркеры'), tx('Орталық — жылжыту, шеттері — өлшемі мен пішіні; өзгеріс бірден сақталады · Esc — аяқтау', 'Центр — перемещение, края — размер и форма; изменения сохраняются сразу · Esc — завершить'));
  if (k !== 'draw') return;
  const c = mode.pts[0] && plane(mode.pts[0][0], mode.pts[0][1]);
  const cur = ll && c ? c.fwd(ll.lat, ll.lng) : null;
  if (mode.shape === 'circle') {
    if (!n) return setHud(tx('Шеңбер: орталығын басыңыз', 'Окружность: щёлкните центр'), 'Esc — ' + tx('бас тарту', 'отмена'));
    return setHud(tx('Шеңбер: шетін басыңыз', 'Окружность: щёлкните край') + (cur ? ' — Ø ' + fmtNum(2 * Math.hypot(cur[0], cur[1]), 1) + ' м' : ''), 'Esc — ' + tx('бас тарту', 'отмена'));
  }
  if (mode.shape === 'ellipse') {
    if (!n) return setHud(tx('Эллипс: орталығын басыңыз', 'Эллипс: щёлкните центр'), '');
    if (n === 1) return setHud(tx('Эллипс: үлкен осьтің ұшын басыңыз', 'Эллипс: щёлкните конец большой оси') + (cur ? ' — ' + fmtNum(2 * Math.hypot(cur[0], cur[1]), 1) + ' м, ' + fmtNum(azXY([0, 0], cur), 1) + '°' : ''), '');
    return setHud(tx('Эллипс: кіші осьтің ұшын басыңыз', 'Эллипс: щёлкните конец малой оси'), '');
  }
  if (mode.shape === 'rect') {
    if (!n) return setHud(tx('Тіктөртбұрыш: орталығын басыңыз', 'Прямоугольник: щёлкните центр'), '');
    if (n === 1) return setHud(tx('Тіктөртбұрыш: ұзын қабырғаның ортасын басыңыз', 'Прямоугольник: щёлкните середину длинной стороны') + (cur ? ' — ' + fmtNum(2 * Math.hypot(cur[0], cur[1]), 1) + ' м, ' + fmtNum(azXY([0, 0], cur), 1) + '°' : ''), '');
    return setHud(tx('Тіктөртбұрыш: қысқа қабырғаның ортасын басыңыз (ені)', 'Прямоугольник: щёлкните середину короткой стороны (ширина)'), '');
  }
  return setHud(tx('Еркін контур: төбелерді басыңыз', 'Свободный контур: щёлкайте вершины') + ' (' + n + ')',
    tx('Бірінші төбені басу, екі рет басу не Enter — тұйықтау; Backspace — соңғы төбе; Esc — бас тарту', 'Щелчок по первой вершине, двойной щелчок или Enter — замкнуть; Backspace — последняя вершина; Esc — отмена'));
}

function rubber(ll) {
  tempLayer.clearLayers();
  if (!mode || mode.kind !== 'draw') return;
  const pts = mode.pts, sty = { color: ST.sel, weight: 2, fillColor: ST.fill, fillOpacity: 0.3, interactive: false, dashArray: '5 5' };
  for (const p of pts) L.circleMarker(p, { radius: 4, color: ST.sel, fillColor: '#fff', fillOpacity: 1, weight: 2, interactive: false }).addTo(tempLayer);
  if (!pts.length) return;
  const P = plane(pts[0][0], pts[0][1]);
  const cur = ll ? P.fwd(ll.lat, ll.lng) : null;
  const llOf = xy => xy.map(p => P.inv(p[0], p[1]));
  if (mode.shape === 'circle' && cur) {
    const d = 2 * Math.hypot(cur[0], cur[1]);
    L.polygon(contourLL({ shape: 'circle', lat: pts[0][0], lon: pts[0][1], diam: d }), sty).addTo(tempLayer);
  } else if (mode.shape === 'ellipse' || mode.shape === 'rect') {
    const a = pts[1] ? P.fwd(pts[1][0], pts[1][1]) : cur;
    if (!a) return;
    const A = 2 * Math.hypot(a[0], a[1]), az = azXY([0, 0], a);
    let B = A * 0.6;
    if (pts[1] && cur) { const t = az * Math.PI / 180; B = 2 * Math.abs(cur[0] * Math.cos(t) - cur[1] * Math.sin(t)); }
    L.polyline(llOf([[0, 0], a]), { color: ST.sel, weight: 1.5, interactive: false }).addTo(tempLayer);
    if (pts[1]) L.polygon(contourLL({ shape: mode.shape, lat: pts[0][0], lon: pts[0][1], ax_a: Math.max(A, 0.01), ax_b: Math.max(B, 0.01), ax_az: az }), sty).addTo(tempLayer);
  } else if (mode.shape === 'free') {
    L.polyline(ll ? pts.concat([[ll.lat, ll.lng]]) : pts, { color: ST.sel, weight: 2, interactive: false }).addTo(tempLayer);
    if (pts.length >= 2 && ll) L.polyline([[ll.lat, ll.lng], pts[0]], { color: ST.sel, weight: 1, dashArray: '3 5', interactive: false }).addTo(tempLayer);
  }
}

map.on('mousemove', e => { if (mode && mode.kind === 'draw') { rubber(e.latlng); paintHud(e.latlng); } });
map.on('click', e => {
  if (!mode) return;
  const ll = e.latlng, k = mode.kind;
  if (k === 'pickMark') {
    const m = nearestOf(marks(), ll);
    if (!m) { toast(tx('Ескерткіштің белгісін басыңыз.', 'Щёлкните по метке памятника.')); return; }
    stopMode(true); setMark(m.id); openPanel(); render();
    return;
  }
  if (k === 'pickAnchor') { const after = mode.after; stopMode(true); render(); after({ lat: ll.lat, lon: ll.lng }); return; }
  if (k === 'pickPtr') {
    const pl = nearestOf(places(), ll);
    const after = mode.after; stopMode(true); render();
    after(pl ? { lat: pl.lat, lon: pl.lon, place: pl } : { lat: ll.lat, lon: ll.lng });
    return;
  }
  if (k !== 'draw') return;
  const pts = mode.pts;
  if (mode.shape === 'free' && pts.length >= 3 && near(ll, pts[0], 10)) { finishDraw(); return; }
  pts.push([ll.lat, ll.lng]);
  if ((mode.shape === 'circle' && pts.length === 2) || ((mode.shape === 'ellipse' || mode.shape === 'rect') && pts.length === 3)) { finishDraw(); return; }
  rubber(ll); paintHud(ll);
});
map.on('dblclick', e => { if (mode && mode.kind === 'draw' && mode.shape === 'free') { L.DomEvent.stop(e); if (mode.pts.length > 3) mode.pts.pop(); finishDraw(); } });
document.addEventListener('keydown', e => {
  if (!mode || dlg) return;
  if (e.key === 'Escape') { e.preventDefault(); stopMode(); }
  else if (mode.kind === 'draw' && mode.shape === 'free' && e.key === 'Enter') { e.preventDefault(); finishDraw(); }
  else if (mode.kind === 'draw' && e.key === 'Backspace' && mode.pts.length) { e.preventDefault(); mode.pts.pop(); rubber(); paintHud(); }
}, true);

/** Сызу аяқталды: өлшемдер нысанның жобасына жазылып, нысан терезесі қайта ашылады (тексеріп, сақтау үшін). */
function finishDraw() {
  const m = mode, pts = m.pts, d = { ...m.draft, latText: undefined, lonText: undefined };
  const P = plane(pts[0][0], pts[0][1]);
  const r1 = v => Math.round(v * 10) / 10;
  if (m.shape === 'circle') {
    const b = P.fwd(pts[1][0], pts[1][1]);
    Object.assign(d, { shape: 'circle', lat: pts[0][0], lon: pts[0][1], diam: r1(2 * Math.hypot(b[0], b[1])) });
  } else if (m.shape === 'ellipse' || m.shape === 'rect') {
    const a = P.fwd(pts[1][0], pts[1][1]), c = P.fwd(pts[2][0], pts[2][1]);
    let A = 2 * Math.hypot(a[0], a[1]), az = azXY([0, 0], a);
    const t = az * Math.PI / 180;
    let B = 2 * Math.abs(c[0] * Math.cos(t) - c[1] * Math.sin(t));
    if (B > A) { [A, B] = [B, A]; az = (az + 90) % 360; }
    Object.assign(d, { shape: m.shape, lat: pts[0][0], lon: pts[0][1], ax_a: r1(A), ax_b: r1(B), ax_az: r1(az) });
  } else {
    if (pts.length < 3) { toast(tx('Еркін контурда кемінде үш төбе болуы керек.', 'В свободном контуре должно быть не менее трёх вершин.'), true); return; }
    if (selfIntersects(pts.map(p => P.fwd(p[0], p[1])))) { toast(tx('Контур өзімен қиылысады — төбелерді қайта қойыңыз (Backspace).', 'Контур самопересекается — переставьте вершины (Backspace).'), true); return; }
    Object.assign(d, { shape: 'free', pts: pts.map(p => [p[0], p[1]]) });
    if (d.lat == null || d.lat === '') { const c = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]); d.lat = c[0]; d.lon = c[1]; }
    if (Array.isArray(d.dim) && d.dim.some(i => i >= pts.length)) d.dim = null;
  }
  stopMode(true);
  render();
  openObjDialog(d.id ? objects.find(o => o.id === d.id) || d : null, { draft: d });
}

/** «Сызу» мәзірі: пішінді таңдау не сақталған контурды редакциялау. */
function drawMenu(btn) {
  const o = curObj();
  if (!o) { toast(tx('Алдымен нысанды таңдаңыз не қосыңыз.', 'Сначала выберите или добавьте объект.')); return; }
  const r = btn.getBoundingClientRect();
  const go = shape => startMode({ kind: 'draw', shape, draft: { ...o } });
  globalThis.MuraCtx?.openMenu(r.left, r.bottom + 4, esc(objName(o)), [
    { label: tx('Шеңбер', 'Окружность'), hint: tx('орталығы, содан кейін шеті', 'центр, затем край'), icon: IC.circle, run: () => go('circle') },
    { label: tx('Эллипс', 'Эллипс'), hint: tx('орталығы, үлкен осьтің ұшы, кіші осьтің ұшы', 'центр, конец большой оси, конец малой оси'), icon: IC.ellipse, run: () => go('ellipse') },
    { label: tx('Тіктөртбұрыш', 'Прямоугольник'), hint: tx('кесене, сағана там, қоршау: орталығы, ұзын және қысқа қабырға', 'мавзолей, саганатам, ограда: центр, длинная и короткая сторона'), icon: IC.rect || IC.free, run: () => go('rect') },
    { label: tx('Еркін контур', 'Свободный контур'), hint: tx('кемінде үш төбе, тұйықтау', 'не менее трёх вершин, замкнуть'), icon: IC.free, run: () => go('free') },
    'sep',
    { label: tx('Контурды редакциялау', 'Редактировать контур'), hint: tx('орнын, өлшемін, пішінін картада түзету', 'исправить положение, размер, форму на карте'), icon: IC.edit, disabled: !hasContour(o), run: () => startMode({ kind: 'edit', id: o.id }) },
  ]);
}

/* ---------- Сақталған контурды редакциялау: картадағы тұтқалар ---------- */
const handleIcon = (cls = '') => L.divIcon({ className: 'pj-handle' + cls, iconSize: [14, 14], iconAnchor: [7, 7] });
function startEdit() {
  const o = objects.find(x => x.id === mode.id);
  if (!o) return;
  let w = JSON.parse(JSON.stringify(o));      // өңделіп жатқан көшірме
  const preview = L.polygon(contourLL(w), { color: ST.sel, weight: 2, fillColor: ST.fill, fillOpacity: 0.35, interactive: false }).addTo(tempLayer);
  const handles = [];
  const P = () => plane(+w.lat, +w.lon);
  const place = () => {
    preview.setLatLngs(contourLL(w));
    const hs = spots();
    handles.forEach((h, i) => { if (hs[i]) h.setLatLng(hs[i]); });
  };
  // Тұтқалар: 0 — орталық (жылжыту), қалғандары — пішінге қарай
  const spots = () => {
    const p = P(), c = [+w.lat, +w.lon];
    if (w.shape === 'circle') { const r = w.diam / 2, t = ((w.dim_az ?? 90) * Math.PI) / 180; return [c, p.inv(r * Math.sin(t), r * Math.cos(t))]; }
    if (w.shape === 'ellipse' || w.shape === 'rect') {
      const t = (w.ax_az || 0) * Math.PI / 180;
      return [c, p.inv(w.ax_a / 2 * Math.sin(t), w.ax_a / 2 * Math.cos(t)), p.inv(w.ax_b / 2 * Math.cos(t), -w.ax_b / 2 * Math.sin(t))];
    }
    return [c, ...w.pts];
  };
  const save = async () => {
    try { await api('save', { data: JSON.stringify(w) }); await refreshPtrSnapshot(w.id); }
    catch (e) { toast(e.message, true); w = JSON.parse(JSON.stringify(objects.find(x => x.id === o.id) || o)); place(); }
  };
  spots().forEach((ll, i) => {
    const h = L.marker(ll, { icon: handleIcon(i === 0 ? ' is-center' : ''), draggable: true, keyboard: false, zIndexOffset: 1000 }).addTo(tempLayer);
    let start = null;
    h.on('dragstart', () => { start = { w: JSON.parse(JSON.stringify(w)), ll: h.getLatLng() }; });
    h.on('drag', () => {
      const q = h.getLatLng();
      if (i === 0) {
        // Жылжыту: бүкіл контур метрлік жазықтықта ығысады
        const p0 = plane(start.ll.lat, start.ll.lng), dxy = p0.fwd(q.lat, q.lng);
        w.lat = q.lat; w.lon = q.lng;
        if (w.shape === 'free') w.pts = start.w.pts.map(pt => { const a = p0.fwd(pt[0], pt[1]); return p0.inv(a[0] + dxy[0], a[1] + dxy[1]); });
      } else if (w.shape === 'circle') {
        const xy = P().fwd(q.lat, q.lng);
        w.diam = Math.round(2 * Math.hypot(xy[0], xy[1]) * 10) / 10;
      } else if (w.shape === 'ellipse' || w.shape === 'rect') {
        const xy = P().fwd(q.lat, q.lng), len = Math.round(2 * Math.hypot(xy[0], xy[1]) * 10) / 10;
        if (i === 1) { w.ax_a = Math.max(len, w.ax_b); w.ax_az = Math.round(azXY([0, 0], xy) * 10) / 10; }
        else w.ax_b = Math.min(len, w.ax_a);
      } else {
        w.pts[i - 1] = [q.lat, q.lng];
      }
      setHud(objName(w), objMeta(w));
      preview.setLatLngs(contourLL(w));
    });
    h.on('dragend', () => { place(); save(); });
    handles.push(h);
  });
}

/* ======================= Нысан терезесі ======================= */
const fieldIds = { num: 'pjNum', lat: 'pjLat', height: 'pjHeight', diam: 'pjDiam', ax_a: 'pjAxA', ax_b: 'pjAxB', ax_az: 'pjAxAz', pts: 'pjPtsInfo', mark_id: 'pjNum' };
function parseLatLon(a, b) {
  const x = parseOne(a), y = parseOne(b);
  if (x.err || y.err || Math.abs(x.v) > 90 || Math.abs(y.v) > 180) return null;
  return { lat: x.v, lon: y.v };
}

/**
 * Нысанды қосу не өңдеу. o — сақталған нысан (null — жаңа); opts.draft — терезеге қайтқандағы енгізілген мәндер
 * (картадан нүкте таңдау не контур сызудан кейін), opts.focus — 'dims'.
 */
function openObjDialog(o, opts = {}) {
  const m = curMark();
  if (!m) { openMarkPicker(); return; }
  const isNew = !o || !o.id;
  const v = { mark_id: markId, num: nextNum(), kind: 'kurgan', shape: '', height: null, diam: null, ax_a: null, ax_b: null, ax_az: 0, dim_az: 90, lat: '', lon: '', name: '', name_ru: '', note: '', note_ru: '', ...(o || {}), ...(opts.draft || {}) };
  const num = x => (x == null || x === '' ? '' : fmtNum(x, 3));
  const coord = x => (x === '' || x == null ? '' : Number.isFinite(+x) ? (+x).toFixed(7) : String(x));
  const back = dialog('pj-objdlg',
    '<form novalidate>' +
    '<h3>' + svgIc(IC.add) + esc(isNew ? tx('Жаңа нысан', 'Новый объект') : objTitle(v, UI)) + '<small class="pj-dlgsub">' + esc(markName(m)) + '</small></h3>' +
    '<div class="qa-row2"><div class="qa-f"><label for="pjNum">№ <span class="mk-req">*</span></label><input type="text" id="pjNum" name="num" maxlength="12" value="' + esc(v.num) + '"><p class="pj-ferr" data-for="num"></p></div>' +
      '<div class="qa-f"><label for="pjKind">' + tx('Түрі', 'Тип') + '</label><select id="pjKind" name="kind">' + optList(KINDS, v.kind) + '</select></div></div>' +
    '<div class="qa-row2"><div class="qa-f"><label for="pjMat">' + tx('Материалы', 'Материал') + '</label><select id="pjMat" name="material">' + optList(MATERIALS, v.material, tx('— белгісіз —', '— неизвестен —')) + '</select></div>' +
      '<div class="qa-f" data-kind="kulpytas"><label for="pjSub">' + tx('Құлпытастың типі', 'Тип кулпытаса') + '</label><select id="pjSub" name="subtype">' + optList(SUBTYPES, v.subtype, tx('— анықталмаған —', '— не определён —')) + '</select></div>' +
      '<div class="qa-f"><label for="pjState">' + tx('Техникалық жай-күйі', 'Техническое состояние') + '</label><select id="pjState" name="state">' + optList(STATES, v.state, '—') + '</select></div></div>' +
    (I18N.biField ? I18N.biField({ id: 'pjName', name: 'name', label: tx('Атауы (қажет болса)', 'Название (при необходимости)'), kk: v.name, ru: v.name_ru, max: 200 }) : '') +
    '<fieldset class="pj-fs"><legend>' + tx('Тірек нүктесі (WGS 84)', 'Опорная точка (WGS 84)') + '</legend>' +
      '<div class="qa-row2"><div class="qa-f"><label for="pjLat">' + tx('Ендік (N)', 'Широта (N)') + '</label><input type="text" id="pjLat" name="lat" autocomplete="off" spellcheck="false" value="' + esc(v.latText ?? coord(v.lat)) + '"></div>' +
      '<div class="qa-f"><label for="pjLon">' + tx('Бойлық (E)', 'Долгота (E)') + '</label><input type="text" id="pjLon" name="lon" autocomplete="off" spellcheck="false" value="' + esc(v.lonText ?? coord(v.lon)) + '"></div></div>' +
      '<p class="pj-ferr" data-for="lat"></p>' +
      '<div class="pj-btnrow"><button type="button" class="lnk" id="pjFromMap">' + svgIc(IC.crosshair, 15) + ' ' + tx('Картадан таңдау', 'Выбрать на карте') + '</button>' +
      '<button type="button" class="lnk" id="pjFromMark" title="' + tx('Ескерткіштің негізгі координатасын көшіру; сақтар алдында тексеріп, қажет болса түзетіңіз', 'Скопировать основную координату памятника; перед сохранением проверьте и при необходимости исправьте') + '">' + tx('Ескерткіштің негізгі координатасын алу', 'Взять основную координату памятника') + '</button></div>' +
      '<p class="qa-hint" id="pjMarkHint" hidden></p>' +
    '</fieldset>' +
    '<fieldset class="pj-fs" id="pjDimsFs"><legend>' + tx('Контур және өлшемдер (метр)', 'Контур и размеры (метры)') + '</legend>' +
      '<div class="qa-row2"><div class="qa-f"><label for="pjShape">' + tx('Контур түрі', 'Тип контура') + '</label><select id="pjShape" name="shape">' + SHAPES.map(s => '<option value="' + s.v + '"' + (s.v === (v.shape || '') ? ' selected' : '') + '>' + esc(UI === 'ru' ? s.ru : s.kk) + '</option>').join('') + '</select></div>' +
      '<div class="qa-f"><label for="pjHeight">' + tx('Биіктігі, м', 'Высота, м') + '</label><input type="text" id="pjHeight" name="height" inputmode="decimal" placeholder="' + tx('өлшенбеген', 'не измерена') + '" value="' + esc(num(v.height)) + '"><p class="pj-ferr" data-for="height"></p></div></div>' +
      '<div class="qa-row2" data-sh="circle free"><div class="qa-f"><label for="pjDiam">' + tx('Диаметрі, м', 'Диаметр, м') + '</label><input type="text" id="pjDiam" name="diam" inputmode="decimal" value="' + esc(num(v.diam)) + '"><p class="pj-ferr" data-for="diam"></p></div>' +
        '<div class="qa-f" data-sh="circle"><label for="pjDimAz">' + tx('Диаметр сызығының бағыты, °', 'Направление линии диаметра, °') + '</label><input type="text" id="pjDimAz" name="dim_az" inputmode="decimal" value="' + esc(num(v.dim_az ?? 90)) + '"></div></div>' +
      '<div class="qa-row2" data-sh="ellipse rect"><div class="qa-f"><label for="pjAxA" data-ell="' + esc(tx('Үлкен ось, м', 'Большая ось, м')) + '" data-rect="' + esc(tx('Ұзындығы, м', 'Длина, м')) + '">' + tx('Үлкен ось, м', 'Большая ось, м') + '</label><input type="text" id="pjAxA" name="ax_a" inputmode="decimal" value="' + esc(num(v.ax_a)) + '"><p class="pj-ferr" data-for="ax_a"></p></div>' +
        '<div class="qa-f"><label for="pjAxB" data-ell="' + esc(tx('Кіші ось, м', 'Малая ось, м')) + '" data-rect="' + esc(tx('Ені, м', 'Ширина, м')) + '">' + tx('Кіші ось, м', 'Малая ось, м') + '</label><input type="text" id="pjAxB" name="ax_b" inputmode="decimal" value="' + esc(num(v.ax_b)) + '"><p class="pj-ferr" data-for="ax_b"></p></div>' +
        '<div class="qa-f"><label for="pjAxAz" data-ell="' + esc(tx('Үлкен осьтің азимуты, °', 'Азимут большой оси, °')) + '" data-rect="' + esc(tx('Ұзын қабырғаның азимуты, °', 'Азимут длинной стороны, °')) + '">' + tx('Үлкен осьтің азимуты, °', 'Азимут большой оси, °') + '</label><input type="text" id="pjAxAz" name="ax_az" inputmode="decimal" value="' + esc(num(v.ax_az ?? 0)) + '"><p class="pj-ferr" data-for="ax_az"></p></div></div>' +
      '<div data-sh="free"><p class="qa-hint" id="pjPtsInfo"></p><p class="pj-ferr" data-for="pts"></p>' +
        '<div class="qa-row2"><div class="qa-f"><label for="pjDimI">' + tx('Өлшем сызығы: 1-нүкте', 'Размерная линия: точка 1') + '</label><select id="pjDimI"></select></div>' +
        '<div class="qa-f"><label for="pjDimJ">' + tx('2-нүкте', 'точка 2') + '</label><select id="pjDimJ"></select></div></div><p class="qa-hint" id="pjDimLen"></p></div>' +
      '<p class="qa-hint" data-sh="circle ellipse rect free">' + tx('Шеңбер, эллипс және тіктөртбұрыш енгізілген өлшемдерден құрылады. Өлшемді енгізіңіз не контурды картада сызыңыз:', 'Окружность, эллипс и прямоугольник строятся по введённым размерам. Введите размеры или начертите контур на карте:') +
        ' <button type="button" class="lnk" id="pjDrawHere">' + svgIc(IC.draw, 15) + ' ' + tx('Картада сызу', 'Начертить на карте') + '</button></p>' +
      '<p class="qa-hint" data-sh="">' + tx('Контуры жоқ нысан жалпы жоспарда нүкте мен нөмір арқылы көрсетіледі; жеке сызба үшін контур қажет.', 'Объект без контура показывается на общем плане точкой и номером; для индивидуального чертежа нужен контур.') + '</p>' +
    '</fieldset>' +
    (I18N.biField ? I18N.biField({ id: 'pjNote', name: 'note', label: tx('Ескертпе', 'Примечание'), kk: v.note, ru: v.note_ru, max: 3000, rows: 2 }) : '') +
    '<p class="mk-err" id="pjErr" role="alert" hidden></p>' +
    '<div class="qa-dlg-btns">' + (isNew ? '' : '<button type="button" class="lnk lnk--danger" id="pjDel">' + tx('Өшіру', 'Удалить') + '</button>') +
      '<span class="mk-sp"></span><button type="button" class="btn btn--ghost btn--sm" data-x>' + tx('Бас тарту', 'Отмена') + '</button>' +
      '<button type="submit" class="btn btn--primary btn--sm">' + tx('Сақтау', 'Сохранить') + '</button></div>' +
    '</form>');
  const form = back.querySelector('form'), F = form.elements;
  const ferr = (k, t) => { const el = back.querySelector('.pj-ferr[data-for="' + k + '"]'); if (el) { el.textContent = t || ''; el.hidden = !t; } const inp = $(fieldIds[k]); if (inp && inp.classList) inp.classList.toggle('is-bad', !!t); };
  const clearErr = () => { back.querySelectorAll('.pj-ferr').forEach(el => { el.textContent = ''; el.hidden = true; }); back.querySelectorAll('.is-bad').forEach(el => el.classList.remove('is-bad')); const g = back.querySelector('#pjErr'); g.hidden = true; };
  clearErr();
  let pts = Array.isArray(v.pts) ? v.pts.slice() : null;
  const paintShape = () => {
    const s = F.shape.value;
    back.querySelectorAll('label[data-rect]').forEach(l => { l.textContent = s === 'rect' ? l.dataset.rect : l.dataset.ell; });
    back.querySelectorAll('[data-kind]').forEach(el => { el.hidden = F.kind.value !== el.dataset.kind; });
    back.querySelectorAll('[data-sh]').forEach(el => { el.hidden = !el.dataset.sh.split(' ').includes(s) && !(el.dataset.sh === '' && s === ''); });
    const info = back.querySelector('#pjPtsInfo');
    info.textContent = pts && pts.length >= 3 ? tx('Контурдың төбелері: ', 'Вершин контура: ') + pts.length : tx('Контур әлі сызылмаған — «Картада сызу».', 'Контур ещё не начерчен — «Начертить на карте».');
    const opt = sel => '<option value="">—</option>' + (pts || []).map((_, i) => '<option value="' + i + '"' + (sel === i ? ' selected' : '') + '>' + (i + 1) + '</option>').join('');
    const dm = Array.isArray(v.dim) ? v.dim : [];
    if (!back.querySelector('#pjDimI').options.length || back.querySelector('#pjDimI').options.length !== (pts || []).length + 1) {
      back.querySelector('#pjDimI').innerHTML = opt(dm[0]); back.querySelector('#pjDimJ').innerHTML = opt(dm[1]);
    }
    paintDimLen();
  };
  const paintDimLen = () => {
    const i = back.querySelector('#pjDimI').value, j = back.querySelector('#pjDimJ').value, el = back.querySelector('#pjDimLen');
    if (pts && i !== '' && j !== '' && i !== j) { const P = plane(pts[0][0], pts[0][1]); el.textContent = tx('Арақашықтық: ', 'Расстояние: ') + fmtNum(dist2(P.fwd(...pts[+i]), P.fwd(...pts[+j])), 2) + ' м'; }
    else el.textContent = tx('Өлшем сызығы қажет болса, контурдың екі төбесін таңдаңыз (нөмірлері картадағы сызу ретімен).', 'Если нужна размерная линия, выберите две вершины контура (номера — в порядке черчения).');
  };
  F.shape.addEventListener('change', paintShape);
  F.kind.addEventListener('change', paintShape);
  back.querySelector('#pjDimI').addEventListener('change', paintDimLen);
  back.querySelector('#pjDimJ').addEventListener('change', paintDimLen);
  paintShape();

  /** Терезедегі ағымдағы мәндер (тексерусіз) — картаға шыққанда сақталады. */
  const collect = () => {
    const ll = parseLatLon(F.lat.value, F.lon.value);
    const di = back.querySelector('#pjDimI').value, dj = back.querySelector('#pjDimJ').value;
    return {
      ...v, id: v.id, mark_id: markId, num: F.num.value.trim(), kind: F.kind.value, shape: F.shape.value,
      name: F.name ? F.name.value : v.name, name_ru: F.name_ru ? F.name_ru.value : v.name_ru, note: F.note ? F.note.value : v.note, note_ru: F.note_ru ? F.note_ru.value : v.note_ru,
      lat: ll ? ll.lat : F.lat.value, lon: ll ? ll.lon : F.lon.value, latText: F.lat.value, lonText: F.lon.value,
      material: F.material.value, subtype: F.kind.value === 'kulpytas' ? F.subtype.value : '', state: F.state.value,
      height: parseNum(F.height.value), diam: parseNum(F.diam.value), ax_a: parseNum(F.ax_a.value), ax_b: parseNum(F.ax_b.value), ax_az: parseNum(F.ax_az.value), dim_az: parseNum(F.dim_az.value),
      pts, dim: di !== '' && dj !== '' && di !== dj ? [+di, +dj] : null,
    };
  };
  const reopen = d => openObjDialog(o, { ...opts, draft: d });
  back.querySelector('#pjFromMap').addEventListener('click', () => {
    const d = collect();
    closeDialog();
    startMode({ kind: 'pickAnchor', after: p => reopen(p ? { ...d, lat: p.lat, lon: p.lon, latText: undefined, lonText: undefined } : d) });
  });
  back.querySelector('#pjFromMark').addEventListener('click', () => {
    F.lat.value = (+m.lat).toFixed(7); F.lon.value = (+m.lon).toFixed(7);
    const h = back.querySelector('#pjMarkHint');
    h.hidden = false;
    h.textContent = tx('Ескерткіштің негізгі координатасы көшірілді. Сақтар алдында тексеріп, қажет болса түзетіңіз — ескерткіштің өз координатасы өзгермейді.',
      'Скопирована основная координата памятника. Перед сохранением проверьте и при необходимости исправьте — координата самого памятника не меняется.');
  });
  back.querySelector('#pjDrawHere').addEventListener('click', () => {
    const d = collect();
    const shape = d.shape || 'circle';
    closeDialog();
    startMode({ kind: 'draw', shape, draft: { ...d, shape }, after: () => reopen(d) });
  });
  back.querySelector('[data-x]').addEventListener('click', closeDialog);
  back.querySelector('#pjDel')?.addEventListener('click', () => { closeDialog(); removeObj(o); });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    clearErr();
    const d = collect();
    // Сақтар алдындағы тексеріс (сервер де тексереді): қате өріс көрсетіледі, қалған енгізілгені сақталады
    const errs = [];
    const bad = (k, t) => { errs.push(k); ferr(k, t); };
    if (!d.num) bad('num', tx('Нөмірін енгізіңіз.', 'Введите номер.'));
    else if (markObjects().some(x => x.id !== d.id && x.num.toLocaleLowerCase() === d.num.toLocaleLowerCase())) bad('num', tx('Бұл нөмір бұл ескерткіште бар.', 'Этот номер уже есть в памятнике.'));
    if (!parseLatLon(F.lat.value, F.lon.value)) bad('lat', tx('Координата дұрыс емес (мыс. 50.412345, 50°24′44,4″).', 'Неверная координата (напр. 50.412345, 50°24′44,4″).'));
    if (Number.isNaN(d.height) || d.height < 0) bad('height', tx('Биіктік — нөл не оң сан (өлшенбесе — бос қалдырыңыз).', 'Высота — ноль или положительное число (если не измерена — оставьте пустым).'));
    const posErr = (k, req) => { const x = d[k]; if (x === null ? req : !(x > 0)) bad(k, tx('Нөлден үлкен сан енгізіңіз.', 'Введите число больше нуля.')); };
    if (d.shape === 'circle') posErr('diam', true);
    if (d.shape === 'free' && d.diam !== null) posErr('diam', false);
    if (d.shape === 'ellipse' || d.shape === 'rect') {
      posErr('ax_a', true); posErr('ax_b', true);
      if (d.shape === 'ellipse' && d.ax_a > 0 && d.ax_b > d.ax_a) bad('ax_b', tx('Кіші ось үлкен осьтен ұзын болмауы керек.', 'Малая ось не может быть длиннее большой.'));
      if (Number.isNaN(d.ax_az)) bad('ax_az', tx('Азимут дұрыс емес.', 'Неверный азимут.'));
    }
    if (d.shape === 'free') {
      if (!pts || new Set(pts.map(p => p.join(','))).size < 3) bad('pts', tx('Еркін контурда кемінде үш бөлек төбе болуы керек — «Картада сызу».', 'В свободном контуре должно быть не менее трёх различных вершин — «Начертить на карте».'));
      else { const P = plane(pts[0][0], pts[0][1]); if (selfIntersects(pts.map(p => P.fwd(p[0], p[1])))) bad('pts', tx('Контур өзімен қиылысады.', 'Контур самопересекается.')); }
    }
    if (errs.length) { $(fieldIds[errs[0]])?.focus?.(); return; }
    const rec = { ...d };
    delete rec.latText; delete rec.lonText;
    if (rec.shape !== 'free') { rec.pts = null; rec.dim = null; }
    try {
      const j = await api('save', { data: JSON.stringify(rec) });
      closeDialog();
      select(j.id, { fit: isNew || !!opts.draft });
      await refreshPtrSnapshot(j.id);
      toast(tx('№' + rec.num + ' сақталды.', 'Объект №' + rec.num + ' сохранён.'));
    } catch (err) {
      if (err.field && fieldIds[err.field]) ferr(err.field, err.message);
      else { const g = back.querySelector('#pjErr'); g.textContent = err.message; g.hidden = false; }
    }
  });
  if (opts.focus === 'dims') { back.querySelector('#pjDimsFs').scrollIntoView({ block: 'start' }); (F.shape.value === 'ellipse' || F.shape.value === 'rect' ? F.ax_a : F.shape.value ? F.diam : F.height).focus(); }
  else F.num.focus();
}

/* ======================= Елді мекенге бағыттауыш ======================= */
const ptrName = (p, l) => (l === 'ru' ? p.ptr_name_ru || p.ptr_name : p.ptr_name || p.ptr_name_ru);
const placeTitle = (pl, l) => (l === 'ru' ? pl.name_ru || pl.name : pl.name || pl.name_ru) || '';
/** Бастапқы нүктенің координатасы: ескерткіштің негізгі координатасы не таңдалған нысан. */
function originOf(fromId) {
  const o = fromId ? objects.find(x => x.id === fromId) : null;
  const m = curMark();
  return o ? { lat: +o.lat, lon: +o.lon } : { lat: +m.lat, lon: +m.lon };
}
/** Нысан жылжығанда бағыттауыштың сақталған (есептелген) мәндері жаңарады; қолмен түзетілгендері өзгермейді. */
async function refreshPtrSnapshot(objId) {
  const p = curPlan();
  if (!p || !p.ptr || (objId && p.ptr_from !== objId)) return;
  const o = originOf(p.ptr_from), r = inverse(o.lat, o.lon, p.ptr.lat, p.ptr.lon);
  if (Math.abs((p.ptr_dist ?? -1) - r.dist) < 0.01 && Math.abs((p.ptr_az ?? -1) - r.az) < 1e-6) return;
  try { await savePlan({ ptr_o_lat: o.lat, ptr_o_lon: o.lon, ptr_az: r.az, ptr_dist: r.dist }); } catch (e) { /* келесі сақтауда жаңарады */ }
}

function openPtrDialog(draft, after) {
  const m = curMark();
  if (!m) { openMarkPicker(); return; }
  const p = curPlan() || {};
  const v = { ptr: p.ptr || null, ptr_name: p.ptr_name || '', ptr_name_ru: p.ptr_name_ru || '', ptr_name_man: !!p.ptr_name_man, ptr_from: p.ptr_from || '',
    ptr_az_man: p.ptr_az_man ?? null, ptr_dist_man: p.ptr_dist_man ?? null, ...(draft || {}) };
  const o0 = originOf(v.ptr_from);
  const pls = places().map(pl => ({ pl, d: inverse(o0.lat, o0.lon, pl.lat, pl.lon).dist }))
    .sort((a, b) => (a.pl.kind === 'settlement' ? 0 : 1) - (b.pl.kind === 'settlement' ? 0 : 1) || a.d - b.d).slice(0, 200);
  const curPlaceId = v.ptr && v.ptr.place_id;
  const back = dialog('pj-ptrdlg',
    '<form novalidate><h3>' + svgIc(IC.ptr) + tx('Елді мекенге бағыттауыш', 'Указатель на населённый пункт') + '<small class="pj-dlgsub">' + esc(markName(m)) + '</small></h3>' +
    '<div class="qa-f"><label for="pjPl">' + tx('Елді мекен', 'Населённый пункт') + '</label><div class="rt-pick"><select id="pjPl">' +
      '<option value="">' + tx('— таңдалмаған —', '— не выбран —') + '</option>' +
      (v.ptr && !curPlaceId ? '<option value="pt" selected>' + tx('Картадан таңдалған нүкте', 'Точка, выбранная на карте') + ' (' + (+v.ptr.lat).toFixed(5) + ', ' + (+v.ptr.lon).toFixed(5) + ')</option>' : '') +
      pls.map(({ pl, d }) => '<option value="' + esc(pl.id) + '"' + (pl.id === curPlaceId ? ' selected' : '') + '>' + esc(placeTitle(pl, UI) || '?') + (pl.kind !== 'settlement' ? ' (' + esc(globalThis.__places?.kindLabel?.(pl.kind) || '') + ')' : '') + ' · ' + fmtDist(d) + '</option>').join('') +
    '</select><button type="button" class="qa-tbtn" id="pjPlMap" aria-label="' + tx('Картадан таңдау', 'Выбрать на карте') + '" title="' + tx('Картадан таңдау: елді мекенді не кез келген нүктені басыңыз', 'Выбрать на карте: щёлкните населённый пункт или любую точку') + '">' + svgIc(IC.crosshair) + '</button></div>' +
    (pls.length ? '' : '<p class="qa-hint">' + tx('Жобада «Өзге нысандар» әлі жоқ — елді мекенді картадан нүкте ретінде таңдап, атауын енгізіңіз.', 'В проекте ещё нет «Прочих объектов» — выберите населённый пункт на карте точкой и введите название.') + '</p>') + '</div>' +
    (I18N.biField ? I18N.biField({ id: 'pjPtrName', name: 'ptr_name', label: tx('Жоспардағы жазу', 'Надпись на плане'), kk: v.ptr_name, ru: v.ptr_name_ru, max: 200, ph: 'Ақжайық ауылы', phRu: 'село Акжайык' }) : '') +
    '<div class="qa-f"><label for="pjFrom">' + tx('Бастапқы нүкте', 'Начальная точка') + '</label><select id="pjFrom"><option value="">' + tx('Ескерткіштің негізгі координатасы', 'Основная координата памятника') + '</option>' +
      markObjects().map(o => '<option value="' + esc(o.id) + '"' + (o.id === v.ptr_from ? ' selected' : '') + '>' + esc(objName(o)) + '</option>').join('') + '</select></div>' +
    '<p class="pj-auto" id="pjAuto"></p>' +
    '<div class="qa-row2"><div class="qa-f"><label for="pjAzM">' + tx('Азимут, ° (қолмен)', 'Азимут, ° (вручную)') + '</label><input type="text" id="pjAzM" inputmode="decimal" value="' + esc(v.ptr_az_man == null ? '' : fmtNum(v.ptr_az_man, 3)) + '"><p class="pj-ferr" data-for="az"></p></div>' +
      '<div class="qa-f"><label for="pjDistM">' + tx('Қашықтық, км (қолмен)', 'Расстояние, км (вручную)') + '</label><input type="text" id="pjDistM" inputmode="decimal" value="' + esc(v.ptr_dist_man == null ? '' : fmtNum(v.ptr_dist_man / 1000, 3)) + '"><p class="pj-ferr" data-for="dist"></p></div></div>' +
    '<p class="qa-hint">' + tx('Бос өріс — автоматты мән. Қолмен түзету картадағы нүктелердің координатасын өзгертпейді.', 'Пустое поле — автоматическое значение. Ручная правка не меняет координаты точек на карте.') +
      ' <button type="button" class="lnk" id="pjAutoReset">' + tx('Автоматты мәнге қайтару', 'Вернуть автоматическое значение') + '</button></p>' +
    '<div class="qa-dlg-btns">' + (p.ptr ? '<button type="button" class="lnk lnk--danger" id="pjPtrDel">' + tx('Бағыттауышты өшіру', 'Удалить указатель') + '</button>' : '') +
      '<span class="mk-sp"></span><button type="button" class="btn btn--ghost btn--sm" data-x>' + tx('Бас тарту', 'Отмена') + '</button>' +
      '<button type="submit" class="btn btn--primary btn--sm">' + tx('Сақтау', 'Сохранить') + '</button></div></form>', { onCancel: () => after?.(false) });
  const form = back.querySelector('form');
  const sel = back.querySelector('#pjPl'), from = back.querySelector('#pjFrom');
  const nk = back.querySelector('#pjPtrName'), nr = back.querySelector('#pjPtrNameRu');
  let ptr = v.ptr, nameMan = v.ptr_name_man;
  const setFromPlace = pl => {
    ptr = { lat: pl.lat, lon: pl.lon, place_id: pl.id };
    if (!nameMan && nk && nr) { nk.value = pl.name || ''; nr.value = pl.name_ru || ''; }
  };
  const paintAuto = () => {
    const el = back.querySelector('#pjAuto');
    if (!ptr) { el.textContent = tx('Елді мекенді таңдаңыз.', 'Выберите населённый пункт.'); return; }
    const o = originOf(from.value), r = inverse(o.lat, o.lon, ptr.lat, ptr.lon);
    el.innerHTML = tx('Есептелген: азимут ', 'Рассчитано: азимут ') + '<b>' + fmtNum(r.az, 1) + '°</b>, ' + tx('геодезиялық қашықтық ', 'геодезическое расстояние ') + '<b>' + fmtDist(r.dist) + '</b>';
    back.querySelector('#pjAzM').placeholder = fmtNum(r.az, 1);
    back.querySelector('#pjDistM').placeholder = fmtNum(r.dist / 1000, 1);
  };
  sel.addEventListener('change', () => { const pl = places().find(x => x.id === sel.value); if (pl) setFromPlace(pl); else if (!sel.value) ptr = null; paintAuto(); });
  from.addEventListener('change', paintAuto);
  for (const el of [nk, nr]) el?.addEventListener('input', () => { nameMan = true; });
  paintAuto();
  const collect = () => ({ ptr, ptr_name: nk ? nk.value : v.ptr_name, ptr_name_ru: nr ? nr.value : v.ptr_name_ru, ptr_name_man: nameMan, ptr_from: from.value,
    ptr_az_man: parseNum(back.querySelector('#pjAzM').value), ptr_dist_man: (x => (x == null || Number.isNaN(x) ? x : x * 1000))(parseNum(back.querySelector('#pjDistM').value)) });
  back.querySelector('#pjPlMap').addEventListener('click', () => {
    const d = collect();
    closeDialog();
    startMode({ kind: 'pickPtr', after: pt => {
      if (!pt) { openPtrDialog(d, after); return; }
      const nd = { ...d, ptr: { lat: pt.lat, lon: pt.lon, place_id: pt.place ? pt.place.id : '' } };
      if (pt.place && !d.ptr_name_man) { nd.ptr_name = pt.place.name || ''; nd.ptr_name_ru = pt.place.name_ru || ''; }
      if (!pt.place && !d.ptr_name_man) { nd.ptr_name = ''; nd.ptr_name_ru = ''; }
      openPtrDialog(nd, after);
    } });
  });
  back.querySelector('#pjAutoReset').addEventListener('click', () => {
    back.querySelector('#pjAzM').value = ''; back.querySelector('#pjDistM').value = '';
    nameMan = false;
    const pl = ptr && ptr.place_id ? places().find(x => x.id === ptr.place_id) : null;
    if (pl && nk && nr) { nk.value = pl.name || ''; nr.value = pl.name_ru || ''; }
    paintAuto();
  });
  back.querySelector('[data-x]').addEventListener('click', () => { closeDialog(); after?.(false); });
  back.querySelector('#pjPtrDel')?.addEventListener('click', async () => {
    closeDialog();
    try { await savePlan({ ptr: null, ptr_name: '', ptr_name_ru: '', ptr_name_man: false, ptr_from: '', ptr_az_man: null, ptr_dist_man: null, ptr_az: null, ptr_dist: null }); toast(tx('Бағыттауыш өшірілді.', 'Указатель удалён.')); }
    catch (e) { toast(e.message, true); }
    after?.(true);
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    back.querySelectorAll('.pj-ferr').forEach(el => { el.textContent = ''; el.hidden = true; });
    const d = collect();
    if (!d.ptr) { toast(tx('Елді мекенді таңдаңыз.', 'Выберите населённый пункт.'), true); return; }
    if (Number.isNaN(d.ptr_az_man)) { const el = back.querySelector('.pj-ferr[data-for="az"]'); el.textContent = tx('Азимут дұрыс емес.', 'Неверный азимут.'); el.hidden = false; return; }
    if (Number.isNaN(d.ptr_dist_man) || d.ptr_dist_man < 0) { const el = back.querySelector('.pj-ferr[data-for="dist"]'); el.textContent = tx('Қашықтық — нөл не оң сан.', 'Расстояние — ноль или положительное число.'); el.hidden = false; return; }
    if (!String(d.ptr_name).trim() && !String(d.ptr_name_ru).trim()) { toast(tx('Жоспардағы жазуды (елді мекен атауын) енгізіңіз.', 'Введите надпись на плане (название населённого пункта).'), true); nk?.focus(); return; }
    const o = originOf(d.ptr_from), r = inverse(o.lat, o.lon, d.ptr.lat, d.ptr.lon);
    try {
      await savePlan({ ...d, ptr_o_lat: o.lat, ptr_o_lon: o.lon, ptr_az: r.az, ptr_dist: r.dist });
      closeDialog();
      toast(tx('Бағыттауыш сақталды.', 'Указатель сохранён.'));
      after?.(true);
    } catch (err) { toast(err.message, true); }
  });
}

/* ======================= Құжат: контекст, алдын ала қарау, PDF ======================= */
/** Құжат тіліндегі мәтіндер (ескерткіш атауы, облыс, аудан, бағыттауыш жазуы). */
function ctxFor(lang) {
  const m = curMark() || { lat: 0, lon: 0 };
  const ru = lang === 'ru';
  const ob = m.oblast || '', di = m.district || '';
  const title = [I18N.field(m, 'name', lang) || '', ru && REG ? REG.ru(ob) : ob, ru && REG ? REG.ru(di, ob) : di].filter(Boolean);
  const p = curPlan();
  return { mark: m, objects: markObjects(), plan: p, lang, names: { title, ptr: p ? ptrName(p, lang) : '' } };
}
/** Экспорт алдындағы ескертулер: аударма жоқ өрістер, тек нүкте болып көрсетілетін нысандар. */
function warnings(lang, kind) {
  const m = curMark(), p = curPlan(), out = [];
  if (lang === 'ru' && !String(m.name_ru || '').trim()) out.push(tx('Ескерткіштің орысша атауы жоқ — қазақшасы шығады.', 'Нет русского названия памятника — будет выведено казахское.'));
  if (lang === 'kk' && !String(m.name || '').trim()) out.push(tx('Ескерткіштің қазақша атауы жоқ — орысшасы шығады.', 'Нет казахского названия памятника — будет выведено русское.'));
  if (p && p.ptr && lang === 'ru' && !String(p.ptr_name_ru || '').trim()) out.push(tx('Бағыттауыш жазуының орысша нұсқасы жоқ.', 'Нет русского варианта надписи указателя.'));
  if (p && p.ptr && lang === 'kk' && !String(p.ptr_name || '').trim()) out.push(tx('Бағыттауыш жазуының қазақша нұсқасы жоқ.', 'Нет казахского варианта надписи указателя.'));
  const pts = markObjects().filter(o => !hasContour(o));
  const other = lang === 'ru' ? 'note' : 'note_ru', own = lang === 'ru' ? 'note_ru' : 'note';
  const noNote = isStage2(markObjects()) && kind !== 'detail' ? markObjects().filter(o => String(o[other] || '').trim() && !String(o[own] || '').trim()) : [];
  if (noNote.length) out.push(tx('Ескертпенің ' + (lang === 'ru' ? 'орысша' : 'қазақша') + ' нұсқасы жоқ (екінші тілдегісі шығады): ', 'Нет ' + (lang === 'ru' ? 'русского' : 'казахского') + ' варианта примечания (будет выведен другой): ') + noNote.map(o => '№' + o.num).join(', '));
  if (pts.length && kind !== 'detail') out.push(tx('Тек жалпы жоспарда нүкте болып көрсетіледі (контуры жоқ): ', 'Будут показаны на общем плане только точкой (нет контура): ') + pts.map(o => '№' + o.num).join(', '));
  return out;
}

let prev = null;    // алдын ала қарау: { back, kind, id, lang }
function closePreview() {
  if (!prev) return;
  prev.back.remove();
  document.removeEventListener('keydown', prev.onKey, true);
  prev = null;
}
function openPreview(o = {}) {
  if (!curMark() || !markObjects().length) { toast(tx('Алдымен нысан қосыңыз.', 'Сначала добавьте объект.'), true); return; }
  closePreview();
  const back = document.createElement('div');
  back.className = 'pj-prev-back';
  back.innerHTML = '<div class="pj-prev" role="dialog" aria-modal="true" aria-label="' + tx('Алдын ала қарау', 'Предпросмотр') + '">' +
    '<div class="pj-sheetwrap"><div class="pj-sheet" id="pjSheet"></div><button type="button" class="pj-pencil" id="pjPencil" hidden title="' + tx('Бағыттауышты түзету: атауы, азимуты, қашықтығы', 'Исправить указатель: название, азимут, расстояние') + '" aria-label="' + tx('Бағыттауышты түзету', 'Исправить указатель') + '">' + svgIc(IC.pencil, 16) + '</button></div>' +
    '<aside class="pj-side"><h3>' + svgIc(IC.eye) + tx('Алдын ала қарау', 'Предпросмотр') + '</h3>' +
      '<div class="qa-f"><label for="pjPvPage">' + tx('Бет', 'Лист') + '</label><select id="pjPvPage"></select></div>' +
      '<div class="qa-f"><label for="pjPvScale">' + tx('Масштаб', 'Масштаб') + '</label><select id="pjPvScale"></select></div>' +
      '<div class="qa-f"><label for="pjPvLang">' + tx('Құжат тілі', 'Язык документа') + '</label><select id="pjPvLang"><option value="kk">Қазақша</option><option value="ru">Русский</option></select></div>' +
      '<div id="pjPaper"></div>' +
      '<div class="pj-pvwarn" id="pjPvWarn" role="status"></div>' +
      '<details class="pj-expl-set" id="pjExplBox" hidden><summary>' + tx('Экспликация баптаулары', 'Настройки экспликации') + '</summary><div id="pjExplSet"></div></details>' +
      '<p class="qa-hint">' + tx('Белгілер мен өлшем жазуларын тінтуірмен сүйреп жылжытуға болады — орны сақталады. Контурлардың орны деректерге сай қалады.', 'Подписи и размерные надписи можно перетаскивать мышью — положение сохраняется. Положение контуров соответствует данным.') + '</p>' +
      '<p class="qa-hint">' + tx('Басып шығарғанда «Нақты өлшем» (100%) режимін таңдаңыз: «Бетке сыйдыру» масштабты өзгертеді.', 'При печати выберите «Фактический размер» (100%): «По размеру страницы» меняет масштаб.') + '</p>' +
      '<div class="pj-side-btns"><button type="button" class="btn btn--primary btn--sm" id="pjPvPdf">' + tx('Осы бетті PDF-ке', 'Этот лист в PDF') + '</button>' +
        '<button type="button" class="btn btn--steppe btn--sm" id="pjPvAll">' + tx('Біріктірілген PDF', 'Объединённый PDF') + '</button>' +
        '<button type="button" class="btn btn--ghost btn--sm" data-x>' + tx('Жабу', 'Закрыть') + '</button></div>' +
    '</aside></div>';
  document.body.appendChild(back);
  const p = curPlan();
  prev = { back, kind: o.kind || 'general', id: o.id || '', idx: 0, lang: (p && p.lang) || I18N.docLang() };
  prev.onKey = e => { if (e.key === 'Escape' && !dlg) { e.preventDefault(); e.stopPropagation(); closePreview(); } };
  document.addEventListener('keydown', prev.onKey, true);
  back.querySelector('[data-x]').addEventListener('click', closePreview);
  back.querySelector('#pjPvLang').value = prev.lang;
  back.querySelector('#pjPvPage').addEventListener('change', e => {
    const v = e.target.value;
    if (v === 'general') { prev.kind = 'general'; prev.id = ''; prev.idx = 0; }
    else if (v.startsWith('more:')) { prev.kind = 'general'; prev.id = ''; prev.idx = +v.slice(5); }
    else { prev.kind = 'detail'; prev.id = v; prev.idx = 0; }
    paintPreview();
  });
  back.querySelector('#pjExplSet').addEventListener('change', e => saveExpl(e.target));
  back.querySelector('#pjPaper').addEventListener('change', () => savePaper(back.querySelector('#pjPaper'), paintPreview));
  back.querySelector('#pjExplSet').addEventListener('click', e => { const b = e.target.closest('button[data-ex]'); if (b) saveExpl(b); });
  back.querySelector('#pjPvScale').addEventListener('change', async e => {
    const s = +e.target.value;
    try { await savePlan(prev.kind === 'general' ? { scale_general: s } : { scale_detail: s }); } catch (err) { toast(err.message, true); }
    paintPreview();
  });
  back.querySelector('#pjPvLang').addEventListener('change', async e => {
    prev.lang = e.target.value;
    try { await savePlan({ lang: prev.lang }); } catch (err) { toast(err.message, true); }
    paintPreview();
  });
  back.querySelector('#pjPencil').addEventListener('click', () => openPtrDialog(null, () => { if (prev) paintPreview(); }));
  back.querySelector('#pjPvPdf').addEventListener('click', () => exportPdf(prev.kind === 'general' ? 'general' : 'detail', prev.lang, prev.id));
  back.querySelector('#pjPvAll').addEventListener('click', () => exportPdf('combined', prev.lang));
  new ResizeObserver(() => placePencil()).observe(back.querySelector('#pjSheet'));
  paintPreview();
}
let lastPage = null;
function paintPreview() {
  if (!prev) return;
  const b = prev.back, p = curPlan() || {};
  const contour = markObjects().filter(hasContour);
  if (prev.kind === 'detail' && !contour.some(o => o.id === prev.id)) { prev.kind = 'general'; prev.id = ''; }
  const o = prev.kind === 'detail' ? objects.find(x => x.id === prev.id) : null;
  const want = prev.kind === 'general' ? (p.scale_general || 0) : (p.scale_detail || 0);
  const pg = renderPage(ctxFor(prev.lang), prev.kind, o, want, { editor: true });
  lastPage = pg;
  if (prev.idx > pg.more.length) prev.idx = 0;
  b.querySelector('#pjPvPage').innerHTML = '<option value="general">' + tx('Жалпы жоспар', 'Общий план') + '</option>' +
    pg.more.map((_, i) => '<option value="more:' + (i + 1) + '">' + tx('Экспликация', 'Экспликация') + ' — ' + (i + 2) + tx('-бет', '-й лист') + '</option>').join('') +
    contour.map(o => '<option value="' + esc(o.id) + '">' + esc(objName(o)) + ' — ' + tx('жеке жоспар', 'индивидуальный план') + '</option>').join('');
  b.querySelector('#pjPvPage').value = prev.kind === 'general' ? (prev.idx ? 'more:' + prev.idx : 'general') : prev.id;
  b.querySelector('#pjPvScale').innerHTML = '<option value="0">' + tx('Автоматты', 'Автоматически') + ' (1:' + pg.auto + ')</option>' +
    SCALES.map(s => '<option value="' + s + '">1:' + s + '</option>').join('');
  b.querySelector('#pjPvScale').value = String(want);
  b.querySelector('#pjSheet').innerHTML = prev.idx ? pg.more[prev.idx - 1] : pg.svg;
  b.querySelector('#pjPaper').innerHTML = paperHtml(p.paper);
  paintExplSet();
  const w = warnings(prev.lang, prev.kind);
  const box = b.querySelector('#pjPvWarn');
  box.innerHTML = (!pg.fits ? '<p class="pj-bad">' + tx('Сызба 1:' + pg.scale + ' масштабында бетке сыймайды.', 'Чертёж в масштабе 1:' + pg.scale + ' не помещается на лист.') +
      ' <button type="button" class="lnk" id="pjUseScale">' + tx('1:' + pg.suggest + ' масштабын қолдану', 'Применить масштаб 1:' + pg.suggest) + '</button></p>' : '') +
    (pg.warn.includes('expl-width') ? '<p class="pj-bad">' + tx('Экспликация бағандарының ені бетке сыймайды — кішірейтілді. Енін азайтыңыз не «авто» қалдырыңыз.', 'Ширина столбцов экспликации не помещается на лист — уменьшена. Уменьшите ширину или оставьте «авто».') + '</p>' : '') +
    (pg.warn.includes('arrow-space') ? '<p>' + tx('Бағыттауышқа орын аз — белгілердің орнын не масштабты өзгертіңіз.', 'Мало места для указателя — измените положение подписей или масштаб.') + '</p>' : '') +
    w.map(x => '<p>' + esc(x) + '</p>').join('');
  b.querySelector('#pjUseScale')?.addEventListener('click', async () => {
    try { await savePlan(prev.kind === 'general' ? { scale_general: pg.suggest } : { scale_detail: pg.suggest }); } catch (err) { toast(err.message, true); }
    paintPreview();
  });
  bindDrag(b.querySelector('#pjSheet svg'));
  placePencil();
}
/** Қағаз өлшемі: A5…A0 (тік / жатық) не өз өлшемі (мм) — жоспардың барлық беті (жалпы, жалғасы, жеке) осы өлшемде. */
function paperHtml(pp) {
  const z = paperSize(pp), custom = pp && pp.size === 'custom';
  return '<div class="pj-exgrid pj-paper">' +
    '<label>' + tx('Қағаз өлшемі', 'Формат листа') + '<select data-pp="size">' +
      PAPERS.map(x => '<option value="' + x.v + '"' + (!custom && z.name === x.v ? ' selected' : '') + '>' + x.v + ' — ' + x.w + ' × ' + x.h + ' мм</option>').join('') +
      '<option value="custom"' + (custom ? ' selected' : '') + '>' + tx('Өз өлшемі…', 'Свой размер…') + '</option></select></label>' +
    '<label>' + tx('Бағдары', 'Ориентация') + '<select data-pp="orient"' + (custom ? ' disabled' : '') + '><option value="portrait"' + (pp && pp.orient === 'landscape' ? '' : ' selected') + '>' + tx('тік', 'книжная') + '</option>' +
      '<option value="landscape"' + (pp && pp.orient === 'landscape' ? ' selected' : '') + '>' + tx('жатық', 'альбомная') + '</option></select></label>' +
    (custom ? '<label>' + tx('Ені, мм', 'Ширина, мм') + '<input type="text" inputmode="decimal" data-pp="w" value="' + z.w + '"></label>' +
      '<label>' + tx('Биіктігі, мм', 'Высота, мм') + '<input type="text" inputmode="decimal" data-pp="h" value="' + z.h + '"></label>' : '') +
    '</div>' + (z.w * z.h > 420 * 600 ? '<p class="qa-hint">' + tx('Үлкен пішім (A2-ден үлкен) плоттерде басылады; PDF-ті «Нақты өлшем» (100%) режимімен шығарыңыз.', 'Большой формат (больше A2) печатается на плоттере; выводите PDF в режиме «Фактический размер» (100%).') + '</p>' : '');
}
/** Қағаз баптауының өзгерісі → жоспарға сақтау; қате болса (өз өлшемі 100–3000 мм емес) — хабар. */
async function savePaper(root, after) {
  const g = k => root.querySelector('[data-pp="' + k + '"]');
  const size = g('size').value;
  const cur = (curPlan() || {}).paper || {};
  const z = paperSize(cur);
  const paper = size === 'custom'
    ? { size, orient: 'portrait', w: g('w') ? parseNum(g('w').value) : z.w, h: g('h') ? parseNum(g('h').value) : z.h }
    : { size, orient: g('orient').value };
  try { await savePlan({ paper }); } catch (err) { toast(err.message, true); }
  after();
}
/** Экспликация баптаулары (docs/PLAN-STAGE2.md, 6.1): бағандар, реті, ені, жол биіктігі, жазу өлшемі, атаулар, орны. */
const EXPL_NAMES = { material: ['Материалы', 'Материал'], size: ['Өлшемі', 'Размеры'], state: ['Жай-күйі', 'Состояние'], note: ['Ескертпе', 'Примечание'] };
function paintExplSet() {
  const box = prev.back.querySelector('#pjExplBox');
  box.hidden = !isStage2(markObjects());
  if (box.hidden) return;
  const e = explOf(curPlan());
  const num = v => (v ? fmtNum(v, 1) : '');
  prev.back.querySelector('#pjExplSet').innerHTML =
    '<p class="qa-hint">' + tx('№ мен «Түрі» бағандары әрдайым көрінеді. Ені бос — автоматты.', 'Столбцы № и «Тип» видны всегда. Пустая ширина — автоматически.') + '</p>' +
    '<table class="pj-excols"><thead><tr><th></th><th>' + tx('Баған', 'Столбец') + '</th><th>' + tx('Ені, мм', 'Ширина, мм') + '</th><th></th></tr></thead><tbody>' +
    e.cols.map((c, i) => '<tr><td><input type="checkbox" data-ex="show" data-i="' + i + '"' + (c.show ? ' checked' : '') + ' aria-label="' + esc(tx('Көрсету', 'Показывать')) + '"></td>' +
      '<td>' + esc(EXPL_NAMES[c.key][UI === 'ru' ? 1 : 0]) + '</td>' +
      '<td><input type="text" inputmode="decimal" data-ex="width" data-i="' + i + '" value="' + num(c.width) + '" placeholder="' + tx('авто', 'авто') + '"></td>' +
      '<td><button type="button" class="qa-ib" data-ex="up" data-i="' + i + '"' + (i ? '' : ' disabled') + ' aria-label="' + tx('Жоғары', 'Выше') + '">↑</button><button type="button" class="qa-ib" data-ex="down" data-i="' + i + '"' + (i < e.cols.length - 1 ? '' : ' disabled') + ' aria-label="' + tx('Төмен', 'Ниже') + '">↓</button></td></tr>').join('') +
    '</tbody></table>' +
    '<div class="pj-exgrid">' +
      '<label>' + tx('Жол биіктігі, мм', 'Высота строки, мм') + '<input type="text" inputmode="decimal" data-ex="row_h" value="' + num(e.row_h) + '" placeholder="' + tx('авто', 'авто') + '"></label>' +
      '<label>' + tx('Жазу өлшемі, мм', 'Размер шрифта, мм') + '<input type="text" inputmode="decimal" data-ex="font" value="' + num(e.font) + '"></label>' +
      '<label>' + tx('Кестенің орны', 'Размещение таблицы') + '<select data-ex="place"><option value="sheet"' + (e.place === 'sheet' ? ' selected' : '') + '>' + tx('жоспар бетінде басталады', 'начинается на листе плана') + '</option><option value="separate"' + (e.place === 'separate' ? ' selected' : '') + '>' + tx('бөлек бетте', 'на отдельном листе') + '</option></select></label>' +
      '<label>' + tx('Аймақ биіктігі, мм', 'Высота зоны, мм') + '<input type="text" inputmode="decimal" data-ex="zone_h" value="' + num(e.zone_h) + '"' + (e.place === 'separate' ? ' disabled' : '') + '></label>' +
    '</div>' +
    '<label class="qa-check"><input type="checkbox" data-ex="short"' + (e.short ? ' checked' : '') + '> ' + tx('Материалдың қысқа атауы («Күйдір. кірпіш»)', 'Краткое название материала («Жжён. кирпич»)') + '</label>' +
    '<label class="qa-check"><input type="checkbox" data-ex="subtype"' + (e.subtype ? ' checked' : '') + '> ' + tx('Құлпытастың типін көрсету', 'Показывать тип кулпытаса') + '</label>' +
    '<button type="button" class="lnk" data-ex="reset">' + tx('Әдепкі күйге қайтару', 'Вернуть по умолчанию') + '</button>';
}
/** Баптаудың өзгерісін сақтау (сервер шектейді: жол 4–12 мм, жазу 2,5–4 мм, аймақ 40–120 мм). */
async function saveExpl(el) {
  const kind = el.dataset.ex;
  if (!kind) return;
  const e = JSON.parse(JSON.stringify(explOf(curPlan())));
  const i = +el.dataset.i;
  const val = () => { const v = parseNum(el.value); return v == null || Number.isNaN(v) ? 0 : v; };
  if (kind === 'show') e.cols[i].show = el.checked;
  else if (kind === 'width') e.cols[i].width = val();
  else if (kind === 'up' && i > 0) [e.cols[i - 1], e.cols[i]] = [e.cols[i], e.cols[i - 1]];
  else if (kind === 'down' && i < e.cols.length - 1) [e.cols[i + 1], e.cols[i]] = [e.cols[i], e.cols[i + 1]];
  else if (kind === 'row_h' || kind === 'font' || kind === 'zone_h') e[kind] = val();
  else if (kind === 'place') e.place = el.value;
  else if (kind === 'short' || kind === 'subtype') e[kind] = el.checked;
  else if (kind === 'reset') { try { await savePlan({ expl: null }); } catch (err) { toast(err.message, true); } paintPreview(); return; }
  else return;
  try { await savePlan({ expl: e }); } catch (err) { toast(err.message, true); }
  const open = prev.back.querySelector('#pjExplBox').open;
  paintPreview();
  prev.back.querySelector('#pjExplBox').open = open;
}
/** Қарындаш батырмасы бағыттауыштың үстінде (тек редакторда). */
function placePencil() {
  if (!prev) return;
  const btn = prev.back.querySelector('#pjPencil'), svg = prev.back.querySelector('#pjSheet svg');
  const mid = prev.kind === 'general' && !prev.idx && lastPage ? lastPage.arrowTip : null;
  btn.hidden = !mid || !svg;
  if (btn.hidden) return;
  const r = svg.getBoundingClientRect(), wrap = btn.parentElement.getBoundingClientRect();
  const k = r.width / svg.viewBox.baseVal.width;
  btn.style.left = (r.left - wrap.left + mid[0] * k - 14) + 'px';
  btn.style.top = (r.top - wrap.top + mid[1] * k - 14) + 'px';
}
/** Белгілер мен өлшем жазуларын сүйреу: жылжу мм-де сақталады (lbl — жалпы жоспар, dimlbl — жеке жоспар). */
function bindDrag(svg) {
  if (!svg) return;
  svg.querySelectorAll('[data-drag]').forEach(g => {
    g.style.cursor = 'move';
    g.addEventListener('pointerdown', e => {
      e.preventDefault();
      const [kind, id] = g.dataset.drag.split(':');
      const o = objects.find(x => x.id === id);
      if (!o) return;
      const key = kind === 'lbl' ? 'lbl' : 'dimlbl';
      const base = Array.isArray(o[key]) ? o[key].slice() : [0, 0];
      const k = svg.viewBox.baseVal.width / svg.getBoundingClientRect().width;
      const x0 = e.clientX, y0 = e.clientY;
      let cur = base;
      g.setPointerCapture(e.pointerId);
      const move = ev => {
        cur = [Math.round((base[0] + (ev.clientX - x0) * k) * 10) / 10, Math.round((base[1] + (ev.clientY - y0) * k) * 10) / 10];
        g.setAttribute('transform', 'translate(' + cur[0] + ' ' + cur[1] + ')');
      };
      const up = async () => {
        g.removeEventListener('pointermove', move);
        g.removeEventListener('pointerup', up);
        if (cur === base) return;
        try { await api('save', { data: JSON.stringify({ ...o, [key]: cur }) }); } catch (err) { toast(err.message, true); }
        paintPreview();
      };
      g.addEventListener('pointermove', move);
      g.addEventListener('pointerup', up);
    });
  });
}

function openPdfDialog() {
  if (!curMark() || !markObjects().length) { toast(tx('Алдымен нысан қосыңыз.', 'Сначала добавьте объект.'), true); return; }
  const o = curObj(), p = curPlan() || {};
  const back = dialog('pj-pdfdlg',
    '<form novalidate><h3>' + svgIc(IC.pdf) + tx('PDF-ке шығару', 'Экспорт в PDF') + '<small class="pj-dlgsub">' + esc(markName(curMark())) + '</small></h3>' +
    '<div class="pj-radios">' +
      '<label class="qa-check"><input type="radio" name="mode" value="general" checked> ' + tx('Жалпы жоспар', 'Общий план') + '</label>' +
      '<label class="qa-check"><input type="radio" name="mode" value="detail"' + (o && hasContour(o) ? '' : ' disabled') + '> ' + tx('Таңдалған нысанның жеке жоспары', 'Индивидуальный план выбранного объекта') + (o ? ' (' + esc(objTitle(o, UI)) + ')' : '') + '</label>' +
      '<label class="qa-check"><input type="radio" name="mode" value="combined"> ' + tx('Біріктірілген: жалпы жоспар және барлық жеке сызба', 'Объединённый: общий план и все индивидуальные чертежи') + '</label>' +
    '</div>' +
    (o && !hasContour(o) ? '<p class="qa-hint">' + tx('Таңдалған нысанның контуры жоқ — жеке сызба үшін контур қажет.', 'У выбранного объекта нет контура — для индивидуального чертежа нужен контур.') + '</p>' : '') +
    '<label class="qa-check mura-doclang">' + tx('Құжат тілі', 'Язык документа') + ' <select id="pjPdfLang"><option value="kk">Қазақша</option><option value="ru">Русский</option></select></label>' +
    '<div id="pjPdfPaper">' + paperHtml(p.paper) + '</div>' +
    '<div class="pj-pvwarn" id="pjPdfWarn"></div>' +
    '<div class="qa-dlg-btns"><button type="button" class="lnk" id="pjPdfPrev">' + tx('Алдын ала қарау', 'Предпросмотр') + '</button><span class="mk-sp"></span>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-x>' + tx('Бас тарту', 'Отмена') + '</button>' +
      '<button type="submit" class="btn btn--primary btn--sm">' + tx('Экспорттау', 'Экспортировать') + '</button></div></form>');
  const form = back.querySelector('form'), langSel = back.querySelector('#pjPdfLang');
  langSel.value = p.lang || I18N.docLang();
  const modeOf = () => form.querySelector('[name=mode]:checked').value;
  const paint = () => { back.querySelector('#pjPdfWarn').innerHTML = warnings(langSel.value, modeOf()).map(x => '<p>' + esc(x) + '</p>').join(''); };
  form.addEventListener('change', e => {
    if (e.target.closest('#pjPdfPaper')) { const box = back.querySelector('#pjPdfPaper'); savePaper(box, () => { box.innerHTML = paperHtml((curPlan() || {}).paper); }); return; }
    paint();
  });
  paint();
  back.querySelector('[data-x]').addEventListener('click', closeDialog);
  back.querySelector('#pjPdfPrev').addEventListener('click', () => { const md = modeOf(); closeDialog(); openPreview(md === 'detail' && o ? { kind: 'detail', id: o.id } : { kind: 'general' }); });
  form.addEventListener('submit', e => { e.preventDefault(); const md = modeOf(), l = langSel.value; closeDialog(); exportPdf(md, l, o && o.id); });
}

/** PDF құру: бет(тер) → HTML → main.js (printToPDF, өрістерсіз, масштаб 1:1). */
async function exportPdf(kind, lang, id) {
  const ctx = ctxFor(lang), p = curPlan() || {};
  const list = [];
  if (kind === 'general' || kind === 'combined') list.push({ k: 'general', o: null, s: p.scale_general || 0 });
  if (kind === 'detail') { const o = objects.find(x => x.id === id); if (!o || !hasContour(o)) { toast(tx('Жеке сызба шығару үшін контур қажет.', 'Для индивидуального чертежа нужен контур.'), true); return; } list.push({ k: 'detail', o, s: p.scale_detail || 0 }); }
  if (kind === 'combined') for (const o of markObjects().filter(hasContour)) list.push({ k: 'detail', o, s: p.scale_detail || 0 });
  let pages = list.map(x => ({ ...x, pg: renderPage(ctx, x.k, x.o, x.s) }));
  // Таңдалған масштабта сыймайтын бет: контур мен белгілер қиылмауы үшін ұсынылған масштаб қолданылады (пайдаланушы растаса)
  const bad = pages.filter(x => !x.pg.fits);
  if (bad.length) {
    const yes = await ask(tx('Таңдалған масштабта ' + bad.length + ' бет сыймайды. Сол беттерге сыйымды масштабты қолданып шығару керек пе?', 'В выбранном масштабе не помещается листов: ' + bad.length + '. Применить к ним подходящий масштаб и экспортировать?'), { ok: tx('Сыйымды масштабпен', 'С подходящим масштабом') });
    if (!yes) return;
    pages = pages.map(x => (x.pg.fits ? x : { ...x, pg: renderPage(ctx, x.k, x.o, x.pg.suggest) }));
  }
  if (!globalThis.mura || !globalThis.mura.pdf) { toast(tx('PDF тек Mura GIS бағдарламасында жасалады.', 'PDF создаётся только в программе Mura GIS.'), true); return; }
  const busy = $('pjBusy');
  if (busy) busy.textContent = tx('PDF жасалуда…', 'Создаётся PDF…');
  try {
    const name = I18N.field(ctx.mark, 'name', lang) || 'plan';
    const svgs = pages.flatMap(x => [x.pg.svg, ...(x.pg.more || [])]);
    const bytes = await globalThis.mura.pdf(pdfHtml(svgs, name, pages[0].pg.page), { exact: true });
    const suffix = kind === 'detail' ? '_№' + pages[0].o.num : kind === 'combined' ? (lang === 'ru' ? '_полный' : '_толық') : '';
    download(bytes, 'application/pdf', fileSafe(name) + (lang === 'ru' ? '_план' : '_жоспар') + suffix + '.pdf');
    toast(tx('PDF дайын (' + pages[0].pg.page.name + '): ', 'PDF готов (' + pages[0].pg.page.name + '): ') + svgs.length + tx(' бет. Басып шығарғанда «Нақты өлшем» (100%) режимін таңдаңыз.', ' стр. При печати выберите «Фактический размер» (100%).'));
  } catch (e) { toast(e.message, true); }
  finally { if (busy) busy.textContent = ''; }
}

/* ======================= Іске қосу ======================= */
app.addEventListener('mura:service', e => { if (e.detail.id !== 'plan') stopMode(true); render(); });
// Ескерткіштер тізімі жаңарғанда (жүктелу, өзгерту) — атауы мен координатасы қайта оқылады
const mkCount = $('mkCount');
if (mkCount) new MutationObserver(() => render()).observe(mkCount, { childList: true, characterData: true, subtree: true });
api('list').catch(e => { toast(tx('Жоспар деректері жүктелмеді: ', 'Данные плана не загружены: ') + e.message, true); render(); });

globalThis.MuraPlan = {
  openPanel, closePanel, openForMark, setMark, select, openObjDialog, openPtrDialog, openPreview, exportPdf, api,
  get objects() { return objects; }, get plans() { return plans; }, get markId() { return markId; }, get selected() { return selId; }, get mode() { return mode && mode.kind; },
  ctx: ctxFor, renderPage: (kind, id, scale, lang = UI) => renderPage(ctxFor(lang), kind, id ? objects.find(o => o.id === id) : null, scale || 0),
  stop() { stopMode(true); closeDialog(); },
};
