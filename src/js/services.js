/* Mura GIS: екі қатарлы құралдар жолағы — «қызмет → тиісті құралдар».
   • Жоғарғы қатар: қызметтер (Ескерткіштер, Маршруттар, Қорғау аймағы, Жоспар) және барлық қызметке ортақ құралдар
     (Сызғыш, бұрышты туралау, Сыйғызу, Толық экран, «⋯»).
   • Төменгі қатар (#qaTmain): тек таңдалған қызметтің батырмалары. Сыймаса — ui.js бұрынғыдай
     жазуларды жасырып, артығын «⋯» мәзіріне жинайды (тек көрініп тұрған қызметтің батырмаларын).
   • Қызмет ауысқанда: алдыңғы қызметтің режимі (Нүкте қою / Белгі қою) өшеді, оның панелі жабылады.
   • Қызмет өзі де ауысады: басқа қызметтің режимі не панелі ашылса (оң жақ мәзір, координата панелі,
     белгіден қорғау аймағын бастау т.б.), жолақ сол қызметке көшеді.
   • Пернелер: 1 — Ескерткіштер, 2 — Маршруттар, 3 — Қорғау аймағы, 4 — Жоспар (мәтін өрісінде емес кезде). Соңғы қызмет есте сақталады.
   Бұл файл marks-dom.js-тен кейін, qorgau/ui.js-тен БҰРЫН орындалады (DOM-ды ui.js батырмаларды санамай тұрып өзгертеміз).
   Жаңа қызмет қосу: SERVICES тізіміне жол және төменгі қатарға data-svc="…" тобы. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var app = $('qaApp'), bar = $('qaToolbar'), tmain = $('qaTmain');
  if (!app || !bar || !tmain) return;

  var KEY = 'mura.service';
  var SERVICES = [
    { id: 'marks', label: 'Белгі қою', tip: 'Белгі қою: ескерткіштер мен өзге нысандар — тізім, импорт, экспорт (1)',
      icon: '<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"/>' },
    { id: 'routes', label: 'Маршруттар', tip: 'Маршруттар: маршрут сызу, тізім, жол табу, GPX/KML импорты (2)',
      icon: '<path d="M9 5h8.5a1 1 0 010 7h-11a1 1 0 000 7H15"/><circle cx="18" cy="19" r="3"/><circle cx="6" cy="5" r="3"/>' },
    { id: 'zone', label: 'Қорғау аймағы', tip: 'Қорғау аймағы: шекара, есеп, сақталған аймақтар (3)',
      icon: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>' },
    // Жоспар: ескерткіштің құрамындағы нысандар, контурлар, масштабты PDF (plan/plan-dom.js, plan/plan.js)
    { id: 'plan', label: (window.tx ? tx('Жоспар', 'План') : 'Жоспар'), tip: (window.tx ? tx('Жоспар: ескерткіштің нысандары, контур, бағыттауыш, масштабты PDF (4)', 'План: объекты памятника, контур, указатель, масштабный PDF (4)') : 'Жоспар (4)'),
      icon: (window.MuraPlanIcon && window.MuraPlanIcon.plan) || '' },
  ];
  var svg = function (p) { return '<svg class="qa-ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };
  var store = {
    get: function () { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
    set: function (v) { try { localStorage.setItem(KEY, v); } catch (e) { /* жеке режим т.б. */ } },
  };
  var group = function (el) { return el && el.closest('.qa-tgroup'); };
  var newGroup = function (label) {
    var g = document.createElement('div');
    g.className = 'qa-tgroup'; g.setAttribute('role', 'group'); g.setAttribute('aria-label', label);
    return g;
  };

  /* ---------- Төменгі қатар: қызметтердің топтары ---------- */
  // Белгілер: «Белгі қою», «Белгілер» (marks-dom.js) + «Импорт» (белгілер панеліндегі импорт батырмасы арқылы)
  var gMarks = tmain.querySelector('.mk-group');
  if (gMarks) {
    gMarks.dataset.svc = 'marks';
    var imp = document.createElement('button');
    imp.type = 'button'; imp.className = 'qa-tbtn'; imp.id = 'mkImportBtn';
    imp.setAttribute('data-prio', '3'); imp.setAttribute('aria-label', 'Импорт');
    imp.setAttribute('data-tip', 'Импорттау: KML, KMZ, GPX, GeoJSON → «Импортталғандар» (сәйкестендіру үшін)');
    imp.innerHTML = svg('<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>') + '<span class="qa-tl">Импорт</span>';
    imp.addEventListener('click', function () { var b = $('mkImport'); if (b) b.click(); });
    gMarks.appendChild(imp);
  }
  // Қорғау аймағы: шекара (Нүкте қою, Болдырмау, Нүктелер, Аяқтау), сақталған аймақтар, геометрия (Ретке келтіру, Тіктөртбұрыш)
  var gBorder = group($('qaAddMode')), gData = group($('qaOpenSaved'));
  var gGeom = newGroup('Қорғау аймағы: геометрия');
  [$('qaSort'), $('qaRectBtn')].forEach(function (b) { if (b) gGeom.appendChild(b); });
  [gBorder, gData, gGeom].forEach(function (g) { if (g) { g.dataset.svc = 'zone'; tmain.appendChild(g); } });

  /* ---------- Жоғарғы қатар: қызметтер + ортақ құралдар ---------- */
  var row1 = document.createElement('div');
  row1.className = 'mura-svcrow';
  var tabs = document.createElement('div');
  tabs.className = 'mura-svcs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Қызметтер');
  SERVICES.forEach(function (s) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'mura-svc'; b.id = 'muraSvc-' + s.id;
    b.setAttribute('role', 'tab'); b.dataset.svc = s.id; b.title = s.tip;
    b.innerHTML = svg(s.icon) + '<span>' + s.label + '</span>';
    b.addEventListener('click', function () { set(s.id); });
    tabs.appendChild(b);
  });
  var common = document.createElement('div');
  common.className = 'mura-common';
  var gMeasure = group($('qaRuler')), gView = group($('qaFit'));
  [gMeasure, gView].forEach(function (g) {
    if (!g) return;
    [].forEach.call(g.querySelectorAll('.qa-tbtn'), function (b) { b.removeAttribute('data-prio'); });   // ортақ құралдар жиналмайды
    common.appendChild(g);
  });
  if (gMeasure) gMeasure.setAttribute('aria-label', 'Өлшеу');
  var right = bar.querySelector('.qa-tright');
  row1.appendChild(tabs);
  row1.appendChild(common);
  if (right) row1.appendChild(right);
  bar.insertBefore(row1, bar.firstChild);
  bar.classList.add('mura-2rows');
  var mapEl = $('qaMap');
  if (mapEl) mapEl.setAttribute('aria-label', 'Карта');
  var reset = $('qaReset');
  if (reset) reset.lastChild.textContent = 'Қорғау аймағын тазалау';

  /* ---------- Қызметті ауыстыру ---------- */
  var cur = null;
  var pressed = function (id) { var b = $(id); return !!b && b.getAttribute('aria-pressed') === 'true'; };
  function leave(svc) {
    var ui = globalThis.QAUI;
    if (ui && ui.closePop) ui.closePop();
    if (svc === 'zone') {
      if (pressed('qaAddMode')) $('qaAddMode').click();
      if (ui && ui.panel && ui.panel()) ui.closePanel();
    } else if (svc === 'routes') {
      if (globalThis.MuraRoutes) { globalThis.MuraRoutes.stop(); globalThis.MuraRoutes.closePanel(); }
    } else if (svc === 'plan') {
      if (globalThis.MuraPlan) { globalThis.MuraPlan.stop(); globalThis.MuraPlan.closePanel(); }
    } else if (svc === 'marks') {
      if (pressed('mkMode')) $('mkMode').click();
      if (globalThis.__marks && globalThis.__marks.closePanel) globalThis.__marks.closePanel();
    }
  }
  function paint() {
    [].forEach.call(tabs.children, function (b) {
      var on = b.dataset.svc === cur;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    var first = true;
    [].forEach.call(tmain.querySelectorAll(':scope > .qa-tgroup'), function (g) {
      var off = !!g.dataset.svc && g.dataset.svc !== cur;
      g.classList.toggle('mura-off', off);
      g.classList.toggle('mura-first', !off && first);
      if (!off) first = false;
    });
    bar.dataset.svc = cur;
    app.dataset.svc = cur;
    paintMore();
  }
  /** Қызметті таңдау: алдыңғы қызметтің режимі мен панелі жабылады. */
  function set(svc) {
    if (!SERVICES.some(function (s) { return s.id === svc; })) return;
    if (svc === cur) return;
    var prev = cur;
    cur = svc;
    if (prev) leave(prev);
    paint();
    store.set(svc);
    app.dispatchEvent(new CustomEvent('mura:service', { detail: { id: svc, prev: prev } }));
  }

  // «⋯»: тек сыймаған құралдар үшін («Тазалау» екінші қатарда — js/desktop.js); мәзір бос болса, батырма да жасырылады
  var moreBtn = $('qaMoreBtn');
  function paintMore() {
    if (reset) reset.classList.toggle('mura-off', cur !== 'zone');
    if (!moreBtn) return;
    var overflow = [].some.call(tmain.querySelectorAll('.qa-tbtn[data-prio]'), function (b) { return b.hidden && !b.closest('.mura-off'); });
    moreBtn.hidden = !overflow && !(cur === 'zone' && reset && !reset.classList.contains('mura-gone'));
  }
  new MutationObserver(paintMore).observe(tmain, { subtree: true, attributes: true, attributeFilter: ['hidden'] });

  /* ---------- Басқа қызметтің әрекеті басталса — жолақ соған ауысады ---------- */
  // Тек күй шын өзгергенде (өшулі → қосулы, жасырын → ашық); жүктелу кезіндегі бастапқы орнатулар есепке алынбайды
  var booted = false;
  function follow(id, svc, attr) {
    var el = $(id);
    if (!el) return;
    new MutationObserver(function (recs) {
      if (!booted) return;
      var was = recs[0].oldValue;
      var on = attr === 'hidden' ? (was !== null && !el.hidden) : (was !== 'true' && el.getAttribute(attr) === 'true');
      if (on) set(svc);
    }).observe(el, { attributes: true, attributeFilter: [attr], attributeOldValue: true });
  }
  follow('qaAddMode', 'zone', 'aria-pressed');
  follow('mkMode', 'marks', 'aria-pressed');
  follow('mkPanel', 'marks', 'hidden');
  follow('rtDraw', 'routes', 'aria-pressed');
  follow('rtPanel', 'routes', 'hidden');
  ['qaPanelInfo', 'qaPanelSaved', 'qaPanelPts'].forEach(function (id) { follow(id, 'zone', 'hidden'); });
  follow('pjPanel', 'plan', 'hidden');
  follow('pjDraw', 'plan', 'aria-pressed');
  // Координата панелі: «Қосу» — шекара нүктесі, «Белгі» — ескерткіш белгісі (басу өз әрекетін орындайды)
  var inAdd = $('qaInAdd'), inMark = $('mkFromCoord');
  if (inAdd) inAdd.addEventListener('click', function () { set('zone'); }, true);
  if (inMark) inMark.addEventListener('click', function () { set('marks'); }, true);

  /* ---------- Пернелер: 1–4 ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (document.querySelector('.qa-dlg-back, .mk-dlg-back, .mura-dlg-back')) return;
    var s = SERVICES[+e.key - 1];
    if (s) { e.preventDefault(); set(s.id); }
  });
  // Қызметтер арасында ← → (tablist үлгісі)
  tabs.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    var i = SERVICES.findIndex(function (s) { return s.id === cur; });
    var n = SERVICES[(i + (e.key === 'ArrowRight' ? 1 : SERVICES.length - 1)) % SERVICES.length];
    set(n.id);
    $('muraSvc-' + n.id).focus();
    e.preventDefault();
  });

  /* ---------- Бастапқы қызмет ---------- */
  var saved = store.get();
  set(SERVICES.some(function (s) { return s.id === saved; }) ? saved : 'marks');
  // Бастапқыда ешбір құрал қосылмайды — пайдаланушы өзі таңдайды. Жүктелу аяқталған соң ғана «басқа қызметке ауысу» іске қосылады.
  document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { booted = true; }, 0); });

  globalThis.MuraSvc = { set: set, get: function () { return cur; }, list: SERVICES.map(function (s) { return s.id; }) };
})();
