/* Mura GIS: үстіңгі WMS қабаттары — НИПД геопорталы (map.gov.kz) және қолданушының WMS сервистері.
 *
 * «Карта қабаттары» мәзірінің «Үстіңгі қабаттар» бөлімін (js/basemaps.js) осы модуль салады:
 *   MuraOverlays.attach(map, { open, close }) → { renderInto(el), identify(latlng), queryable(), openAddDialog() }.
 *
 * Қабаттардың реті (төменнен жоғары): негізгі карта (тайл zIndex 1) → Esri/XYZ қабаттары (5) → НИПД әкімшілік
 * шекаралары (10+) → НИПД гидрография және көлік (30+) → НИПД атаулары (50+) → қолданушының WMS қабаттары (70+).
 * Бәрі Leaflet-тің tilePane-інде (z 200), ал қорғау аймақтары, маршруттар, белгілер, сызу/өлшеу құралдары — одан жоғары
 * overlayPane/markerPane-де; тайл суреттері тінтуір оқиғаларын ұстамайды, сондықтан құралдарға кедергі жоқ.
 *
 * Сақталатыны (localStorage, XYZ карталарынан бөлек):
 *   mura.wms-services — қолданушының сервистері; mura.wms-state — әр қабаттың қосулы/мөлдірлік/стиль күйі және реті;
 *   mura.wms-nipd-meta — НИПД қабаттарын тексеру нәтижесі мен метадеректері (тек сипаттама, карта деректері ЕМЕС; 7 күн).
 * Карта суреттері дискіге сақталмайды: офлайн кэш, жаппай жүктеу жоқ (НИПД-тен ресми рұқсат алынбаған).
 */
