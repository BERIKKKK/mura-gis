/* Mura GIS: құралдар жолағының поповерлері және сызғыш пен циркуль өлшемдерін өшіру.
   • Құралдар жолағындағы батырма ашатын кез келген терезе (бұрышты туралау, тіктөртбұрыш, «⋯» т.б.) сол батырманың
     дәл астында шығады. Жоғарғы қатардың батырмалары үшін терезе төменгі қатардың үстіне шығуы керек, сондықтан
     поповерлер карта аймағынан (#qaStage, overflow:hidden) бүкіл жұмыс аймағына (#qaApp) көшіріледі.
   • Картада қалған әр сызғыш не циркуль өлшемінің жазуының басында кішкентай «×» — сол өлшемді өшіреді
     (өлшеу баптауларындағы тізімнің «×» батырмасы арқылы, app.js-тің өз логикасымен). */
const $ = id => document.getElementById(id);
const stage = $('qaApp');
for (const pop of document.querySelectorAll('.qa-pop')) stage.appendChild(pop);

/* ---------- Поповерлер батырманың астында ---------- */
function triggerOf(pop) {
  const t = document.querySelector('[data-pop="' + pop.id + '"][aria-expanded="true"]') || document.querySelector('[data-pop="' + pop.id + '"]');
  if (t && t.offsetParent) return t;
  return $('qaMoreBtn');                          // батырма «⋯» мәзіріне жиналған болса — «⋯» тұсында
}
function place(pop) {
  if (pop.hidden || !stage) return;
  const t = triggerOf(pop);
  if (!t) return;
  const s = stage.getBoundingClientRect(), r = t.getBoundingClientRect();
  const gap = 8, w = pop.offsetWidth;
  const right = pop.classList.contains('qa-more');            // «⋯» — оң жақ шетімен тураланады
  let left = right ? r.right - s.left - w : r.left - s.left;
  left = Math.max(gap, Math.min(left, s.width - w - gap));
  pop.style.left = left + 'px';
  pop.style.right = 'auto';
  pop.style.top = Math.max(gap, r.bottom - s.top + 6) + 'px';
  pop.style.maxHeight = 'calc(100% - ' + Math.max(gap, r.bottom - s.top + 6 + gap) + 'px)';
}
for (const pop of document.querySelectorAll('.qa-pop')) {
  new MutationObserver(() => place(pop)).observe(pop, { attributes: true, attributeFilter: ['hidden'] });
  new ResizeObserver(() => place(pop)).observe(pop);
}
addEventListener('resize', () => document.querySelectorAll('.qa-pop:not([hidden])').forEach(place));

/* ---------- Сызғыш пен циркуль өлшемдерін картадан өшіру ---------- */
const map = globalThis.MuraMarks && globalThis.MuraMarks.map;
const pane = map && map.getPane('markerPane');
const list = $('qaRulerList');
function addDel(lbl) {
  if (lbl.querySelector('.mura-rdel')) return;
  const id = lbl.dataset.mdel;                // тек сақталған өлшемдер (r1 — сызғыш, c1 — циркуль); өлшеу кезіндегісі не кесінді жазуы емес
  if (!id) return;
  const sm = lbl.querySelector('small'), n = sm ? sm.textContent.split(' · ')[0] : '';
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'mura-rdel';
  b.title = id[0] === 'c' ? 'Шеңберді өшіру (' + n + ')' : n + '-өлшемді өшіру'; b.setAttribute('aria-label', b.title);
  b.textContent = '×';
  const stop = e => { e.stopPropagation(); };
  for (const ev of ['pointerdown', 'mousedown', 'mouseup', 'dblclick', 'contextmenu']) b.addEventListener(ev, stop);
  b.addEventListener('click', e => {
    e.stopPropagation(); e.preventDefault();
    const del = list && list.querySelector('[data-rdel="' + id + '"]');
    if (del) del.click();
  });
  lbl.prepend(b);
}
if (pane) {
  const scan = () => pane.querySelectorAll('.qa-rlbl').forEach(addDel);
  new MutationObserver(scan).observe(pane, { childList: true, subtree: true });
  scan();
}
