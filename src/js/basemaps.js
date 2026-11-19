/* Сайттың assets/js/app.js файлынан автоматты көшірілген (scripts/sync-from-site.mjs). Қолмен өзгертпеңіз. */
(function () {
  'use strict';
  var Basemaps = (function () {
    var KEY = 'aqm.basemap';
    var cfg = null;
    try { var ce = document.getElementById('mapBasemaps'); if (ce) cfg = JSON.parse(ce.textContent || 'null'); } catch (e) { cfg = null; }
    var T = (cfg && cfg.i18n) || {};
    var STD_MAX = 18;

    function saved() { try { var v = localStorage.getItem(KEY); return v === 'topo' || v === 'sat' ? v : 'std'; } catch (e) { return 'std'; } }
    function save(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
    function topoOk() { return !!(cfg && cfg.available && cfg.layers && cfg.layers.length); }

    function stdLayer() {
      return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: STD_MAX, zIndex: 1 });
    }
    // Қамту картасы (coverage.json, әр масштабқа 2 бит): 0 — тайл жоқ (аймақтық қамтудан тыс →
    // сұраныс жіберілмейді, мөлдір орын арқылы астындағы OSM көрінеді), 1 — JPEG (толық ішінде),
    // 2 — WebP (қамту шекарасымен қиылысатын тайл; шекарадан тыс пиксельдері мөлдір).
    var BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    function covDecode(cov) {
      if (!cov || !cov.levels) return null;
      var out = {};
      Object.keys(cov.levels).forEach(function (z) {
        var l = cov.levels[z];
        out[z] = { x0: l.x0, y0: l.y0, w: l.w, h: l.h, b: atob(l.bits) };
      });
      return out;
    }
    function covValue(lv, z, x, y) {
      var l = lv[z];
      if (!l) return 0;
      x -= l.x0; y -= l.y0;
      if (x < 0 || y < 0 || x >= l.w || y >= l.h) return 0;
      var i = (y * l.w + x) * 2;
      return (l.b.charCodeAt(i >> 3) >> (6 - (i & 7))) & 3;
    }
    // Класс тек картасы бар бетте (Leaflet жүктелгенде) жасалады: басты бетте L жоқ — модуль
    // анықталғанда L-ге жүгінсе, қате бүкіл app.js-ті тоқтатады (мыс. тақырып ауыстырғышы істемей қалады).
    var CovLayer = null;
    function covLayerClass() {
      if (!CovLayer) CovLayer = L.TileLayer.extend({
        getTileUrl: function (c) {
          var lv = this.options.levels;
          if (lv) {
            var v = covValue(lv, c.z, c.x, c.y);
            if (!v) return BLANK;
            this.options.ext = v === 2 ? 'webp' : 'jpg';
          }
          return L.TileLayer.prototype.getTileUrl.call(this, c);
        }
      });
      return CovLayer;
    }
    // Топокарта — OSM-нің ҮСТІНДЕГІ қабаттар тобы (астыңғысы бірінші): 1:1 млн шолу (5–10, ары қарай
    // үлкейтіліп фон болады — ішкі бос орындарда да, 1:200 000 жүктелгенше де көрінеді) және
    // 1:200 000 (11–12, 13-те үлкейтіледі). Аймақтық қамту ішінде топокарта мөлдір емес;
    // одан тыс тайлдар жоқ, сондықтан бір картада өзінен-өзі OSM ашылады.
    function topoLayer() {
      var labels = cfg.layers.map(function (l) { return l.label; }).filter(Boolean);
      var att = cfg.attribution + (labels.length ? ' (' + labels.join(', ') + ')' : '');
      return L.layerGroup(cfg.layers.map(function (l, i) {
        return new (covLayerClass())(l.url, {
          minZoom: l.minZoom, maxNativeZoom: l.nativeZoom, maxZoom: cfg.maxZoom, zIndex: 2 + i,
          bounds: l.bounds ? L.latLngBounds(l.bounds) : undefined, ext: 'jpg',
          attribution: i === 0 ? att : undefined, className: 'topo-tiles', keepBuffer: 1, levels: covDecode(l.cov)
        });
      }));
    }

    /* --- Толық экран: Fullscreen API; ол жоқ браузерде (мыс. iPhone Safari) — CSS арқылы
       бүкіл терезеге жаю (.map-fs). Карта қайта құрылмайды, тек өлшемі жаңарады. --- */
    var FS_ON = '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7.5V3h4.5M12.5 3H17v4.5M17 12.5V17h-4.5M7.5 17H3v-4.5"/></svg>';
    var FS_OFF = '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.5 3v4.5H3M17 7.5h-4.5V3M12.5 17v-4.5H17M3 12.5h4.5V17"/></svg>';
    function addFullscreen(map, el) {
      var native = !!(el.requestFullscreen || el.webkitRequestFullscreen);
      var wheelWas = map.scrollWheelZoom.enabled();
      var btn = null, on = false;
      function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
      function paint() {
        if (!btn) return;
        btn.innerHTML = on ? FS_OFF : FS_ON;
        var t = on ? (T.fsOff || 'Exit full screen') : (T.fsOn || 'Full screen');
        btn.title = t; btn.setAttribute('aria-label', t); btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      function changed(state) {
        on = state;
        el.classList.toggle('is-fullscreen', on);
        if (on) map.scrollWheelZoom.enable(); else if (!wheelWas) map.scrollWheelZoom.disable();
        paint();
        setTimeout(function () { map.invalidateSize(); }, 60);
      }
      function enter() {
        if (native) {
          var r = el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen();
          if (r && r.catch) r.catch(function () { native = false; enter(); });   // рұқсат етілмесе — CSS нұсқасы
          return;
        }
        el.classList.add('map-fs'); document.documentElement.classList.add('map-fs-lock'); changed(true);
      }
      function exit() {
        if (fsEl() === el) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
        el.classList.remove('map-fs'); document.documentElement.classList.remove('map-fs-lock'); changed(false);
      }
      ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) {
        document.addEventListener(ev, function () { var f = fsEl() === el; if (f !== on) changed(f); });
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && on && !fsEl()) exit(); });
      var Ctl = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: function () {
          var box = L.DomUtil.create('div', 'leaflet-bar map-fs-ctl');
          btn = L.DomUtil.create('a', 'map-fs-btn', box);
          btn.href = '#'; btn.setAttribute('role', 'button');
          L.DomEvent.on(btn, 'click', function (e) { L.DomEvent.preventDefault(e); if (on) exit(); else enter(); });
          L.DomEvent.disableClickPropagation(box);
          paint();
          return box;
        }
      });
      map.addControl(new Ctl());
    }

    // Спутник: Esri World Imagery. Кей өңірде 18-масштабта сурет жоқ («Map data not yet available»),
    // сондықтан көрініс ортасында суреті бар ең үлкен масштаб тексеріліп, одан әрі тайлдар ұлғайтылады.
    var SAT_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    var SAT_MAX = 19;
    function satLayer() {
      return L.tileLayer(SAT_URL, { attribution: '© Esri, Maxar, Earthstar Geographics', maxZoom: SAT_MAX, maxNativeZoom: 18, zIndex: 1, className: 'sat-tiles' });
    }
    var satZoomCache = {};
    function satNativeZoom(lat, lng, done) {
      var key = lat.toFixed(2) + ',' + lng.toFixed(2);
      if (satZoomCache[key]) { done(satZoomCache[key]); return; }
      if (!window.fetch) { done(18); return; }
      var z = 18;
      (function probe() {
        var n = Math.pow(2, z), s = Math.sin(lat * Math.PI / 180);
        var x = Math.floor((lng + 180) / 360 * n), y = Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n);
        fetch(SAT_URL.replace('/tile/{z}/{y}/{x}', '/tilemap/' + z + '/' + y + '/' + x + '/1/1'))
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if ((j && j.data && j.data[0] === 1) || z <= 14) { satZoomCache[key] = z; done(z); }
            else { z--; probe(); }
          })
          .catch(function () { satZoomCache[key] = 18; done(18); });
      })();
    }

    var ICON_LAYERS = '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5 2 6.5l8 4 8-4-8-4Z"/><path d="m2 10 8 4 8-4"/><path d="m2 13.5 8 4 8-4"/></svg>';

    /* attach(map, el) → { mode(), set(m) }; режим ауысқанда map 'basemapchange' оқиғасын шығарады ({mode}). */
    function attach(map, el) {
      if (el && el.dataset.basemaps) addFullscreen(map, el);
      var withMenu = !!(el && el.dataset.basemaps);
      var hasTopo = withMenu && topoOk();
      var layers = { std: stdLayer(), sat: withMenu ? satLayer() : null, topo: hasTopo ? topoLayer() : null };
      var modes = ['std', 'sat'].concat(hasTopo ? ['topo'] : []);
      var mode = withMenu ? saved() : 'std';
      if (modes.indexOf(mode) < 0) mode = 'std';
      var notice = null, opts = {}, keptZoom = null;
      var api = { mode: function () { return mode; }, set: function (m) { set(m, true); } };
      if (!withMenu) { layers.std.addTo(map); return api; }

      // Ұлғайту шегі: топо кезінде cfg.maxZoom; асып тұрса — шекке дейін кішірейтеміз,
      // ал басқа картаға оралғанда (пайдаланушы масштабты өзгертпесе) бұрынғы масштабты қайтарамыз.
      function applyLimit(m) {
        if (m === 'topo') {
          if (map.getZoom() > cfg.maxZoom) { keptZoom = map.getZoom(); map.setZoom(cfg.maxZoom, { animate: false }); }
          else keptZoom = null;
          map.setMaxZoom(cfg.maxZoom);
        } else {
          map.setMaxZoom(m === 'sat' ? SAT_MAX : STD_MAX);
          if (keptZoom !== null && map.getZoom() === cfg.maxZoom) map.setZoom(keptZoom, { animate: false });
          keptZoom = null;
        }
      }

      // --- Топокарта тайлдары жүктелмесе: хабарлама + OpenStreetMap-қа оралу ---
      var ok = 0, bad = 0, timer = null;
      function resetCount() { ok = 0; bad = 0; }
      function check() { timer = null; if (mode === 'topo' && bad > 0 && ok === 0) showNotice(); resetCount(); }
      function bump(isOk) { if (isOk) ok++; else bad++; clearTimeout(timer); timer = setTimeout(check, 900); }
      if (layers.topo) layers.topo.eachLayer(function (tl) {
        tl.on('tileload', function (e) { if (e.tile.src !== BLANK) bump(true); });
        tl.on('tileerror', function () { bump(false); });
      });
      map.on('zoomstart movestart', function () { clearTimeout(timer); timer = null; resetCount(); });
      map.on('zoomend', function () { if (mode === 'topo' && map.getZoom() !== cfg.maxZoom) keptZoom = null; });

      // Спутник: суреті бар ең үлкен масштабты тексеру
      var satTimer = null;
      function satCheck() {
        if (mode !== 'sat' || map.getZoom() < 15) return;
        clearTimeout(satTimer);
        satTimer = setTimeout(function () {
          var c = map.getCenter();
          satNativeZoom(c.lat, c.lng, function (z) {
            if (layers.sat.options.maxNativeZoom !== z) { layers.sat.options.maxNativeZoom = z; layers.sat.redraw(); }
          });
        }, 300);
      }
      map.on('moveend', satCheck);

      function hideNotice() { if (notice) { notice.remove(); notice = null; } }
      function showNotice() {
        if (notice) return;
        notice = L.DomUtil.create('div', 'bm-notice', map.getContainer());
        notice.setAttribute('role', 'status');
        notice.innerHTML = '<span class="bm-notice-text"></span>' +
          '<button type="button" class="bm-notice-back"></button>' +
          '<button type="button" class="bm-notice-close">×</button>';
        notice.querySelector('.bm-notice-text').textContent = T.failed || 'The topographic map could not be loaded.';
        notice.querySelector('.bm-notice-back').textContent = T.back || 'Back';
        var cl = notice.querySelector('.bm-notice-close');
        cl.setAttribute('aria-label', T.close || 'Close');
        L.DomEvent.disableClickPropagation(notice);
        L.DomEvent.disableScrollPropagation(notice);
        notice.querySelector('.bm-notice-back').addEventListener('click', function () { set('std', true); });
        cl.addEventListener('click', hideNotice);
      }

      function paint() {
        var c = map.getContainer();
        c.classList.toggle('is-topo', mode === 'topo');
        c.classList.toggle('is-sat', mode === 'sat');
        Object.keys(opts).forEach(function (k) {
          opts[k].classList.toggle('is-active', k === mode);
          opts[k].setAttribute('aria-checked', k === mode ? 'true' : 'false');
        });
      }
      // OSM топокартаның астында қалады (қамтудан тыс жерде көрінеді); спутник кезінде OSM алынады.
      function set(m, persist) {
        if (modes.indexOf(m) < 0) return;
        if (persist) save(m);
        if (m === mode) return;
        if (mode === 'topo') map.removeLayer(layers.topo);
        if (mode === 'sat') map.removeLayer(layers.sat);
        if (m === 'sat') map.removeLayer(layers.std); else if (!map.hasLayer(layers.std)) layers.std.addTo(map);
        mode = m;
        applyLimit(m);
        if (m === 'topo') layers.topo.addTo(map);
        if (m === 'sat') { layers.sat.addTo(map); satCheck(); }
        hideNotice(); resetCount(); paint();
        map.fire('basemapchange', { mode: m });
      }

      applyLimit(mode);
      if (mode === 'sat') layers.sat.addTo(map); else layers.std.addTo(map);
      if (mode === 'topo') layers.topo.addTo(map);
      if (mode === 'sat') map.whenReady(satCheck);

      // --- «Карта қабаттары» ашылмалы мәзірі ---
      var Ctl = L.Control.extend({
        options: { position: 'topright' },
        onAdd: function () {
          var box = L.DomUtil.create('div', 'bm-layers');
          var trig = L.DomUtil.create('button', 'bm-trigger', box);
          trig.type = 'button';
          trig.setAttribute('aria-haspopup', 'true');
          trig.setAttribute('aria-expanded', 'false');
          // Ықшам иконка; «Карта қабаттары» жазуы — меңзер апарғанда/фокуста шығатын кеңес (tooltip)
          // және ашылған мәзірдің тақырыбы.
          var title = T.layers || 'Map layers';
          trig.setAttribute('aria-label', title);
          trig.innerHTML = ICON_LAYERS + '<span class="bm-tip" aria-hidden="true"></span>';
          trig.querySelector('.bm-tip').textContent = title;
          var menu = L.DomUtil.create('div', 'bm-menu', box);
          menu.setAttribute('role', 'menu');
          menu.setAttribute('aria-label', title);
          menu.hidden = true;
          L.DomUtil.create('div', 'bm-menu-title', menu).textContent = title;
          var labels = { std: T.osm || 'OpenStreetMap', sat: T.sat || 'Satellite', topo: T.topo || 'Topographic map' };
          modes.forEach(function (k) {
            var b = L.DomUtil.create('button', 'bm-opt', menu);
            b.type = 'button';
            b.setAttribute('role', 'menuitemradio');
            b.innerHTML = '<span class="bm-sw bm-sw--' + k + '" aria-hidden="true"></span><span class="bm-opt-label"></span><span class="bm-radio" aria-hidden="true"></span>';
            b.querySelector('.bm-opt-label').textContent = labels[k];
            b.addEventListener('click', function () { set(k, true); close(true); });
            opts[k] = b;
          });
          function open() { menu.hidden = false; trig.setAttribute('aria-expanded', 'true'); box.classList.add('is-open'); }
          function close(focus) {
            if (menu.hidden) return;
            menu.hidden = true; trig.setAttribute('aria-expanded', 'false'); box.classList.remove('is-open');
            if (focus) trig.focus();
          }
          trig.addEventListener('click', function () {
            if (menu.hidden) { open(); (opts[mode] || menu.firstChild).focus(); } else close();
          });
          box.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { close(true); return; }
            if (menu.hidden || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
            e.preventDefault();
            var list = modes.map(function (k) { return opts[k]; });
            var i = list.indexOf(document.activeElement);
            list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length].focus();
          });
          document.addEventListener('click', function (e) { if (!box.contains(e.target)) close(); });
          map.on('click movestart', function () { close(); });
          L.DomEvent.disableClickPropagation(box);
          L.DomEvent.disableScrollPropagation(box);
          return box;
        }
      });
      map.addControl(new Ctl());
      paint();
      return api;
    }

    return { attach: attach };
  })();
  // Әкімші панеліндегі құралдар (мыс. «Координат») сайттың картасын осы модуль арқылы қолданады
  window.AqmBasemaps = Basemaps;
})();