(function () {
  'use strict';
  var L = window.L, W = window.MuraWms;
  if (!L || !W) return;
  var tx = function (kk, ru) { return window.tx ? window.tx(kk, ru) : kk; };

  var KEY_SVC = 'mura.wms-services', KEY_ST = 'mura.wms-state', KEY_META = 'mura.wms-nipd-meta';
  var META_TTL = 7 * 864e5;
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* елемейміз */ } },
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ======================= НИПД каталогы =======================
     Идентификаторлар ойдан құрастырылмаған: 2026-11-25 күні https://map.gov.kz/geoserver/wms GetCapabilities жауабынан
     (3124 қабат) алынып, әрқайсысы GetMap сұрауымен Ақтөбе облысының аумағында тексерілді. Бағдарлама іске қосылған
     сайын қабат серверде бар-жоғы қайта тексеріледі (checkLayer); жоқ не рұқсат сұрайтын қабат қосылмайды. */
  var NIPD_URL = 'https://map.gov.kz/geoserver/wms';
  var KZ = [46.4, 40.5, 87.4, 55.5];
  var NIPD_ATTR_KK = 'Дереккөз: ҚР Ұлттық кеңістіктік деректер инфрақұрылымының мемлекеттік геопорталы (<a href="https://map.gov.kz/">map.gov.kz</a>)';
  var NIPD_ATTR_RU = 'Источник данных: государственный геопортал Национальной инфраструктуры пространственных данных РК (<a href="https://map.gov.kz/">map.gov.kz</a>)';
  var KATO = ['geonode:almobl_kato_wgs84', 'geonode:aqmola_kato_wgs84', 'geonode:batys_kato_wgs84', 'geonode:kostanay_kato_wgs84',
    'geonode:mangistau_kato_wgs84', 'geonode:orda_kato_wgs84', 'geonode:qarobl_kato_wgs84', 'geonode:turkistan_kato_wgs84', 'geonode:zhambyl_kato_wgs84'];
  var NIPD = [
    { key: 'border_rk', grp: 'admin', layers: ['geonode:border_rk'], kk: 'Мемлекеттік шекара', ru: 'Государственная граница' },
    { key: 'border_regions', grp: 'admin', layers: ['geonode:border_regions'], kk: 'Облыстардың шекаралары', ru: 'Границы областей' },
    { key: 'border_districts', grp: 'admin', layers: ['geonode:border_districts'], kk: 'Аудандардың шекаралары', ru: 'Границы районов' },
    { key: 'settlements', grp: 'admin', layers: KATO, opacity: 0.35,
      kk: 'Елді мекендердің шекаралары (9 облыс)', ru: 'Границы населённых пунктов (9 областей)',
      noteKk: 'Сервер тек тұтас сұр бояулы стиль ұсынады (тек контур не мөлдір стиль жоқ) — негізгі карта жабылып қалмас үшін әдепкі мөлдірлік 65%. Қамтылғаны: Алматы, Ақмола, Батыс Қазақстан, Қостанай, Маңғыстау, Қызылорда, Қарағанды, Түркістан, Жамбыл облыстары; Ақтөбе облысы серверде жоқ.',
      noteRu: 'Сервер предоставляет только стиль со сплошной серой заливкой (контурного или прозрачного стиля нет) — чтобы не закрывать основную карту, прозрачность по умолчанию 65%. Охвачены области: Алматинская, Акмолинская, Западно-Казахстанская, Костанайская, Мангистауская, Кызылординская, Карагандинская, Туркестанская, Жамбылская; Актюбинской области на сервере нет.' },
    { key: 'hydro', grp: 'hydro', layers: ['geonode:hydro_polygon_ca4c123b1e54d8e2baaf59cbfd688c22'], kk: 'Өзендер мен көлдер (гидрография)', ru: 'Реки и озёра (гидрография)' },
    { key: 'roads', grp: 'hydro', layers: ['geonode:roads_kz_sparse_ids_20261124'], kk: 'Автомобиль жолдары', ru: 'Автомобильные дороги' },
    { key: 'rail', grp: 'hydro', layers: ['geonode:railways_line'], kk: 'Темір жолдар', ru: 'Железные дороги' },
  ];
  // Серверден табылмағандар (интерфейсте тек ақпарат ретінде; жұмыс істейтін қабат ретінде көрсетілмейді)
  var NIPD_ABSENT_KK = 'Серверде табылмады: ауылдық округтердің шекаралары; қалалар мен ауылдардың атаулары (жазуы бар қабат); географиялық және жер-су атаулары. Тексерілген күні — 2026-11-25.';
  var NIPD_ABSENT_RU = 'На сервере не найдены: границы сельских округов; названия городов и сёл (слой с подписями); географические названия. Дата проверки — 2026-11-25.';
  var GROUPS = {
    admin: { base: 10, kk: 'Әкімшілік шекаралар', ru: 'Административные границы' },
    hydro: { base: 30, kk: 'Гидрография және көлік', ru: 'Гидрография и транспорт' },
    names: { base: 50, kk: 'Жер-су атаулары', ru: 'Географические названия' },
    user: { base: 70 },
  };
  var ST = {
    ok: ['қолжетімді', 'доступен'], checking: ['тексерілуде…', 'проверка…'], unknown: ['тексерілмеген', 'не проверен'],
    missing: ['серверде жоқ', 'нет на сервере'], denied: ['авторизация қажет', 'требуется авторизация'],
    down: ['Сервер қолжетімсіз', 'Сервер недоступен'], timeout: ['сервер жауап бермеді', 'сервер не ответил'],
    offline: ['Офлайн режимде қолжетімсіз', 'Недоступно в офлайн-режиме'], exception: ['сервер қатесі', 'ошибка сервера'],
    bad: ['жарамсыз жауап', 'некорректный ответ'], partial: ['ішінара қолжетімді', 'доступен частично'],
  };
  var BLOCKING = { missing: 1, denied: 1 };

  function loadServices() { var s = store.get(KEY_SVC, []); return Array.isArray(s) ? s.filter(function (x) { return x && x.id && x.url && Array.isArray(x.layers); }) : []; }
  function loadState() {
    var s = store.get(KEY_ST, null) || {};
    if (!s.items || typeof s.items !== 'object') s.items = {};
    if (!s.order || typeof s.order !== 'object') s.order = {};
    ['admin', 'hydro', 'names', 'user'].forEach(function (g) { if (!Array.isArray(s.order[g])) s.order[g] = []; });
    return s;
  }

  function attach(map, hooks) {
    hooks = hooks || {};
    var st = loadState(), services = loadServices();
    var meta = store.get(KEY_META, null);
    if (!meta || typeof meta !== 'object' || !meta.probe) meta = { probe: {}, caps: null, capsAt: 0 };
    var status = {};       // id → { kind, detail } (ағымдағы сеанс)
    var inst = {};         // id → Leaflet қабаты
    var box = null;
    var open = { nipd: false, user: false };
    var capsBusy = false;

    /* ---------- Каталог ---------- */
    function nipdItems() {
      return NIPD.map(function (n) {
        return { id: 'nipd:' + n.key, nipd: true, grp: n.grp, n: n, label: tx(n.kk, n.ru), sub: n.layers, defOpacity: n.opacity != null ? n.opacity : 1,
          note: n.noteKk ? tx(n.noteKk, n.noteRu) : '' };
      });
    }
    function userItems() {
      var out = [];
      services.forEach(function (s) {
        s.layers.forEach(function (l) { out.push({ id: 'u:' + s.id + ':' + l.name, grp: 'user', svc: s, lyr: l, label: l.title || l.name, sub: [l.name], defOpacity: s.opacity != null ? s.opacity : 1 }); });
      });
      return out;
    }
    function all() { return nipdItems().concat(userItems()); }
    function byId(id) { return all().filter(function (x) { return x.id === id; })[0] || null; }
    function cfg(id) { return st.items[id] || (st.items[id] = {}); }
    function saveState() { store.set(KEY_ST, st); }
    function saveMeta() { store.set(KEY_META, meta); }

    /* Қатар реті: st.order[grp] — төменнен жоғары; тізімде жоқ қабаттар соңына (жоғарыға емес, каталог ретімен) қосылады */
    function ordered(grp, list) {
      var ids = list.map(function (x) { return x.id; });
      var o = st.order[grp].filter(function (id) { return ids.indexOf(id) >= 0; });
      ids.forEach(function (id) { if (o.indexOf(id) < 0) o.push(id); });
      st.order[grp] = o;
      return o.map(function (id) { return list.filter(function (x) { return x.id === id; })[0]; });
    }
    function zIndexOf(it) {
      var list = it.grp === 'user' ? userItems() : nipdItems().filter(function (x) { return x.grp === it.grp; });
      var ids = ordered(it.grp, list).map(function (x) { return x.id; });
      return GROUPS[it.grp].base + Math.max(0, ids.indexOf(it.id));
    }

    /* ---------- НИПД: метадеректер және тексеру ---------- */
    function nipdMeta(name) { return meta.caps && meta.caps.layers && meta.caps.layers[name] || null; }
    function subOk(it) {
      // Тексерілген қолжетімді ішкі қабаттар (тексерілмегендері де алынады — оларды тайл қатесі көрсетеді)
      return it.sub.filter(function (n) { var p = meta.probe[n]; return !p || !BLOCKING[p.kind]; });
    }
    function probeFresh(n) { var p = meta.probe[n]; return p && Date.now() - p.at < META_TTL && (p.kind === 'ok' || BLOCKING[p.kind]); }
    function itemStatus(it) {
      if (!navigator.onLine) return { kind: 'offline' };
      if (status[it.id]) return status[it.id];
      if (!it.nipd) return { kind: 'unknown' };
      var kinds = it.sub.map(function (n) { var p = meta.probe[n]; return p ? p.kind : 'unknown'; });
      if (kinds.every(function (k) { return k === 'ok'; })) return { kind: 'ok' };
      if (kinds.some(function (k) { return k === 'ok'; })) return { kind: kinds.some(function (k) { return k === 'unknown'; }) ? 'ok' : 'partial', detail: it.sub.filter(function (n, i) { return kinds[i] !== 'ok'; }).join(', ') };
      if (kinds.every(function (k) { return k === 'missing'; })) return { kind: 'missing' };
      if (kinds.some(function (k) { return k === 'denied'; })) return { kind: 'denied' };
      var other = kinds.filter(function (k) { return k !== 'unknown'; })[0];
      return { kind: other || 'unknown', detail: it.sub.map(function (n) { return meta.probe[n] && meta.probe[n].detail; }).filter(Boolean)[0] };
    }
    var queue = [], running = 0;
    function pump() {
      while (running < 2 && queue.length) {
        var job = queue.shift();
        running++;
        job().then(function () { running--; pump(); }, function () { running--; pump(); });
      }
    }
    /** НИПД қабатын тексеру (бар ма, ашық па). force — кэшке қарамай. */
    function verify(it, force) {
      var names = it.sub.filter(function (n) { return force || !probeFresh(n); });
      if (!names.length) return Promise.resolve(itemStatus(it));
      status[it.id] = { kind: 'checking' };
      draw();
      return Promise.all(names.map(function (n) {
        return new Promise(function (res) {
          queue.push(function () {
            return W.checkLayer({ url: NIPD_URL, version: '1.3.0', layers: [n], format: 'image/png', bbox: (nipdMeta(n) || {}).bbox || KZ }).then(function (r) {
              // Желі қатесі сақталмайды (уақытша), тек анық нәтиже
              meta.probe[n] = { kind: r.kind, detail: r.detail ? String(r.detail).slice(0, 300) : '', at: r.kind === 'ok' || BLOCKING[r.kind] ? Date.now() : 0 };
              res(r);
            }, function () { res({ kind: 'down' }); });
          });
          pump();
        });
      })).then(function () {
        saveMeta();
        delete status[it.id];
        draw();
        return itemStatus(it);
      });
    }
    /** НИПД-тің толық GetCapabilities-і (≈13 МБ, бір минутқа дейін): тек «Қайта тексеру» басылғанда (серверге жүктеме түсірмеу үшін).
        Одан тек біздің қабаттардың сипаттамасы алынады (атауы, стильдері, queryable, шекарасы, атрибуциясы). */
    function loadNipdCaps(force) {
      if (capsBusy || (!force && meta.capsAt && Date.now() - meta.capsAt < META_TTL) || !navigator.onLine) return;
      capsBusy = true; draw();
      W.capabilities(NIPD_URL, '1.3.0', { id: 'nipd-caps', timeout: 180000, force: force }).then(function (r) {
        capsBusy = false;
        if (!r.ok) { meta.capsErr = r.kind; draw(); return; }
        var want = {};
        NIPD.forEach(function (n) { n.layers.forEach(function (x) { want[x] = 1; }); });
        var layers = {};
        r.caps.layers.forEach(function (l) {
          if (!want[l.name]) return;
          layers[l.name] = { title: l.title, abstract: l.abstract.slice(0, 300), styles: l.styles.map(function (s) { return { name: s.name, title: s.title }; }),
            queryable: l.queryable, bbox: l.bbox, crs: l.crs, attribution: l.attribution && l.attribution.title ? l.attribution : null, metadata: l.metadata };
        });
        // Каталогта жоқ болса — қабат серверден алынып тасталған
        Object.keys(want).forEach(function (n) { if (!layers[n]) meta.probe[n] = { kind: 'missing', detail: 'GetCapabilities', at: Date.now() }; });
        meta.caps = { title: r.caps.title, org: r.caps.org, version: r.caps.version, infoFormats: r.caps.infoFormats, layers: layers };
        meta.capsAt = Date.now(); meta.capsErr = '';
        saveMeta();
        // Жаңа шекаралар (bounds) мен атрибуция қосулы қабаттарға қолданылсын
        Object.keys(inst).forEach(function (id) { var it = byId(id); if (it && it.nipd) { remove(id); add(it); } });
        draw();
      });
    }

    /* ---------- Leaflet қабаттары ---------- */
    function attrOf(it) {
      if (it.nipd) {
        var a = it.sub.map(nipdMeta).filter(function (m) { return m && m.attribution && m.attribution.title; })[0];
        return a ? tx('Дереккөз: ', 'Источник данных: ') + esc(a.attribution.title) + ' (map.gov.kz)' : tx(NIPD_ATTR_KK, NIPD_ATTR_RU);
      }
      var s = it.svc, la = it.lyr.attribution;
      var t = s.attribution || (la && la.title) || '';
      return t ? tx('Дереккөз: ', 'Источник данных: ') + esc(t) : '';
    }
    function defOf(it) {
      var c = cfg(it.id);
      if (it.nipd) {
        var sub = subOk(it), boxes = sub.map(function (n) { return (nipdMeta(n) || {}).bbox; }).filter(Boolean);
        var bb = boxes.length ? boxes.reduce(function (a, b) { return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]; }) : KZ;
        return { url: NIPD_URL, version: '1.3.0', format: 'image/png', crs: 'EPSG:3857', layers: sub, styles: sub.map(function () { return sub.length === 1 ? c.style || '' : ''; }),
          bbox: bb, opacity: opacityOf(it), zIndex: zIndexOf(it), attribution: attrOf(it),
          infoUrl: NIPD_URL, infoFormats: meta.caps && meta.caps.infoFormats || ['application/json', 'text/html', 'text/plain'] };
      }
      var s = it.svc, l = it.lyr;
      var crs = s.crs === 'EPSG:4326' && (!l.crs || l.crs.indexOf('EPSG:4326') >= 0) ? 'EPSG:4326' : (l.crs && l.crs.length && l.crs.indexOf('EPSG:3857') < 0 ? 'EPSG:4326' : 'EPSG:3857');
      return { url: s.getMap || W.baseUrl(s.url), version: s.ver || '1.3.0', format: s.format || 'image/png', crs: crs, layers: [l.name],
        styles: [c.style != null ? c.style : (s.style && l.styles && l.styles.some(function (x) { return x.name === s.style; }) ? s.style : '')],
        bbox: l.bbox, opacity: opacityOf(it), zIndex: zIndexOf(it), attribution: attrOf(it), infoUrl: s.getInfo || s.getMap || W.baseUrl(s.url), infoFormats: s.infoFormats || [] };
    }
    function opacityOf(it) { var o = cfg(it.id).opacity; return typeof o === 'number' && o >= 0 && o <= 1 ? o : it.defOpacity; }
    function add(it) {
      if (inst[it.id]) return;
      var d = defOf(it);
      if (!d.layers.length) return;
      var l = W.layer(d);
      var stat = { ok: 0, bad: 0, url: '' }, t = null;
      l.on('tileload', function () {
        stat.ok++;
        if (status[it.id] && status[it.id].kind !== 'checking') { delete status[it.id]; draw(); }
      });
      l.on('tileerror', function (e) {
        stat.bad++; stat.url = e.tile && e.tile.src || stat.url;
        clearTimeout(t);
        t = setTimeout(function () {
          var s = stat; stat = { ok: 0, bad: 0, url: '' };
          if (!s.bad || s.ok || !inst[it.id]) return;
          if (!navigator.onLine) { draw(); return; }
          W.probe(s.url).then(function (r) {
            if (!r || r.kind === 'aborted' || !inst[it.id]) return;
            status[it.id] = r;
            if (it.nipd && BLOCKING[r.kind]) it.sub.forEach(function (n) { meta.probe[n] = { kind: r.kind, detail: r.detail || '', at: Date.now() }; });
            if (BLOCKING[r.kind]) { remove(it.id); cfg(it.id).on = false; saveState(); }
            draw();
          });
        }, 1500);
      });
      l.addTo(map);
      inst[it.id] = l;
    }
    function remove(id) { if (inst[id]) { map.removeLayer(inst[id]); delete inst[id]; } }
    function restack(grp) {
      var list = grp === 'user' ? userItems() : nipdItems().filter(function (x) { return x.grp === grp; });
      ordered(grp, list).forEach(function (it) { if (inst[it.id]) inst[it.id].setZIndex(zIndexOf(it)); });
    }

    function toggle(id, on) {
      var it = byId(id);
      if (!it) return;
      var c = cfg(id);
      if (!on) { c.on = false; saveState(); remove(id); draw(); return; }
      if (it.nipd) {
        if (!navigator.onLine) { draw(); return; }   // тексеру мүмкін емес — қоспаймыз
        verify(it).then(function (s) {
          if (s.kind === 'ok' || s.kind === 'partial') { c.on = true; saveState(); add(it); }
          else { c.on = false; saveState(); status[it.id] = s; }
          draw();
        });
        return;
      }
      c.on = true; saveState(); add(it); draw();
    }
    function setOpacity(id, op) {
      cfg(id).opacity = op; saveState();
      if (inst[id]) inst[id].setOpacity(op);
    }
    function setStyle(id, style) {
      cfg(id).style = style; saveState();
      var it = byId(id);
      if (inst[id] && it) inst[id].setParams({ styles: defOf(it).styles.join(',') });
    }
    function move(id, dir) {
      var it = byId(id);
      if (!it) return;
      var list = it.grp === 'user' ? userItems() : nipdItems().filter(function (x) { return x.grp === it.grp; });
      // Көрші ҚОСУЛЫ қабатпен орын ауыстыру (өшірулілері картада көрінбейді)
      var o = ordered(it.grp, list).map(function (x) { return x.id; }), i = o.indexOf(id), j = i + dir;
      while (j >= 0 && j < o.length && !inst[o[j]]) j += dir;
      if (i < 0 || j < 0 || j >= o.length) return;
      o[i] = o[j]; o[j] = id;
      st.order[it.grp] = o; saveState(); restack(it.grp); draw();
    }

    /* ---------- Мәзір бөлімі ---------- */
    function statusHtml(it) {
      var s = itemStatus(it), k = capsBusy && it.nipd && s.kind === 'unknown' ? 'checking' : s.kind;
      var t = ST[k] || ST.unknown;
      return '<span class="ov-st ov-st--' + esc(k) + '"' + (s.detail ? ' title="' + esc(s.detail) + '"' : '') + '>' + esc(tx(t[0], t[1])) + '</span>';
    }
    function rowHtml(it, idx, count) {
      var c = cfg(it.id), on = !!inst[it.id] || (c.on && !navigator.onLine);
      var s = itemStatus(it), blocked = !!BLOCKING[s.kind];
      var src, styles = [];
      if (it.nipd) {
        var m = it.sub.length === 1 ? nipdMeta(it.sub[0]) : null;
        src = 'map.gov.kz · ' + (it.sub.length === 1 ? it.sub[0] : it.sub.length + tx(' қабат', ' слоёв')) + (m && m.title ? ' · «' + m.title + '»' : '');
        if (m && m.styles) styles = m.styles;
      } else {
        src = (it.svc.label || W.baseUrl(it.svc.url)) + ' · ' + it.lyr.name;
        styles = it.lyr.styles || [];
      }
      var op = Math.round((1 - opacityOf(it)) * 100);
      var cur = defOf(it).styles[0] || '';
      var h = '<div class="ov-row' + (on ? ' is-on' : '') + (blocked ? ' is-blocked' : '') + '" data-id="' + esc(it.id) + '">' +
        '<label class="ov-head"><input type="checkbox" class="ov-chk"' + (on ? ' checked' : '') + (blocked ? ' disabled' : '') + '>' +
        '<span class="ov-name">' + esc(it.label) + '<small title="' + esc(src) + '">' + esc(tx('Дереккөз: ', 'Источник: ') + src) + '</small></span>' + statusHtml(it) + '</label>';
      if (on) {
        h += '<div class="ov-ctl">' +
          '<label class="ov-op" title="' + esc(tx('Мөлдірлік', 'Прозрачность')) + '"><span>' + esc(tx('Мөлдірлік', 'Прозрачность')) + '</span>' +
          '<input type="range" min="0" max="100" step="5" value="' + op + '" class="ov-range" aria-label="' + esc(tx('Мөлдірлік', 'Прозрачность') + ', %') + '"><output>' + op + '%</output></label>';
        if (styles.length > 1 && it.sub.length === 1) {
          h += '<select class="ov-style" aria-label="' + esc(tx('Стиль', 'Стиль')) + '"><option value="">' + esc(tx('әдепкі стиль', 'стиль по умолчанию')) + '</option>' +
            styles.map(function (x) { return '<option value="' + esc(x.name) + '"' + (x.name === cur ? ' selected' : '') + '>' + esc(x.title || x.name) + '</option>'; }).join('') + '</select>';
        }
        if (count > 1) {
          h += '<span class="ov-ord"><button type="button" class="ov-up" title="' + esc(tx('Жоғары көтеру', 'Поднять выше')) + '"' + (idx === 0 ? ' disabled' : '') + '>▲</button>' +
            '<button type="button" class="ov-down" title="' + esc(tx('Төмен түсіру', 'Опустить ниже')) + '"' + (idx === count - 1 ? ' disabled' : '') + '>▼</button></span>';
        }
        h += '</div>';
      }
      if (it.note) h += '<p class="ov-note">' + esc(it.note) + '</p>';
      if (!it.nipd && it.lyr && it.lyr.styles && it.lyr.styles.length <= 1 && on && it.lyr.opaque) h += '<p class="ov-note">' + esc(tx('Сервер бұл қабатты мөлдір емес (opaque) деп белгілеген — астындағы картаны жабуы мүмкін.', 'Сервер отмечает слой как непрозрачный (opaque) — он может закрывать карту под ним.')) + '</p>';
      return h + '</div>';
    }
    function groupRows(grp, list) {
      // Тізімде жоғарғы жол — картада ең жоғарғы қабат
      var o = ordered(grp, list).slice().reverse();
      var onIds = o.filter(function (x) { return inst[x.id]; });
      return o.map(function (it) { var k = onIds.indexOf(it); return rowHtml(it, k, k >= 0 ? onIds.length : 0); }).join('');
    }
    function draw() {
      if (!box) return;
      var nOn = nipdItems().filter(function (x) { return inst[x.id]; }).length, uOn = userItems().filter(function (x) { return inst[x.id]; }).length;
      var off = !navigator.onLine;
      var h = '<button type="button" class="ov-sec" data-sec="nipd" aria-expanded="' + open.nipd + '"><span class="ov-caret" aria-hidden="true"></span>' +
        esc(tx('НИПД геопорталы', 'Геопортал НИПД')) + (nOn ? '<b class="ov-cnt">' + nOn + '</b>' : '') + '</button>';
      if (open.nipd) {
        h += '<div class="ov-body">';
        if (off) h += '<p class="ov-warn">' + esc(tx('Интернет байланысы жоқ: НИПД қабаттары офлайн режимде қолжетімсіз.', 'Нет подключения к интернету: слои НИПД недоступны в офлайн-режиме.')) + '</p>';
        if (capsBusy) h += '<p class="ov-info">' + esc(tx('Сервер каталогы жүктелуде (≈13 МБ, бір минутқа дейін)… Қабаттарды қосуға болады.', 'Загружается каталог сервера (≈13 МБ, до минуты)… Слои уже можно включать.')) + '</p>';
        else if (meta.capsErr) h += '<p class="ov-info">' + esc(tx('Сервер каталогын алу мүмкін болмады: ', 'Не удалось получить каталог сервера: ') + tx((ST[meta.capsErr] || ST.down)[0], (ST[meta.capsErr] || ST.down)[1])) + '</p>';
        var nipd = nipdItems();
        ['admin', 'hydro'].forEach(function (g) {
          h += '<div class="ov-grp">' + esc(tx(GROUPS[g].kk, GROUPS[g].ru)) + '</div>' + groupRows(g, nipd.filter(function (x) { return x.grp === g; }));
        });
        h += '<div class="ov-grp">' + esc(tx(GROUPS.names.kk, GROUPS.names.ru)) + '</div><p class="ov-note">' + esc(tx(NIPD_ABSENT_KK, NIPD_ABSENT_RU)) + '</p>';
        h += '<div class="ov-acts"><button type="button" class="ov-link" data-act="recheck">' + esc(tx('Қайта тексеру', 'Проверить заново')) + '</button>' +
          '<button type="button" class="ov-link" data-act="nipd-all">' + esc(tx('Барлық НИПД қабаттары…', 'Все слои НИПД…')) + '</button></div>';
        h += '</div>';
      }
      h += '<button type="button" class="ov-sec" data-sec="user" aria-expanded="' + open.user + '"><span class="ov-caret" aria-hidden="true"></span>' +
        esc(tx('Қолданушының WMS қабаттары', 'Пользовательские слои WMS')) + (uOn ? '<b class="ov-cnt">' + uOn + '</b>' : '') + '</button>';
      if (open.user) {
        h += '<div class="ov-body">';
        if (services.length) {
          h += services.map(function (s) {
            return '<div class="ov-svc" data-svc="' + esc(s.id) + '"><span class="ov-svc-name" title="' + esc(s.url) + '">' + esc(s.label || s.url) + '</span>' +
              '<button type="button" class="ov-ico" data-act="edit" title="' + esc(tx('Өңдеу', 'Изменить')) + '" aria-label="' + esc(tx('Өңдеу', 'Изменить')) + '">✎</button>' +
              '<button type="button" class="ov-ico mura-del" data-act="del" title="' + esc(tx('Сервисті өшіру', 'Удалить сервис')) + '" aria-label="' + esc(tx('Өшіру', 'Удалить')) + '">×</button></div>';
          }).join('');
          h += groupRows('user', userItems());
        } else h += '<p class="ov-info">' + esc(tx('Әзірге сервис қосылмаған.', 'Сервисы пока не добавлены.')) + '</p>';
        h += '</div>';
      }
      h += '<button type="button" class="mura-add ov-add" data-act="add">' + esc(tx('+ WMS қосу…', '+ Добавить WMS…')) + '</button>';
      box.innerHTML = h;
    }
    function rowId(el) { var r = el.closest('.ov-row'); return r ? r.getAttribute('data-id') : null; }
    function bind(el) {
      el.addEventListener('change', function (e) {
        var t = e.target, id = rowId(t);
        if (!id) return;
        if (t.classList.contains('ov-chk')) toggle(id, t.checked);
        else if (t.classList.contains('ov-style')) setStyle(id, t.value);
        else if (t.classList.contains('ov-range')) saveState();
      });
      el.addEventListener('input', function (e) {
        var t = e.target;
        if (!t.classList.contains('ov-range')) return;
        var id = rowId(t), v = Math.min(100, Math.max(0, +t.value || 0));
        t.nextElementSibling.textContent = v + '%';
        setOpacity(id, Math.round(100 - v) / 100);
      });
      el.addEventListener('click', function (e) {
        // Бөлім қайта салынғанда басылған батырма DOM-нан шығады — сонда Leaflet басуды картаға жатқызып, мәзірді жабады
        e.stopPropagation();
        var b = e.target.closest('button');
        if (!b || !el.contains(b)) return;
        var sec = b.getAttribute('data-sec');
        if (sec) {
          open[sec] = !open[sec];
          // Бөлім ашылғанда — тек жеңіл тексеру (16×16 GetMap); толық каталог (≈13 МБ) — тек «Қайта тексеру» басылғанда
          if (sec === 'nipd' && open.nipd) nipdItems().forEach(function (it) { if (!it.sub.every(probeFresh)) verify(it); });
          draw(); return;
        }
        var id = rowId(b);
        if (b.classList.contains('ov-up')) { move(id, 1); return; }
        if (b.classList.contains('ov-down')) { move(id, -1); return; }
        var act = b.getAttribute('data-act'), svcEl = b.closest('.ov-svc');
        var svc = svcEl ? services.filter(function (s) { return s.id === svcEl.getAttribute('data-svc'); })[0] : null;
        if (act === 'recheck') { status = {}; loadNipdCaps(true); nipdItems().forEach(function (it) { verify(it, true); }); }
        else if (act === 'nipd-all') { if (hooks.close) hooks.close(); openDialog(null, { label: tx('НИПД геопорталы', 'Геопортал НИПД'), url: NIPD_URL, version: '1.3.0', auto: true }); }
        else if (act === 'add') { if (hooks.close) hooks.close(); openDialog(null); }
        else if (act === 'edit' && svc) { if (hooks.close) hooks.close(); openDialog(svc); }
        else if (act === 'del' && svc) removeService(svc);
      });
    }
    function renderInto(el) {
      if (box !== el) { box = el; bind(el); }
      draw();
    }

    /* ---------- Қолданушы сервистері ---------- */
    function saveServices() { store.set(KEY_SVC, services); }
    function removeService(s) {
      if (!confirm(tx('«' + (s.label || s.url) + '» WMS сервисін және оның қабаттарын тізімнен өшіру керек пе?', 'Удалить WMS-сервис «' + (s.label || s.url) + '» и его слои из списка?'))) return;
      s.layers.forEach(function (l) { var id = 'u:' + s.id + ':' + l.name; remove(id); delete st.items[id]; delete status[id]; });
      services = services.filter(function (x) { return x.id !== s.id; });
      st.order.user = st.order.user.filter(function (id) { return id.indexOf('u:' + s.id + ':') !== 0; });
      saveServices(); saveState(); draw();
    }
    function upsertService(s, isNew) {
      var prev = services.filter(function (x) { return x.id === s.id; })[0];
      var keep = {};
      s.layers.forEach(function (l) { keep['u:' + s.id + ':' + l.name] = 1; });
      if (prev) prev.layers.forEach(function (l) { var id = 'u:' + s.id + ':' + l.name; if (!keep[id]) { remove(id); delete st.items[id]; } });
      services = prev ? services.map(function (x) { return x.id === s.id ? s : x; }) : services.concat([s]);
      // Ашық қабаттар жаңа баптаулармен қайта салынады
      s.layers.forEach(function (l) {
        var id = 'u:' + s.id + ':' + l.name;
        if (isNew || !st.items[id]) st.items[id] = { on: false, opacity: s.opacity };
        if (inst[id]) { remove(id); add(byId(id)); }
      });
      saveServices(); saveState();
      open.user = true;
      draw();
      if (hooks.open) hooks.open();
    }

    /* ---------- «WMS қосу» терезесі ---------- */
    function openDialog(svc, preset) {
      var p = svc || preset || {};
      var reqId = W.newId();
      var caps = null, checked = {}, filter = '';
      if (svc) svc.layers.forEach(function (l) { checked[l.name] = l; });
      var dlg = document.createElement('div');
      dlg.className = 'mura-dlg-back';
      dlg.innerHTML =
        '<form class="mura-dlg ov-dlg" role="dialog" aria-modal="true" aria-labelledby="ovDlgT" novalidate>' +
        '<h3 id="ovDlgT">' + esc(svc ? tx('WMS сервисін өңдеу', 'Изменить WMS-сервис') : tx('WMS қосу', 'Добавить WMS')) + '</h3>' +
        '<label>' + esc(tx('Сервис атауы', 'Название сервиса')) + '<input name="label" maxlength="80" value="' + esc(p.label || '') + '" placeholder="' + esc(tx('Мысалы: Облыс әкімдігінің ГАЖ', 'Например: ГИС акимата области')) + '"></label>' +
        '<label>' + esc(tx('Сервердің URL мекенжайы', 'URL-адрес сервера')) + '<input name="url" spellcheck="false" value="' + esc(p.url || '') + '" placeholder="https://example.kz/geoserver/wms"></label>' +
        '<div class="ov-dlg-row"><label>' + esc(tx('WMS нұсқасы', 'Версия WMS')) + '<select name="version">' +
        ['auto', '1.1.1', '1.3.0'].map(function (v) { return '<option value="' + v + '"' + ((p.version || 'auto') === v ? ' selected' : '') + '>' + (v === 'auto' ? esc(tx('Автоматты', 'Автоматически')) : v) + '</option>'; }).join('') +
        '</select></label><button type="button" class="btn btn--ghost btn--sm ov-test">' + esc(tx('Байланысты тексеру', 'Проверить подключение')) + '</button></div>' +
        '<p class="ov-dlg-st" role="status"></p>' +
        '<div class="ov-dlg-layers" hidden><div class="ov-dlg-lh"><b>' + esc(tx('Сервердегі қабаттар', 'Слои на сервере')) + '</b><span class="ov-dlg-cnt"></span></div>' +
        '<input type="search" class="ov-dlg-filter" placeholder="' + esc(tx('Атауы не идентификаторы бойынша іздеу', 'Поиск по названию или идентификатору')) + '">' +
        '<div class="ov-dlg-list" role="group"></div></div>' +
        '<div class="ov-dlg-grid">' +
        '<label>' + esc(tx('Координаттар жүйесі', 'Система координат')) + '<select name="crs"><option value="EPSG:3857">EPSG:3857 (Web Mercator)</option><option value="EPSG:4326">EPSG:4326 (WGS 84)</option></select></label>' +
        '<label>' + esc(tx('Стиль', 'Стиль')) + '<select name="style"><option value="">' + esc(tx('сервердің әдепкі стилі', 'стиль сервера по умолчанию')) + '</option></select></label>' +
        '<label>' + esc(tx('Сурет пішімі', 'Формат изображения')) + '<select name="format"><option value="image/png">image/png</option></select></label>' +
        '<label>' + esc(tx('Мөлдірлік, %', 'Прозрачность, %')) + '<input name="tr" type="number" min="0" max="95" step="5" value="' + Math.round((1 - (p.opacity != null ? p.opacity : 1)) * 100) + '"></label>' +
        '</div>' +
        '<label>' + esc(tx('Атрибуция', 'Атрибуция')) + '<input name="attr" maxlength="200" value="' + esc(p.attribution || '') + '" placeholder="' + esc(tx('Дерек иесі (картада көрсетіледі)', 'Владелец данных (показывается на карте)')) + '"></label>' +
        '<p class="mura-err" role="alert" hidden></p>' +
        '<div class="mura-dlg-btns"><button type="button" class="btn btn--ghost btn--sm" data-x>' + esc(tx('Бас тарту', 'Отмена')) + '</button>' +
        '<button type="submit" class="btn btn--primary btn--sm" disabled>' + esc(tx('Сақтау', 'Сохранить')) + '</button></div></form>';
      document.body.appendChild(dlg);
      var f = dlg.querySelector('form'), E = f.elements, err = dlg.querySelector('.mura-err'), stEl = dlg.querySelector('.ov-dlg-st');
      var lw = dlg.querySelector('.ov-dlg-layers'), list = dlg.querySelector('.ov-dlg-list'), cnt = dlg.querySelector('.ov-dlg-cnt'), saveBtn = f.querySelector('[type=submit]');
      function done() { W.abort(reqId); dlg.remove(); document.removeEventListener('keydown', onKey, true); }
      function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); done(); } }
      document.addEventListener('keydown', onKey, true);
      dlg.addEventListener('mousedown', function (e) { if (e.target === dlg) done(); });
      dlg.querySelector('[data-x]').addEventListener('click', done);
      function say(t, bad) { stEl.textContent = t; stEl.classList.toggle('is-bad', !!bad); }
      function layersArr() { return caps ? caps.layers : Object.keys(checked).map(function (k) { return checked[k]; }); }
      function selected() { return layersArr().filter(function (l) { return checked[l.name]; }); }
      function refreshOpts() {
        var sel = selected();
        cnt.textContent = tx('таңдалды: ', 'выбрано: ') + sel.length;
        saveBtn.disabled = !sel.length || !(caps || svc);
        // Стильдер: таңдалған қабаттардың стильдері (әр қабатқа тек өзінде бар болса қолданылады)
        var styles = {}, cur = E.style.value || (svc && svc.style) || '';
        sel.forEach(function (l) { (l.styles || []).forEach(function (s) { styles[s.name] = s.title || s.name; }); });
        E.style.innerHTML = '<option value="">' + esc(tx('сервердің әдепкі стилі', 'стиль сервера по умолчанию')) + '</option>' +
          Object.keys(styles).map(function (n) { return '<option value="' + esc(n) + '"' + (n === cur ? ' selected' : '') + '>' + esc(styles[n] + (styles[n] !== n ? ' (' + n + ')' : '')) + '</option>'; }).join('');
        // CRS: тек барлық таңдалған қабат қолдайтыны
        var has = function (c) { return sel.length && sel.every(function (l) { return !l.crs || !l.crs.length || l.crs.indexOf(c) >= 0; }); };
        var c3857 = !sel.length || has('EPSG:3857'), c4326 = !sel.length || has('EPSG:4326');
        E.crs.options[0].disabled = !c3857; E.crs.options[1].disabled = !c4326;
        if (E.crs.selectedOptions[0] && E.crs.selectedOptions[0].disabled) E.crs.value = c3857 ? 'EPSG:3857' : 'EPSG:4326';
      }
      function drawList() {
        var q = filter.toLowerCase(), arr = layersArr();
        var hit = arr.filter(function (l) { return !q || (l.name + ' ' + l.title).toLowerCase().indexOf(q) >= 0; });
        var MAX = 400;
        list.innerHTML = hit.slice(0, MAX).map(function (l) {
          return '<label class="ov-dlg-item" title="' + esc(l.abstract || '') + '"><input type="checkbox" value="' + esc(l.name) + '"' + (checked[l.name] ? ' checked' : '') + '>' +
            '<span><b>' + esc(l.title) + '</b><small>' + esc(l.name) + (l.queryable ? ' · GetFeatureInfo' : '') + (l.opaque ? ' · opaque' : '') + '</small></span></label>';
        }).join('') + (hit.length > MAX ? '<p class="ov-info">' + esc(tx('Тағы ' + (hit.length - MAX) + ' қабат — іздеуді нақтылаңыз.', 'Ещё ' + (hit.length - MAX) + ' слоёв — уточните поиск.')) + '</p>' : '') +
          (!hit.length ? '<p class="ov-info">' + esc(tx('Сәйкес қабат жоқ.', 'Подходящих слоёв нет.')) + '</p>' : '');
        lw.hidden = false;
        refreshOpts();
      }
      list.addEventListener('change', function (e) {
        var t = e.target;
        if (t.type !== 'checkbox') return;
        if (t.checked) checked[t.value] = layersArr().filter(function (l) { return l.name === t.value; })[0] || { name: t.value };
        else delete checked[t.value];
        refreshOpts();
      });
      dlg.querySelector('.ov-dlg-filter').addEventListener('input', function (e) { filter = e.target.value.trim(); drawList(); });
      E.crs.value = p.crs || 'EPSG:3857';
      if (svc) {
        E.format.innerHTML = '<option>' + esc(svc.format || 'image/png') + '</option>';
        drawList();
        say(tx('Сақталған баптаулар. Қабаттар тізімін жаңарту үшін «Байланысты тексеру» басыңыз.', 'Сохранённые настройки. Чтобы обновить список слоёв, нажмите «Проверить подключение».'));
      }
      function test() {
        err.hidden = true;
        var url = E.url.value.trim();
        if (!/^https?:\/\/[^\s/]+/i.test(url)) { err.textContent = tx('Мекенжай http:// не https:// деп басталуы керек.', 'Адрес должен начинаться с http:// или https://.'); err.hidden = false; return; }
        var big = /map\.gov\.kz/i.test(url);
        say(big ? tx('GetCapabilities сұралуда… НИПД каталогы үлкен (≈13 МБ, 3000-нан астам қабат), бір минутқа дейін күтіңіз.', 'Запрос GetCapabilities… Каталог НИПД большой (≈13 МБ, более 3000 слоёв), подождите до минуты.') : tx('GetCapabilities сұралуда…', 'Запрос GetCapabilities…'));
        var btn = f.querySelector('.ov-test');
        btn.disabled = true;
        W.capabilities(url, E.version.value, { id: reqId, timeout: 180000 }).then(function (r) {
          btn.disabled = false;
          if (!document.body.contains(dlg)) return;
          if (!r.ok) {
            if (r.kind === 'aborted') return;
            var t = ST[r.kind] || ST.down;
            say(tx('Байланыс сәтсіз: ', 'Подключение не удалось: ') + tx(t[0], t[1]) + (r.detail ? ' — ' + r.detail : ''), true);
            return;
          }
          caps = r.caps;
          // Бұрын таңдалғандар — серверде бар болса ғана
          Object.keys(checked).forEach(function (n) { var l = caps.layers.filter(function (x) { return x.name === n; })[0]; if (l) checked[n] = l; else delete checked[n]; });
          var imgs = caps.formats.filter(function (x) { return /^image\/(png|jpeg|gif|webp)/i.test(x); });
          if (!imgs.length) imgs = ['image/png'];
          var curF = svc && svc.format || 'image/png';
          E.format.innerHTML = imgs.map(function (x) { return '<option value="' + esc(x) + '"' + (x === curF ? ' selected' : '') + '>' + esc(x) + (/png|gif|webp/i.test(x) ? '' : ' — ' + tx('мөлдір фонсыз', 'без прозрачности')) + '</option>'; }).join('');
          if (!E.label.value.trim()) E.label.value = caps.title || new URL(url).host;
          if (!E.attr.value.trim() && caps.org) E.attr.value = caps.org;
          say(tx('Қосылды: WMS ', 'Подключено: WMS ') + caps.version + ' · ' + caps.layers.length + tx(' қабат', ' слоёв') + (caps.access && !/^none$/i.test(caps.access) ? ' · ' + tx('Шектеулер: ', 'Ограничения: ') + caps.access : ''));
          drawList();
        });
      }
      f.querySelector('.ov-test').addEventListener('click', test);
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var sel = selected();
        if (!sel.length) return;
        var tr = Math.min(95, Math.max(0, parseInt(E.tr.value, 10) || 0));
        var s = {
          id: svc ? svc.id : W.newId(), label: E.label.value.trim() || new URL(E.url.value.trim()).host, url: E.url.value.trim(),
          version: E.version.value, ver: caps ? caps.version : svc.ver, getMap: caps ? caps.getMap : svc.getMap,
          getInfo: caps ? caps.getInfo : svc.getInfo, infoFormats: caps ? caps.infoFormats.slice(0, 20) : svc.infoFormats,
          format: E.format.value || 'image/png', crs: E.crs.value, style: E.style.value, attribution: E.attr.value.trim(), opacity: (100 - tr) / 100,
          layers: sel.map(function (l) {
            return { name: l.name, title: l.title || l.name, abstract: (l.abstract || '').slice(0, 300), queryable: !!l.queryable, opaque: !!l.opaque,
              styles: (l.styles || []).slice(0, 30).map(function (x) { return { name: x.name, title: x.title }; }), bbox: l.bbox || null, crs: l.crs || [],
              attribution: l.attribution && l.attribution.title ? { title: l.attribution.title, url: l.attribution.url || '' } : null };
          }),
          created_at: svc && svc.created_at || new Date().toISOString(), updated_at: new Date().toISOString(),
        };
        // Сервистің стилі өзгерсе — қабаттардың жеке стилін сол стильге келтіру
        if (svc && svc.style !== s.style) s.layers.forEach(function (l) { var c = st.items['u:' + s.id + ':' + l.name]; if (c) delete c.style; });
        done();
        upsertService(s, !svc);
      });
      if (p.auto && p.url) test();
      E[p.url ? 'label' : 'url'].focus();
    }

    /* ---------- Нысан туралы ақпарат (GetFeatureInfo) ---------- */
    function queryable() {
      return all().filter(function (it) {
        if (!inst[it.id]) return false;
        if (it.nipd) return it.sub.some(function (n) { var m = nipdMeta(n); return !m || m.queryable; });
        return it.lyr.queryable;
      });
    }
    function identify(latlng) {
      var list = queryable();
      if (!list.length) return;
      var el = document.createElement('div');
      el.className = 'ov-pop';
      var head = document.createElement('div');
      head.className = 'ov-pop-h';
      head.textContent = tx('Үстіңгі қабаттар: нысан туралы ақпарат', 'Накладываемые слои: сведения об объекте');
      el.appendChild(head);
      var pop = L.popup({ maxWidth: 380, maxHeight: 320, className: 'ov-popup', autoPanPadding: [20, 20] }).setLatLng(latlng).setContent(el).openOn(map);
      list.forEach(function (it, i) {
        var sec = document.createElement('section');
        var h = document.createElement('b');
        h.textContent = it.label;
        var body = document.createElement('div');
        body.className = 'ov-pop-b';
        body.textContent = tx('Сұралуда…', 'Запрос…');
        sec.appendChild(h); sec.appendChild(body); el.appendChild(sec);
        var d = defOf(it);
        if (it.nipd) d.queryLayers = d.layers.filter(function (n) { var m = nipdMeta(n); return !m || m.queryable; });
        W.featureInfo(map, latlng, d, { id: 'gfi-' + i }).then(function (r) {
          body.textContent = '';
          if (!r.ok) { var t = ST[r.kind] || ST.down; body.textContent = tx(t[0], t[1]) + (r.detail ? ' — ' + r.detail : ''); body.classList.add('is-bad'); }
          else if (r.rows && r.rows.length) {
            r.rows.slice(0, 5).forEach(function (row) {
              var tb = document.createElement('table');
              Object.keys(row.props).slice(0, 30).forEach(function (k) {
                var tr = document.createElement('tr'), th = document.createElement('th'), td = document.createElement('td');
                th.textContent = k; td.textContent = row.props[k];
                tr.appendChild(th); tr.appendChild(td); tb.appendChild(tr);
              });
              body.appendChild(tb);
            });
          } else if (r.text) { var pre = document.createElement('pre'); pre.textContent = r.text; body.appendChild(pre); }
          else body.textContent = tx('Бұл нүктеде нысан жоқ.', 'В этой точке объектов нет.');
          pop.update();
        });
      });
    }

    /* ---------- Іске қосу: сақталған қосулы қабаттар ---------- */
    all().forEach(function (it) {
      if (!cfg(it.id).on) return;
      if (!it.nipd) { add(it); return; }
      if (it.sub.some(function (n) { return meta.probe[n] && meta.probe[n].kind === 'ok'; }) && it.sub.every(probeFresh)) add(it);
      else if (navigator.onLine) verify(it).then(function (s) { if (s.kind === 'ok' || s.kind === 'partial') add(it); else { cfg(it.id).on = false; saveState(); } draw(); });
    });
    // Интернет қайта қосылғанда — қабаттар қайта сұралады; үзілгенде — тек күй өзгереді (бағдарламаның қалған бөлігі жұмыс істей береді)
    window.addEventListener('online', function () {
      all().forEach(function (it) { if (cfg(it.id).on && !inst[it.id]) toggle(it.id, true); });
      Object.keys(inst).forEach(function (id) { inst[id].redraw(); });
      draw();
    });
    window.addEventListener('offline', draw);

    return { renderInto: renderInto, identify: identify, queryable: queryable, openAddDialog: function () { openDialog(null); },
      // тесттер үшін
      _state: function () { return { st: st, services: services, meta: meta, status: status, on: Object.keys(inst) }; },
      _layer: function (id) { return inst[id] || null; }, _toggle: toggle, _verify: function (id, force) { return verify(byId(id), force); },
      _setOpacity: setOpacity, _move: move };
  }

  window.MuraOverlays = { attach: attach, NIPD_URL: NIPD_URL };
})();
