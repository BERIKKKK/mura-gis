/* Mura GIS: «Жоспар» қызметі — ескерткіштің құрамындағы нысандарды (қорғандар т.б.) тіркеу, контурын сызу, өлшемдері,
   елді мекенге бағыттауыш, «Салтақ-III қорымы» үлгісімен жалпы және жеке жоспарды масштабты PDF-ке шығару.
   • Ескерткіш — қолданыстағы белгі (marks): мұнда тек оның id-і пайдаланылады; оның негізгі координатасы жоспардан өзгермейді.
   • Нысандар мен жоспар баптаулары — жобаның plan_objects және plans қабаттары (main/plans.js, mura://app/plans).
   • Карта режимдері (ескерткішті / тірек нүктесін / елді мекенді картадан таңдау, контур сызу, редакциялау) кезінде
     картадағы белгілер басуды картаға өткізеді (.is-pjmap).
   • Жағдаят белгілері (жол, ЭБЖ, горизонталь, ағаш, жазу т.б.; docs/PLAN-STAGE3.md) — жобаның plan_features қабаты.
   Интерфейс бөліктері — plan/plan-dom.js, есептер — plan/geo.js, бет үлгісі — plan/sheet.js. */
import { plane, contourLL, hasContour, inverse, dist2, azXY, selfIntersects, fmtNum, fmtDist, parseNum, cmpNum, SCALES } from './geo.js';
import { renderPage, pdfHtml, objTitle, pointerValues, KINDS, MATERIALS, SUBTYPES, KTYPES, STATES, materialLabel, subtypeLabel, ktypeLabel, stateLabel, glyph, isStage2, explOf, PAPERS, paperSize,
  FEAT_KINDS, featCat, featLabel, featGlyph, featSample, SURFACES, PLACE_KINDS, isDug } from './sheet.js';
const MUS_LINE = { weight: 4, dashArray: '1 6', lineCap: 'round', interactive: false };     // мұрт картада: нүктелі жуан сызық
import { parseDxf, decodeDxf, parseCsv, guessColumns, csvItems, parseGeojson, parseKml, parseKmz, parseGpx, groupsOf, kindsFor, toRecords, allXY, thin as thinPts } from './importer.js';
import { CRS_LIST, makeTransform, guessCrs, utmZone, gkZone } from './crs.js';
import { contours, MAX_POINTS as TIN_MAX } from './tin.js';
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
let objects = [], plans = [], features = [];
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
  if (Array.isArray(j.features)) features = j.features;
  render();
  return j;
}
const marks = () => (globalThis.__marks && globalThis.__marks.items) || [];
const places = () => (globalThis.__places && globalThis.__places.items) || [];
const curMark = () => marks().find(m => m.id === markId) || null;
const markObjects = (id = markId) => objects.filter(o => o.mark_id === id).sort(cmpNum);
const curPlan = () => plans.find(p => p.mark_id === markId) || null;
const markFeatures = (id = markId) => features.filter(f => f.mark_id === id);
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
// Картадағы қазылған қорғанның штрихы (CSS .pj-dug → fill: url(#pj-map-dug)); анықтамасы құжатқа бір рет қосылады
document.body.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
  '<pattern id="pj-map-dug" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fff" fill-opacity="0.7"/>' +
  '<line x1="0" y1="0" x2="0" y2="6" stroke="' + ST.line + '" stroke-width="1.5"/></pattern></defs></svg>');
