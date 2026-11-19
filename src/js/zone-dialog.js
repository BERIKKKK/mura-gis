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
    : dirty ? 'Аяқтау: сақталмаған өзгерістер бар — мәліметтерді тексеріп, сақтаңыз' : 'Аяқтау: мәліметтерді толтырып, қорғау аймағын сақтау';
}
if (dirtyEl) new MutationObserver(paintFinish).observe(dirtyEl, { attributes: true, attributeFilter: ['hidden'] });
function toast(msg, err) {
  const t = $('qaToast');
  if (!t) return;
  t.textContent = msg; t.classList.toggle('is-err', !!err); t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, err ? 5000 : 3200);
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
    box.innerHTML = '<div class="qa-f"><label for="zdMark">Белгіленген ескерткіш</label><select id="zdMark"><option value="">— таңдалмаған —</option>' +
      near.map(x => '<option value="' + escapeHtml(x.m.id) + '"' + (pre && pre.m.id === x.m.id ? ' selected' : '') + '>' + escapeHtml(x.m.name) +
        (x.m.district ? ' — ' + escapeHtml(x.m.district) : '') + (x.in ? ' · шекара ішінде' : x.d < Infinity ? ' · ' + fmtD(x.d) : '') + '</option>').join('') +
      '</select><p class="qa-hint" id="zdMarkHint">Таңдасаңыз, атауы, мерзімі, облыс, аудан, орналасқан жері мен түрі белгіден толтырылады.</p></div>';
    body.appendChild(box);
    box.querySelector('select').addEventListener('change', e => {
      const m = marks().find(x => x.id === e.target.value);
      if (m) { fillFromMark(m); box.querySelector('#zdMarkHint').textContent = 'Мәліметтер «' + m.name + '» белгісінен толтырылды — қажет болса түзетіңіз.'; }
    });
    if (pre && (auto || pendingMark === pre.m.id)) {
      fillFromMark(pre.m);
      box.querySelector('#zdMarkHint').textContent = (auto ? 'Шекара ішіндегі белгі таңдалды: ' : 'Мәліметтер белгіден толтырылды: ') + '«' + pre.m.name + '». Қажет болса түзетіңіз.';
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

/* Сайттағы құралдың бос тізім мәтіні «Сақтау» батырмасына сілтейді — бағдарламада ол «Аяқтау» */
const savedBox = $('qaSaved');
if (savedBox) new MutationObserver(() => {
  const e = savedBox.querySelector('.qa-empty');
  if (e && e.textContent.includes('«Сақтау»')) e.textContent = e.textContent.replace('«Сақтау»', '«Аяқтау»');
}).observe(savedBox, { childList: true, subtree: true });
