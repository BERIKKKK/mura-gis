/* Mura GIS: қорғау аймағын «Аяқтау» — белгі қоюмен бірдей логика.
   Шекара нүктелері қойылып болған соң құралдар жолағындағы «Аяқтау» батырмасы басылады: нүкте қою режимі өшеді де,
   мәліметтер терезесі ашылады (атауы, мерзімі, облыс/аудан, орналасқан жері, сипаттамасы, аймақ өлшемдері, нәтиже),
   сол жерден «Сақтау» басылады.
   Терезедегі өрістер — «Мәліметтер» панеліндегі өрістердің өзі (уақытша терезеге көшіріліп, жабылғанда орнына қайтады),
   сондықтан есептеу мен сақтау qorgau/app.js-тің өз логикасымен жүреді; сақтау — құралдар жолағындағы «Сақтау» батырмасы арқылы.
   Бұл модуль qorgau/app.js-тен кейін жүктеледі (globalThis.__qa). */
const $ = id => document.getElementById(id);
const QA = globalThis.__qa;
const app = $('qaApp'), fin = $('qaFinish'), saveBtn = $('qaSave');

const ready = () => !!(QA && QA.R && !QA.R.error);
function paintFinish() {
  if (!fin) return;
  const ok = ready();
  fin.disabled = !ok;
  fin.dataset.tip = ok ? 'Аяқтау: мәліметтерді толтырып, қорғау аймағын сақтау' : 'Аяқтау: алдымен шекараның кемінде 4 нүктесін қойыңыз';
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
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

fin?.addEventListener('click', openDialog);
globalThis.MuraZone = { openDialog, closeDialog, ready };
