/* Mura GIS: «Қорғау аймағы» қызметінің интерфейс қабығы.
   Есеп, карта, сақтау мен экспорт — app.js; бұл файл тек интерфейсті басқарады:
     • бүйірлік панельдер (Мәліметтер / Сақталған аймақтар / Нүктелер; мобильде — төменнен шығатын drawer);
     • құралдар жолағының төменгі қатары (таңдалған қызметтің батырмалары, js/services.js): орын жетпесе алдымен жазулар
       жасырылады, содан кейін басымдығы төмен құралдар «⋯» мәзіріне көшеді (data-prio: 0 — ешқашан жасырылмайды;
       сан үлкен болған сайын ертерек жасырылады). Басқа қызметтің батырмалары (.mura-off) есепке алынбайды;
     • поповерлер (өлшеу баптаулары, тіктөртбұрыш) және «⋯» мәзірі;
     • төменгі координата панелін жасыру/ашу (күйі браузерде сақталады);
     • бүкіл жұмыс аймағын (құралдар жолағымен бірге) толық экранға жаю;
     • Leaflet басқару элементтері қалқымалы панельдердің астында қалмауы үшін CSS айнымалылары
       (--qa-top, --qa-bottom, --qa-right) және картаны сыйғызу кезіндегі шегіністер (QAUI.pad).
   app.js-тен бұрын жүктеледі (модульдер құжаттағы ретімен орындалады) және globalThis.QAUI арқылы қолжетімді. */

const $ = id => document.getElementById(id);
const app = $('qaApp');
const bar = $('qaToolbar'), tmain = $('qaTmain');
const moreMenu = $('qaMoreMenu'), moreDyn = $('qaMoreDyn');
const mqMobile = matchMedia('(max-width: 767px)');
const PANELS = { info: 'qaPanelInfo', saved: 'qaPanelSaved', pts: 'qaPanelPts' };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* жеке режим т.б. */ } },
};

let panel = null;          // ашық панельдің атауы
let panelTrigger = null;
let pop = null, popTrigger = null;

/* ======================= Шегіністер (CSS айнымалылары) ======================= */
const cssNum = k => parseFloat(getComputedStyle(app).getPropertyValue(k)) || 0;
const gap = () => cssNum('--qa-gap') || 10;
function drawerEl() { return panel ? $(PANELS[panel]) : null; }
function measure() {
  const g = gap();
  app.style.setProperty('--qa-top', Math.round(bar.offsetTop + bar.offsetHeight + 8) + 'px');
  const cb = $('qaCoordBar'), cs = $('qaCoordShow');
  const low = cb.hidden ? cs : cb;
  app.style.setProperty('--qa-bottom', Math.round(low.offsetHeight + g + 6) + 'px');
  const d = drawerEl();
  app.style.setProperty('--qa-right', (d && !mqMobile.matches ? d.offsetWidth + 2 * g : g) + 'px');
}
/** Картаны сыйғызғанда қалқымалы панельдер жабатын жиектер (px): Leaflet fitBounds үшін. */
function pad() {
  const g = gap(), d = drawerEl();
  const top = cssNum('--qa-top') + 12;
  let right = g + 24, bottom = cssNum('--qa-bottom') + 18;
  if (d && mqMobile.matches) bottom = d.offsetHeight + 18;
  else if (d) right = d.offsetWidth + 2 * g + 24;
  return { tl: [56, top], br: [right, bottom] };
}

