/* Mura GIS: қорғау аймағын «Аяқтау» — белгі қоюмен бірдей логика.
   Шекара нүктелері қойылып болған соң құралдар жолағындағы «Аяқтау» батырмасы басылады: нүкте қою режимі өшеді де,
   мәліметтер терезесі ашылады (атауы, мерзімі, облыс/аудан, орналасқан жері, сипаттамасы, аймақ өлшемдері, нәтиже),
   сол жерден «Сақтау» басылады. Құралдар жолағында бөлек «Сақтау» батырмасы жоқ — қорғау аймағы тек осы терезеден сақталады.
   Белгіленген ескерткішпен біріктіру: терезенің басында ескерткіш белгісін таңдауға болады — атауы, мерзімі, облыс,
   аудан, орналасқан жері, түрі (аймақ өлшемдері соған сай) белгіден толтырылады. Шекара ішінде белгі болса, ол өзі таңдалады.
   Белгілер панеліндегі «Қорғау аймағы» әрекеті — сол белгіден жаңа қорғау аймағын бастайды (startFromMark).
   Терезедегі өрістер — «Мәліметтер» панеліндегі өрістердің өзі (уақытша терезеге көшіріліп, жабылғанда орнына қайтады),
   сондықтан есептеу мен сақтау qorgau/app.js-тің өз логикасымен жүреді; сақтау — құралдар жолағындағы «Сақтау» батырмасы арқылы.
   Бұл модуль qorgau/app.js-тен кейін жүктеледі (globalThis.__qa). */
const $ = id => document.getElementById(id);
const QA = globalThis.__qa;
const app = $('qaApp'), fin = $('qaFinish'), saveBtn = $('qaSave');

const ready = () => !!(QA && QA.R && !QA.R.error);
const dirtyEl = $('qaDirty');
function paintFinish() {
  if (!fin) return;
  const ok = ready(), dirty = !!(dirtyEl && !dirtyEl.hidden);
  fin.disabled = !ok;
  fin.classList.toggle('is-dirty', ok && dirty);
  fin.dataset.tip = !ok ? 'Аяқтау: алдымен шекараның кемінде 4 нүктесін қойыңыз'
    : dirty ? 'Аяқтау: сақталмаған өзгерістер бар — мәліметтерді тексеріп, сақтаңыз' : 'Аяқтау: мәліметтерді толтырып, қорғау аймағын сақтау (не 1-нүктені басып, шекараны жабыңыз)';
}
if (dirtyEl) new MutationObserver(paintFinish).observe(dirtyEl, { attributes: true, attributeFilter: ['hidden'] });
function toast(msg, err) {
  const t = $('qaToast');
  if (!t) return;
  t.textContent = msg; t.classList.toggle('is-err', !!err); t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, err ? 5000 : 3200);
}

/* ---------- Шекараны жабу: нүкте қою режимінде 1-нүктені басса — «Аяқтау» (белгі қойғандағыдай терезе бірден ашылады) ---------- */
const mapEl = $('qaMap');
let downAt = null;
if (mapEl) {
  mapEl.addEventListener('pointerdown', e => { downAt = e.target.closest('.qa-vx') ? { x: e.clientX, y: e.clientY } : null; }, true);
  mapEl.addEventListener('click', e => {
    const vx = e.target.closest('.qa-vx');
    if (!vx || !downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) return;   // сүйреу емес, басу
    if (vx.textContent.trim() !== '1' || !ready()) return;
    const add = $('qaAddMode');
    if (!add || add.getAttribute('aria-pressed') !== 'true') return;
    openDialog();
  });
}
const cntEl = $('qaCount');
if (cntEl) {                                       // 4-нүкте қойылғанда — кеңес (бір рет)
  let hinted = false;
  new MutationObserver(() => {
    const add = $('qaAddMode');
    if (!hinted && ready() && add && add.getAttribute('aria-pressed') === 'true' && !QA.state.loadedId) {
      hinted = true;
      toast('Шекара дайын: «Аяқтау» басыңыз не 1-нүктені басып, шекараны жабыңыз.');
    }
    if (!QA.state.pts.length) hinted = false;
  }).observe(cntEl, { childList: true, characterData: true, subtree: true });
}