function drawLayer() {
  layer.clearLayers();
  if (!markId) return;
  drawFeatures();          // жағдаят — нысандардың астында
  // Мұрттар (тас жалдар) — контурлардың астында
  for (const o of markObjects()) {
    if (!Array.isArray(o.mus) || (mode && mode.kind === 'edit' && mode.id === o.id)) continue;
    for (const ln of o.mus) {
      L.polyline(ln, { ...MUS_LINE, color: o.id === selId ? ST.sel : ST.line }).addTo(layer);
      L.polyline(ln, { opacity: 0, weight: 14, className: 'pj-shape' }).on('click', ev => { if (mode) return; L.DomEvent.stop(ev); select(o.id); })
        .on('dblclick', ev => { if (mode) return; L.DomEvent.stop(ev); openObjDialog(o); }).addTo(layer);
    }
  }
  for (const o of markObjects()) {
    const sel = o.id === selId;
    const ll = hasContour(o) ? contourLL(o) : null;
    const kurgan = !o.kind || o.kind === 'kurgan' || o.kind === 'other';
    const dug = isDug(o);
    // Контур: қорған — қоңыр, қазылған қорған — қиғаш штрих, қорымның құрылыстары — сұр, қоршау — толтырусыз; контурсыз қорым нысаны — жоспардағы белгісі
    const shape = ll
      ? L.polygon(ll, { color: sel ? ST.sel : ST.line, weight: sel ? 3 : 1.5, fillColor: kurgan ? ST.fill : '#8a8070', fillOpacity: o.kind === 'korshau' ? 0 : 0.55,
        dashArray: o.kind === 'korshau' ? '6 4' : null, className: 'pj-shape' + (dug ? ' pj-dug' : '') })
      : kurgan
        ? L.circleMarker([o.lat, o.lon], { radius: sel ? 6 : 4.5, color: sel ? ST.sel : dug ? ST.line : '#fff', weight: 2, fillColor: dug ? '#fff' : ST.line, fillOpacity: 1, className: 'pj-shape' })
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
  for (const [id, on] of [['pjListBtn', has], ['pjAdd', has], ['pjSit', has], ['pjDraw', sel || mode?.kind === 'edit'], ['pjDims', sel], ['pjPtr', has], ['pjPreview', any], ['pjPdf', any],
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
  if (o.ktype && (o.kind || 'kurgan') === 'kurgan') parts.push(ktypeLabel(o.ktype, UI).toLocaleLowerCase(UI));
  if (o.state) parts.push(stateLabel(o.state, UI));
  if (Array.isArray(o.surface)) for (const k of o.surface) { const x = SURFACES.find(s => s.v === k); if (x) parts.push((UI === 'ru' ? x.ru : x.kk).toLocaleLowerCase(UI)); }
  if (Array.isArray(o.mus) && o.mus.length) parts.push(tx('мұрттары: ', 'усов: ') + o.mus.length);
  if (isDug(o)) parts.push(tx('қазылған', 'раскопан'));
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
  renderFeatPanel(m);
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
  if ((m.kind === 'draw' && m.shape === 'free') || (m.kind === 'fdraw' && isMulti(m.fkind)) || m.kind === 'mus') map.doubleClickZoom.disable();
  $('pjDraw').setAttribute('aria-pressed', m.kind === 'draw' || m.kind === 'edit' || m.kind === 'mus' ? 'true' : 'false');
  $('pjSit').setAttribute('aria-pressed', m.kind === 'fdraw' || m.kind === 'fedit' ? 'true' : 'false');
  if (m.kind === 'edit') startEdit();
  if (m.kind === 'fedit') startFeatEdit();
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
  $('pjSit').setAttribute('aria-pressed', 'false');
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
  if (k === 'fdraw') {
    const nm = featLabel(mode.fkind, UI);
    if (featCat(mode.fkind) === 'area') return setHud(nm + ': ' + tx('шекараның төбелерін басыңыз', 'щёлкайте вершины границы') + ' (' + n + ')',
      tx('Бірінші төбені басу, екі рет басу не Enter — тұйықтау; Backspace — соңғы төбе; Esc — бас тарту', 'Щелчок по первой вершине, двойной щелчок или Enter — замкнуть; Backspace — последняя вершина; Esc — отмена'));
    if (featCat(mode.fkind) !== 'line') return setHud(nm + ': ' + tx('орнын картадан басыңыз', 'щёлкните место на карте'),
      mode.fkind === 'tree' ? tx('Бірнеше ағашты қатарынан қоюға болады · Esc — аяқтау', 'Можно ставить несколько деревьев подряд · Esc — завершить') : 'Esc — ' + tx('бас тарту', 'отмена'));
    return setHud(nm + ': ' + tx('төбелерді басыңыз', 'щёлкайте вершины') + ' (' + n + ')',
      tx('Екі рет басу не Enter — аяқтау; Backspace — соңғы төбе; Esc — бас тарту', 'Двойной щелчок или Enter — завершить; Backspace — последняя вершина; Esc — отмена'));
  }
  if (k === 'mus') return setHud(tx('Мұрт (тас жал): төбелерді қорғаннан бастап басыңыз', 'Ус (каменная гряда): щёлкайте вершины, начиная от кургана') + ' (' + n + ')',
    tx('Екі рет басу не Enter — аяқтау; Backspace — соңғы төбе; Esc — бас тарту', 'Двойной щелчок или Enter — завершить; Backspace — последняя вершина; Esc — отмена'));
  if (k === 'fedit') return setHud(tx('Белгіні түзету: тұтқаларды сүйреңіз', 'Исправление знака: перетаскивайте маркеры'),
    tx('Өзгеріс бірден сақталады; сызықтың төбесін өшіру — тінтуірдің оң жағы · Esc — аяқтау', 'Изменения сохраняются сразу; удалить вершину линии — правая кнопка · Esc — завершить'));
  if (k === 'edit') return setHud(tx('Контурды редакциялау: тұтқаларды сүйреңіз', 'Редактирование контура: перетаскивайте маркеры'), tx('Орталық — жылжыту (мұрттарымен бірге), шеттері — өлшемі мен пішіні, ұсақ тұтқалар — мұрттың төбелері (оң жағы — өшіру); өзгеріс бірден сақталады · Esc — аяқтау', 'Центр — перемещение (вместе с усами), края — размер и форма, мелкие маркеры — вершины усов (правая кнопка — удалить); изменения сохраняются сразу · Esc — завершить'));
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
  if (mode && mode.kind === 'mus') {
    // Қорғанның бұрынғы мұрттары — бағдар үшін
    for (const ln of mode.draft.mus || []) L.polyline(ln, { ...MUS_LINE, color: ST.line }).addTo(tempLayer);
    for (const p of mode.pts) L.circleMarker(p, { radius: 4, color: ST.sel, fillColor: '#fff', fillOpacity: 1, weight: 2, interactive: false }).addTo(tempLayer);
    if (mode.pts.length) L.polyline(ll ? mode.pts.concat([[ll.lat, ll.lng]]) : mode.pts, { color: ST.sel, weight: 2, interactive: false }).addTo(tempLayer);
    return;
  }
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

map.on('mousemove', e => {
  if (mode && (mode.kind === 'draw' || (mode.kind === 'mus' && mode.pts.length))) { rubber(e.latlng); paintHud(e.latlng); }
  if (mode && mode.kind === 'fdraw' && isMulti(mode.fkind) && mode.pts.length) { rubberF(e.latlng); paintHud(e.latlng); }
});
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
  if (k === 'fdraw') {
    if (isMulti(mode.fkind)) {
      // Аудан: бірінші төбені басу — тұйықтау
      if (featCat(mode.fkind) === 'area' && mode.pts.length >= 3 && near(ll, mode.pts[0], 10)) { finishFeatLine(); return; }
      mode.pts.push([ll.lat, ll.lng]); rubberF(ll); paintHud(ll); return;
    }
    if (mode.fkind === 'tree') { addTree(ll); return; }
    const d = { ...mode.draft, kind: mode.fkind, lat: ll.lat, lon: ll.lng };
    stopMode(true); render();
    openFeatDialog(null, { draft: d });
    return;
  }
  if (k === 'mus') { mode.pts.push([ll.lat, ll.lng]); rubber(ll); paintHud(ll); return; }
  if (k !== 'draw') return;
  const pts = mode.pts;
  if (mode.shape === 'free' && pts.length >= 3 && near(ll, pts[0], 10)) { finishDraw(); return; }
  pts.push([ll.lat, ll.lng]);
  if ((mode.shape === 'circle' && pts.length === 2) || ((mode.shape === 'ellipse' || mode.shape === 'rect') && pts.length === 3)) { finishDraw(); return; }
  rubber(ll); paintHud(ll);
});
map.on('dblclick', e => {
  if (mode && mode.kind === 'draw' && mode.shape === 'free') { L.DomEvent.stop(e); if (mode.pts.length > 3) mode.pts.pop(); finishDraw(); }
  // Екі рет басу алдымен екі «click» береді — соңғы (қайталанған) төбе алынады
  else if (mode && mode.kind === 'mus') { L.DomEvent.stop(e); if (mode.pts.length > 2) mode.pts.pop(); finishMus(); }
  else if (mode && mode.kind === 'fdraw' && isMulti(mode.fkind)) { L.DomEvent.stop(e); if (mode.pts.length > (featCat(mode.fkind) === 'area' ? 3 : 2)) mode.pts.pop(); finishFeatLine(); }
});
document.addEventListener('keydown', e => {
  if (!mode || dlg) return;
  if (e.key === 'Escape') { e.preventDefault(); stopMode(); }
  else if (mode.kind === 'draw' && mode.shape === 'free' && e.key === 'Enter') { e.preventDefault(); finishDraw(); }
  else if (mode.kind === 'mus' && e.key === 'Enter') { e.preventDefault(); finishMus(); }
  else if ((mode.kind === 'draw' || mode.kind === 'mus') && e.key === 'Backspace' && mode.pts.length) { e.preventDefault(); mode.pts.pop(); rubber(); paintHud(); }
  else if (mode.kind === 'fdraw' && isMulti(mode.fkind) && e.key === 'Enter') { e.preventDefault(); finishFeatLine(); }
  else if (mode.kind === 'fdraw' && e.key === 'Backspace' && mode.pts.length) { e.preventDefault(); mode.pts.pop(); rubberF(); paintHud(); }
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

/** Мұрт сызылды: терезеден шақырылса — жобаға қосылып, терезе қайта ашылады; мәзірден — нысан бірден сақталады. */
async function finishMus() {
  const m = mode;
  const pts = m.pts.filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  if (pts.length < 2) { toast(tx('Мұртта кемінде екі төбе болуы керек.', 'В «усе» должно быть не менее двух вершин.'), true); return; }
  const d = { ...m.draft, mus: (m.draft.mus || []).concat([pts]) };
  stopMode(true);
  render();
  if (m.after) { m.after(d); return; }
  try { await api('save', { data: JSON.stringify(d) }); toast(tx('Мұрт қосылды.', 'Ус добавлен.')); } catch (e) { toast(e.message, true); }
}
async function clearMus(o) {
  if (!(await ask(tx('№' + o.num + ' қорғанның мұрттарын (' + o.mus.length + ') өшіру керек пе?', 'Удалить усы (' + o.mus.length + ') кургана №' + o.num + '?'), { danger: true }))) return;
  try { await api('save', { data: JSON.stringify({ ...o, mus: null }) }); } catch (e) { toast(e.message, true); }
}

/** «Сызу» мәзірі: пішінді таңдау, мұрт сызу не сақталған контурды редакциялау. */
function drawMenu(btn) {
  const o = curObj();
  if (!o) { toast(tx('Алдымен нысанды таңдаңыз не қосыңыз.', 'Сначала выберите или добавьте объект.')); return; }
  const r = btn.getBoundingClientRect();
  const go = shape => startMode({ kind: 'draw', shape, draft: { ...o } });
  const kurgan = (o.kind || 'kurgan') === 'kurgan', nMus = Array.isArray(o.mus) ? o.mus.length : 0;
  globalThis.MuraCtx?.openMenu(r.left, r.bottom + 4, esc(objName(o)), [
    { label: tx('Шеңбер', 'Окружность'), hint: tx('орталығы, содан кейін шеті', 'центр, затем край'), icon: IC.circle, run: () => go('circle') },
    { label: tx('Эллипс', 'Эллипс'), hint: tx('орталығы, үлкен осьтің ұшы, кіші осьтің ұшы', 'центр, конец большой оси, конец малой оси'), icon: IC.ellipse, run: () => go('ellipse') },
    { label: tx('Тіктөртбұрыш', 'Прямоугольник'), hint: tx('кесене, сағана там, қоршау: орталығы, ұзын және қысқа қабырға', 'мавзолей, саганатам, ограда: центр, длинная и короткая сторона'), icon: IC.rect || IC.free, run: () => go('rect') },
    { label: tx('Еркін контур', 'Свободный контур'), hint: tx('кемінде үш төбе, тұйықтау', 'не менее трёх вершин, замкнуть'), icon: IC.free, run: () => go('free') },
    'sep',
    { label: tx('Мұрт (тас жал)', 'Ус (каменная гряда)'), hint: kurgan ? tx('мұртты қорған: жалдың төбелері қорғаннан бастап, Enter — аяқтау', 'курган с усами: вершины гряды от кургана, Enter — завершить') : tx('тек қорғанда', 'только у кургана'),
      icon: IC.mus || IC.free, disabled: !kurgan, run: () => startMode({ kind: 'mus', draft: { ...o } }) },
    { label: tx('Мұрттарды өшіру', 'Удалить усы'), hint: nMus ? String(nMus) : '', icon: IC.del || IC.edit, disabled: !nMus, run: () => clearMus(o) },
    'sep',
    { label: tx('Контурды редакциялау', 'Редактировать контур'), hint: tx('орнын, өлшемін, пішінін, мұрттарын картада түзету', 'исправить положение, размер, форму, усы на карте'), icon: IC.edit, disabled: !hasContour(o) && !nMus, run: () => startMode({ kind: 'edit', id: o.id }) },
  ]);
}

/* ---------- Сақталған контурды редакциялау: картадағы тұтқалар ---------- */
const handleIcon = (cls = '', s = 14) => L.divIcon({ className: 'pj-handle' + cls, iconSize: [s, s], iconAnchor: [s / 2, s / 2] });
function startEdit() {
  const o = objects.find(x => x.id === mode.id);
  if (!o) return;
  let w = JSON.parse(JSON.stringify(o));      // өңделіп жатқан көшірме
  const preview = hasContour(w) ? L.polygon(contourLL(w), { color: ST.sel, weight: 2, fillColor: ST.fill, fillOpacity: 0.35, interactive: false }).addTo(tempLayer) : null;
  const musLines = (w.mus || []).map(ln => L.polyline(ln, { ...MUS_LINE, color: ST.sel }).addTo(tempLayer));
  const paintMus = () => musLines.forEach((pl, k) => { if (w.mus && w.mus[k]) pl.setLatLngs(w.mus[k]); });
  const handles = [];
  const P = () => plane(+w.lat, +w.lon);
  const place = () => {
    if (preview) preview.setLatLngs(contourLL(w));
    paintMus();
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
    return [c, ...(w.shape === 'free' && Array.isArray(w.pts) ? w.pts : [])];
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
        // Жылжыту: бүкіл контур мен мұрттар метрлік жазықтықта ығысады
        const p0 = plane(start.ll.lat, start.ll.lng), dxy = p0.fwd(q.lat, q.lng);
        const mv = pt => { const a = p0.fwd(pt[0], pt[1]); return p0.inv(a[0] + dxy[0], a[1] + dxy[1]); };
        w.lat = q.lat; w.lon = q.lng;
        if (w.shape === 'free') w.pts = start.w.pts.map(mv);
        if (Array.isArray(start.w.mus)) { w.mus = start.w.mus.map(ln => ln.map(mv)); paintMus(); }
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
      if (preview) preview.setLatLngs(contourLL(w));
    });
    h.on('dragend', () => { place(); save(); });
    handles.push(h);
  });
  // Мұрттың төбелері: сүйреу; оң жағы — төбені өшіру (екі төбе қалса — бүкіл мұртты)
  (w.mus || []).forEach((ln, k) => ln.forEach((ll, j) => {
    const h = L.marker(ll, { icon: handleIcon(' is-small', 10), draggable: true, keyboard: false, zIndexOffset: 900 }).addTo(tempLayer);
    h.on('drag', () => { const q = h.getLatLng(); w.mus[k][j] = [q.lat, q.lng]; paintMus(); });
    h.on('dragend', save);
    h.on('contextmenu', async ev => {
      L.DomEvent.stop(ev);
      if (w.mus[k].length <= 2) {
        if (!(await ask(tx('Бұл мұртты толық өшіру керек пе?', 'Удалить этот ус целиком?'), { danger: true }))) return;
        w.mus.splice(k, 1);
        if (!w.mus.length) w.mus = null;
      } else w.mus[k].splice(j, 1);
      await save();
      if (hasContour(w) || w.mus) startMode({ kind: 'edit', id: w.id }); else stopMode();
    });
  }));
}

/* ======================= Жағдаят белгілері (3-кезең, docs/PLAN-STAGE3.md) ======================= */
/* Жол, ЭБЖ, горизонталь, ағаш, мұнара, жазу т.б. — картада сызылады (геокоординатамен); жоспар бетінде сызықтар нысандардың астында,
   белгілер мен жазулар үстінде. Ескерткіштің құрамына кірмейді: нөмірі жоқ, экспликацияға түспейді (plan_features қабаты). */
const FST = { road: { c: '#fff', w: 2.6 }, track: { c: '#5b4a32', w: 2, d: '7 4' }, power: { c: '#333', w: 1.5 }, contour: { c: '#b06a1f', w: 1.8 }, line: { c: '#333', w: 1.5 },
  path: { c: '#444', w: 1.4, d: '5 4' }, fence: { c: '#333', w: 1.5, d: '2 3' }, ditch: { c: '#2f6db3', w: 1.8 }, river: { c: '#2f6db3', w: 3 }, ravine: { c: '#7a5a2a', w: 2.2, d: '1 2' } };
/** Аудандардың картадағы толтыруы (бетте — штрих). */
const FAREA = { arable: '#e3cf8c', forest: '#7fae5a', shrub: '#a9c98a', swamp: '#8fb7cf', water: '#79b0e3', sand: '#e2cc95', area: null };
/** Көп төбелі белгі: сызық не аудан. */
const isMulti = k => { const c = featCat(k); return c === 'line' || c === 'area'; };
const FHINT = {
  road: ['қос тұтас сызық, бойында атауы', 'двойная сплошная линия, название вдоль'],
  track: ['қос сызық, біреуі үзік', 'двойная линия, одна прерывистая'],
  power: ['әр төбеде тірек', 'опора на каждой вершине'],
  contour: ['биіктік мәнімен', 'со значением высоты'],
  line: ['жіңішке тұтас сызық', 'тонкая сплошная линия'],
  tree: ['бірнешеуін қатарынан қоюға болады', 'можно ставить несколько подряд'],
  trig: ['үшбұрыш, ортасында нүкте', 'треугольник с точкой'],
  tower: ['шаршы ішінде үшбұрыш', 'квадрат с треугольником'],
  point: ['шеңбер, жазуы', 'кружок, подпись'],
  height: ['нүкте және биіктігі', 'точка и высота'],
  text: ['еркін жазу, бұрышы', 'свободная надпись, угол'],
  path: ['жіңішке үзік сызық', 'тонкая прерывистая линия'],
  fence: ['сызық және көлденең штрихтар', 'линия с поперечными штрихами'],
  ditch: ['көк сызық', 'синяя линия'],
  river: ['жуан көк сызық, атауы', 'толстая синяя линия, название'],
  ravine: ['тісті сызық', 'линия с зубцами'],
  arable: ['«═» штрихы, нүктелі шекара', 'штриховка «═», точечная граница'],
  forest: ['ағаш белгілері', 'значки деревьев'],
  shrub: ['шағын шеңберлер', 'мелкие кружки'],
  swamp: ['көк көлденең штрих', 'синяя горизонтальная штриховка'],
  water: ['көк толтыру', 'синяя заливка'],
  sand: ['нүктелер', 'точки'],
  area: ['контур және ортасында жазуы', 'контур и подпись в центре'],
};
const featName = (f, l = UI) => String((l === 'ru' ? f.name_ru || f.name : f.name || f.name_ru) || '').trim();
const featTitle = f => featLabel(f.kind, UI) + (f.value != null ? ' ' + fmtNum(f.value) : '') + (featName(f) ? ' — ' + featName(f) : '');
/** Белгінің шағын суреті (тізім, мәзір): нүкте — өз белгісі, сызық — үлгісі, жазу — «Аа». */
function featSvg(kind, size = 18) {
  if (featCat(kind) === 'text') return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" aria-hidden="true"><text x="12" y="17" font-size="14" text-anchor="middle" font-family="system-ui,sans-serif" fill="#221d16">Аа</text></svg>';
  const vb = featCat(kind) === 'line' ? '-2.5 -2.6 6 5.2' : '-2.4 -2.4 4.8 4.8';
  return '<svg viewBox="' + vb + '" width="' + size + '" height="' + size + '" aria-hidden="true">' + featSample(kind, 0, 0) + '</svg>';
}
function featIcon(f) {
  if (featCat(f.kind) === 'text') {
    return L.divIcon({ className: 'pj-shape pj-ftext', iconSize: [0, 0], html: '<span style="transform:translate(-50%,-50%) rotate(' + (+f.rot || 0) + 'deg)">' + esc(featName(f)) + '</span>' });
  }
  return L.divIcon({ className: 'pj-shape pj-glyph pj-fpt', iconSize: [18, 18], iconAnchor: [9, 9],
    html: '<svg viewBox="-2.4 -2.4 4.8 4.8" width="18" height="18" aria-hidden="true">' + featGlyph(f.kind, 0, 0) + '</svg>' });
}
function drawFeatures() {
  for (const f of markFeatures()) {
    if (mode && mode.kind === 'fedit' && mode.id === f.id) continue;      // редакциялау кезінде — уақытша қабатта
    let lyr;
    if (featCat(f.kind) === 'area') {
      if (!Array.isArray(f.pts) || f.pts.length < 3) continue;
      const fc = FAREA[f.kind];
      lyr = L.polygon(f.pts, { color: fc ? '#5b4a32' : '#333', weight: 1.2, dashArray: fc && f.kind !== 'water' ? '2 3' : null, fillColor: fc || '#000', fillOpacity: fc ? 0.35 : 0, className: 'pj-shape' });
    } else if (featCat(f.kind) === 'line') {
      if (!Array.isArray(f.pts) || f.pts.length < 2) continue;
      const S = FST[f.kind] || FST.line;
      lyr = L.featureGroup();
      if (f.kind === 'road') L.polyline(f.pts, { color: '#3a352c', weight: 5.2, interactive: false }).addTo(lyr);
      L.polyline(f.pts, { color: S.c, weight: S.w, dashArray: S.d || null, interactive: false }).addTo(lyr);
      if (f.kind === 'power') for (const p of f.pts) L.circleMarker(p, { radius: 2.5, color: '#222', weight: 1, fillColor: '#999', fillOpacity: 1, interactive: false }).addTo(lyr);
      L.polyline(f.pts, { opacity: 0, weight: 14, className: 'pj-shape' }).addTo(lyr);      // жіңішке сызықты басуға ыңғайлы із
    } else if (f.lat != null) {
      // Биіктік белгілері (импортта жүздеген болуы мүмкін) — жеңіл дөңгелек; қалғандары — өз белгісі
      lyr = f.kind === 'height'
        ? L.circleMarker([f.lat, f.lon], { radius: 3, color: '#fff', weight: 1, fillColor: '#221d16', fillOpacity: 1, className: 'pj-shape' })
        : L.marker([f.lat, f.lon], { keyboard: false, icon: featIcon(f) });
    } else continue;
    lyr.bindTooltip(esc(featTitle(f)), { sticky: true, className: 'mk-tip' });
    lyr.on('click', ev => { if (mode) return; L.DomEvent.stop(ev); openFeatDialog(f); });
    lyr.addTo(layer);
  }
}
function renderFeatPanel(m) {
  const fl = m ? markFeatures().slice().sort((a, b) => FEAT_KINDS.findIndex(k => k.v === a.kind) - FEAT_KINDS.findIndex(k => k.v === b.kind)) : [];
  const pl = m ? planPlaces() : [];
  $('pjFeatSec').hidden = !fl.length && !pl.length;
  $('pjFeatT').textContent = tx('Жағдаят белгілері: ', 'Знаки ситуации: ') + fl.length;
  // Бір түрдің белгісі көп болса (импорт, горизонтальдар) — бір жолмен: саны және «Барлығын өшіру»
  const cnt = {};
  for (const f of fl) cnt[f.kind] = (cnt[f.kind] || 0) + 1;
  const many = k => cnt[k] > 12, shown = new Set();
  const groupRow = k => '<div class="qa-sc pj-fcard" data-fkind="' + esc(k) + '"><span class="pj-fic">' + featSvg(k) + '</span><div class="qa-sc-main">' +
    '<span class="qa-sc-title">' + esc(featLabel(k, UI)) + ' × ' + cnt[k] + '</span><div class="qa-sc-act">' +
    '<button type="button" class="lnk lnk--danger" data-pjfact="delkind">' + tx('Барлығын өшіру', 'Удалить все') + '</button></div></div></div>';
  $('pjFeatList').innerHTML = (pl.length ? '<p class="qa-hint pj-plcount">' + tx('Жоспардағы өзге нысандар: ', 'Прочие объекты на плане: ') + esc(pl.map(p => placeName(p)).join(', ')) +
      ' <button type="button" class="lnk" data-pjfact="places">' + tx('Өзгерту', 'Изменить') + '</button></p>' : '') + fl.map(f => many(f.kind) ? (shown.has(f.kind) ? '' : (shown.add(f.kind), groupRow(f.kind))) : '<div class="qa-sc pj-fcard" data-fid="' + esc(f.id) + '"><span class="pj-fic">' + featSvg(f.kind) + '</span><div class="qa-sc-main">' +
    '<button type="button" class="qa-sc-title" data-pjfact="edit">' + esc(featTitle(f)) + '</button>' +
    '<div class="qa-sc-act"><button type="button" class="lnk" data-pjfact="show">' + tx('Картада көрсету', 'Показать на карте') + '</button>' +
    '<button type="button" class="lnk" data-pjfact="geo">' + tx('Картада түзету', 'Исправить на карте') + '</button>' +
    '<button type="button" class="lnk lnk--danger" data-pjfact="del">' + tx('Өшіру', 'Удалить') + '</button></div></div></div>').join('');
}
$('pjFeatList').addEventListener('click', e => {
  const b = e.target.closest('[data-pjfact]');
  if (b && b.dataset.pjfact === 'places') { openPlacesPicker(); return; }
  if (b && b.dataset.pjfact === 'delkind') { removeKind(b.closest('[data-fkind]').dataset.fkind); return; }
  const card = b && b.closest('[data-fid]'), f = card ? features.find(x => x.id === card.dataset.fid) : null;
  if (!f) return;
  const act = b.dataset.pjfact;
  if (act === 'edit') openFeatDialog(f);
  else if (act === 'geo') startMode({ kind: 'fedit', id: f.id });
  else if (act === 'del') removeFeat(f);
  else if (act === 'show') {
    const pts = isMulti(f.kind) ? f.pts : [[f.lat, f.lon]];
    const p = globalThis.QAUI?.pad?.();
    map.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 18, paddingTopLeft: p?.tl, paddingBottomRight: [Math.max(24, open ? panelEl.offsetWidth + 40 : 24), 24] });
  }
});
async function removeKind(k) {
  const ids = markFeatures().filter(f => f.kind === k).map(f => f.id);
  if (!ids.length || !(await ask(tx('«' + featLabel(k, UI) + '» түріндегі ' + ids.length + ' белгінің бәрін өшіру керек пе?', 'Удалить все знаки типа «' + featLabel(k, UI) + '» (' + ids.length + ')?'), { ok: tx('Өшіру', 'Удалить') }))) return;
  try { await api('fdelete', { id: ids.join(',') }); toast(tx('Өшірілді: ', 'Удалено: ') + ids.length); } catch (e) { toast(e.message, true); }
}
async function removeFeat(f) {
  if (!(await ask(tx('«' + featTitle(f) + '» белгісін өшіру керек пе?', 'Удалить знак «' + featTitle(f) + '»?'), { ok: tx('Өшіру', 'Удалить') }))) return;
  try { await api('fdelete', { id: f.id }); toast(tx('Белгі өшірілді.', 'Знак удалён.')); } catch (e) { toast(e.message, true); }
}
/* ---------- Файлдан импорт (GeoJSON, KML/KMZ, GPX, DXF, CSV/TXT) және нүктелерден горизонтальдар (3-кезең, Г және Д жолдары) ---------- */
const fileIn = document.createElement('input');
fileIn.type = 'file'; fileIn.hidden = true;
fileIn.accept = '.geojson,.json,.kml,.kmz,.gpx,.dxf,.csv,.txt';
document.body.appendChild(fileIn);
fileIn.addEventListener('change', () => { const f = fileIn.files[0]; fileIn.value = ''; if (f) importFile(f).catch(e => toast(e.message, true)); });
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
/** Файлды оқу → импорт терезесі. */
async function importFile(f) {
  if (!curMark()) { openMarkPicker(); return; }
  const ext = ((f.name.match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
  let r;
  if (ext === 'dxf') r = parseDxf(decodeDxf(new Uint8Array(await f.arrayBuffer())));
  else if (ext === 'csv' || ext === 'txt') {
    const t = parseCsv(await f.text()), m = guessColumns(t);
    r = { items: csvItems(t, m).items, wgs: false, csv: { t, m } };
  } else if (ext === 'geojson' || ext === 'json') r = parseGeojson(await f.text());
  else if (ext === 'kml') r = parseKml(await f.text());
  else if (ext === 'kmz') r = parseKmz(new Uint8Array(await f.arrayBuffer()), await loadFflate());
  else if (ext === 'gpx') r = parseGpx(await f.text());
  else throw new Error(tx('Белгісіз файл түрі: ', 'Неизвестный тип файла: ') + f.name);
  if (!r.items.length && !r.csv) throw new Error(tx('Файлда импорттайтын нысан табылмады.', 'В файле не найдено объектов для импорта.'));
  openImportDialog(f.name, r);
}
function openImportDialog(fname, r) {
  const m = curMark();
  const st = { crs: 'wgs84', zone: '', anchor: { x: '', y: '', lat: (+m.lat).toFixed(7), lon: (+m.lon).toFixed(7) }, rot: 0, sel: {} };
  const guess = () => {
    const { xs, ys } = allXY(r.items);
    const g = r.wgs ? { crs: 'wgs84' } : guessCrs(xs, ys, +m.lon);
    st.crs = g.crs; st.zone = g.zone || (g.crs === 'sk42' ? gkZone(+m.lon) : utmZone(+m.lon));
    if (xs.length) { st.anchor.x = Math.round((Math.min(...xs) + Math.max(...xs)) / 2 * 1000) / 1000; st.anchor.y = Math.round((Math.min(...ys) + Math.max(...ys)) / 2 * 1000) / 1000; }
  };
  const groups = () => groupsOf(r.items);
  const resetSel = () => { st.sel = {}; for (const g of groups()) st.sel[g.key] = g.kind; };
  guess(); resetSel();
  const GEOM = { point: tx('нүкте', 'точка'), line: tx('сызық', 'линия'), area: tx('аудан', 'участок'), text: tx('жазу', 'надпись') };
  const csvHtml = () => {
    if (!r.csv) return '';
    const { t, m: c } = r.csv;
    const sel = (k, lbl) => '<label>' + lbl + '<select data-col="' + k + '"><option value="-1">—</option>' + t.header.map((h, i) => '<option value="' + i + '"' + (c[k] === i ? ' selected' : '') + '>' + esc(h) + '</option>').join('') + '</select></label>';
    return '<fieldset class="pj-fs"><legend>' + tx('Бағандар', 'Столбцы') + '</legend><div class="pj-exgrid pj-impcols">' +
      sel('name', tx('Атауы / №', 'Название / №')) + sel('e', tx('Шығыс — E (геод. Y), бойлық', 'Восток — E (геод. Y), долгота')) + sel('n', tx('Солтүстік — N (геод. X), ендік', 'Север — N (геод. X), широта')) +
      sel('h', tx('Биіктік — H', 'Высота — H')) + sel('code', tx('Код (топтау)', 'Код (группы)')) + '</div>' +
      '<table class="pj-impprev"><tr>' + t.header.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr>' + t.rows.slice(0, 3).map(row => '<tr>' + t.header.map((_, i) => '<td>' + esc(row[i] ?? '') + '</td>').join('') + '</tr>').join('') + '</table>' +
      '<p class="qa-hint">' + tx('Тахеометр файлдарында X — солтүстік, Y — шығыс (геодезиялық шарт); бағандарды тексеріңіз.', 'В файлах тахеометра X — север, Y — восток (геодезическое правило); проверьте столбцы.') + '</p></fieldset>';
  };
  const crsHtml = () => r.wgs ? '<p class="qa-hint">' + tx('Координаттар жүйесі — WGS 84 (ендік / бойлық).', 'Система координат — WGS 84 (широта / долгота).') + '</p>'
    : '<fieldset class="pj-fs"><legend>' + tx('Координаттар жүйесі', 'Система координат') + '</legend><div class="pj-exgrid">' +
      '<label class="pj-wide">' + tx('Жүйе', 'Система') + '<select data-st="crs">' + CRS_LIST.map(c => '<option value="' + c.v + '"' + (c.v === st.crs ? ' selected' : '') + '>' + esc(UI === 'ru' ? c.ru : c.kk) + '</option>').join('') + '</select></label>' +
      (st.crs === 'utm' || st.crs === 'sk42' ? '<label>' + tx('Аймақ', 'Зона') + '<input type="text" inputmode="numeric" data-st="zone" value="' + esc(st.zone) + '"></label>' : '') +
      (st.crs === 'local' ? '<label>' + tx('Тірек нүктесі: шығыс (E)', 'Опорная точка: восток (E)') + '<input type="text" inputmode="decimal" data-st="ax" value="' + esc(st.anchor.x) + '"></label>' +
        '<label>' + tx('Тірек нүктесі: солтүстік (N)', 'Опорная точка: север (N)') + '<input type="text" inputmode="decimal" data-st="ay" value="' + esc(st.anchor.y) + '"></label>' +
        '<label>' + tx('Оның ендігі (WGS 84)', 'Её широта (WGS 84)') + '<input type="text" data-st="alat" value="' + esc(st.anchor.lat) + '"></label>' +
        '<label>' + tx('Оның бойлығы (WGS 84)', 'Её долгота (WGS 84)') + '<input type="text" data-st="alon" value="' + esc(st.anchor.lon) + '"></label>' +
        '<label>' + tx('Тордың бұрылуы, ° (сағат тілімен)', 'Поворот сетки, ° (по часовой)') + '<input type="text" inputmode="decimal" data-st="rot" value="' + esc(st.rot) + '"></label>' : '') +
      '</div>' + (st.crs === 'local' ? '<p class="qa-hint">' + tx('Әдепкіде: деректің ортасы ескерткіштің негізгі координатасына сәйкес қойылады. Тахеометр станциясының не белгілі нүктенің жергілікті және WGS 84 координаттарын енгізсеңіз — дәлірек.',
        'По умолчанию центр данных совмещается с основной координатой памятника. Точнее — ввести местные и WGS 84 координаты станции тахеометра или известной точки.') + '</p>' : '') + '</fieldset>';
  const groupsHtml = () => '<table class="pj-impgroups"><thead><tr><th></th><th>' + tx('Топ (қабат, код)', 'Группа (слой, код)') + '</th><th>' + tx('Саны', 'Кол-во') + '</th><th>' + tx('Белгі түрі', 'Тип знака') + '</th></tr></thead><tbody>' +
    groups().map(g => '<tr><td><input type="checkbox" data-gon="' + esc(g.key) + '"' + (st.sel[g.key] ? ' checked' : '') + ' aria-label="' + esc(tx('Импорттау', 'Импортировать')) + '"></td>' +
      '<td>' + esc(g.label.startsWith('kind:') ? featLabel(g.label.slice(5), UI) : g.label) + ' <small>(' + GEOM[g.geom] + ')</small></td><td>' + g.count + '</td>' +
      '<td><select data-gk="' + esc(g.key) + '">' + kindsFor(g.geom).map(k => '<option value="' + k.v + '"' + (k.v === (st.sel[g.key] || g.kind) ? ' selected' : '') + '>' + esc(featLabel(k.v, UI)) + '</option>').join('') + '</select></td></tr>').join('') + '</tbody></table>';
  const back = dialog('pj-impdlg',
    '<form novalidate><h3>' + svgIc(IC.fimport) + tx('Импорт: ', 'Импорт: ') + esc(fname) + '<small class="pj-dlgsub">' + esc(markName(m)) + '</small></h3>' +
    '<div id="pjImpCsv">' + csvHtml() + '</div><div id="pjImpCrs">' + crsHtml() + '</div><div id="pjImpGroups">' + groupsHtml() + '</div>' +
    '<div class="pj-pvwarn" id="pjImpInfo" role="status"></div>' +
    '<div class="qa-dlg-btns"><span class="mk-sp"></span><button type="button" class="btn btn--ghost btn--sm" data-x>' + tx('Бас тарту', 'Отмена') + '</button>' +
      '<button type="submit" class="btn btn--primary btn--sm">' + tx('Импорттау', 'Импортировать') + '</button></div></form>');
  let built = null;
  /** Жазбаларды құрып, қорытындыны көрсету: саны, деректің ортасы ескерткіштен қаншалықты алыс. */
  const build = () => {
    const info = back.querySelector('#pjImpInfo');
    built = null;
    let tf;
    try { tf = r.wgs ? (x, y) => [y, x] : makeTransform({ crs: st.crs, zone: st.zone, anchor: { x: parseNum(String(st.anchor.x)), y: parseNum(String(st.anchor.y)), lat: parseNum(String(st.anchor.lat)), lon: parseNum(String(st.anchor.lon)) }, rot: parseNum(String(st.rot)) || 0 }); }
    catch (e) { info.innerHTML = '<p class="pj-bad">' + esc(UI === 'ru' && e.ru ? e.ru : e.message) + '</p>'; return; }
    const res = toRecords(r.items, st.sel, tf, markId, st.crs === 'local' ? parseNum(String(st.rot)) || 0 : 0);
    built = res.recs;
    const lls = res.recs.flatMap(x => (x.pts ? x.pts : [[x.lat, x.lon]]));
    let far = '';
    if (lls.length) {
      const c = lls.reduce((s, p) => [s[0] + p[0] / lls.length, s[1] + p[1] / lls.length], [0, 0]);
      const d = Number.isFinite(c[0]) ? inverse(+m.lat, +m.lon, c[0], c[1]).dist : Infinity;
      far = d > 20000 ? '<p class="pj-bad">' + tx('Деректің ортасы ескерткіштен ' + fmtDist(d) + ' қашықтықта — координаттар жүйесін не бағандарды тексеріңіз.', 'Центр данных в ' + fmtDist(d) + ' от памятника — проверьте систему координат или столбцы.') + '</p>'
        : '<p>' + tx('Деректің ортасы ескерткіштен ', 'Центр данных от памятника: ') + fmtDist(d) + '.</p>';
    }
    const by = {};
    for (const x of res.recs) by[x.kind] = (by[x.kind] || 0) + 1;
    info.innerHTML = '<p><b>' + tx('Импортталады: ', 'Будет импортировано: ') + res.recs.length + '</b>' + (Object.keys(by).length ? ' — ' + esc(Object.entries(by).map(([k, n]) => featLabel(k, UI).toLocaleLowerCase(UI) + ' ' + n).join(', ')) : '') + '</p>' +
      (res.skipped ? '<p>' + tx('Өткізіледі (геометриясы не мәні жоқ): ', 'Пропускается (нет геометрии или значения): ') + res.skipped + '</p>' : '') + far;
  };
  const repaint = what => {
    if (what.includes('csv')) back.querySelector('#pjImpCsv').innerHTML = csvHtml();
    if (what.includes('crs')) back.querySelector('#pjImpCrs').innerHTML = crsHtml();
    if (what.includes('groups')) back.querySelector('#pjImpGroups').innerHTML = groupsHtml();
    build();
  };
  back.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.col) { r.csv.m[el.dataset.col] = +el.value; r.items = csvItems(r.csv.t, r.csv.m).items; guess(); resetSel(); repaint(['crs', 'groups']); return; }
    if (el.dataset.st === 'crs') { st.crs = el.value; repaint(['crs']); return; }
    if (el.dataset.st) { const k = el.dataset.st, v = el.value.trim(); if (k === 'zone') st.zone = v; else if (k === 'rot') st.rot = v; else st.anchor[{ ax: 'x', ay: 'y', alat: 'lat', alon: 'lon' }[k]] = v; build(); return; }
    if (el.dataset.gon) { const g = groups().find(x => x.key === el.dataset.gon); st.sel[g.key] = el.checked ? back.querySelector('select[data-gk="' + CSS.escape(g.key) + '"]').value : ''; build(); return; }
    if (el.dataset.gk) { st.sel[el.dataset.gk] = el.value; const cb = back.querySelector('input[data-gon="' + CSS.escape(el.dataset.gk) + '"]'); if (cb) cb.checked = true; build(); }
  });
  back.querySelector('[data-x]').addEventListener('click', closeDialog);
  back.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    build();
    if (!built || !built.length) { toast(tx('Импорттайтын белгі жоқ.', 'Нет знаков для импорта.'), true); return; }
    const btn = back.querySelector('[type=submit]');
    btn.disabled = true;
    let added = 0, skipped = 0, err = '';
    try {
      for (let i = 0; i < built.length; i += 5000) {
        const j = await api('fimport', { data: JSON.stringify(built.slice(i, i + 5000)) });
        added += j.added; skipped += j.skipped; err = err || j.error;
      }
      closeDialog();
      toast(tx('Импортталды: ', 'Импортировано: ') + added + (skipped ? tx(', өткізілді: ', ', пропущено: ') + skipped + (err ? ' (' + err + ')' : '') : ''), !!skipped && !added);
      if (!open) openPanel();
    } catch (er) { btn.disabled = false; toast(er.message, true); }
  });
  build();
}

