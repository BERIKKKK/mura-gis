/* Mura GIS: WMS ядросы — GetCapabilities талдау, GetMap қабаты, GetFeatureInfo (WMS 1.1.1 және 1.3.0).
 *
 * Интерфейсі (window.MuraWms):
 *   capsUrl(url, version)          — GetCapabilities сұрауының мекенжайы (version: 'auto' | '1.1.1' | '1.3.0');
 *   fetchText(url, opts)           — мәтіндік сұрау негізгі процесс арқылы (CORS жоқ серверлер үшін; HTTPS тексеріледі);
 *   capabilities(url, version, o)  — сұрап, талдап қайтарады: { version, title, getMap, formats, infoFormats, layers[] };
 *   parseCaps(xml, srcUrl)         — тек талдау (тесттер үшін де);
 *   layer(def)                     — Leaflet қабаты (L.TileLayer.WMS негізінде, 512 px тайлдар);
 *   featureInfo(map, latlng, def)  — нүктедегі нысандар туралы ақпарат: { rows: [{ title, props }], text } не қате.
 *
 * Карта суреттерін бет <img> арқылы жүктейді (Leaflet). Сервер XML қате қайтарса, ол сурет ретінде ашылмайды
 * (Chromium XML-ды кескін деп декодтамайды → tileerror), EXCEPTIONS параметрі XML-ға қойылады — серверлер қатені
 * «суреттің ішіне» (INIMAGE) салмайды. Ештеңе дискіде сақталмайды (тек браузердің әдеттегі HTTP кэші).
 */