/* ======================= Құралдар жолағы: бір қатар + «⋯» ======================= */
const allItems = [...tmain.querySelectorAll('.qa-tbtn[data-prio]')];
let items = allItems;
// .mura-uhide — пайдаланушы «Баптаулар → Құралдар панелі» арқылы жасырған батырма (js/project.js): есепке де, «⋯»-ге де кірмейді
const activeItems = () => allItems.filter(b => !b.closest('.mura-off') && !b.classList.contains('mura-uhide'));
const groups = [...tmain.querySelectorAll('.qa-tgroup')];
const fits = () => tmain.scrollWidth <= tmain.clientWidth + 1;
function syncGroups() { groups.forEach(gr => { gr.hidden = !gr.querySelector('.qa-tbtn:not([hidden]):not(.mura-uhide):not(.mura-gone)'); }); }
let lastW = -1;
function layoutBar(force) {
  const w = tmain.clientWidth;
  if (!force && w === lastW) return;
  lastW = w;
  allItems.forEach(b => { b.hidden = false; b.classList.remove('is-icon'); });
  items = activeItems();
  syncGroups();
  bar.classList.remove('is-compact');
  // 1) басымдығы төмен құралдардан бастап жазуларды жасырамыз (тек иконка қалады);
  // 2) бәрібір сыймаса — құралдардың өзін «⋯» мәзіріне көшіреміз (data-prio="0" — ешқашан)
  const order = items.slice().sort((a, b) => b.dataset.prio - a.dataset.prio);
  for (const b of order) { if (fits()) break; b.classList.add('is-icon'); }
  if (!fits()) {
    bar.classList.add('is-compact');
    for (const b of order) { if (fits()) break; if (+b.dataset.prio > 0) { b.hidden = true; syncGroups(); } }
  }
  if (pop === moreMenu) buildMore();
}
function buildMore() {
  const hid = items.filter(b => b.hidden);
  moreDyn.innerHTML = hid.length ? '<div class="qa-mhead">Құралдар</div>' : '';
  for (const b of hid) {
    const mi = document.createElement('button');
    mi.type = 'button'; mi.className = 'qa-mi'; mi.setAttribute('role', 'menuitem');
    const svg = b.querySelector('svg');
    if (svg) mi.appendChild(svg.cloneNode(true));
    mi.appendChild(document.createTextNode(b.getAttribute('aria-label') || ''));
    const pressed = b.getAttribute('aria-pressed');
    let note = '';
    if (pressed !== null) { mi.setAttribute('aria-pressed', pressed); note = pressed === 'true' ? 'қосулы' : ''; }
    if (b.id === 'qaSnapBtn') note = $('qaSnapVal').textContent;
    if (note) { const s = document.createElement('small'); s.textContent = note; mi.appendChild(s); }
    mi.addEventListener('click', () => { closePop(); b.click(); });
    moreDyn.appendChild(mi);
  }
  $('qaMoreSep').hidden = !hid.length;
}

/* ======================= Поповерлер ======================= */
function openPop(el, trigger) {
  closePop();
  if (el === moreMenu) buildMore();
  el.hidden = false;
  pop = el; popTrigger = trigger || null;
  if (popTrigger) popTrigger.setAttribute('aria-expanded', 'true');
}
function closePop() {
  if (!pop) return;
  pop.hidden = true;
  if (popTrigger) popTrigger.setAttribute('aria-expanded', 'false');
  pop = null; popTrigger = null;
}
bar.addEventListener('click', e => {
  const b = e.target.closest('[data-pop]');
  if (!b) return;
  const el = $(b.dataset.pop);
  if (pop === el) closePop(); else openPop(el, b);
});
// Сырттан басқанда жабылады (басу картаға да өтеді — нүкте қою әдеттегідей жұмыс істейді)
document.addEventListener('pointerdown', e => {
  if (pop && !pop.contains(e.target) && !(popTrigger && popTrigger.contains(e.target))) closePop();
}, true);
moreMenu.addEventListener('click', e => {
  const mi = e.target.closest('.qa-mi');
  if (!mi || moreDyn.contains(mi)) return;          // көшірілген құралдар өз әрекетін өзі орындайды (buildMore)
  closePop();
  if (mi.dataset.proxy) $(mi.dataset.proxy)?.click();
});
$('qaMenuPaste').addEventListener('click', () => {
  openPanel('pts');
  const box = $('qaPasteBox');
  box.open = true;
  box.scrollIntoView({ block: 'start', behavior: 'smooth' });
  $('qaPasteText').focus({ preventScroll: true });
});

/* ======================= Панельдер ======================= */
function paintPanelButtons() {
  document.querySelectorAll('[data-panel]').forEach(b => b.setAttribute('aria-expanded', b.dataset.panel === panel ? 'true' : 'false'));
}
function openPanel(name, opts = {}) {
  if (!PANELS[name]) return;
  closePop();
  const was = panel;
  for (const [k, id] of Object.entries(PANELS)) $(id).hidden = k !== name;
  panel = name;
  if (opts.trigger) panelTrigger = opts.trigger;
  paintPanelButtons();
  measure(); layoutBar(true);
  const d = $(PANELS[name]);
  if (opts.scrollTo) {
    const t = $(opts.scrollTo);
    if (t) requestAnimationFrame(() => t.scrollIntoView({ block: 'start', behavior: was === name ? 'smooth' : 'auto' }));
  } else if (was !== name) d.querySelector('.qa-db')?.scrollTo(0, 0);
  app.dispatchEvent(new CustomEvent('qa:panel', { detail: { name } }));
}
function closePanel() {
  if (!panel) return;
  $(PANELS[panel]).hidden = true;
  panel = null;
  paintPanelButtons();
  measure(); layoutBar(true);
  if (panelTrigger && document.activeElement && document.activeElement !== document.body && !panelTrigger.hidden) panelTrigger.focus({ preventScroll: true });
  panelTrigger = null;
  app.dispatchEvent(new CustomEvent('qa:panel', { detail: { name: null } }));
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-panel]');
  if (b) { if (panel === b.dataset.panel) closePanel(); else openPanel(b.dataset.panel, { trigger: b }); return; }
  const c = e.target.closest('[data-close]');
  if (!c) return;
  if (c.closest('.qa-pop')) closePop(); else if (c.closest('.qa-drawer')) closePanel();
});
$('qaExportBtn').addEventListener('click', () => openPanel('info', { scrollTo: 'qaResSec', trigger: $('qaOpenInfo') }));
$('qaInfoExport').addEventListener('click', () => $('qaResSec').scrollIntoView({ block: 'start', behavior: 'smooth' }));
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  if (pop) { const t = popTrigger; closePop(); if (t && !t.hidden) t.focus(); return; }
  if (panel && !document.querySelector('.qa-map.is-ruler, .qa-map.is-compass')) closePanel();
});

