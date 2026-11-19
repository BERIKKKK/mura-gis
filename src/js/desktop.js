/* Mura GIS: жұмыс үстелі қабығы.
   Құралдың негізгі коды — qorgau/*.js; мұнда интерфейсті жұмыс үстелі терезесіне бейімдейміз.
   Бұл файл qorgau/ui.js пен app.js модульдерінен БҰРЫН орындалады, сондықтан DOM-ды солар іске қосылмай тұрып өзгертеміз:
     • жоғарғы жолақ (.qa-top) алынады; «Мәліметтер» мен «Сақталған аймақтар» құралдар жолағына көшеді;
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

  // «Мәліметтер» және «Сақталған аймақтар» → құралдар жолағының оң жағы (сақтау батырмасының алдында)
  var right = bar.querySelector('.qa-tright');
  var grp = document.createElement('div');
  grp.className = 'qa-tgroup mura-panels';
  grp.setAttribute('role', 'group');
  grp.setAttribute('aria-label', 'Панельдер');
  [['qaOpenInfo', 'Мәліметтер: ескерткіш, аймақ өлшемдері, нәтиже'], ['qaOpenSaved', 'Сақталған аймақтар']].forEach(function (p) {
    var b = $(p[0]);
    if (!b) return;
    b.className = 'qa-tbtn';
    b.setAttribute('data-tip', p[1]);
    b.removeAttribute('title');
    var lbl = b.querySelector('.qa-hl');
    if (lbl) lbl.className = 'qa-tl';
    grp.appendChild(b);
  });
  right.insertBefore(grp, right.firstChild);

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
  function paintTitle() {
    var loaded = $('qaLoaded'), dirty = $('qaDirty');
    var strong = loaded && loaded.querySelector('strong');
    var name = strong ? strong.textContent.trim() : 'Жаңа жазба';
    document.title = (dirty && !dirty.hidden ? '● ' : '') + name + ' — Mura GIS';
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