/** Нүктелерден горизонтальдар: ескерткіштің биіктік белгілері (height) → TIN → горизонтальдар (src = tin). */
function openContourDialog() {
  const m = curMark();
  if (!m) { openMarkPicker(); return; }
  const src = markFeatures().filter(f => f.kind === 'height' && f.value != null && f.lat != null);
  if (src.length < 3) { toast(tx('Кемінде 3 биіктік белгісі керек — оларды CSV / DXF файлынан импорттаңыз не картада қойыңыз.', 'Нужно не менее 3 отметок высоты — импортируйте их из CSV / DXF или поставьте на карте.'), true); return; }
  if (src.length > TIN_MAX) { toast(tx('Нүкте тым көп (' + src.length + '); ең көбі ' + TIN_MAX + '.', 'Слишком много точек (' + src.length + '); не более ' + TIN_MAX + '.'), true); return; }
  const zs = src.map(f => +f.value), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const old = markFeatures().filter(f => f.src === 'tin');
  const range = z1 - z0, defStep = range > 40 ? 5 : range > 15 ? 2 : range > 4 ? 1 : range > 1.5 ? 0.5 : 0.25;
  const back = dialog('pj-tindlg',
    '<form novalidate><h3>' + svgIc(IC.fline) + tx('Нүктелерден горизонтальдар', 'Горизонтали по точкам') + '<small class="pj-dlgsub">' + esc(markName(m)) + '</small></h3>' +
    '<p class="qa-hint">' + tx('Биіктік белгілері: ', 'Отметок высоты: ') + src.length + tx(' · биіктігі ', ' · высоты ') + fmtNum(z0, 2) + '–' + fmtNum(z1, 2) + ' м. ' +
      tx('Горизонтальдар нүктелер арасындағы үшбұрыштар бойынша сызықтық интерполяциямен құрылады; нүкте жоқ жерде салынбайды.', 'Горизонтали строятся линейной интерполяцией по треугольникам между точками; там, где точек нет, не строятся.') + '</p>' +
    '<div class="pj-exgrid">' +
      '<label>' + tx('Қимасы (қадамы), м', 'Сечение рельефа, м') + '<input type="text" inputmode="decimal" id="pjTinStep" value="' + fmtNum(defStep, 2) + '"></label>' +
      '<label>' + tx('Үшбұрыш қабырғасының шегі, м', 'Предел стороны треугольника, м') + '<input type="text" inputmode="decimal" id="pjTinEdge" placeholder="' + tx('автоматты', 'автоматически') + '"></label>' +
    '</div>' +
    '<label class="qa-check"><input type="checkbox" id="pjTinSmooth" checked> ' + tx('Тегістеу', 'Сглаживание') + '</label>' +
    (old.length ? '<label class="qa-check"><input type="checkbox" id="pjTinReplace" checked> ' + tx('Бұрын құрылған горизонтальдарды ауыстыру (' + old.length + ')', 'Заменить ранее построенные горизонтали (' + old.length + ')') + '</label>' : '') +
    '<p class="pj-ferr" id="pjTinErr" hidden></p>' +
    '<div class="qa-dlg-btns"><span class="mk-sp"></span><button type="button" class="btn btn--ghost btn--sm" data-x>' + tx('Бас тарту', 'Отмена') + '</button>' +
      '<button type="submit" class="btn btn--primary btn--sm">' + tx('Құру', 'Построить') + '</button></div></form>');
  back.querySelector('[data-x]').addEventListener('click', closeDialog);
  back.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    const err = back.querySelector('#pjTinErr');
    const step = parseNum(back.querySelector('#pjTinStep').value), edge = parseNum(back.querySelector('#pjTinEdge').value);
    if (!(step > 0) || (range / step) > 500) { err.textContent = tx('Қима — нөлден үлкен сан (горизонтальдар 500-ден аспауы керек).', 'Сечение — число больше нуля (не более 500 горизонталей).'); err.hidden = false; return; }
    if (edge != null && !(edge > 0)) { err.textContent = tx('Қабырға шегі — нөлден үлкен сан не бос.', 'Предел стороны — число больше нуля или пусто.'); err.hidden = false; return; }
    const P = plane(+m.lat, +m.lon);
    const res = contours(src.map(f => [...P.fwd(+f.lat, +f.lon), +f.value]), { step, maxEdge: edge || 0, smooth: back.querySelector('#pjTinSmooth').checked });
    if (!res.lines.length) { err.textContent = tx('Горизонталь шықпады: нүктелердің биіктігі бір деңгейде не үшбұрыштар тым ұзын (шекті үлкейтіңіз).', 'Горизонтали не получились: точки на одном уровне или треугольники слишком длинные (увеличьте предел).'); err.hidden = false; return; }
    const recs = res.lines.map(l => ({ mark_id: markId, kind: 'contour', value: l.value, src: 'tin', pts: thinPts(l.pts.map(p => P.inv(p[0], p[1]))) }));
    try {
      if (old.length && back.querySelector('#pjTinReplace')?.checked) await api('fdelete', { id: old.map(f => f.id).join(',') });
      const j = await api('fimport', { data: JSON.stringify(recs) });
      closeDialog();
      toast(tx('Горизонтальдар құрылды: ', 'Построено горизонталей: ') + j.added + ' (' + fmtNum(res.lines[0].value, 2) + '–' + fmtNum(res.lines[res.lines.length - 1].value, 2) + ' м' + tx(', қабырға шегі ', ', предел стороны ') + fmtNum(res.maxEdge, 1) + ' м)');
    } catch (er) { toast(er.message, true); }
  });
}