/* ======================= Төменгі координата панелі ======================= */
const COORD_KEY = 'qa-coordbar-v1';
function setCoord(open, user) {
  $('qaCoordBar').hidden = !open;
  $('qaCoordShow').hidden = open;
  if (user) {
    store.set(COORD_KEY, open ? '1' : '0');
    (open ? $('qaInLat') : $('qaCoordShow')).focus();
  }
  measure();
}
$('qaCoordHide').addEventListener('click', () => setCoord(false, true));
$('qaCoordShow').addEventListener('click', () => setCoord(true, true));
setCoord(store.get(COORD_KEY) !== '0', false);

/* ======================= Толық экран (бүкіл жұмыс аймағы) ======================= */
const fsBtn = $('qaFsBtn');
const FS_ICON = { on: fsBtn.querySelector('svg').innerHTML, off: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>' };
const fsNative = () => document.fullscreenElement || document.webkitFullscreenElement || null;
const fsActive = () => fsNative() === app || app.classList.contains('is-fs');
function paintFs() {
  const on = fsActive();
  fsBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  const t = on ? 'Толық экраннан шығу' : 'Толық экран';
  fsBtn.setAttribute('aria-label', t); fsBtn.dataset.tip = t;
  fsBtn.querySelector('svg').innerHTML = on ? FS_ICON.off : FS_ICON.on;
  fsBtn.querySelector('.qa-tl').textContent = on ? 'Шығу' : 'Толық экран';
  requestAnimationFrame(() => { measure(); layoutBar(true); });
}
function cssFs(on) { app.classList.toggle('is-fs', on); paintFs(); }
fsBtn.addEventListener('click', () => {
  if (fsActive()) {
    if (fsNative() === app) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else cssFs(false);
    return;
  }
  const req = app.requestFullscreen || app.webkitRequestFullscreen;
  if (!req) { cssFs(true); return; }                            // мыс. iPhone Safari — CSS арқылы терезеге жаю
  const r = req.call(app);
  if (r && r.then) {
    // Кей ендірілген браузерлерде сұраныс жауапсыз қалады — 0,8 с ішінде нәтиже болмаса, CSS нұсқасына көшеміз
    let settled = false;
    const t = setTimeout(() => { if (!settled && !fsNative()) cssFs(true); }, 800);
    r.then(() => { settled = true; clearTimeout(t); }, () => { settled = true; clearTimeout(t); cssFs(true); });
  }
});
['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, paintFs));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && app.classList.contains('is-fs') && !pop && !panel) cssFs(false); });

/* ======================= Бұрышты туралау мәні (құралдар жолағында) ======================= */
function paintSnap() {
  const v = $('qaSnap').value;
  $('qaSnapVal').textContent = v === '0' ? 'жоқ' : v + '°';
}
$('qaSnap').addEventListener('change', paintSnap);

/* ======================= Экрандағы пернетақта ======================= */
// Бет viewport-та interactive-widget=resizes-content сұрайды (index.html) — оны қолдайтын браузерде
// пернетақта ашылғанда беттің өзі кішірейеді де, мұнда есептелетін айырма 0 болады. Қолдамайтындарда
// (iOS Safari, ескі Chrome) пернетақта тек «көрінетін» аймақты жабады: VisualViewport арқылы оның биіктігін
// табып (--qa-kb), координата панелін және мобильдегі ашық панельді пернетақтаның үстіне көтереміз.
const vv = globalThis.visualViewport;
let kbRaf = 0;
function kbFix() {
  if (!vv) return;
  const a = document.activeElement;
  const typing = a && a.matches && a.matches('input:not([type=checkbox]):not([type=file]),select,textarea') &&
    (a.closest('#qaCoordBar') || (mqMobile.matches && a.closest('.qa-drawer')));
  const gapPx = Math.round(innerHeight - vv.height - vv.offsetTop);
  const kb = typing && gapPx > 60 ? gapPx : 0;
  app.style.setProperty('--qa-kb', kb + 'px');
  if (!kb) return;
  cancelAnimationFrame(kbRaf);
  kbRaf = requestAnimationFrame(() => {                // өріс панель ішінде пернетақта астында қалса — тек сол панельді айналдырамыз
    const db = a.closest('.qa-db');
    if (!db) return;
    const r = a.getBoundingClientRect(), d = db.getBoundingClientRect();
    if (r.bottom > d.bottom - 8) db.scrollTop += r.bottom - d.bottom + 16;
  });
}
if (vv) {
  vv.addEventListener('resize', kbFix);
  vv.addEventListener('scroll', kbFix);
  document.addEventListener('focusin', kbFix);
  document.addEventListener('focusout', () => setTimeout(kbFix, 60));
}

/* ======================= Өлшем өзгерістері ======================= */
let raf = 0;
function relayout() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => { measure(); layoutBar(); });
}
new ResizeObserver(relayout).observe(tmain);
new ResizeObserver(relayout).observe($('qaStage'));
for (const id of ['qaCoordBar', 'qaCoordShow', ...Object.values(PANELS)]) new ResizeObserver(relayout).observe($(id));
mqMobile.addEventListener('change', relayout);
// Қызмет ауысқанда (js/services.js) — төменгі қатар басқа батырмалармен қайта сыйғызылады
app.addEventListener('mura:service', () => { closePop(); measure(); layoutBar(true); });
addEventListener('mura:toolbar', () => { measure(); layoutBar(true); });
// app.js өз баптауларын (туралау мәні, т.б.) орнатқаннан кейін
document.addEventListener('DOMContentLoaded', () => { paintSnap(); measure(); layoutBar(true); });

