/* Mura GIS: «Жоспар» қызметінің интерфейс бөліктері — екінші қатардағы құралдар (data-svc="plan") және оң жақ панель.
   Логикасы — plan/plan.js. Бұл файл services.js пен qorgau/ui.js-тен БҰРЫН орындалады
   (ui.js құралдар жолағының батырмаларын жүктелу кезінде санайды). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var tmain = $('qaTmain'), stage = $('qaStage');
  if (!tmain || !stage) return;
  var T = window.tx || function (kk) { return kk; };
  var svg = function (p, s) { s = s || 18; return '<svg class="qa-ic" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };
  // Иконкалар — Lucide (lucide.dev, ISC лицензиясы): map-pin-check, list, circle-plus, pen-tool, ruler-dimension-line, move-up-right, eye, file-down, map, pencil, x
  var IC = {
    pick: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><path d="m9 10 2 2 4-4"/>',
    list: '<path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/>',
    add: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/>',
    draw: '<path d="M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z"/><path d="m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18"/><path d="m2.3 2.3 7.286 7.286"/><circle cx="11" cy="11" r="2"/>',
    dims: '<path d="M10 15v-3"/><path d="M14 15v-3"/><path d="M18 15v-3"/><path d="M2 8V4"/><path d="M22 6H2"/><path d="M22 8V4"/><path d="M6 15v-3"/><rect x="2" y="12" width="20" height="8" rx="2"/>',
    ptr: '<path d="M13 5H19V11"/><path d="M19 5L5 19"/>',
    eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
    pdf: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/>',
    plan: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    circle: '<circle cx="12" cy="12" r="9"/>',
    ellipse: '<ellipse cx="12" cy="12" rx="10" ry="6"/>',
    free: '<path d="M4 8 10 3l9 4-2 10-8 4-6-6z"/>',
    rect: '<rect width="18" height="12" x="3" y="6" rx="1"/>',
    edit: '<path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M21 19a2 2 0 0 1-2 2"/><path d="M5 21a2 2 0 0 1-2-2"/><path d="M9 3h1"/><path d="M9 21h1"/><path d="M14 3h1"/><path d="M14 21h1"/><path d="M3 9v1"/><path d="M21 9v1"/><path d="M3 14v1"/><path d="M21 14v1"/>',
    crosshair: '<line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/>',
  };
  window.MuraPlanIcon = IC;
  window.MuraPlanSvg = svg;

  /* ---------- Құралдар жолағы (екінші қатар, data-svc="plan") ---------- */
  function group(label, html) {
    var g = document.createElement('div');
    g.className = 'qa-tgroup pj-group'; g.setAttribute('role', 'group'); g.setAttribute('aria-label', label);
    g.dataset.svc = 'plan';
    g.innerHTML = html;
    tmain.appendChild(g);
  }
  var btn = function (id, prio, icon, label, tip, extra) {
    return '<button type="button" class="qa-tbtn" id="' + id + '" data-prio="' + prio + '" aria-label="' + label + '" data-tip="' + tip + '"' + (extra || '') + '>' + svg(icon) + '<span class="qa-tl">' + label + '</span></button>';
  };
  group(T('Жоспар: ескерткіш', 'План: памятник'),
    '<button type="button" class="qa-tbtn pj-markbtn" id="pjPick" data-prio="0" aria-label="' + T('Ескерткіш таңдау', 'Выбрать памятник') + '" data-tip="' + T('Ескерткіш таңдау: тізімнен не картадан', 'Выбрать памятник: из списка или на карте') + '">' +
      svg(IC.pick) + '<span class="qa-tl" id="pjMarkName">' + T('Ескерткіш таңдау', 'Выбрать памятник') + '</span></button>');
  group(T('Жоспар: нысандар', 'План: объекты'),
    '<button type="button" class="qa-tbtn" id="pjListBtn" data-prio="1" aria-controls="pjPanel" aria-expanded="false" aria-label="' + T('Нысандар', 'Объекты') + '" data-tip="' + T('Ескерткіштің құрамындағы нысандар: тізім, картадағы орны', 'Объекты в составе памятника: список, расположение на карте') + '" disabled>' +
      svg(IC.list) + '<span class="qa-tl">' + T('Нысандар', 'Объекты') + '</span><span class="qa-total" id="pjCount">0</span></button>' +
    btn('pjAdd', 0, IC.add, T('Нысан қосу', 'Добавить объект'), T('Нысан қосу: қорған не өзге нысан', 'Добавить объект: курган или иной объект'), ' disabled') +
    btn('pjDraw', 1, IC.draw, T('Сызу', 'Начертить'), T('Сызу: шеңбер, эллипс, еркін контур; сақталған контурды редакциялау', 'Начертить: окружность, эллипс, свободный контур; редактировать сохранённый контур'), ' aria-pressed="false" disabled') +
    btn('pjDims', 2, IC.dims, T('Өлшемдер', 'Размеры'), T('Өлшемдер: биіктігі, диаметрі, осьтері, өлшем сызығы', 'Размеры: высота, диаметр, оси, размерная линия'), ' disabled'));
  group(T('Жоспар: құжат', 'План: документ'),
    btn('pjPtr', 2, IC.ptr, T('Бағыттауыш', 'Указатель'), T('Елді мекенге бағыт қосу: елді мекенді картадан таңдау, жебе мен қашықтық', 'Добавить направление на населённый пункт: выбор на карте, стрелка и расстояние'), ' disabled') +
    btn('pjPreview', 1, IC.eye, T('Алдын ала қарау', 'Предпросмотр'), T('Алдын ала қарау: жалпы не жеке сызба, беттегі орналасуы мен масштабы', 'Предпросмотр: общий или индивидуальный чертёж, размещение на листе и масштаб'), ' disabled') +
    btn('pjPdf', 1, IC.pdf, 'PDF', T('PDF: жалпы, жеке не біріктірілген жоспар', 'PDF: общий, индивидуальный или объединённый план'), ' disabled'));

  /* ---------- Панель (оң жақ) ---------- */
  var d = document.createElement('aside');
  d.className = 'qa-drawer qa-glass mk-drawer pj-drawer';
  d.id = 'pjPanel';
  d.setAttribute('role', 'dialog');
  d.setAttribute('aria-labelledby', 'pjPanelT');
  d.hidden = true;
  d.innerHTML =
    '<header class="qa-dh"><h2 id="pjPanelT">' + svg(IC.plan) + T('Жоспар', 'План') + '</h2><button type="button" class="qa-ib" data-pjclose aria-label="' + T('Жабу', 'Закрыть') + '" title="' + T('Жабу', 'Закрыть') + '">' + svg(IC.close) + '</button></header>' +
    '<div class="qa-db">' +
      '<div class="pj-mark" id="pjMarkBox"></div>' +
      '<div class="qa-selbar"><span id="pjInfo"></span></div>' +
      '<div class="qa-slist" id="pjObjList"></div>' +
      '<section class="pj-thumbsec" id="pjThumbSec" hidden><h3 id="pjThumbT"></h3><div class="pj-thumb" id="pjThumb" role="button" tabindex="0" title="' + T('Алдын ала қарау', 'Предпросмотр') + '"></div></section>' +
    '</div>' +
    '<footer class="qa-df">' +
      '<button type="button" class="btn btn--primary btn--sm" id="pjAdd2">' + T('Нысан қосу', 'Добавить объект') + '</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="pjPtr2">' + T('Елді мекенге бағыт қосу', 'Добавить направление на населённый пункт') + '</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="pjPreview2">' + T('Алдын ала қарау', 'Предпросмотр') + '</button>' +
      '<button type="button" class="btn btn--steppe btn--sm" id="pjPdf2">PDF</button>' +
      '<span class="qa-cinfo" id="pjBusy" role="status"></span>' +
    '</footer>';
  stage.appendChild(d);
})();
