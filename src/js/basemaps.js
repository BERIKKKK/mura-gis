/* Mura GIS: карта қабаттары — ашық сыртқы тайл-сервистер.
 *
 * Пайдаланушы өз XYZ сервисін (мыс. QGIS-те қолданатын сілтеме) «Сыртқы карта қосу» арқылы қоса алады.
 *
 * Интерфейсі: AqmBasemaps.attach(map, el) → { mode(), set(id) };
 * карта ауысқанда map 'basemapchange' оқиғасы шығады. mode() — 'sat' (спутник түрі) не 'std':
 * құралдың сызба (PNG/DOCX) фонын таңдауы осыған сүйенеді (qorgau/app.js → schemeIsSat).
 */
(function () {
  'use strict';
  var L = window.L;
  if (!L) return;

  var KEY_BASE = 'mura.basemap', KEY_OVL = 'mura.overlays', KEY_CUSTOM = 'mura.custom-maps';
  var ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  var SAT_URL = ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}';

  /* ---------- Кірістірілген каталог ---------- */
  var BUILTIN = [
    { id: 'osm', kind: 'std', grp: 'std', label: 'OpenStreetMap', sw: 'std',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxNative: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
    { id: 'otm', kind: 'std', grp: 'topo', label: 'OpenTopoMap (топокарта)', sw: 'topo',
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', subdomains: 'abc', maxNative: 17,
      attribution: '© OpenStreetMap, SRTM · © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)' },
    { id: 'esri-topo', kind: 'std', grp: 'topo', label: 'Esri World Topo', sw: 'topo2',
      url: ESRI + 'World_Topo_Map/MapServer/tile/{z}/{y}/{x}', maxNative: 19,
      attribution: '© Esri, HERE, Garmin, OpenStreetMap' },
    // Кеңестік Бас штаб (Генштаб) топокарталары — nakarte.me тайл-серверінен (AtloMaps мозаикасы: 1:100 000 → 1:50 000,
    // бүкіл КСРО аумағы, нақты масштаб z13-ке дейін). Ақтөбе облысы толық қамтылған (2026-11-19 тексерілді).
    { id: 'gsh', kind: 'std', grp: 'hist', label: 'Генштаб (КСРО топокартасы)', sw: 'gsh',
      url: 'https://tiles.nakarte.me/topomapper/{z}/{x}/{y}', maxNative: 13,
      attribution: 'Генштаб КСРО · AtloMaps · <a href="https://nakarte.me">nakarte.me</a>' },
    { id: 'gsh1m', kind: 'std', grp: 'hist', label: 'Генштаб 1:1 000 000', sw: 'gsh',
      url: 'https://{s}.tiles.nakarte.me/topo001m/{z}/{x}/{y}', subdomains: 'abc', tms: true, maxNative: 10,
      attribution: 'Генштаб КСРО · <a href="https://nakarte.me">nakarte.me</a>' },
    { id: 'sat', kind: 'sat', grp: 'sat', label: 'Спутник (Esri)', sw: 'sat',
      url: SAT_URL, maxNative: 18, probe: true,
      attribution: '© Esri, Maxar, Earthstar Geographics' },
  ];
  // Esri Wayback — спутник суретінің бұрынғы нұсқалары, жылдар бойынша салыстыру (js/wayback.js; қабат пен панельді сол жасайды)
  var WAYBACK = { id: 'wayback', kind: 'sat', grp: 'sat', label: 'Спутник: Esri Wayback (жылдар бойынша)', sw: 'sat',
    make: function (map) { return window.MuraWayback.create(map); } };
  var BUILTIN_OVL = [
    { id: 'esri-places', overlay: true, label: 'Атаулар мен шекаралар (Esri)',
      url: ESRI + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', maxNative: 19,
      attribution: '© Esri' },
    { id: 'esri-roads', overlay: true, label: 'Жолдар (Esri)',
      url: ESRI + 'Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', maxNative: 19,
      attribution: '© Esri' },
  ];

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* елемейміз */ } },
  };
  function customs() { var c = store.get(KEY_CUSTOM, []); return Array.isArray(c) ? c.filter(function (x) { return x && x.id && x.url; }) : []; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function makeLayer(d) {
    var url = d.url, tms = false;
    if (url.indexOf('{-y}') >= 0) { url = url.replace('{-y}', '{y}'); tms = true; }
    var o = {
      attribution: d.attribution || '', maxZoom: 20, maxNativeZoom: d.maxNative || 18,
      zIndex: d.overlay ? 5 : 1, opacity: d.opacity != null ? d.opacity : 1, tms: tms || !!d.tms,
    };
    if (d.subdomains) o.subdomains = d.subdomains;
    if (d.kind === 'sat') o.className = 'sat-tiles';
    return L.tileLayer(url, o);
  }

  /* Спутник: кей өңірде 18-масштабта сурет жоқ — көрініс ортасындағы ең үлкен бар масштабты тексеріп, одан әрі ұлғайтамыз */
  var satZoomCache = {};
  function satNativeZoom(lat, lng, done) {
    var key = lat.toFixed(2) + ',' + lng.toFixed(2);
    if (satZoomCache[key]) { done(satZoomCache[key]); return; }
    var z = 18;
    (function probe() {
      var n = Math.pow(2, z), s = Math.sin(lat * Math.PI / 180);
      var x = Math.floor((lng + 180) / 360 * n), y = Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n);
      fetch(SAT_URL.replace('/tile/{z}/{y}/{x}', '/tilemap/' + z + '/' + y + '/' + x + '/1/1'))
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if ((j && j.data && j.data[0]) || z <= 13) { satZoomCache[key] = z; done(z); return; }
          z--; probe();
        })
        .catch(function () { satZoomCache[key] = 18; done(18); });
    })();
  }

  var ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/></svg>';

  function attach(map) {
    var bases = {}, overlays = {}, layers = {};
    function rebuildCatalog() {
      bases = {}; overlays = {};
      BUILTIN.forEach(function (d) { bases[d.id] = d; });
      if (window.MuraWayback) bases[WAYBACK.id] = WAYBACK;
      BUILTIN_OVL.forEach(function (d) { overlays[d.id] = d; });
      customs().forEach(function (d) { d.custom = true; if (d.overlay) overlays[d.id] = d; else bases[d.id] = d; });
    }
    rebuildCatalog();
    function layerOf(d) { if (!layers[d.id]) { layers[d.id] = d.make ? d.make(map) : makeLayer(d); watch(layers[d.id], d); } return layers[d.id]; }

    var base = store.get(KEY_BASE, 'osm');
    if (!bases[base]) base = 'osm';
    var onOvl = (store.get(KEY_OVL, []) || []).filter(function (id) { return overlays[id]; });
    var api = {
      mode: function () { return bases[base] && bases[base].kind === 'sat' ? 'sat' : 'std'; },
      id: function () { return base; },
      set: function (id) { setBase(id); },
    };

    /* --- Тайлдар жүктелмесе: хабарлама --- */
    var notice = null, stat = {}, timer = null;
    function watch(tl, d) {
      tl.on('tileload', function () { bump(d, true); });
      tl.on('tileerror', function () { bump(d, false); });
    }
    function bump(d, ok) {
      var s = stat[d.id] || (stat[d.id] = { ok: 0, bad: 0 });
      if (ok) s.ok++; else s.bad++;
      clearTimeout(timer); timer = setTimeout(check, 1200);
    }
    function check() {
      Object.keys(stat).forEach(function (id) {
        var s = stat[id], d = bases[id] || overlays[id];
        if (d && s.bad > 0 && s.ok === 0 && (id === base || onOvl.indexOf(id) >= 0)) showNotice(d);
      });
      stat = {};
    }
    map.on('zoomstart movestart', function () { clearTimeout(timer); stat = {}; });
    function hideNotice() { if (notice) { notice.remove(); notice = null; } }
    function showNotice(d) {
      hideNotice();
      notice = L.DomUtil.create('div', 'bm-notice', map.getContainer());
      notice.setAttribute('role', 'status');
      notice.innerHTML = '<span class="bm-notice-text"></span>' +
        (d.overlay || d.id === 'osm' ? '' : '<button type="button" class="bm-notice-back">OpenStreetMap-қа оралу</button>') +
        '<button type="button" class="bm-notice-close" aria-label="Жабу">×</button>';
      notice.querySelector('.bm-notice-text').textContent = window.tx ? window.tx('«' + d.label + '» картасы жүктелмеді. Интернет байланысын не сервис мекенжайын тексеріңіз.', 'Карта «' + window.tr(d.label) + '» не загрузилась. Проверьте подключение к интернету или адрес сервиса.') : '«' + d.label + '» картасы жүктелмеді. Интернет байланысын не сервис мекенжайын тексеріңіз.';
      L.DomEvent.disableClickPropagation(notice);
      var back = notice.querySelector('.bm-notice-back');
      if (back) back.addEventListener('click', function () { setBase('osm'); });
      notice.querySelector('.bm-notice-close').addEventListener('click', hideNotice);
    }

    /* --- Спутник: нақты масштабты тексеру --- */
    var probeTimer = null;
    function satCheck() {
      var d = bases[base];
      if (!d || !d.probe || map.getZoom() < 15) return;
      clearTimeout(probeTimer);
      probeTimer = setTimeout(function () {
        var c = map.getCenter(), tl = layers[d.id];
        satNativeZoom(c.lat, c.lng, function (z) { if (tl && tl.options.maxNativeZoom !== z) { tl.options.maxNativeZoom = z; tl.redraw(); } });
      }, 300);
    }
    map.on('moveend', satCheck);

    function setBase(id) {
      if (!bases[id]) return;
      var prev = base;
      if (prev !== id && layers[prev] && map.hasLayer(layers[prev])) map.removeLayer(layers[prev]);
      base = id; store.set(KEY_BASE, id);
      layerOf(bases[id]).addTo(map);
      hideNotice(); satCheck(); paint();
      if (prev !== id) map.fire('basemapchange', { mode: api.mode(), id: id });
    }
    function toggleOverlay(id, on) {
      var d = overlays[id];
      if (!d) return;
      var i = onOvl.indexOf(id);
      if (on && i < 0) onOvl.push(id);
      if (!on && i >= 0) onOvl.splice(i, 1);
      store.set(KEY_OVL, onOvl);
      if (on) layerOf(d).addTo(map); else if (layers[id]) map.removeLayer(layers[id]);
      paint();
    }
    function removeCustom(id) {
      var d = bases[id] || overlays[id];
      if (!d || !d.custom) return;
      if (!confirm(window.tx ? window.tx('«' + d.label + '» картасын тізімнен өшіру керек пе?', 'Удалить карту «' + d.label + '» из списка?') : '«' + d.label + '» картасын тізімнен өшіру керек пе?')) return;
      if (layers[id]) { map.removeLayer(layers[id]); delete layers[id]; }
      store.set(KEY_CUSTOM, customs().filter(function (x) { return x.id !== id; }));
      onOvl = onOvl.filter(function (x) { return x !== id; }); store.set(KEY_OVL, onOvl);
      var wasBase = id === base;
      rebuildCatalog();
      if (wasBase) setBase('osm');
      render();
    }

    layerOf(bases[base]).addTo(map);
    onOvl.forEach(function (id) { layerOf(overlays[id]).addTo(map); });
    map.whenReady(satCheck);

    /* --- «Карта қабаттары» мәзірі --- */
    var box, menu, trig, opts = {};
    function row(d, isOvl) {
      var b = document.createElement('div');
      b.className = 'bm-opt mura-opt';
      b.setAttribute('role', isOvl ? 'menuitemcheckbox' : 'menuitemradio');
      b.tabIndex = 0;
      // Өз картасын өшіру — атауының астындағы сілтеме: таңдау белгісінен (оң жақтағы дөңгелек / құсбелгі) алыс,
      // карта таңдағанда байқаусыз басылмайды
      b.innerHTML = (isOvl ? '<span class="mura-chk" aria-hidden="true"></span>' : '<span class="bm-sw bm-sw--' + esc(d.sw || 'custom') + '" aria-hidden="true"></span>') +
        '<span class="bm-opt-label">' + esc(d.label) + (d.custom ? '<small>өз картаңыз · <button type="button" class="mura-del-link" title="Тізімнен өшіру">тізімнен өшіру</button></small>' : '') + '</span>' +
        (isOvl ? '' : '<span class="bm-radio" aria-hidden="true"></span>');
      function act() { if (isOvl) toggleOverlay(d.id, onOvl.indexOf(d.id) < 0); else setBase(d.id); }
      b.addEventListener('click', function (e) {
        if (e.target.closest('.mura-del-link')) { e.stopPropagation(); removeCustom(d.id); return; }
        act();
      });
      b.addEventListener('keydown', function (e) { if (e.target.closest('.mura-del-link')) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
      opts[d.id] = b;
      return b;
    }
    function title(text, extra) { var t = document.createElement('div'); t.className = 'bm-menu-title' + (extra ? ' ' + extra : ''); t.textContent = text; return t; }
    function sub(text) { var t = document.createElement('div'); t.className = 'bm-sub'; t.textContent = text; return t; }
    // Негізгі карталардың топтары (интерфейстегі реті); өз XYZ карталары — «Қолданушы карталары»
    var BGRP = [['std', 'Қалыпты карталар'], ['topo', 'Топографиялық карталар'], ['sat', 'Спутниктік карталар'], ['hist', 'Тарихи карталар'], ['user', 'Қолданушы карталары']];
    function render() {
      opts = {};
      menu.innerHTML = '';
      menu.appendChild(title('Негізгі карталар'));
      BGRP.forEach(function (g) {
        var ids = Object.keys(bases).filter(function (id) { return (bases[id].grp || 'user') === g[0]; });
        if (!ids.length && g[0] !== 'user') return;
        menu.appendChild(sub(g[1]));
        ids.forEach(function (id) { menu.appendChild(row(bases[id], false)); });
      });
      var add = document.createElement('button');
      add.type = 'button'; add.className = 'mura-add';
      add.textContent = '+ Сыртқы карта қосу (XYZ)…';
      add.addEventListener('click', function () { close(); openAddDialog(); });
      menu.appendChild(add);
      menu.appendChild(title('Үстіңгі қабаттар', 'mura-sub'));
      // WMS: НИПД геопорталы және қолданушының WMS қабаттары (js/wms-ui.js)
      if (ovl) { var ob = document.createElement('div'); ob.className = 'ov-box'; menu.appendChild(ob); ovl.renderInto(ob); }
      var xyz = Object.keys(overlays);
      if (xyz.length) {
        menu.appendChild(sub('Esri және XYZ қабаттары'));
        xyz.forEach(function (id) { menu.appendChild(row(overlays[id], true)); });
      }
      paint();
    }
    function paint() {
      Object.keys(opts).forEach(function (id) {
        var on = id === base || onOvl.indexOf(id) >= 0;
        opts[id].classList.toggle('is-active', on);
        opts[id].setAttribute('aria-checked', on ? 'true' : 'false');
      });
      map.getContainer().classList.toggle('is-sat', api.mode() === 'sat');
    }
    function open() { menu.hidden = false; trig.setAttribute('aria-expanded', 'true'); box.classList.add('is-open'); }
    function close() { if (!menu || menu.hidden) return; menu.hidden = true; trig.setAttribute('aria-expanded', 'false'); box.classList.remove('is-open'); }

    // Үстіңгі WMS қабаттары (НИПД, қолданушы сервистері) — XYZ карталарынан бөлек модуль
    var ovl = window.MuraOverlays ? window.MuraOverlays.attach(map, { open: function () { if (menu) open(); }, close: function () { close(); } }) : null;
    api.overlays = ovl;
    if (window.MuraOverlays) window.MuraOverlays.current = ovl;

    var Ctl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        box = L.DomUtil.create('div', 'bm-layers');
        trig = L.DomUtil.create('button', 'bm-trigger', box);
        trig.type = 'button';
        trig.setAttribute('aria-haspopup', 'true');
        trig.setAttribute('aria-expanded', 'false');
        trig.setAttribute('aria-label', 'Карта қабаттары');
        trig.innerHTML = ICON + '<span class="bm-tip" aria-hidden="true">Карта қабаттары</span>';
        menu = L.DomUtil.create('div', 'bm-menu mura-menu', box);
        menu.setAttribute('role', 'menu');
        menu.hidden = true;
        render();
        trig.addEventListener('click', function () { if (menu.hidden) open(); else close(); });
        box.addEventListener('keydown', function (e) { if (e.key === 'Escape') { close(); trig.focus(); } });
        // composedPath: мәзір ішіндегі батырма басылғаннан кейін қайта салынса да (WMS бөлімі), басу мәзір ішінде саналады
        document.addEventListener('click', function (e) { if (e.composedPath().indexOf(box) < 0) close(); });
        map.on('click movestart', close);
        L.DomEvent.disableClickPropagation(box);
        L.DomEvent.disableScrollPropagation(box);
        return box;
      }
    });
    map.addControl(new Ctl());

    /* --- Сыртқы карта қосу терезесі --- */
    function openAddDialog() {
      var dlg = document.createElement('div');
      dlg.className = 'mura-dlg-back';
      dlg.innerHTML =
        '<form class="mura-dlg" role="dialog" aria-modal="true" aria-labelledby="muraAddT" novalidate>' +
        '<h3 id="muraAddT">Сыртқы карта қосу</h3>' +
        '<label>Атауы<input name="label" maxlength="60" placeholder="Мысалы: Генштаб 1:100 000"></label>' +
        '<label>Тайлдар мекенжайы (XYZ үлгісі)<input name="url" spellcheck="false" placeholder="https://{s}.example.com/{z}/{x}/{y}.png"></label>' +
        '<p class="mura-hint">' + (window.MuraI18n && window.MuraI18n.ru
          ? 'В адресе должны быть <code>{z}</code>, <code>{x}</code>, <code>{y}</code>. Дополнительно: <code>{s}</code> (поддомен a, b, c), <code>{-y}</code> (нумерация TMS). Формат совпадает со ссылками «XYZ Tiles» в QGIS.'
          : 'Мекенжайда <code>{z}</code>, <code>{x}</code>, <code>{y}</code> болуы керек. Қосымша: <code>{s}</code> (субдомен a, b, c), <code>{-y}</code> (TMS нөмірлеуі). Пішімі QGIS-тегі «XYZ Tiles» сілтемелерімен бірдей.') + '</p>' +
        '<div class="mura-dlg-row">' +
        '<label>Түрі<select name="overlay"><option value="0">Негізгі карта</option><option value="1">Үстіңгі қабат</option></select></label>' +
        '<label>Ең үлкен масштаб (z)<input name="max" type="number" min="1" max="22" value="18"></label>' +
        '<label>Мөлдірсіздігі, %<input name="op" type="number" min="10" max="100" value="100"></label>' +
        '</div>' +
        '<label>Авторлық белгі (міндетті емес)<input name="attr" maxlength="120" placeholder="© …"></label>' +
        '<p class="mura-err" role="alert" hidden></p>' +
        '<div class="mura-dlg-btns"><button type="button" class="btn btn--ghost btn--sm" data-x>Бас тарту</button><button type="submit" class="btn btn--primary btn--sm">Қосу</button></div>' +
        '</form>';
      document.body.appendChild(dlg);
      var f = dlg.querySelector('form'), err = dlg.querySelector('.mura-err');
      function done() { dlg.remove(); document.removeEventListener('keydown', onKey, true); }
      function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); done(); } }
      document.addEventListener('keydown', onKey, true);
      dlg.addEventListener('mousedown', function (e) { if (e.target === dlg) done(); });
      dlg.querySelector('[data-x]').addEventListener('click', done);
      f.elements.label.focus();
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var url = f.elements.url.value.trim();
        var bad = !/^https?:\/\//i.test(url) ? 'Мекенжай http:// не https:// деп басталуы керек.' :
          (url.indexOf('{z}') < 0 || url.indexOf('{x}') < 0 || (url.indexOf('{y}') < 0 && url.indexOf('{-y}') < 0)) ? 'Мекенжайда {z}, {x} және {y} болуы керек.' : '';
        if (bad) { err.textContent = bad; err.hidden = false; return; }
        var d = {
          id: 'c' + Date.now().toString(36), custom: true, label: f.elements.label.value.trim() || 'Өз картам', url: url,
          overlay: f.elements.overlay.value === '1', kind: 'std', sw: 'custom',
          subdomains: url.indexOf('{s}') >= 0 ? 'abc' : undefined,
          maxNative: Math.min(22, Math.max(1, parseInt(f.elements.max.value, 10) || 18)),
          opacity: Math.min(100, Math.max(10, parseInt(f.elements.op.value, 10) || 100)) / 100,
          attribution: esc(f.elements.attr.value.trim()),
        };
        var list = customs(); list.push(d); store.set(KEY_CUSTOM, list);
        rebuildCatalog(); render();
        if (d.overlay) toggleOverlay(d.id, true); else setBase(d.id);
        done();
      });
    }

    paint();
    return api;
  }

  window.AqmBasemaps = { attach: attach };
})();