/* ======================= Растау терезесі ======================= */
// Браузердің confirm() терезесі шыққанда Chrome толық экраннан өздігінен шығарады, сондықтан растау бет ішінде,
// толық экранға жайылатын элементтің (#qaApp) ішінде сұралады. Хабарлама (toast) да сонда көшіріледі —
// әйтпесе толық экранда көрінбейді.
const toastEl = $('qaToast');
if (toastEl) app.appendChild(toastEl);
let dlgSeq = 0;
/** Бет ішіндегі растау: Promise<boolean>. o.ok — растау батырмасының мәтіні, o.danger — қайтарылмайтын әрекет. */
function confirmDlg(message, o = {}) {
  return new Promise(resolve => {
    closePop();
    const id = 'qaDlg' + (++dlgSeq);
    const back = document.createElement('div');
    back.className = 'qa-dlg-back';
    back.innerHTML = '<div class="qa-dlg qa-glass" role="alertdialog" aria-modal="true" aria-describedby="' + id + '">' +
      '<p class="qa-dlg-msg" id="' + id + '"></p><div class="qa-dlg-btns">' +
      '<button type="button" class="btn btn--ghost btn--sm" data-v="0">Бас тарту</button>' +
      '<button type="button" class="btn btn--primary btn--sm" data-v="1"></button></div></div>';
    back.querySelector('.qa-dlg-msg').textContent = message;
    const okBtn = back.querySelector('[data-v="1"]'), noBtn = back.querySelector('[data-v="0"]');
    okBtn.textContent = o.ok || 'Жалғастыру';
    const prev = document.activeElement;
    function done(v) {
      back.remove();
      document.removeEventListener('keydown', onKey, true);
      if (prev && prev.focus && document.contains(prev)) prev.focus({ preventScroll: true });
      resolve(v);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
      else if (e.key === 'Tab') {                  // фокус терезе ішінде қалады
        e.preventDefault();
        (document.activeElement === okBtn ? noBtn : okBtn).focus();
      }
    }
    back.addEventListener('click', e => {
      const b = e.target.closest('[data-v]');
      if (b) done(b.dataset.v === '1'); else if (e.target === back) done(false);
    });
    document.addEventListener('keydown', onKey, true);
    app.appendChild(back);
    (o.danger ? noBtn : okBtn).focus();           // қайтарылмайтын әрекетте әдепкі — «Бас тарту»
  });
}

globalThis.QAUI = {
  openPanel, closePanel, closePop, pad, measure, confirm: confirmDlg,
  panel: () => panel,
  isMobile: () => mqMobile.matches,
};