/* ---------- Жоспарға қосылған «Өзге нысандар» (құдық, бұлақ, қыстау…): plans.places — id-лер, деректер places қабатынан ---------- */
const placeName = (p, l = UI) => (l === 'ru' ? p.name_ru || p.name : p.name || p.name_ru) || (PLACE_KINDS.find(k => k.v === p.kind) || PLACE_KINDS[PLACE_KINDS.length - 1])[l === 'ru' ? 'ru' : 'kk'];
const planPlaces = () => { const ids = (curPlan() || {}).places || []; return ids.map(id => places().find(p => p.id === id)).filter(Boolean); };
function openPlacesPicker() {
  const m = curMark();
  if (!m) { openMarkPicker(); return; }
  const all = places();
  if (!all.length) { toast(tx('Жобада өзге нысан жоқ. Құдық, бұлақ, қыстау т.б. «Белгі қою» бөлімінде қосылады.', 'В проекте нет прочих объектов. Колодцы, родники, зимовки и др. добавляются в разделе «Метки».'), true); return; }
  const cur = new Set((curPlan() || {}).places || []);
  const rows = all.map(p => ({ p, d: inverse(+m.lat, +m.lon, +p.lat, +p.lon).dist })).sort((a, b) => a.d - b.d).slice(0, 300);
  const back = dialog('pj-pldlg',
    '<form novalidate><h3>' + svgIc(IC.fpoint) + tx('Өзге нысандарды жоспарға қосу', 'Прочие объекты на плане') + '<small class="pj-dlgsub">' + esc(markName(m)) + '</small></h3>' +
    '<p class="qa-hint">' + tx('Нысандар көшірілмейді: атауы мен орны «Белгі қою» бөліміндегі деректен алынады. Ескерткішке жақыны жоғарыда; сызба аймағынан тыс қалғаны жоспарда көрінбейді.',
      'Объекты не копируются: название и положение берутся из раздела «Метки». Ближайшие к памятнику — вверху; находящиеся вне чертежа на плане не видны.') + '</p>' +
    '<div class="pj-mlist pj-pllist">' + rows.map(({ p, d }) => '<label class="qa-check pj-plrow"><input type="checkbox" value="' + esc(p.id) + '"' + (cur.has(p.id) ? ' checked' : '') + '> <b>' + esc(placeName(p)) + '</b>' +
      '<small>' + esc((PLACE_KINDS.find(k => k.v === p.kind) || PLACE_KINDS[PLACE_KINDS.length - 1])[UI === 'ru' ? 'ru' : 'kk']) + ' · ' + fmtDist(d) + '</small></label>').join('') + '</div>' +
    '<div class="qa-dlg-btns"><span class="mk-sp"></span><button type="button" class="btn btn--ghost btn--sm" data-x>' + tx('Бас тарту', 'Отмена') + '</button>' +
      '<button type="submit" class="btn btn--primary btn--sm">' + tx('Сақтау', 'Сохранить') + '</button></div></form>');
  back.querySelector('[data-x]').addEventListener('click', closeDialog);
  back.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    const ids = [...back.querySelectorAll('.pj-pllist input:checked')].map(x => x.value);
    try { await savePlan({ places: ids }); closeDialog(); toast(tx('Жоспардағы өзге нысандар: ', 'Прочих объектов на плане: ') + ids.length); } catch (err) { toast(err.message, true); }
  });
}
/** «Жағдаят» мәзірі: сызықтар, аудандар, нүктелік белгілер, жазу, өзге нысандар. */
function featMenu(btn) {
  if (mode && (mode.kind === 'fdraw' || mode.kind === 'fedit')) { stopMode(); return; }
  if (!curMark()) { openMarkPicker(); return; }
  const r = btn.getBoundingClientRect();
  const it = k => ({ label: featLabel(k.v, UI), hint: FHINT[k.v][UI === 'ru' ? 1 : 0], icon: k.cat === 'line' ? IC.fline : k.cat === 'area' ? IC.farea : k.cat === 'text' ? IC.ftext : IC.fpoint,
    run: () => startMode({ kind: 'fdraw', fkind: k.v, draft: { mark_id: markId } }) });
  const cat = c => FEAT_KINDS.filter(k => k.cat === c).map(it);
  globalThis.MuraCtx?.openMenu(r.left, r.bottom + 4, tx('Жағдаят белгісін салу', 'Нанести знак ситуации'), [...cat('line'), 'sep', ...cat('area'), 'sep', ...cat('point'), 'sep', ...cat('text'), 'sep',
    { label: tx('Өзге нысандарды жоспарға қосу…', 'Добавить прочие объекты на план…'), hint: tx('құдық, бұлақ, қыстау т.б. — «Белгі қою» бөлімінен', 'колодец, родник, зимовка и др. — из раздела «Метки»'), icon: IC.fpoint, run: openPlacesPicker },
    { label: tx('Файлдан импорттау…', 'Импорт из файла…'), hint: 'GeoJSON, KML, KMZ, GPX, DXF, CSV / TXT', icon: IC.fimport, run: () => { if (!curMark()) { openMarkPicker(); return; } fileIn.click(); } },
    { label: tx('Нүктелерден горизонтальдар құру…', 'Построить горизонтали по точкам…'), hint: tx('биіктік белгілерінен (TIN)', 'по отметкам высоты (TIN)'), icon: IC.fline, run: openContourDialog }]);
}
$('pjSit').addEventListener('click', e => featMenu(e.currentTarget));
function rubberF(ll) {
  tempLayer.clearLayers();
  if (!mode || mode.kind !== 'fdraw') return;
  const pts = mode.pts;
  for (const p of pts) L.circleMarker(p, { radius: 4, color: ST.sel, fillColor: '#fff', fillOpacity: 1, weight: 2, interactive: false }).addTo(tempLayer);
  if (pts.length) L.polyline(ll ? pts.concat([[ll.lat, ll.lng]]) : pts, { color: ST.sel, weight: 2, interactive: false }).addTo(tempLayer);
  if (featCat(mode.fkind) === 'area' && pts.length >= 2 && ll) L.polyline([[ll.lat, ll.lng], pts[0]], { color: ST.sel, weight: 1, dashArray: '3 5', interactive: false }).addTo(tempLayer);
}
function finishFeatLine() {
  const m = mode;
  const pts = m.pts.filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  if (featCat(m.fkind) === 'area') {
    if (new Set(pts.map(p => p.join(','))).size < 3) { toast(tx('Ауданда кемінде үш төбе болуы керек.', 'В участке должно быть не менее трёх вершин.'), true); return; }
    const P = plane(pts[0][0], pts[0][1]);
    if (selfIntersects(pts.map(p => P.fwd(p[0], p[1])))) { toast(tx('Шекара өзімен қиылысады — төбелерді қайта қойыңыз (Backspace).', 'Граница самопересекается — переставьте вершины (Backspace).'), true); return; }
  } else if (pts.length < 2) { toast(tx('Сызықта кемінде екі төбе болуы керек.', 'В линии должно быть не менее двух вершин.'), true); return; }
  stopMode(true);
  render();
  openFeatDialog(null, { draft: { ...m.draft, kind: m.fkind, pts } });
}
/** Ағаш: терезесіз бірден сақталады, режим қосулы қалады (бірнеше ағашты қатарынан қою). */
async function addTree(ll) {
  try { await api('fsave', { data: JSON.stringify({ mark_id: markId, kind: 'tree', lat: ll.lat, lon: ll.lng }) }); } catch (e) { toast(e.message, true); }
}
/** Сақталған белгіні картада түзету: нүкте — жылжыту; сызық — төбелерді сүйреу, тінтуірдің оң жағы — төбені өшіру. */
function startFeatEdit() {
  const f = features.find(x => x.id === mode.id);
  if (!f) return;
  const w = JSON.parse(JSON.stringify(f));
  const isLine = isMulti(f.kind), isArea = featCat(f.kind) === 'area';
  const preview = isArea ? L.polygon(w.pts, { color: ST.sel, weight: 3, fillOpacity: 0.15, interactive: false }).addTo(tempLayer)
    : isLine ? L.polyline(w.pts, { color: ST.sel, weight: 3, interactive: false }).addTo(tempLayer) : null;
  const save = async () => { try { await api('fsave', { data: JSON.stringify(w) }); } catch (e) { toast(e.message, true); } };
  (isLine ? w.pts : [[w.lat, w.lon]]).forEach((ll, i) => {
    const h = L.marker(ll, { icon: handleIcon(isLine ? '' : ' is-center'), draggable: true, keyboard: false, zIndexOffset: 1000 }).addTo(tempLayer);
    h.on('drag', () => {
      const q = h.getLatLng();
      if (isLine) { w.pts[i] = [q.lat, q.lng]; preview.setLatLngs(w.pts); } else { w.lat = q.lat; w.lon = q.lng; }
    });
    h.on('dragend', save);
    if (isLine) h.on('contextmenu', async ev => {
      L.DomEvent.stop(ev);
      if (w.pts.length <= (isArea ? 3 : 2)) { toast(isArea ? tx('Ауданда кемінде үш төбе қалуы керек.', 'В участке должно остаться не менее трёх вершин.') : tx('Сызықта кемінде екі төбе қалуы керек.', 'В линии должно остаться не менее двух вершин.'), true); return; }
      w.pts.splice(i, 1);
      await save();
      startMode({ kind: 'fedit', id: w.id });
    });
  });
}

