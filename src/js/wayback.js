/* Mura GIS: Esri World Imagery Wayback — спутник суретінің бұрынғы нұсқалары (2014 жылдан бері), жылдар бойынша салыстыру.
 *
 * Қабатты js/basemaps.js «Негізгі карта» тізіміне қосады (id 'wayback', түрі 'sat'). Қабат картада тұрғанда
 * жоғарғы ортада панель шығады:
 *   • «Нұсқа» — шығарылым (күні); ◀ ▶ — көршілес нұсқаға өту;
 *   • «Тек осы жерде өзгергендері» — карта ортасында сурет шынымен ауысқан шығарылымдар ғана (Esri tilemap «select» өрісі);
 *   • «Салыстыру» — екінші нұсқа және жылжымалы бөлгіш: сол жағы — бірінші нұсқа, оң жағы — екінші;
 *   • карта ортасындағы суреттің түсірілген күні, көзі, анықтығы (Esri метадерек қызметі).
 * Шығарылымдар тізімі: waybackconfig.json (тәулігіне бір рет жаңартылады, localStorage-та сақталады).
 * Тайлдар мен метадерек тегін, кілтсіз (© Esri, Maxar, Earthstar Geographics т.б.).
 */
(function () {
  'use strict';
  var L = window.L;
  if (!L) return;

  var CFG_URL = 'https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json';
  var TILEMAP = 'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tilemap/';
  var KEY_CFG = 'mura.wayback.cfg', KEY_ST = 'mura.wayback';
  var DAY = 864e5;
  var ATTR = '© Esri, Maxar, Earthstar Geographics · <a href="https://livingatlas.arcgis.com/wayback/">World Imagery Wayback</a>';

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* елемейміз */ } },
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- Шығарылымдар тізімі ---------- */
  var releases = null, loading = null;   // [{ num, date, url, meta }] — жаңасы бірінші
  function parseCfg(j) {
    return Object.keys(j).map(function (k) {
      var v = j[k], m = /(\d{4}-\d\d-\d\d)/.exec(v.itemTitle || '');
      return m && v.itemURL ? {
        num: +k, date: m[1], meta: v.metadataLayerUrl || '',
        url: v.itemURL.replace('{level}', '{z}').replace('{row}', '{y}').replace('{col}', '{x}'),
      } : null;
    }).filter(Boolean).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : b.num - a.num; });
  }
  function loadReleases() {
    if (releases) return Promise.resolve(releases);
    if (loading) return loading;
    var c = store.get(KEY_CFG, null);
    var cached = c && c.t && c.j ? parseCfg(c.j) : null;
    if (cached && Date.now() - c.t < DAY) { releases = cached; return Promise.resolve(releases); }
    loading = fetch(CFG_URL, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { store.set(KEY_CFG, { t: Date.now(), j: j }); releases = parseCfg(j); return releases; })
      .catch(function (e) { if (cached) { releases = cached; return releases; } loading = null; throw e; });
    return loading;
  }
  function byNum(n) { for (var i = 0; i < releases.length; i++) if (releases[i].num === n) return releases[i]; return null; }

  /* ---------- Нүктеде сурет ауысқан шығарылымдар (Esri wayback-core алгоритмі) ---------- */
  function tileXY(lat, lng, z) {
    var n = Math.pow(2, z), s = Math.sin(lat * Math.PI / 180);
    return { x: Math.floor((lng + 180) / 360 * n), y: Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n) };
  }
  var changesCache = {};
  /** Тізімнің ең жаңасынан бастап: tilemap жауабындағы «select» — тайл соңғы рет ауысқан шығарылым; одан ескілеріне өтеміз. */
  function localChanges(lat, lng, z) {
    var t = tileXY(lat, lng, z), key = z + '/' + t.y + '/' + t.x;
    if (changesCache[key]) return changesCache[key];
    var out = [], i = 0;
    var p = new Promise(function (resolve) {
      (function next() {
        if (i >= releases.length || out.length > 60) { resolve(out); return; }
        var r = releases[i];
        fetch(TILEMAP + r.num + '/' + key)
          .then(function (x) { return x.json(); })
          .then(function (j) {
            if (!j || !j.data || j.data[0] !== 1) { i++; next(); return; }
            var sel = (j.select && j.select[0]) || r.num, hit = byNum(sel) || r;
            if (out.indexOf(hit) < 0) out.push(hit);
            var k = releases.indexOf(hit);
            i = Math.max(i, k) + 1;
            next();
          })
          .catch(function () { i++; next(); });
      })();
    });
    p.then(function (v) { if (!v.length) delete changesCache[key]; });
    changesCache[key] = p;
    return p;
  }

  /* ---------- Түсірілген күні (метадерек) ---------- */
  var metaCache = {};
  function captureInfo(rel, lat, lng, z) {
    if (!rel.meta) return Promise.resolve(null);
    var layer = Math.max(0, Math.min(13, 23 - Math.round(z)));
    var key = rel.num + '/' + layer + '/' + lat.toFixed(3) + ',' + lng.toFixed(3);
    if (metaCache[key]) return metaCache[key];
    var q = rel.meta + '/' + layer + '/query?f=json&outFields=SRC_DATE2,NICE_DESC,SRC_RES,SRC_ACC&returnGeometry=false' +
      '&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&geometry=' + lng.toFixed(6) + ',' + lat.toFixed(6);
    var p = fetch(q).then(function (r) { return r.json(); }).then(function (j) {
      var a = j && j.features && j.features[0] && j.features[0].attributes;
      if (!a) return null;
      return {
        date: a.SRC_DATE2 ? new Date(a.SRC_DATE2).toISOString().slice(0, 10) : '',
        src: a.NICE_DESC || '', res: a.SRC_RES ? +a.SRC_RES : 0, acc: a.SRC_ACC ? +a.SRC_ACC : 0,
      };
    });
    p.catch(function () { delete metaCache[key]; });
    metaCache[key] = p;
    return p;
  }

  /* ---------- Қабат + панель ---------- */
  function create(map) {
    var st = store.get(KEY_ST, {}) || {};
    var state = { a: st.a || 0, b: st.b || 0, cmp: !!st.cmp, local: st.local !== false, split: st.split || 0.5 };
    function save() { store.set(KEY_ST, { a: state.a, b: state.b, cmp: state.cmp, local: state.local, split: state.split }); }

    var group = L.featureGroup(), tlA = null, tlB = null, panel = null, divider = null, onMap = false;
    var list = [];      // панельдегі тізім (барлығы не тек осы жерде өзгергендері)

    function tileLayer(rel) {
      return L.tileLayer(rel.url, { attribution: ATTR, maxZoom: 20, maxNativeZoom: 18, zIndex: 1, className: 'sat-tiles' });
    }
    function setLayer(which, rel) {
      var cur = which === 'a' ? tlA : tlB;
      if (cur && cur._wbNum === rel.num) return;
      var tl = tileLayer(rel); tl._wbNum = rel.num;
      group.addLayer(tl);
      if (cur) {   // ескісін жаңасы жүктелгенде алып тастаймыз — жыпылықтамайды
        var drop = function () { group.removeLayer(cur); clip(); };
        tl.once('load', drop); setTimeout(function () { if (group.hasLayer(cur)) drop(); }, 4000);
      }
      if (which === 'a') tlA = tl; else tlB = tl;
      clip();
    }
    function dropB() { if (tlB) { group.removeLayer(tlB); tlB = null; } }

    /* --- Бөлгіш: сол жағы — A, оң жағы — B (қабат контейнерлерін clip арқылы кесеміз) --- */
    function clip() {
      if (!onMap) return;
      var cA = tlA && tlA.getContainer(), cB = tlB && tlB.getContainer();
      if (!state.cmp || !tlB) {
        if (cA) cA.style.clip = '';
        if (divider) divider.hidden = true;
        return;
      }
      var size = map.getSize(), x = Math.round(size.x * state.split);
      var nw = map.containerPointToLayerPoint([0, 0]), se = map.containerPointToLayerPoint(size), cx = map.containerPointToLayerPoint([x, 0]).x;
      if (cA) cA.style.clip = 'rect(' + [nw.y, cx, se.y, nw.x].join('px,') + 'px)';
      if (cB) cB.style.clip = 'rect(' + [nw.y, se.x, se.y, cx].join('px,') + 'px)';
      if (divider) { divider.hidden = false; divider.style.left = x + 'px'; }
    }
    function makeDivider() {
      divider = L.DomUtil.create('div', 'wb-divider', map.getContainer());
      divider.innerHTML = '<span class="wb-side wb-side--a"></span><button type="button" class="wb-handle" aria-label="Бөлгішті жылжыту" title="Сүйреп жылжытыңыз">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l-6 6 6 6M15 6l6 6-6 6"/></svg></button><span class="wb-side wb-side--b"></span>';
      divider.hidden = true;
      L.DomEvent.disableClickPropagation(divider);
      L.DomEvent.disableScrollPropagation(divider);
      var h = divider.querySelector('.wb-handle');
      h.addEventListener('pointerdown', function (e) {
        e.preventDefault(); e.stopPropagation();
        h.setPointerCapture(e.pointerId);
        var r = map.getContainer().getBoundingClientRect();
        function mv(ev) { state.split = Math.max(0.02, Math.min(0.98, (ev.clientX - r.left) / r.width)); clip(); }
        function up() { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); save(); }
        h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
      });
      h.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowLeft' ? -0.02 : e.key === 'ArrowRight' ? 0.02 : 0;
        if (!d) return;
        e.preventDefault(); state.split = Math.max(0.02, Math.min(0.98, state.split + d)); clip(); save();
      });
    }

    /* --- Панель --- */
    var el = {};
    function makePanel() {
      panel = L.DomUtil.create('div', 'wb-panel', map.getContainer());
      panel.setAttribute('role', 'group');
      panel.setAttribute('aria-label', 'Esri Wayback: спутник суретінің нұсқалары');
      panel.innerHTML =
        '<div class="wb-row">' +
          '<strong class="wb-title" title="Esri World Imagery Wayback — спутник суретінің бұрынғы нұсқалары">Wayback</strong>' +
          '<button type="button" class="wb-step" data-step="1" data-w="a" title="Ескірек нұсқа" aria-label="Ескірек нұсқа">◀</button>' +
          '<select class="wb-sel" data-w="a" aria-label="Сурет нұсқасы"></select>' +
          '<button type="button" class="wb-step" data-step="-1" data-w="a" title="Жаңарақ нұсқа" aria-label="Жаңарақ нұсқа">▶</button>' +
          '<label class="wb-chk" title="Екі нұсқаны бөлгішпен қатар көрсету"><input type="checkbox" class="wb-cmp"> Салыстыру</label>' +
        '</div>' +
        '<div class="wb-row wb-row--b" hidden>' +
          '<span class="wb-lbl">Оң жақ:</span>' +
          '<button type="button" class="wb-step" data-step="1" data-w="b" title="Ескірек нұсқа" aria-label="Ескірек нұсқа">◀</button>' +
          '<select class="wb-sel" data-w="b" aria-label="Салыстыратын нұсқа"></select>' +
          '<button type="button" class="wb-step" data-step="-1" data-w="b" title="Жаңарақ нұсқа" aria-label="Жаңарақ нұсқа">▶</button>' +
          '<button type="button" class="wb-swap" title="Екі жағын ауыстыру" aria-label="Екі жағын ауыстыру">⇄</button>' +
        '</div>' +
        '<div class="wb-row wb-row--info">' +
          '<label class="wb-chk" title="Карта ортасында сурет шынымен ауысқан нұсқалар ғана"><input type="checkbox" class="wb-local"> Тек осы жерде өзгергендері</label>' +
          '<span class="wb-info" aria-live="polite"></span>' +
        '</div>';
      L.DomEvent.disableClickPropagation(panel);
      L.DomEvent.disableScrollPropagation(panel);
      el.selA = panel.querySelector('.wb-sel[data-w="a"]');
      el.selB = panel.querySelector('.wb-sel[data-w="b"]');
      el.rowB = panel.querySelector('.wb-row--b');
      el.cmp = panel.querySelector('.wb-cmp');
      el.local = panel.querySelector('.wb-local');
      el.info = panel.querySelector('.wb-info');
      el.cmp.checked = state.cmp; el.local.checked = state.local;
      el.selA.addEventListener('change', function () { pick('a', +el.selA.value); });
      el.selB.addEventListener('change', function () { pick('b', +el.selB.value); });
      panel.querySelectorAll('.wb-step').forEach(function (b) {
        b.addEventListener('click', function () {
          var w = b.dataset.w, cur = state[w], i = indexIn(cur) + (+b.dataset.step);
          if (i >= 0 && i < list.length) pick(w, list[i].num);
        });
      });
      panel.querySelector('.wb-swap').addEventListener('click', function () {
        var a = state.a, t = tlA; state.a = state.b; state.b = a; tlA = tlB; tlB = t; save();
        fill(); apply();
      });
      el.cmp.addEventListener('change', function () {
        state.cmp = el.cmp.checked;
        if (state.cmp && (!state.b || state.b === state.a)) state.b = defaultB();
        save(); fill(); apply();
      });
      el.local.addEventListener('change', function () { state.local = el.local.checked; save(); refreshList(); });
    }
    function indexIn(num) { for (var i = 0; i < list.length; i++) if (list[i].num === num) return i; return -1; }
    function defaultB() {   // салыстыруға: A-дан ескірек ең жақын нұсқа
      var i = indexIn(state.a);
      return (list[i + 1] || list[i - 1] || list[0] || {}).num || 0;
    }
    /** Тізімде жоқ шығарылым → осы жерде дәл сол суретті көрсететін нұсқа (күні одан ескі не тең ең жақыны). */
    function snap(num) {
      var r = byNum(num);
      if (!r || indexIn(num) >= 0) return r ? num : (list[0] || {}).num || 0;
      for (var i = 0; i < list.length; i++) if (list[i].date <= r.date) return list[i].num;
      return list[list.length - 1].num;
    }
    function pick(w, num) { state[w] = num; save(); fill(); apply(); }

    function fill() {
      if (!panel || !releases) return;
      [['a', el.selA], ['b', el.selB]].forEach(function (p) {
        var w = p[0], sel = p[1], cur = state[w];
        var items = list.slice();
        if (cur && indexIn(cur) < 0 && byNum(cur)) items.push(byNum(cur));   // тізімнен тыс таңдалғаны да көрінсін
        items.sort(function (x, y) { return x.date < y.date ? 1 : -1; });
        sel.innerHTML = items.map(function (r) {
          return '<option value="' + r.num + '"' + (r.num === cur ? ' selected' : '') + '>' + esc(r.date) + '</option>';
        }).join('');
      });
      el.rowB.hidden = !state.cmp;
      var iA = indexIn(state.a), iB = indexIn(state.b);
      panel.querySelectorAll('.wb-step').forEach(function (b) {
        var i = b.dataset.w === 'a' ? iA : iB, n = i + (+b.dataset.step);
        b.disabled = i < 0 ? !list.length : n < 0 || n >= list.length;
      });
      if (divider) {
        var a = byNum(state.a), b = byNum(state.b);
        divider.querySelector('.wb-side--a').textContent = a ? a.date : '';
        divider.querySelector('.wb-side--b').textContent = b ? b.date : '';
      }
    }
    function apply() {
      if (!onMap || !releases) return;
      var a = byNum(state.a) || list[0] || releases[0];
      state.a = a.num;
      setLayer('a', a);
      if (state.cmp) { var b = byNum(state.b) || byNum(defaultB()); if (b) { state.b = b.num; setLayer('b', b); } }
      else dropB();
      clip(); info();
    }

    /* Карта ортасындағы суреттің түсірілген күні */
    var infoSeq = 0;
    function info() {
      if (!panel || !releases) return;
      var seq = ++infoSeq, c = map.getCenter(), z = map.getZoom();
      var rels = [byNum(state.a)].concat(state.cmp ? [byNum(state.b)] : []).filter(Boolean);
      if (!rels.length) { el.info.textContent = ''; return; }
      var res = rels.map(function () { return undefined; });
      function show() {
        var parts = res.map(function (m, i) {
          var RU = !!(window.MuraI18n && window.MuraI18n.ru);
          var side = rels.length > 1 ? (i ? (RU ? 'справа: ' : 'оң: ') : (RU ? 'слева: ' : 'сол: ')) : '';
          if (m === undefined) return side + '…';
          if (!m) return side + (RU ? 'нет данных' : 'дерек жоқ');
          return side + (m.date || '?') + (m.src ? ' · ' + m.src : '') + (m.res ? ' · ' + (Math.round(m.res * 100) / 100) + ' м' : '');
        });
        el.info.textContent = (window.MuraI18n && window.MuraI18n.ru ? 'Снято: ' : 'Түсірілген: ') + parts.join(' | ');
      }
      el.info.title = 'Карта ортасындағы суреттің түсірілген күні, көзі және анықтығы (Esri метадеректері)';
      show();
      rels.forEach(function (r, i) {
        captureInfo(r, c.lat, c.lng, z).catch(function () { return null; }).then(function (m) {
          if (seq !== infoSeq) return;
          res[i] = m || null; show();
        });
      });
    }

    var listSeq = 0;
    function refreshList() {
      if (!releases) return;
      var seq = ++listSeq;
      if (!state.local) { list = releases.slice(); fill(); apply(); return; }
      var c = map.getCenter(), z = Math.max(3, Math.min(18, Math.round(map.getZoom())));
      el.local.parentNode.classList.add('is-busy');
      localChanges(c.lat, c.lng, z).then(function (res) {
        if (seq !== listSeq) return;
        el.local.parentNode.classList.remove('is-busy');
        list = res.length ? res : releases.slice();
        state.a = snap(state.a); if (state.b) state.b = snap(state.b);
        fill(); apply();
      });
    }

    var moveT = null;
    function onMove() { clip(); }
    function onMoveEnd() {
      clip();
      clearTimeout(moveT);
      moveT = setTimeout(function () { if (state.local) refreshList(); else info(); }, 450);
    }

    group.onAdd = function (m) {
      L.FeatureGroup.prototype.onAdd.call(this, m);
      onMap = true;
      if (!panel) { makePanel(); makeDivider(); }
      panel.hidden = false;
      map.on('move zoom viewreset resize', onMove);
      map.on('moveend zoomend', onMoveEnd);
      el.info.textContent = 'Нұсқалар тізімі жүктелуде…';
      loadReleases().then(function () {
        if (!onMap) return;
        if (!state.a || !byNum(state.a)) state.a = releases[0].num;
        list = releases.slice();
        fill(); apply(); refreshList();
      }, function (e) {
        el.info.textContent = (window.MuraI18n && window.MuraI18n.ru ? 'Список Wayback не загружен: ' : 'Wayback тізімі жүктелмеді: ') + e.message;
        group.fire('tileerror');
      });
    };
    group.onRemove = function (m) {
      onMap = false;
      map.off('move zoom viewreset resize', onMove);
      map.off('moveend zoomend', onMoveEnd);
      clearTimeout(moveT);
      if (panel) panel.hidden = true;
      if (divider) divider.hidden = true;
      L.FeatureGroup.prototype.onRemove.call(this, m);
      group.clearLayers(); tlA = tlB = null;
    };
    group.label = function () { var r = releases && byNum(state.a); return r ? 'Wayback ' + r.date : 'Wayback'; };
    return group;
  }

  window.MuraWayback = { create: create, loadReleases: loadReleases, localChanges: localChanges, captureInfo: captureInfo };
})();