/* ---------- Белгіленген ескерткіштер: шекараға жақындығы ---------- */
const marks = () => (globalThis.__marks && globalThis.__marks.items) || [];
function inside(p, poly) {                       // нүкте көпбұрыш ішінде ме (сәуле әдісі)
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.lat > p.lat) !== (b.lat > p.lat) && p.lon < (b.lon - a.lon) * (p.lat - a.lat) / (b.lat - a.lat) + a.lon) c = !c;
  }
  return c;
}
function distM(a, b) {
  const k = Math.PI / 180, x = (b.lon - a.lon) * k * Math.cos((a.lat + b.lat) / 2 * k), y = (b.lat - a.lat) * k;
  return Math.hypot(x, y) * 6371008.8;
}
/** Белгілер шекараға жақындығы бойынша: ішіндегілері алдымен, қалғаны — шекара ортасынан қашықтығы бойынша. */
function marksNear() {
  const pts = (QA && QA.state && QA.state.pts) || [];
  const c = pts.length ? { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length } : null;
  return marks().map(m => ({ m, in: pts.length >= 3 && inside(m, pts), d: c ? distM(c, m) : Infinity }))
    .sort((a, b) => (b.in - a.in) || (a.d - b.d));
}
const fmtD = d => (!isFinite(d) ? '' : d < 1000 ? Math.round(d) + ' м' : (d / 1000).toFixed(d < 10000 ? 1 : 0).replace('.', ',') + ' км');

/** Қорғау аймағының мәліметтерін белгіден толтыру (app.js өрістері — оқиғалары арқылы, есептеу өзі жаңарады). */
function fillFromMark(m) {
  const set = (id, v, ev = 'input') => { const el = $(id); if (!el) return; el.value = v ?? ''; el.dispatchEvent(new Event(ev, { bubbles: true })); };
  set('qaNameGen', '');                          // ілік септігі атаудан қайта құрастырылады
  set('qaName', m.name);
  set('qaPeriod', m.period || '');
  if (m.oblast) set('qaOblast', m.oblast);       // аудандар тізімі облысқа сай қайта құрылады (js/regions.js)
  set('qaDistrict', m.district || '', 'change');
  set('qaPlace', m.place || '');
  if (m.note && !$('qaDesc').value.trim()) set('qaDesc', m.note);
  const type = $('qaType');
  if (type && [...type.options].some(o => o.value === m.type)) set('qaType', m.type, 'change');   // аймақ өлшемдері түріне сай
}
// Нүктелер саны өзгерген сайын (шартты белгілердегі санауыш) — батырма күйі жаңарады
const cnt = $('qaCount');
if (cnt) new MutationObserver(paintFinish).observe(cnt, { childList: true, characterData: true, subtree: true, attributes: true });
paintFinish();

let dlg = null;
function closeDialog() {
  if (!dlg) return;
  for (const m of dlg.moved.reverse()) m.parent.insertBefore(m.node, m.next);   // өрістер «Мәліметтер» панеліне қайтады
  dlg.back.remove();
  document.removeEventListener('keydown', dlg.onKey, true);
  if (dlg.prev && dlg.prev.focus && document.contains(dlg.prev)) dlg.prev.focus({ preventScroll: true });
  dlg = null;
}