/** Жағдаят белгісінің терезесі: түрі (сол геометрия ішінде), жазуы, мәні, бұрышы, орны. */
const ffieldIds = { kind: 'pjFKind', name: 'pjFName', value: 'pjFValue', rot: 'pjFRot', lat: 'pjFLat', pts: 'pjFKind', mark_id: 'pjFKind' };
function openFeatDialog(f, opts = {}) {
  const m = curMark();
  if (!m) { openMarkPicker(); return; }
  const v = { mark_id: markId, kind: 'point', name: '', name_ru: '', value: null, rot: 0, lat: null, lon: null, pts: null, ...(f || {}), ...(opts.draft || {}) };
  const isNew = !v.id, cat = featCat(v.kind);
  const coord = x => (x == null || x === '' ? '' : (+x).toFixed(7));
  let lenTxt = '';
  if ((cat === 'line' || cat === 'area') && Array.isArray(v.pts) && v.pts.length) {
    const P = plane(v.pts[0][0], v.pts[0][1]), xy = v.pts.map(p => P.fwd(p[0], p[1]));
    if (cat === 'line') {
      let len = 0;
      for (let i = 1; i < xy.length; i++) len += dist2(xy[i - 1], xy[i]);
      lenTxt = tx('Төбелері: ', 'Вершин: ') + v.pts.length + tx(' · ұзындығы ≈ ', ' · длина ≈ ') + fmtDist(len);
    } else {
      let a = 0;
      for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) a += xy[j][0] * xy[i][1] - xy[i][0] * xy[j][1];
      a = Math.abs(a / 2);
      lenTxt = tx('Төбелері: ', 'Вершин: ') + v.pts.length + tx(' · ауданы ≈ ', ' · площадь ≈ ') + (a >= 10000 ? fmtNum(a / 10000, 2) + tx(' га', ' га') : fmtNum(a, 0) + ' м²');
    }
  }
  const back = dialog('pj-featdlg',
    '<form novalidate><h3>' + svgIc(IC.sit) + esc(isNew ? tx('Жаңа жағдаят белгісі', 'Новый знак ситуации') : featLabel(v.kind, UI)) + '<small class="pj-dlgsub">' + esc(markName(m)) + '</small></h3>' +
    '<div class="qa-row2"><div class="qa-f"><label for="pjFKind">' + tx('Түрі', 'Тип') + '</label><select id="pjFKind" name="kind">' +
      FEAT_KINDS.filter(k => k.cat === cat).map(k => '<option value="' + k.v + '"' + (k.v === v.kind ? ' selected' : '') + '>' + esc(featLabel(k.v, UI)) + '</option>').join('') + '</select><p class="pj-ferr" data-for="kind"></p></div>' +
      '<div class="qa-f" id="pjFValueF"><label for="pjFValue" id="pjFValueL"></label><input type="text" id="pjFValue" name="value" inputmode="decimal" value="' + esc(v.value == null ? '' : fmtNum(v.value, 3)) + '"><p class="pj-ferr" data-for="value"></p></div>' +
      (cat === 'text' ? '<div class="qa-f"><label for="pjFRot">' + tx('Бұрылу бұрышы, °', 'Угол поворота, °') + '</label><input type="text" id="pjFRot" name="rot" inputmode="decimal" value="' + esc(fmtNum(v.rot || 0, 1)) + '"><p class="pj-ferr" data-for="rot"></p></div>' : '') +
    '</div>' +
    (I18N.biField ? I18N.biField({ id: 'pjFName', name: 'name', label: cat === 'text' ? tx('Мәтіні', 'Текст') : tx('Жазуы (қажет болса)', 'Подпись (при необходимости)'), kk: v.name, ru: v.name_ru, max: 200, req: cat === 'text' }) : '') +
    '<p class="pj-ferr" data-for="name"></p>' +
    (cat === 'line' || cat === 'area' ? '<p class="qa-hint">' + esc(lenTxt) + '</p><p class="pj-ferr" data-for="pts"></p>'
      : '<fieldset class="pj-fs"><legend>' + tx('Орны (WGS 84)', 'Положение (WGS 84)') + '</legend><div class="qa-row2">' +
        '<div class="qa-f"><label for="pjFLat">' + tx('Ендік (N)', 'Широта (N)') + '</label><input type="text" id="pjFLat" name="lat" autocomplete="off" spellcheck="false" value="' + esc(coord(v.lat)) + '"></div>' +
        '<div class="qa-f"><label for="pjFLon">' + tx('Бойлық (E)', 'Долгота (E)') + '</label><input type="text" id="pjFLon" name="lon" autocomplete="off" spellcheck="false" value="' + esc(coord(v.lon)) + '"></div></div>' +
        '<p class="pj-ferr" data-for="lat"></p></fieldset>') +
    '<p class="qa-hint">' + tx('Жағдаят белгісі нөмірленбейді және экспликацияға түспейді. Жоспар бетінде (алдын ала қарауда) жазуын тінтуірмен жылжытуға болады.',
      'Знак ситуации не нумеруется и не входит в экспликацию. На листе плана (в предпросмотре) подпись можно перетащить мышью.') + '</p>' +
    '<p class="mk-err" id="pjFErr" role="alert" hidden></p>' +
    '<div class="qa-dlg-btns">' + (isNew ? '' : '<button type="button" class="lnk lnk--danger" id="pjFDel">' + tx('Өшіру', 'Удалить') + '</button><button type="button" class="lnk" id="pjFGeo">' + tx('Картада түзету', 'Исправить на карте') + '</button>') +
      '<span class="mk-sp"></span><button type="button" class="btn btn--ghost btn--sm" data-x>' + tx('Бас тарту', 'Отмена') + '</button>' +
      '<button type="submit" class="btn btn--primary btn--sm">' + tx('Сақтау', 'Сохранить') + '</button></div></form>');
  const form = back.querySelector('form'), F = form.elements;
  const ferr = (k, t) => { const el = back.querySelector('.pj-ferr[data-for="' + k + '"]'); if (el) { el.textContent = t || ''; el.hidden = !t; } const inp = $(ffieldIds[k]); if (inp) inp.classList.toggle('is-bad', !!t); };
  const clearErr = () => { back.querySelectorAll('.pj-ferr').forEach(el => { el.textContent = ''; el.hidden = true; }); back.querySelectorAll('.is-bad').forEach(el => el.classList.remove('is-bad')); back.querySelector('#pjFErr').hidden = true; };
  const paintKind = () => {
    const k = F.kind.value;
    back.querySelector('#pjFValueF').hidden = k !== 'contour' && k !== 'height';
    back.querySelector('#pjFValueL').innerHTML = k === 'height' ? tx('Биіктігі, м', 'Высота, м') + ' <span class="mk-req">*</span>' : tx('Горизонтальдың биіктігі, м', 'Высота горизонтали, м');
  };
  F.kind.addEventListener('change', paintKind);
  clearErr();
  paintKind();
  back.querySelector('[data-x]').addEventListener('click', closeDialog);
  back.querySelector('#pjFDel')?.addEventListener('click', () => { closeDialog(); removeFeat(f); });
  back.querySelector('#pjFGeo')?.addEventListener('click', () => { closeDialog(); startMode({ kind: 'fedit', id: v.id }); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    clearErr();
    const k = F.kind.value, errs = [];
    const bad = (key, t) => { errs.push(key); ferr(key, t); };
    const rec = { ...v, kind: k, mark_id: markId, name: F.name ? F.name.value.trim() : v.name, name_ru: F.name_ru ? F.name_ru.value.trim() : v.name_ru };
    rec.value = k === 'contour' || k === 'height' ? parseNum(F.value.value) : null;
    if (Number.isNaN(rec.value)) bad('value', tx('Сан енгізіңіз (мыс. 427,5).', 'Введите число (напр. 427,5).'));
    else if (k === 'height' && rec.value === null) bad('value', tx('Биіктікті енгізіңіз.', 'Введите высоту.'));
    if (cat === 'text') {
      rec.rot = parseNum(F.rot.value) ?? 0;
      if (Number.isNaN(rec.rot)) bad('rot', tx('Бұрыш дұрыс емес.', 'Неверный угол.'));
      if (!rec.name && !rec.name_ru) bad('name', tx('Жазудың мәтінін енгізіңіз.', 'Введите текст надписи.'));
    }
    if (cat !== 'line' && cat !== 'area') {
      const ll = parseLatLon(F.lat.value, F.lon.value);
      if (!ll) bad('lat', tx('Координата дұрыс емес (мыс. 50.412345, 50°24′44,4″).', 'Неверная координата (напр. 50.412345, 50°24′44,4″).'));
      else { rec.lat = ll.lat; rec.lon = ll.lon; }
    }
    if (errs.length) { $(ffieldIds[errs[0]])?.focus?.(); return; }
    try {
      await api('fsave', { data: JSON.stringify(rec) });
      closeDialog();
      toast(tx('Белгі сақталды: ', 'Знак сохранён: ') + featLabel(k, UI).toLocaleLowerCase(UI) + '.');
    } catch (err) {
      if (err.field && ffieldIds[err.field]) ferr(err.field, err.message);
      else { const g = back.querySelector('#pjFErr'); g.textContent = err.message; g.hidden = false; }
    }
  });
  (cat === 'text' || !F.value || back.querySelector('#pjFValueF').hidden ? $('pjFName') || F.kind : F.value).focus();
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
    '<div class="qa-row2"><div class="qa-f" data-kind="kurgan"><label for="pjKtype">' + tx('Қорғанның түрі', 'Тип кургана') + '</label><select id="pjKtype" name="ktype">' + optList(KTYPES, v.ktype, tx('— анықталмаған —', '— не определён —')) + '</select></div>' +
      '<div class="qa-f" data-nokind="kurgan"><label for="pjMat">' + tx('Материалы', 'Материал') + '</label><select id="pjMat" name="material">' + optList(MATERIALS, v.material, tx('— белгісіз —', '— неизвестен —')) + '</select></div>' +
      '<div class="qa-f" data-kind="kulpytas"><label for="pjSub">' + tx('Құлпытастың типі', 'Тип кулпытаса') + '</label><select id="pjSub" name="subtype">' + optList(SUBTYPES, v.subtype, tx('— анықталмаған —', '— не определён —')) + '</select></div>' +
      '<div class="qa-f"><label for="pjState">' + tx('Техникалық жай-күйі', 'Техническое состояние') + '</label><select id="pjState" name="state">' + optList(STATES, v.state, '—') + '</select></div></div>' +
    '<div class="qa-f" data-kind="kurgan"><label class="qa-check"><input type="checkbox" name="dug"' + (v.dug ? ' checked' : '') + '> ' +
      tx('Қазылған (зерттелген) қорған — жоспарда қиғаш штрихпен көрсетіледі', 'Раскопанный (исследованный) курган — на плане показывается косой штриховкой') + '</label></div>' +
    '<div class="qa-f" data-kind="kurgan"><label>' + tx('Бетінде (жоспарда контурдың ішінде көрсетіледі)', 'На поверхности (показывается внутри контура на плане)') + '</label><div class="pj-surf">' +
      SURFACES.map(x => '<label class="qa-check"><input type="checkbox" name="surface" value="' + x.v + '"' + (Array.isArray(v.surface) && v.surface.includes(x.v) ? ' checked' : '') + '> ' + esc(UI === 'ru' ? x.ru : x.kk) + '</label>').join('') + '</div></div>' +
    '<div class="qa-f" data-kind="kurgan"><label>' + tx('Мұрттары (мұртты қорғанның тас жалдары)', 'Усы (каменные гряды кургана с усами)') + '</label>' +
      '<div class="pj-btnrow"><span class="qa-hint" id="pjMusInfo"></span><button type="button" class="lnk" id="pjMusDraw">' + svgIc(IC.mus, 15) + ' ' + tx('Мұрт сызу', 'Начертить ус') + '</button>' +
      '<button type="button" class="lnk lnk--danger" id="pjMusClr">' + tx('Мұрттарды өшіру', 'Удалить усы') + '</button></div></div>' +
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
  let mus = Array.isArray(v.mus) && v.mus.length ? v.mus.slice() : null;
  const paintMus = () => {
    back.querySelector('#pjMusInfo').textContent = mus ? tx('Мұрттары: ', 'Усов: ') + mus.length : tx('Мұрты жоқ.', 'Усов нет.');
    back.querySelector('#pjMusClr').hidden = !mus;
  };
  paintMus();
  const paintShape = () => {
    const s = F.shape.value;
    back.querySelectorAll('label[data-rect]').forEach(l => { l.textContent = s === 'rect' ? l.dataset.rect : l.dataset.ell; });
    back.querySelectorAll('[data-kind]').forEach(el => { el.hidden = F.kind.value !== el.dataset.kind; });
    // Қорғанда материалдың орнына түрі; бұрын материал берілген қорғанда өріс көрінеді (деректі өшіру мүмкін болсын)
    back.querySelectorAll('[data-nokind]').forEach(el => { el.hidden = F.kind.value === el.dataset.nokind && !F.material.value; });
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
      material: F.material.value, subtype: F.kind.value === 'kulpytas' ? F.subtype.value : '', ktype: F.kind.value === 'kurgan' ? F.ktype.value : '', state: F.state.value,
      surface: F.kind.value === 'kurgan' ? [...back.querySelectorAll('input[name="surface"]:checked')].map(x => x.value) : null,
      dug: F.kind.value === 'kurgan' && back.querySelector('input[name="dug"]').checked ? true : null,
      height: parseNum(F.height.value), diam: parseNum(F.diam.value), ax_a: parseNum(F.ax_a.value), ax_b: parseNum(F.ax_b.value), ax_az: parseNum(F.ax_az.value), dim_az: parseNum(F.dim_az.value),
      pts, dim: di !== '' && dj !== '' && di !== dj ? [+di, +dj] : null, mus,
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
  // Мұрт: картада сызылып, терезе қайта ашылады (сақтау — «Сақтау» батырмасымен)
  back.querySelector('#pjMusDraw').addEventListener('click', () => {
    const d = collect();
    closeDialog();
    startMode({ kind: 'mus', draft: d, after: d2 => reopen(d2 || d) });
  });
  back.querySelector('#pjMusClr').addEventListener('click', () => { mus = null; paintMus(); });
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
  return { mark: m, objects: markObjects(), features: markFeatures(), places: planPlaces(), plan: p, lang, names: { title, ptr: p ? ptrName(p, lang) : '' } };
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
/** Белгілер мен өлшем жазуларын сүйреу: жылжу мм-де сақталады (lbl — жалпы жоспар, dimlbl — жеке жоспар, flbl — жағдаят белгісінің жазуы). */
function bindDrag(svg) {
  if (!svg) return;
  svg.querySelectorAll('[data-drag]').forEach(g => {
    g.style.cursor = 'move';
    g.addEventListener('pointerdown', e => {
      e.preventDefault();
      const [kind, id] = g.dataset.drag.split(':');
      const isF = kind === 'flbl', isP = kind === 'plbl';
      const pl = curPlan() || {};
      const o = isP ? { id } : (isF ? features : objects).find(x => x.id === id);
      if (!o) return;
      const key = kind === 'dim' ? 'dimlbl' : 'lbl';
      const was = isP ? (pl.place_lbl || {})[id] : o[key];
      const base = Array.isArray(was) ? was.slice() : [0, 0];
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
        try {
          if (isP) await savePlan({ place_lbl: { ...(pl.place_lbl || {}), [id]: cur } });
          else await api(isF ? 'fsave' : 'save', { data: JSON.stringify({ ...o, [key]: cur }) });
        } catch (err) { toast(err.message, true); }
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
  openPanel, closePanel, openForMark, setMark, select, openObjDialog, openPtrDialog, openPreview, exportPdf, api, openFeatDialog, importFile, openContourDialog,
  get objects() { return objects; }, get features() { return features; }, get plans() { return plans; }, get markId() { return markId; }, get selected() { return selId; }, get mode() { return mode && mode.kind; },
  ctx: ctxFor, renderPage: (kind, id, scale, lang = UI) => renderPage(ctxFor(lang), kind, id ? objects.find(o => o.id === id) : null, scale || 0),
  stop() { stopMode(true); closeDialog(); },
};
