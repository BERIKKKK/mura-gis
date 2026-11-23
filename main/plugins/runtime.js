/* Mura GIS Plugin API 1 — плагиннің оқшауланған ортасындағы орындау ортасы (runtime).
   Бұл файл бағдарлама терезесінде ЕМЕС, әр плагиннің жеке жасырын терезесінде (бөлек процесс, sandbox, бөлек сессия)
   mura-plugin://<id>/__mura/runtime.js мекенжайынан плагин кодынан бұрын жүктеледі (main/plugins/host.js).
   Плагинге берілетін жалғыз байланыс — globalThis.mura: әр шақыру хабар ретінде негізгі процеске жіберіледі, ол
   рұқсатты тексеріп, нәтижесін қайтарады. Плагинде Node.js, файлдық жүйе, бағдарлама беті (DOM), mura://app/ жоқ;
   желі — тек network.access рұқсаты берілсе (HTTPS). */
(function () {
  'use strict';
  var bridge = globalThis.__muraBridge;
  var initEl = document.getElementById('mura-init');
  var INIT = initEl ? JSON.parse(initEl.textContent) : {};
  var pending = new Map();
  var seq = 0;
  var commands = new Map();
  var panels = new Map();
  var MAX_MSG = 48 * 1024 * 1024;

  function send(m) { bridge.send(m); }
  function call(method, args) {
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      var msg = { t: 'call', id: id, method: method, args: args === undefined ? [] : args };
      var size;
      try { size = JSON.stringify(msg).length; } catch (e) { reject(new TypeError('Аргументтер JSON-ға айналмайды: ' + e.message)); return; }
      if (size > MAX_MSG) { reject(new RangeError('Хабар тым үлкен (шегі 48 МБ).')); return; }
      pending.set(id, { resolve: resolve, reject: reject });
      send(msg);
    });
  }
  function toError(e) {
    var err = new Error(e && e.message || String(e));
    if (e && e.code) err.code = e.code;
    return err;
  }
  var errText = function (e) { return e && (e.stack || e.message) ? String(e.stack || e.message) : String(e); };

  bridge.onMessage(function (m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'reply') {
      var p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.ok) p.resolve(m.value); else p.reject(toError(m.error));
    } else if (m.t === 'ping') send({ t: 'pong', n: m.n });
    else if (m.t === 'invoke') invoke(m);
    else if (m.t === 'panel-action') {
      var h = panels.get(m.panel);
      if (h) h.listeners.forEach(function (fn) { try { fn({ button: m.button, values: m.values || {} }); } catch (e) { report('error', errText(e)); } });
    } else if (m.t === 'panel-closed') {
      var h2 = panels.get(m.panel);
      if (h2) { panels.delete(m.panel); h2.closedFns.forEach(function (fn) { try { fn(); } catch (e) { report('error', errText(e)); } }); }
    }
  });
  function invoke(m) {
    var fn = commands.get(m.command);
    if (!fn) { send({ t: 'result', id: m.id, ok: false, error: { message: 'Команда тіркелмеген: ' + m.command } }); return; }
    Promise.resolve().then(function () { return fn(Object.freeze(m.ctx || {})); }).then(function (v) {
      var value;
      try { value = v === undefined ? null : JSON.parse(JSON.stringify(v)); } catch (e) { value = null; }
      send({ t: 'result', id: m.id, ok: true, value: value });
    }, function (e) {
      send({ t: 'result', id: m.id, ok: false, error: { message: e && e.message || String(e), stack: e && e.stack ? String(e.stack).slice(0, 4000) : '' } });
    });
  }
  function report(level, text) { send({ t: 'log', level: level, text: String(text).slice(0, 4000) }); }
  globalThis.addEventListener('error', function (e) { report('error', e.error ? errText(e.error) : (e.message + ' (' + e.filename + ':' + e.lineno + ')')); });
  globalThis.addEventListener('unhandledrejection', function (e) { report('error', 'Өңделмеген Promise қатесі: ' + errText(e.reason)); });

  /* ---------- Аудармалар (locales/<тіл>.json) ---------- */
  var dicts = {};
  function loadLocale(l) {
    if (dicts[l]) return Promise.resolve(dicts[l]);
    return fetch('/locales/' + l + '.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }).then(function (d) { dicts[l] = d && typeof d === 'object' ? d : {}; return dicts[l]; });
  }
  var i18nReady = Promise.all([loadLocale(INIT.lang || 'kk'), INIT.docLang && INIT.docLang !== INIT.lang ? loadLocale(INIT.docLang) : null]);
  function t(key, vars, l) {
    var d = dicts[l || INIT.lang] || {};
    var s = Object.prototype.hasOwnProperty.call(d, key) ? String(d[key]) : key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] == null ? '' : String(vars[k]); });
    return s;
  }

  var G = globalThis.MuraGeo, AT = globalThis.MuraAttrs;
  function panelHandle(id) {
    var h = { listeners: [], closedFns: [] };
    panels.set(id, h);
    return Object.freeze({
      id: id,
      update: function (spec) { return call('ui.panel.update', [id, spec]); },
      close: function () { panels.delete(id); return call('ui.panel.close', [id]); },
      onAction: function (fn) { if (typeof fn === 'function') h.listeners.push(fn); },
      onClose: function (fn) { if (typeof fn === 'function') h.closedFns.push(fn); },
    });
  }

  var api = {
    apiVersion: '1',
    app: Object.freeze({ version: INIT.appVersion, platform: INIT.platform, lang: INIT.lang, docLang: INIT.docLang }),
    plugin: Object.freeze({ id: INIT.id, version: INIT.version, permissions: Object.freeze((INIT.permissions || []).slice()) }),
    /** Рұқсат берілген бе (тек ақпарат үшін: тексеру бәрібір негізгі процесте жасалады). */
    hasPermission: function (p) { return (INIT.permissions || []).indexOf(p) >= 0; },
    commands: Object.freeze({
      /** Манифесттегі contributes[*].command атауына өңдеуші тіркеу: fn(ctx) → Promise. */
      register: function (name, fn) {
        if (typeof name !== 'string' || typeof fn !== 'function') throw new TypeError('commands.register(name, fn)');
        commands.set(name, fn);
        send({ t: 'commands', list: Array.from(commands.keys()) });
      },
    }),
    settings: Object.freeze({ get: function () { return call('settings.get'); } }),
    storage: Object.freeze({
      get: function (k) { return call('storage.get', [k]); },
      set: function (k, v) { return call('storage.set', [k, v]); },
      remove: function (k) { return call('storage.remove', [k]); },
      keys: function () { return call('storage.keys'); },
    }),
    project: Object.freeze({ info: function () { return call('project.info'); } }),
    geometry: Object.freeze({
      selection: function () { return call('geometry.selection'); },
      list: function (layer, opts) { return call('geometry.list', [layer, opts || {}]); },
      get: function (layer, id) { return call('geometry.get', [layer, id]); },
      type: G.type, bbox: G.bbox, area: G.area, orient: G.orient, validate: G.validate, transform: G.transform, supported: G.supported, utmFor: G.utmFor,
    }),
    attributes: Object.freeze({
      selection: function () { return call('attributes.selection'); },
      list: function (layer, opts) { return call('attributes.list', [layer, opts || {}]); },
      get: function (layer, id) { return call('attributes.get', [layer, id]); },
      map: AT.map, validate: AT.validate, checkSchema: AT.checkSchema,
    }),
    map: Object.freeze({
      addLayer: function (id, geojson, style) { return call('map.addLayer', [id, geojson, style || {}]); },
      removeLayer: function (id) { return call('map.removeLayer', [id]); },
      clearLayers: function () { return call('map.clearLayers'); },
      showTemporary: function (geojson, style, opts) { return call('map.showTemporary', [geojson, style || {}, opts || {}]); },
      clearTemporary: function () { return call('map.clearTemporary'); },
      registerSymbol: function (name, spec) { return call('map.registerSymbol', [name, spec]); },
      pick: function (opts) { return call('map.pick', [opts || {}]); },
    }),
    export: Object.freeze({
      /** Файлды пайдаланушы таңдаған жерге сақтау: { suggestedName, data: string | Uint8Array | ArrayBuffer, filters? } → { saved, name }. */
      saveFile: function (o) {
        o = o || {};
        var data = o.data;
        var bin = data instanceof ArrayBuffer ? new Uint8Array(data) : (ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null);
        var payload = { suggestedName: o.suggestedName, filters: o.filters, title: o.title };
        if (bin) { var s = ''; for (var i = 0; i < bin.length; i += 0x8000) s += String.fromCharCode.apply(null, bin.subarray(i, i + 0x8000)); payload.base64 = btoa(s); }
        else payload.text = typeof data === 'string' ? data : JSON.stringify(data);
        return call('export.saveFile', [payload]);
      },
    }),
    ui: Object.freeze({
      notify: function (text, opts) { return call('ui.notify', [String(text), opts || {}]); },
      confirm: function (text, opts) { return call('ui.confirm', [String(text), opts || {}]); },
      /** Модальді диалог: { title, body: [...], buttons: [{ id, title, primary }] } → { button, values } (жабылса — button: null). */
      dialog: function (spec) { return call('ui.dialog', [spec]); },
      panel: Object.freeze({
        open: function (spec) { return call('ui.panel.open', [spec]).then(function (r) { return panelHandle(r.id); }); },
      }),
    }),
    i18n: Object.freeze({ t: t, ready: function () { return i18nReady.then(function () { return true; }); }, load: loadLocale }),
    log: Object.freeze({
      info: function () { report('info', Array.prototype.join.call(arguments, ' ')); },
      warn: function () { report('warn', Array.prototype.join.call(arguments, ' ')); },
      error: function () { report('error', Array.prototype.join.call(arguments, ' ')); },
    }),
  };
  Object.defineProperty(globalThis, 'mura', { value: Object.freeze(api), writable: false, configurable: false, enumerable: true });
  globalThis.addEventListener('load', function () { send({ t: 'ready', list: Array.from(commands.keys()) }); });
})();