function openDialog() {
  if (!ready()) { paintFinish(); return; }
  closeDialog();
  const ui = globalThis.QAUI;
  ui?.closePop?.(); ui?.closePanel?.();
  globalThis.__marks?.closePanel?.();
  const add = $('qaAddMode');
  if (add && add.getAttribute('aria-pressed') === 'true') add.click();          // шекара сызу аяқталды — нүкте қою өшеді
  const loaded = !!(QA.state && QA.state.loadedId);

  const back = document.createElement('div');
  back.className = 'qa-dlg-back mk-dlg-back';
  back.innerHTML =
    '<form class="qa-dlg qa-glass mk-dlg zd-dlg" role="dialog" aria-modal="true" aria-labelledby="zdT" novalidate>' +
      '<h3 id="zdT">' + fin.querySelector('svg').outerHTML + (loaded ? 'Қорғау аймағы: «' + escapeHtml(QA.state.loadedName || '') + '»' : 'Жаңа қорғау аймағы') + '</h3>' +
      '<div class="zd-body"></div>' +
      '<p class="mk-err" id="zdErr" role="alert" hidden></p>' +
      '<div class="qa-dlg-btns">' +
        (loaded ? '<button type="button" class="lnk" id="zdSaveNew" title="Ашық жазбаны өзгертпей, жаңа жазба ретінде сақтау">Жаңа жазба ретінде сақтау</button>' : '') +
        '<span class="mk-sp"></span>' +
        '<button type="button" class="btn btn--ghost btn--sm" id="zdCancel">Бас тарту</button>' +
        '<button type="submit" class="btn btn--primary btn--sm" id="zdSave">' + (loaded ? 'Өзгерістерді сақтау' : 'Сақтау') + '</button>' +
      '</div>' +
    '</form>';
  const body = back.querySelector('.zd-body');
  // Белгіленген ескерткішті таңдау: мәліметтер белгіден толтырылады
  const near = marksNear();
  let pre = pendingMark && near.find(x => x.m.id === pendingMark);
  const curName = $('qaName').value.trim();
  let auto = false;
  if (!pre && curName) pre = near.find(x => x.m.name === curName);                    // атауы сәйкес белгі — тек таңдалады
  if (!pre && !curName && near[0] && near[0].in) { pre = near[0]; auto = true; }       // шекара ішіндегі белгі — өзі толтырылады
  if (near.length) {
    const box = document.createElement('section');
    box.className = 'qa-sec zd-mark';
    box.innerHTML = '<div class="qa-f"><label for="zdMark">Белгіленген ескерткіш <small class="mk-law">(мәліметтер белгіден алынады)</small></label><select id="zdMark"><option value="">— таңдалмаған —</option>' +
      near.map(x => '<option value="' + escapeHtml(x.m.id) + '"' + (pre && pre.m.id === x.m.id ? ' selected' : '') + '>' + escapeHtml(x.m.name) +
        (x.m.district ? ' — ' + escapeHtml(x.m.district) : '') + (x.in ? ' · шекара ішінде' : x.d < Infinity ? ' · ' + fmtD(x.d) : '') + '</option>').join('') +
      '</select><p class="qa-hint" id="zdMarkHint" hidden></p></div>';
    body.appendChild(box);
    box.querySelector('select').addEventListener('change', e => {
      const m = marks().find(x => x.id === e.target.value);
      const h = box.querySelector('#zdMarkHint');
      if (m) { fillFromMark(m); h.textContent = 'Мәліметтер «' + m.name + '» белгісінен толтырылды — қажет болса түзетіңіз.'; h.hidden = false; }
    });
    if (pre && (auto || pendingMark === pre.m.id)) {
      fillFromMark(pre.m);
      const h = box.querySelector('#zdMarkHint');
      h.textContent = (auto ? 'Шекара ішіндегі белгі таңдалды: ' : 'Мәліметтер белгіден толтырылды: ') + '«' + pre.m.name + '». Қажет болса түзетіңіз.'; h.hidden = false;
    }
  }
  pendingMark = null;
  // «Мәліметтер» панеліндегі бөлімдерді уақытша көшіреміз: ескерткіш, аймақ өлшемдері, нәтиже кестесі
  const nodes = [$('qaInfoTitle')?.closest('section'), $('qaRuleTitle')?.closest('section'), $('qaRes')?.closest('.qa-tablewrap')].filter(Boolean);
  const moved = nodes.map(node => ({ node, parent: node.parentNode, next: node.nextSibling }));
  for (const m of moved) body.appendChild(m.node);
  const res = moved.find(m => m.node.classList.contains('qa-tablewrap'));
  if (res) {                                       // нәтиже кестесіне тақырып (тек терезеде)
    const h = document.createElement('h3');
    h.className = 'zd-h'; h.textContent = 'Нәтиже';
    body.insertBefore(h, res.node);
  }

  const err = back.querySelector('#zdErr');
  const showErr = t => { err.textContent = t || ''; err.hidden = !t; };
  async function doSave(asNew) {
    showErr('');
    const name = $('qaName');
    if (!name.value.trim()) { showErr('Ескерткіш атауын енгізіңіз.'); name.focus(); return; }
    if (!ready()) { showErr('Шекара дұрыс емес — кемінде 4 нүкте керек.'); return; }
    const btn = asNew ? $('qaSaveNew') : saveBtn;
    const own = back.querySelectorAll('button');
    own.forEach(b => { b.disabled = true; });
    btn.click();                                   // app.js: saveRecord() — батырма сақтау кезінде өшіп тұрады
    while (btn.disabled) await new Promise(r => setTimeout(r, 80));
    own.forEach(b => { b.disabled = false; });
    const dirty = $('qaDirty');
    if (QA.state.loadedId && (!dirty || dirty.hidden)) closeDialog();   // сақталды (қате болса — хабарлама шығады, терезе ашық қалады)
  }
  back.querySelector('form').addEventListener('submit', e => { e.preventDefault(); doSave(false); });
  back.querySelector('#zdSaveNew')?.addEventListener('click', () => doSave(true));
  back.querySelector('#zdCancel').addEventListener('click', closeDialog);
  back.addEventListener('mousedown', e => { if (e.target === back) back.dataset.down = '1'; });
  back.addEventListener('click', e => { if (e.target === back && back.dataset.down) closeDialog(); delete back.dataset.down; });
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDialog(); }
    else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); doSave(false); }
  };
  document.addEventListener('keydown', onKey, true);
  dlg = { back, moved, onKey, prev: document.activeElement };
  app.appendChild(back);
  const nm = $('qaName');
  (nm && !nm.value.trim() ? nm : back.querySelector('#zdSave')).focus({ preventScroll: true });
  back.querySelector('form').scrollTop = 0;              // терезе басынан көрінеді
}
/* ---------- Белгіден жаңа қорғау аймағын бастау (Белгілер панелі → «Қорғау аймағы») ---------- */
let pendingMark = null;
async function startFromMark(m) {
  if (!m) return;
  const st = QA.state;
  if (st.pts.length || st.loadedId) {
    $('qaReset').click();                          // app.js өзі растау сұрайды; бас тартса — ештеңе өзгермейді
    for (let i = 0; i < 1200; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (!st.pts.length && !st.loadedId) break;
      if (!document.querySelector('.qa-dlg-back')) return;   // растау терезесі жабылды, бірақ тазаланбады — бас тартты
    }
    if (st.pts.length || st.loadedId) return;
  }
  pendingMark = m.id;
  globalThis.__marks?.closePanel?.();
  globalThis.__marks?.setMarking?.(false);
  fillFromMark(m);
  const add = $('qaAddMode');
  if (add && add.getAttribute('aria-pressed') !== 'true') add.click();
  const map = globalThis.MuraMarks && globalThis.MuraMarks.map;
  if (map) map.flyTo([m.lat, m.lon], Math.max(map.getZoom(), 17), { duration: 0.6 });
  toast('«' + m.name + '»: шекара нүктелерін қойып, «Аяқтау» басыңыз.');
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

fin?.addEventListener('click', openDialog);
globalThis.MuraZone = { openDialog, closeDialog, ready, fillFromMark, startFromMark };

/* Бос тізім мәтіні «Сақтау» батырмасына сілтейді — бағдарламада ол «Аяқтау» */
const savedBox = $('qaSaved');
if (savedBox) new MutationObserver(() => {
  const e = savedBox.querySelector('.qa-empty');
  if (e && e.textContent.includes('«Сақтау»')) e.textContent = e.textContent.replace('«Сақтау»', '«Аяқтау»');
}).observe(savedBox, { childList: true, subtree: true });

/* «Қорғау аймақтары» тізімі: әр жазбада «Өңдеу» — жазбаны ашып, мәліметтер терезесін бірден көрсетеді
   («Ашу» — тек картаға ашады: шекараны түзетіп, кейін «Аяқтау» басуға болады) */
/** Жазбаны редакторға ашу (қажет болса — app.js сақталмаған өзгерістер туралы сұрайды); ашылса — true. */
async function ensureLoaded(id) {
  const st = QA.state;
  if (st.loadedId === id) return true;
  const open = savedBox && savedBox.querySelector('[data-open="' + CSS.escape(id) + '"]');
  if (!open) return false;
  open.click();
  for (let i = 0; i < 1200 && st.loadedId !== id; i++) {
    await new Promise(r => setTimeout(r, 100));
    if (st.loadedId !== id && i > 3 && !document.querySelector('.qa-dlg-back')) return false;   // бас тартты
  }
  return st.loadedId === id;
}
async function editRecord(id) {
  const st = QA.state;
  if (st.loadedId !== id) {
    const open = savedBox && savedBox.querySelector('[data-open="' + CSS.escape(id) + '"]');
    if (!open) return;
    open.click();                                   // app.js: сақталмаған өзгерістер болса — өзі сұрайды
    for (let i = 0; i < 1200 && st.loadedId !== id; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (st.loadedId !== id && i > 3 && !document.querySelector('.qa-dlg-back')) return;   // бас тартты
    }
    if (st.loadedId !== id) return;
  }
  globalThis.QAUI?.closePanel?.();
  openDialog();
}
if (savedBox) {
  const addEdit = () => {
    for (const act of savedBox.querySelectorAll('.qa-sc-act')) {
      if (act.querySelector('[data-zedit]')) continue;
      const open = act.querySelector('[data-open]');
      if (!open) continue;
      if (!open.disabled) open.textContent = 'Ашу';
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'lnk'; b.dataset.zedit = open.getAttribute('data-open');
      b.textContent = 'Өңдеу'; b.title = 'Мәліметтерді өңдеу (атауы, орналасқан жері, аймақ өлшемдері) және сақтау';
      open.after(b);
      // Экспорт: әр ескерткіштің өз экспорты (GeoJSON, Word, сызба PNG) — бір батырмадан
      const geo = act.querySelector('[data-geo]');
      if (geo) {
        geo.classList.add('mura-gone');
        const x = document.createElement('button');
        x.type = 'button'; x.className = 'lnk'; x.dataset.zexp = geo.getAttribute('data-geo');
        x.textContent = 'Экспорт ▾'; x.title = 'Осы ескерткіштің қорғау аймағын экспорттау: GeoJSON, Word (DOCX), сызба (PNG)';
        geo.before(x);
      }
    }
  };
  new MutationObserver(addEdit).observe(savedBox, { childList: true, subtree: true });
  addEdit();
  savedBox.addEventListener('click', e => {
    const b = e.target.closest('[data-zedit]');
    if (b) { editRecord(b.dataset.zedit); return; }
    const x = e.target.closest('[data-zexp]');
    if (x) exportMenu(x.dataset.zexp, x);
  });
}

/* Жеке экспорт: GeoJSON — жазбаның өзінен (ашпай); Word мен сызба — жазба ашылып, «Мәліметтер» панеліндегі экспорт арқылы */
const ICX = {
  geo: '<path d="M12 3v12"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  png: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>',
};
async function exportRecord(id, kind) {
  if (kind === 'geo') { savedBox.querySelector('[data-geo="' + CSS.escape(id) + '"]')?.click(); return; }
  if (!(await ensureLoaded(id))) return;
  const btn = $(kind === 'docx' ? 'qaDocx' : 'qaPng');
  for (let i = 0; i < 50 && btn.disabled; i++) await new Promise(r => setTimeout(r, 100));   // аймақтар есептелгенше
  if (btn.disabled) { toast('Аймақтар есептелмеді — шекараны тексеріңіз.', true); return; }
  toast(kind === 'docx' ? 'Word құжаты жасалуда (карта суреті жүктелуде)…' : 'Сызба жасалуда…');
  btn.click();
}
function exportMenu(id, anchor) {
  const r = anchor.getBoundingClientRect();
  globalThis.MuraCtx?.openMenu(r.left, r.bottom + 4, 'Жеке экспорт', [
    { label: 'GeoJSON', hint: 'аймақтар шекарасы (QGIS)', icon: ICX.geo, run: () => exportRecord(id, 'geo') },
    { label: 'Word (DOCX)', hint: 'мәтін, сызба, аудандары', icon: ICX.doc, run: () => exportRecord(id, 'docx') },
    { label: 'Сызба (PNG)', hint: 'фоны — картадағы қабат', icon: ICX.png, run: () => exportRecord(id, 'png') },
  ]);
}

/* Жеке экспорт баптаулары («Мәліметтер» панелінен) — «Қорғау аймақтары» панеліне; төменде — біріктіріп экспорттау */
{
  const opts = document.querySelector('#qaResSec .qa-opts'), db = $('qaPanelSaved')?.querySelector('.qa-db'), df = $('qaPanelSaved')?.querySelector('.qa-df');
  if (opts && db) {
    const d = document.createElement('details');
    d.className = 'qa-combine zd-expopts';
    d.innerHTML = '<summary>Жеке экспорт баптаулары</summary>';
    d.appendChild(opts);
    db.appendChild(d);
  }
  if (df) df.insertAdjacentHTML('afterbegin', '<span class="zd-combt">Таңдалғандарды біріктіріп экспорттау:</span>');
}
globalThis.MuraZone.editRecord = editRecord;
globalThis.MuraZone.exportRecord = exportRecord;