(function () {
  'use strict';
  var L = window.L;
  if (!L) return;

  var XLINK = 'http://www.w3.org/1999/xlink';

  /* ---------- XML көмекшілері (аттар кеңістігіне тәуелсіз: localName бойынша) ---------- */
  function kids(el, name) {
    var out = [];
    if (!el) return out;
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === name) out.push(c);
    return out;
  }
  function kid(el, name) { return kids(el, name)[0] || null; }
  function path(el) { for (var i = 1; i < arguments.length && el; i++) el = kid(el, arguments[i]); return el || null; }
  function txt(el) { return el ? String(el.textContent || '').trim() : ''; }
  function href(el) { return el ? (el.getAttributeNS(XLINK, 'href') || el.getAttribute('xlink:href') || el.getAttribute('href') || '') : ''; }

  /** Сервис қатесі (ServiceExceptionReport / ows:ExceptionReport) мәтіні; қате емес болса — ''. */
  function exceptionText(doc) {
    var root = doc && doc.documentElement;
    if (!root) return '';
    if (!/Exception/i.test(root.localName)) return '';
    var parts = [];
    var all = root.getElementsByTagName('*');
    for (var i = 0; i < all.length; i++) if (/Exception(Text)?$/.test(all[i].localName) && !all[i].firstElementChild) {
      var code = all[i].getAttribute('code') || (all[i].parentNode && all[i].parentNode.getAttribute && all[i].parentNode.getAttribute('exceptionCode')) || '';
      parts.push((code ? code + ': ' : '') + txt(all[i]));
    }
    return (parts.filter(Boolean).join(' · ') || txt(root) || 'ServiceException').slice(0, 500);
  }

  /** Сұрау мекенжайының негізі: '?' кейінгі SERVICE/REQUEST/VERSION параметрлерін алып тастайды, қалғандарын (мыс. map=…) сақтайды. */
  function baseUrl(url) {
    var u = new URL(String(url).trim());
    ['service', 'request', 'version', 'layers', 'styles', 'format', 'bbox', 'crs', 'srs', 'width', 'height', 'transparent'].forEach(function (k) {
      Array.from(u.searchParams.keys()).forEach(function (key) { if (key.toLowerCase() === k) u.searchParams.delete(key); });
    });
    return u.href;
  }
  function withParams(url, params) {
    var u = new URL(url);
    Object.keys(params).forEach(function (k) { u.searchParams.set(k, params[k]); });
    return u.href;
  }
  function capsUrl(url, version) {
    var p = { SERVICE: 'WMS', REQUEST: 'GetCapabilities' };
    // «Автоматты»: 1.3.0 сұралады — сервер өзі қолдайтын ең жоғары нұсқамен жауап береді (WMS нұсқа келісімі)
    p.VERSION = version === '1.1.1' ? '1.1.1' : '1.3.0';
    return withParams(baseUrl(url), p);
  }

  /* ---------- GetCapabilities талдау ---------- */
  function parseCaps(xml, srcUrl) {
    var doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('xml');
    var exc = exceptionText(doc);
    if (exc) { var e = new Error('exception'); e.detail = exc; throw e; }
    var root = doc.documentElement;
    if (!/^(WMS_Capabilities|WMT_MS_Capabilities)$/.test(root.localName)) throw new Error('not-wms');
    var version = root.getAttribute('version') || (root.localName === 'WMS_Capabilities' ? '1.3.0' : '1.1.1');
    var v13 = version >= '1.3';
    var svc = kid(root, 'Service'), cap = kid(root, 'Capability'), req = kid(cap, 'Request');
    var gm = kid(req, 'GetMap'), gfi = kid(req, 'GetFeatureInfo');
    var getMap = href(path(gm, 'DCPType', 'HTTP', 'Get', 'OnlineResource'));
    var getInfo = href(path(gfi, 'DCPType', 'HTTP', 'Get', 'OnlineResource'));
    // GetMap мекенжайы: сервер жариялағаны тек енгізілген мекенжаймен бір хостта болса (кей серверлер ішкі не http мекенжай жариялайды)
    var src = new URL(baseUrl(srcUrl));
    function pick(u) {
      try { var x = new URL(u); if (x.host === src.host && (x.protocol === src.protocol || x.protocol === 'https:')) return baseUrl(x.href); } catch (err) { /* жарамсыз */ }
      return src.href;
    }
    var out = {
      version: version, title: txt(kid(svc, 'Title')), abstract: txt(kid(svc, 'Abstract')),
      access: txt(kid(svc, 'AccessConstraints')), fees: txt(kid(svc, 'Fees')),
      org: txt(path(svc, 'ContactInformation', 'ContactPersonPrimary', 'ContactOrganization')),
      getMap: pick(getMap), getInfo: gfi ? pick(getInfo || getMap) : '',
      formats: kids(gm, 'Format').map(txt), infoFormats: kids(gfi, 'Format').map(txt),
      layers: [],
    };
    var crsTag = v13 ? 'CRS' : 'SRS';
    function walk(el, inh, depth) {
      // CRS/SRS, стильдер, атрибуция, шекаралар ата-ана қабаттан мұраланады (WMS 7.2.4.8)
      var own = {};
      kids(el, crsTag).forEach(function (c) { txt(c).split(/\s+/).forEach(function (x) { if (x) own[x.toUpperCase()] = 1; }); });
      var crs = {
        g3857: inh.g3857 || !!(own['EPSG:3857'] || own['EPSG:900913'] || own['EPSG:102100']),
        g4326: inh.g4326 || !!(own['EPSG:4326'] || own['CRS:84']),
      };
      var bb = null, ex = kid(el, 'EX_GeographicBoundingBox'), ll = kid(el, 'LatLonBoundingBox');
      if (ex) bb = [+txt(kid(ex, 'westBoundLongitude')), +txt(kid(ex, 'southBoundLatitude')), +txt(kid(ex, 'eastBoundLongitude')), +txt(kid(ex, 'northBoundLatitude'))];
      else if (ll) bb = [+ll.getAttribute('minx'), +ll.getAttribute('miny'), +ll.getAttribute('maxx'), +ll.getAttribute('maxy')];
      if (!bb || bb.some(isNaN) || bb[0] >= bb[2] || bb[1] >= bb[3]) bb = inh.bbox || null;
      var styles = (inh.styles || []).slice();
      kids(el, 'Style').forEach(function (s) {
        var n = txt(kid(s, 'Name'));
        if (n && !styles.some(function (x) { return x.name === n; })) styles.push({ name: n, title: txt(kid(s, 'Title')) || n, legend: href(path(s, 'LegendURL', 'OnlineResource')) });
      });
      var at = kid(el, 'Attribution');
      var attribution = at ? { title: txt(kid(at, 'Title')), url: href(kid(at, 'OnlineResource')) } : inh.attribution || null;
      var name = txt(kid(el, 'Name'));
      var queryable = el.getAttribute('queryable') === '1' || el.getAttribute('queryable') === 'true';
      var opaque = el.getAttribute('opaque') === '1' || el.getAttribute('opaque') === 'true';
      if (name) {
        out.layers.push({
          name: name, title: txt(kid(el, 'Title')) || name, abstract: txt(kid(el, 'Abstract')).slice(0, 600),
          queryable: queryable, opaque: opaque, styles: styles, bbox: bb, attribution: attribution,
          crs: [].concat(crs.g3857 ? ['EPSG:3857'] : [], crs.g4326 ? ['EPSG:4326'] : []),
          metadata: kids(el, 'MetadataURL').map(function (m) { return href(kid(m, 'OnlineResource')); }).filter(Boolean)[0] || '',
          depth: depth,
        });
      }
      kids(el, 'Layer').forEach(function (c) { walk(c, { g3857: crs.g3857, g4326: crs.g4326, bbox: bb, styles: styles, attribution: attribution }, depth + 1); });
    }
    kids(cap, 'Layer').forEach(function (l) { walk(l, {}, 0); });
    return out;
  }

  /* ---------- Мәтіндік сұрау (негізгі процесс арқылы) ---------- */
  var seq = 0;
  function fetchText(url, opts) {
    opts = opts || {};
    var api = window.mura && window.mura.wms;
    if (!navigator.onLine) return Promise.resolve({ ok: false, error: 'offline' });
    if (api) return api.get(url, { id: opts.id, timeout: opts.timeout, accept: opts.accept }).then(function (r) { return r || { ok: false, error: 'network' }; });
    // Electron-сыз (браузерде тексеру): тек CORS рұқсат еткен серверлер
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, opts.timeout || 30000);
    return fetch(url, { signal: ctl.signal }).then(function (r) {
      return r.text().then(function (text) { return { ok: r.ok, status: r.status, type: r.headers.get('content-type') || '', text: text }; });
    }).catch(function (e) { return { ok: false, error: ctl.signal.aborted ? 'timeout' : 'network', detail: e.message }; })
      .finally(function () { clearTimeout(t); });
  }
  function abort(id) { var api = window.mura && window.mura.wms; if (api && id) api.abort(id); }

  /** Қатенің адамға түсінікті түрі: 'offline' | 'down' | 'denied' | 'timeout' | 'exception' | 'bad' (+ detail). */
  function classify(r) {
    if (!r) return { kind: 'down' };
    if (r.error === 'offline' || (!navigator.onLine)) return { kind: 'offline' };
    if (r.error === 'aborted') return { kind: 'aborted' };
    if (r.error === 'timeout') return { kind: 'timeout' };
    if (r.error === 'bad-url') return { kind: 'bad', detail: 'URL' };
    if (r.error === 'too-large') return { kind: 'bad', detail: 'too large' };
    if (r.error) return { kind: 'down', detail: r.detail || r.error };
    if (r.status === 401 || r.status === 403) return { kind: 'denied', detail: 'HTTP ' + r.status };
    if (!r.ok) return { kind: 'down', detail: 'HTTP ' + r.status };
    return null;
  }

  var capsMemo = {};   // сеанс ішінде ғана (дискіге жазылмайды)
  /** GetCapabilities: { ok:true, caps } не { ok:false, kind, detail }. */
  function capabilities(url, version, opts) {
    opts = opts || {};
    var u;
    try { u = capsUrl(url, version); } catch (e) { return Promise.resolve({ ok: false, kind: 'bad', detail: 'URL' }); }
    if (!opts.force && capsMemo[u]) return Promise.resolve({ ok: true, caps: capsMemo[u], url: u });
    return fetchText(u, { id: opts.id, timeout: opts.timeout || 120000, accept: 'application/vnd.ogc.wms_xml, text/xml, application/xml' }).then(function (r) {
      var bad = classify(r);
      if (bad && !(r && r.text && /Exception/.test(r.text.slice(0, 2000)))) return Object.assign({ ok: false }, bad);
      try {
        var caps = parseCaps(r.text || '', u);
        capsMemo[u] = caps;
        return { ok: true, caps: caps, url: u };
      } catch (e) {
        if (e.message === 'exception') return { ok: false, kind: /authori|access|denied|forbidden|login/i.test(e.detail) ? 'denied' : 'exception', detail: e.detail };
        return { ok: false, kind: 'bad', detail: e.message === 'not-wms' ? 'not WMS' : 'XML' };
      }
    });
  }

  /* ---------- GetMap қабаты ---------- */
  var IMG_TRANSPARENT = /png|gif|webp/i;
  var WmsLayer = L.TileLayer.WMS.extend({
    // 512 px тайлдар — сұрау саны 256 px-пен салыстырғанда 4 есе аз; карта тоқтағанда ғана жүктеледі (updateWhenIdle),
    // масштабтау кезінде жаңа сұрау жоқ; ескірген масштабтың жүктелмей қалған тайлдарын Leaflet өзі тоқтатады.
    options: { tileSize: 512, updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 1, maxZoom: 22, uppercase: true },
  });

  /** def: { url, layers:[], styles:[], version, format, crs, opacity, zIndex, attribution, bbox:[w,s,e,n] } */
  function layer(def) {
    var v13 = String(def.version || '1.3.0') >= '1.3';
    var fmt = def.format || 'image/png';
    var o = {
      layers: def.layers.join(','),
      styles: (def.styles || []).map(function (s) { return s || ''; }).join(','),
      format: fmt, transparent: IMG_TRANSPARENT.test(fmt), version: v13 ? '1.3.0' : '1.1.1',
      exceptions: v13 ? 'XML' : 'application/vnd.ogc.se_xml',
      crs: def.crs === 'EPSG:4326' ? L.CRS.EPSG4326 : L.CRS.EPSG3857,
      opacity: def.opacity != null ? def.opacity : 1, zIndex: def.zIndex || 10,
      attribution: def.attribution || '', className: 'mura-wms',
    };
    if (def.bbox) {
      var b = def.bbox, dx = (b[2] - b[0]) * 0.02 + 0.01, dy = (b[3] - b[1]) * 0.02 + 0.01;
      o.bounds = L.latLngBounds([Math.max(-85, b[1] - dy), b[0] - dx], [Math.min(85, b[3] + dy), b[2] + dx]);
    }
    var l = new WmsLayer(def.url, o);
    l.muraDef = def;
    return l;
  }

  /* ---------- GetFeatureInfo ---------- */
  var INFO_PREF = ['application/json', 'application/geo+json', 'text/plain', 'application/vnd.ogc.gml', 'text/xml', 'text/html'];
  function featureInfo(map, latlng, def, opts) {
    opts = opts || {};
    var v13 = String(def.version || '1.3.0') >= '1.3';
    var crs = def.crs === 'EPSG:4326' ? L.CRS.EPSG4326 : L.CRS.EPSG3857;
    var z = map.getZoom(), R = 50, p = map.project(latlng, z);
    var nw = crs.project(map.unproject(p.subtract([R, R]), z)), se = crs.project(map.unproject(p.add([R, R]), z));
    var minx = Math.min(nw.x, se.x), maxx = Math.max(nw.x, se.x), miny = Math.min(nw.y, se.y), maxy = Math.max(nw.y, se.y);
    var bbox = v13 && def.crs === 'EPSG:4326' ? [miny, minx, maxy, maxx] : [minx, miny, maxx, maxy];
    var fmts = def.infoFormats || [];
    var fmt = INFO_PREF.filter(function (f) { return fmts.some(function (x) { return x.toLowerCase().indexOf(f) === 0; }); })[0] || (fmts.length ? null : 'text/plain');
    if (!fmt) return Promise.resolve({ ok: false, kind: 'bad', detail: 'INFO_FORMAT' });
    var q = def.queryLayers || def.layers;
    var p2 = {
      SERVICE: 'WMS', REQUEST: 'GetFeatureInfo', VERSION: v13 ? '1.3.0' : '1.1.1',
      LAYERS: def.layers.join(','), QUERY_LAYERS: q.join(','), STYLES: (def.styles || []).join(','),
      BBOX: bbox.join(','), WIDTH: 2 * R + 1, HEIGHT: 2 * R + 1, INFO_FORMAT: fmt, FEATURE_COUNT: 10,
      EXCEPTIONS: v13 ? 'XML' : 'application/vnd.ogc.se_xml', FORMAT: def.format || 'image/png',
    };
    p2[v13 ? 'CRS' : 'SRS'] = crs.code;
    p2[v13 ? 'I' : 'X'] = R; p2[v13 ? 'J' : 'Y'] = R;
    var url = withParams(def.infoUrl || def.url, p2);
    return fetchText(url, { id: opts.id, timeout: 30000 }).then(function (r) {
      var bad = classify(r);
      if (bad) return Object.assign({ ok: false }, bad);
      return Object.assign({ ok: true }, parseInfo(r.text || '', r.type || fmt));
    });
  }
  /** Жауапты кесте жолдарына айналдыру. HTML ешқашан бетке HTML ретінде салынбайды — тек мәтіні алынады. */
  function parseInfo(text, type) {
    type = String(type).toLowerCase();
    var t = text.trim();
    if (/json/.test(type) || /^[{[]/.test(t)) {
      try {
        var j = JSON.parse(t);
        var feats = j.features || (j.type === 'Feature' ? [j] : []);
        return { rows: feats.map(function (f) { return { title: String(f.id || ''), props: flat(f.properties || {}) }; }) };
      } catch (e) { /* мәтін ретінде */ }
    }
    if (/xml|gml/.test(type) || /^<\?xml|^<[\w:]+[\s>]/.test(t) && !/html/.test(type)) {
      var doc = new DOMParser().parseFromString(t, 'application/xml');
      if (!doc.getElementsByTagName('parsererror').length) {
        var exc = exceptionText(doc);
        if (exc) return { rows: [], text: exc, error: true };
        var rows = [], all = doc.getElementsByTagName('*');
        for (var i = 0; i < all.length; i++) {
          var el = all[i];
          // Нысан: жапырақ элементтері (мәтіні бар, баласы жоқ) бар элемент
          var leaves = kids(el, '*').length ? [] : null;
          if (leaves) { for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (!c.firstElementChild && txt(c) && !/^(coordinates|posList|pos)$/.test(c.localName)) leaves.push([c.localName, txt(c)]); }
          if (leaves && leaves.length >= 2 && !/^(FeatureCollection|featureMember|boundedBy|Envelope)$/.test(el.localName)) {
            var props = {};
            leaves.forEach(function (lv) { props[lv[0]] = lv[1]; });
            rows.push({ title: el.getAttribute('fid') || el.getAttribute('gml:id') || el.localName, props: props });
          }
        }
        return { rows: rows.slice(0, 20) };
      }
    }
    var plain = t;
    if (/html/.test(type) || /^<(!doctype|html)/i.test(t)) plain = new DOMParser().parseFromString(t, 'text/html').body.textContent || '';
    plain = plain.replace(/\n\s*\n+/g, '\n').trim();
    if (/no features were found|^$/i.test(plain)) return { rows: [] };
    return { rows: [], text: plain.slice(0, 4000) };
  }
  function flat(o) {
    var r = {};
    Object.keys(o).forEach(function (k) { var v = o[k]; if (v === null || v === undefined || v === '') return; r[k] = typeof v === 'object' ? JSON.stringify(v) : String(v); });
    return r;
  }

  /** Тайл қатесінің себебін анықтау: сол сұрауды мәтін ретінде қайталау (бір рет, ұзын қатар қателерде ғана). */
  function probe(url) {
    return fetchText(url, { timeout: 20000 }).then(function (r) {
      var bad = classify(r);
      if (bad) return bad;
      if (/xml|text|html/i.test(r.type)) {
        var doc = new DOMParser().parseFromString(r.text || '', 'application/xml');
        var exc = exceptionText(doc);
        return { kind: /authori|access|denied|forbidden|login/i.test(exc) ? 'denied' : 'exception', detail: exc || (r.text || '').slice(0, 200) };
      }
      return null;   // сурет қалыпты — уақытша қате болған
    });
  }

  /** Қабаттың қолжетімділігін тексеру: шағын GetMap (16×16 PNG) сұрауы. { kind:'ok' } | { kind:'missing'|'denied'|'down'|… }.
      Тек серверге шынымен бар және ашық қабат 'ok' болады (LayerNotDefined → 'missing', 401/403 не рұқсат қатесі → 'denied'). */
  function checkLayer(def, bbox) {
    var v13 = String(def.version || '1.3.0') >= '1.3', b = bbox || def.bbox || [-180, -85, 180, 85];
    var p = {
      SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: v13 ? '1.3.0' : '1.1.1', LAYERS: def.layers.join(','),
      STYLES: (def.styles || []).join(','), FORMAT: def.format || 'image/png', TRANSPARENT: 'TRUE', WIDTH: 16, HEIGHT: 16,
      EXCEPTIONS: v13 ? 'XML' : 'application/vnd.ogc.se_xml',
    };
    p[v13 ? 'CRS' : 'SRS'] = 'EPSG:4326';
    p.BBOX = (v13 ? [b[1], b[0], b[3], b[2]] : b).join(',');
    return fetchText(withParams(def.url, p), { timeout: 30000 }).then(function (r) {
      var bad = classify(r);
      if (bad) return bad;
      if (/^image\//i.test(r.type)) return { kind: 'ok' };
      var exc = exceptionText(new DOMParser().parseFromString(r.text || '', 'application/xml'));
      if (/LayerNotDefined|not defined|could not find|no such|unknown layer/i.test(exc)) return { kind: 'missing', detail: exc };
      if (/authori|access|denied|forbidden|login/i.test(exc)) return { kind: 'denied', detail: exc };
      return { kind: 'exception', detail: exc || String(r.type) };
    });
  }

  window.MuraWms = {
    capsUrl: capsUrl, baseUrl: baseUrl, parseCaps: parseCaps, fetchText: fetchText, abort: abort, classify: classify,
    capabilities: capabilities, layer: layer, featureInfo: featureInfo, parseInfo: parseInfo, probe: probe, checkLayer: checkLayer,
    newId: function () { return 'wms' + Date.now().toString(36) + (++seq).toString(36); },
  };
})();
