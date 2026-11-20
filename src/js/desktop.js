/* Mura GIS: жұмыс үстелі қабығы.
   Қорғау аймағы қызметінің интерфейсін (qorgau/*.js) жұмыс үстелі терезесіне бейімдейді.
   Бұл файл qorgau/ui.js пен app.js модульдерінен БҰРЫН орындалады, сондықтан DOM-ды солар іске қосылмай тұрып өзгертеміз:
     • беттің жоғарғы жолағы (.qa-top) алынады; құралдар жолағы жұмыс реті бойынша қайта топталады,
       «Мәліметтер» мен «Қорғау аймақтары» («Сақталған аймақтар») соған көшеді, «Аяқтау» батырмасы қосылады;
     • құралдар жолағы картаның үстінде қалқымайды — терезенің жоғарғы жағына бекітіледі;
     • жазба күйі («Жаңа жазба», «Сақталмаған өзгерістер») төменгі күй жолағына және терезе атауына шығады;
     • күй жолағында курсордың координатасы мен карта масштабы көрсетіледі. */
(function () {
  'use strict';
  var L = window.L;
  var map = null;
  if (L && L.Map) L.Map.addInitHook(function () { if (!map) { map = this; hookMap(this); } });

  var $ = function (id) { return document.getElementById(id); };
  var app = $('qaApp'), bar = $('qaToolbar'), stage = $('qaStage'), top = app && app.querySelector('.qa-top');
  if (!app || !bar || !stage) return;

  /* ---------- Құралдар жолағы: терезенің жоғарғы жағында ---------- */
  bar.classList.remove('qa-glass');
  bar.classList.add('mura-bar');
  app.insertBefore(bar, stage);

  /* ---------- Құралдар жолағы жұмыс реті бойынша ----------
     [Белгілер — marks/marks-dom.js қосады] → [Қорғау аймағы: шекара — Нүкте қою, Болдырмау, Нүктелер, Аяқтау]
     → [Қорғау аймақтары (тізім, өңдеу, экспорт)] → [Өлшеу: Сызғыш, бұрыш, Ретке келтіру, Тіктөртбұрыш] → [Көрініс: Сыйғызу, Толық экран] … ⋯ */
  var tmain = $('qaTmain');
  var gBorder = $('qaAddMode').closest('.qa-tgroup'), gData = $('qaPtsBtn').closest('.qa-tgroup'), gMeasure = $('qaRuler').closest('.qa-tgroup');
  gBorder.setAttribute('aria-label', 'Қорғау аймағы: шекара');
  gData.setAttribute('aria-label', 'Қорғау аймағы: деректер');
  gBorder.classList.add('mura-zone');
  gData.classList.add('mura-zone');
  gBorder.appendChild($('qaPtsBtn'));
  // «Ретке келтіру» мен «Тіктөртбұрыш» — бұрышты туралаудан кейін (өлшеу / геометрия құралдары)
  gMeasure.setAttribute('aria-label', 'Өлшеу және геометрия');
  gMeasure.appendChild($('qaSort'));
  gMeasure.appendChild($('qaRectBtn'));
  // «⋯» мәзірі: «GeoJSON файлын ашу» мен «Тізіммен енгізу» — «Нүктелер» панелінде бар; «Үлгіні ашу» жасырылады
  ['qaMenuPaste', 'qaSample'].forEach(function (id) { var el = $(id); if (el) el.classList.add('mura-gone'); });
  var mm = $('qaMoreMenu');
  if (mm) {
    var gp = mm.querySelector('[data-proxy="qaGeoOpen"]'); if (gp) gp.classList.add('mura-gone');
    [].forEach.call(mm.querySelectorAll('.qa-msep:not(#qaMoreSep)'), function (s) { s.classList.add('mura-gone'); });
  }
  // «Аяқтау»: шекара белгіленген соң — мәліметтер терезесі және сақтау (js/zone-dialog.js)
  var fin = document.createElement('button');
  fin.type = 'button'; fin.className = 'qa-tbtn mura-finish'; fin.id = 'qaFinish';
  fin.setAttribute('data-prio', '0'); fin.setAttribute('aria-label', 'Аяқтау');
  fin.setAttribute('data-tip', 'Аяқтау: шекара дайын — мәліметтерді толтырып, сақтау');
  fin.disabled = true;
  fin.innerHTML = '<svg class="qa-ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.7 2.7L16.2 9.4"/></svg><span class="qa-tl">Аяқтау</span>';
  gBorder.appendChild(fin);
  // «Мәліметтер» және «Қорғау аймақтары» (бұрынғы «Сақталған аймақтар») — қорғау аймағының деректер тобына, «Экспорттың» алдына
  [['qaOpenSaved', 'Қорғау аймақтары: сақталған жазбалар, біріктіру', 'Қорғау аймақтары', '3']].forEach(function (p) {
    var b = $(p[0]);
    if (!b) return;
    b.className = 'qa-tbtn';
    b.setAttribute('data-tip', p[1]);
    b.setAttribute('aria-label', p[2]);
    b.setAttribute('data-prio', p[3]);
    b.removeAttribute('title');
    var lbl = b.querySelector('.qa-hl');
    if (lbl) { lbl.className = 'qa-tl'; lbl.textContent = p[2]; }
    gData.insertBefore(b, $('qaExportBtn'));
  });
  // «Мәліметтер» батырмасы жоқ: мәліметтер «Аяқтау» терезесінде, өңдеу — «Қорғау аймақтары» тізімінен.
  // Панельдің өзі қалады (экспорт: «Экспорт» батырмасы оны ашады) — батырма элементі жасырын түрде сақталады.
  // «Экспорт» батырмасы да жоқ: әр ескерткіштің экспорты және біріктіріп экспорттау — «Қорғау аймақтары» панелінде
  var exp = $('qaExportBtn');
  if (exp) { exp.removeAttribute('data-prio'); exp.className = 'qa-tbtn mura-gone'; }
  var info = $('qaOpenInfo');
  if (info) { info.className = 'qa-tbtn mura-gone'; info.removeAttribute('title'); info.setAttribute('aria-label', 'Мәліметтер'); gData.appendChild(info); }
  tmain.insertBefore(gData, gMeasure);
  var st = $('qaPanelSavedT');
  if (st && st.lastChild && st.lastChild.nodeType === 3) st.lastChild.textContent = 'Қорғау аймақтары';
  var sq = $('qaSavedQ');
  if (sq) sq.setAttribute('aria-label', 'Қорғау аймақтарынан іздеу');

  /* ---------- Төменгі күй жолағы ---------- */
  var sb = document.createElement('footer');
  sb.className = 'mura-status';
  sb.innerHTML =
    '<span class="mura-st-rec" id="muraRec"></span>' +
    '<span class="mura-st-sp"></span>' +
    '<span class="mura-st-cell" id="muraCursor" title="Курсордың координатасы (WGS 84)">N —  E —</span>' +
    '<span class="mura-st-cell" id="muraScale" title="Карта масштабы (экран 96 dpi)"></span>' +
    '<span class="mura-st-cell mura-st-ver">Mura GIS' + (window.mura && window.mura.version ? ' ' + window.mura.version : '') + '</span>';
  app.appendChild(sb);
  var rec = $('muraRec');
  ['qaLoaded', 'qaDirty'].forEach(function (id) { var el = $(id); if (el) rec.appendChild(el); });
  if (top) top.remove();

  /* ---------- Терезе атауы: ашық жазба және сақталмаған өзгерістер ---------- */
  // «Жаңа жазба» деген күй жоқ: ашық қорғау аймағы болмаса — тек «Mura GIS»; ашылса — «Mura GIS — атауы».
  // Күй жолағында да «Жаңа жазба» жазуы көрсетілмейді (app.js оны жазады — жасырамыз), ашық жазба болса — «Қорғау аймағы: атауы».
  var busyTitle = false;
  function paintTitle() {
    if (busyTitle) return;
    busyTitle = true;
    var loaded = $('qaLoaded'), dirty = $('qaDirty');
    var strong = loaded && loaded.querySelector('strong');
    var name = strong ? strong.textContent.trim() : '';
    if (loaded) {
      if (loaded.hidden !== !strong) loaded.hidden = !strong;      // тек өзгергенде — әйтпесе MutationObserver тұйықталады
      if (strong && loaded.firstChild && loaded.firstChild.nodeType === 3 && loaded.firstChild.textContent !== 'Қорғау аймағы: ') loaded.firstChild.textContent = 'Қорғау аймағы: ';
    }
    var proj = window.mura && window.mura.project && window.mura.project.current;
    document.title = (proj ? proj.name + ' — ' : '') + 'Mura GIS' + (name ? ' — ' + name : '') + (name && dirty && !dirty.hidden ? ' ●' : '');
    busyTitle = false;
  }
  new MutationObserver(paintTitle).observe(rec, { subtree: true, childList: true, characterData: true, attributes: true });
  paintTitle();

  /* ---------- Курсор координатасы және масштаб ---------- */
  function fmt(v) { return v.toFixed(6); }
  function hookMap(m) {
    var cur = $('muraCursor'), sc = $('muraScale');
    m.on('mousemove', function (e) {
      if (cur) cur.textContent = 'N ' + fmt(e.latlng.lat) + '°  E ' + fmt(e.latlng.lng) + '°';
    });
    m.on('mouseout', function () { if (cur) cur.textContent = 'N —  E —'; });
    function paintScale() {
      if (!sc) return;
      var c = m.getCenter(), z = m.getZoom();
      var mpp = 40075016.686 * Math.cos(c.lat * Math.PI / 180) / Math.pow(2, z + 8);
      var n = Math.round(mpp * 96 / 0.0254);
      var r = n > 10000 ? Math.round(n / 1000) * 1000 : n > 1000 ? Math.round(n / 100) * 100 : Math.round(n / 10) * 10;
      sc.textContent = 'Масштаб 1:' + r.toLocaleString('ru-RU') + ' · z' + z;
    }
    m.on('zoomend moveend', paintScale);
    m.whenReady(paintScale);
  }
})();
