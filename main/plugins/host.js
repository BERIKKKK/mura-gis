/* Плагиндерді оқшауланған ортада іске қосу және Plugin API 1 брокері.

   Оқшаулау (техникалық деңгейде, тек рұқсат тізімі емес):
     • әр плагин — жеке жасырын BrowserWindow: бөлек renderer процесі, Chromium sandbox (sandbox: true), contextIsolation,
       Node.js жоқ; бағдарлама терезесімен ортақ DOM, JavaScript нысандары, localStorage жоқ;
     • әр плагин — жеке жадтағы сессия (partition «mura-plugin-<id>», дискіге жазылмайды): бағдарламаның mura://app/
       протоколы (жоба деректері) онда тіркелмеген, file:// — 403;
     • желі: network.access рұқсаты жоқ болса, сессияның барлық сұранысы (http, https, ws…) webRequest деңгейінде
       тоқтатылады және прокси жоқ мекенжайға бағытталады (WebRTC UDP да); рұқсат болса — тек HTTPS / WSS;
     • CSP: тек плагиннің өз файлдары (mura-plugin://<id>/), inline скрипт, eval, iframe, форма жіберу жоқ;
     • жаңа терезе, навигация, жүктеу, құрылғы/камера/геолокация рұқсаттары, alert/confirm — бұғатталған;
     • плагин бағдарламаға тек хабар жібере алады (sandbox-preload.js): әр шақыру осы файлда рұқсатымен, түрімен және
       өлшемімен тексеріледі. Жоба деректері тек оқылады (API 1-де жазу әдісі жоқ);
     • қате, құлау, «қатып қалу» (жүрек соғысы 15 с жауапсыз) — тек сол плагиннің процесі тоқтатылады, бағдарлама жалғасады. */
const fs = require('node:fs');
const path = require('node:path');
const M = require('../../plugin-sdk/lib/manifest.cjs');
const GEO = require('../../plugin-sdk/lib/geo.js');
const LY = require('../../plugin-sdk/lib/layers.cjs');

const SCHEME = 'mura-plugin';
const SDK_LIB = path.join(__dirname, '..', '..', 'plugin-sdk', 'lib');
const RUNTIME_FILES = { 'runtime.js': path.join(__dirname, 'runtime.js'), 'geo.js': path.join(SDK_LIB, 'geo.js'), 'attrs.js': path.join(SDK_LIB, 'attrs.js') };
const LAYERS = LY.LAYERS;
const ACTIVATE_TIMEOUT = 15000, HEARTBEAT = 5000, HANG_AFTER = 15000, INVOKE_TIMEOUT = 30 * 60 * 1000;
const MAX_CRASHES = 3, MAX_PENDING = 64;
const DANGEROUS_EXT = /\.(exe|com|bat|cmd|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|hta|msi|msp|scr|pif|cpl|dll|sys|lnk|reg|jar|app|sh|desktop|appimage|deb|rpm|dmg|pkg|iso|url|scf|inf|gadget|msc|mui)$/i;

const MIME = { js: 'text/javascript', json: 'application/json', md: 'text/markdown', txt: 'text/plain', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', css: 'text/css', geojson: 'application/geo+json', csv: 'text/csv', xml: 'application/xml', qml: 'application/xml' };
const csp = net => "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'" + (net ? ' https: wss:' : '') +
  "; img-src 'self' data: blob:" + (net ? ' https:' : '') + "; style-src 'none'; font-src 'none'; media-src 'none'; frame-src 'none'; child-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

class PluginError extends Error { constructor(m, code) { super(m); this.code = code || 'error'; } }

const clone = o => JSON.parse(JSON.stringify(o === undefined ? null : o));
/** Жоба қабаттарының жазбалары (тек оқу; түрлендіру — plugin-sdk/lib/layers.cjs). */
const ROWS = {
  marks: d => d.marks.list(), zones: d => d.store.load(), routes: d => d.routes.list(), places: d => d.places.list(), plan_objects: d => d.plans.objects(),
};

class PluginHost {
  /**
   * deps: { electron: { BrowserWindow, session, dialog, app }, manager, data: () => ({ marks, store, routes, places, plans, projects }),
   *         ui: (pluginId, op, args) => Promise (бағдарлама терезесіндегі сұраныс), mainWindow: () => BrowserWindow,
   *         lang: () => 'kk'|'ru', onStatus: () => void }
   */
  constructor(deps) {
    this.d = deps;
    this.E = deps.electron;
    this.mgr = deps.manager;
    this.inst = new Map();          // id → Instance
    this.bySender = new Map();      // webContents.id → Instance
    this.log = new Map();           // id → [{ at, level, text }] (соңғы 30)
    this.crashes = new Map();
    this.failed = new Set();
    this.seq = 0;
    this.sessions = new Map();
    this.docLang = deps.lang();
    this.E.ipcMain.on('mura-plugin:msg', (e, m) => {
      const it = this.bySender.get(e.sender.id);
      if (!it || e.senderFrame !== e.sender.mainFrame) return;        // тек плагиннің өз басты фреймі
      try { this.onMessage(it, m); } catch (err) { this.note(it.id, 'error', 'Хабар өңделмеді: ' + err.message); }
    });
  }

  note(id, level, text) {
    const a = this.log.get(id) || [];
    a.push({ at: new Date().toISOString(), level, text: String(text).slice(0, 2000) });
    while (a.length > 30) a.shift();
    this.log.set(id, a);
    if (level === 'error') this.d.onStatus && this.d.onStatus();
  }
  status(id) {
    const it = this.inst.get(id);
    return { running: !!(it && it.ready), starting: !!(it && !it.ready), failed: this.failed.has(id), crashes: this.crashes.get(id) || 0, log: (this.log.get(id) || []).slice(-30) };
  }

  /* ---------- Сессия: бөлек, жадта, желісі бұғатталған ---------- */
  sessionFor(p, net) {
    const key = p.id + (net ? '#net' : '');
    if (this.sessions.has(key)) return this.sessions.get(key);
    const ses = this.E.session.fromPartition('mura-plugin-' + key.replace('#', '-'), { cache: false });
    ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    ses.setPermissionCheckHandler(() => false);
    if (ses.setDevicePermissionHandler) ses.setDevicePermissionHandler(() => false);
    if (ses.setBluetoothPairingHandler) ses.setBluetoothPairingHandler((_d, cb) => cb({ confirmed: false }));
    ses.on('will-download', e => e.preventDefault());
    ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (det, cb) => {
      const u = String(det.url);
      if (u.startsWith(SCHEME + '://' + p.id + '/')) return cb({});
      if (net && /^(https|wss):\/\//i.test(u)) return cb({});
      cb({ cancel: true });
    });
    if (!net) ses.setProxy({ proxyRules: 'http://127.0.0.1:9', proxyBypassRules: '<-loopback>' }).catch(() => {});
    ses.protocol.handle('file', () => new Response('Forbidden', { status: 403 }));
    ses.protocol.handle(SCHEME, req => this.serve(req, net));
    this.sessions.set(key, ses);
    return ses;
  }
  /** mura-plugin://<id>/ — хост беті; /<жол> — плагиннің тұтастық тізіміндегі файлдары; /__mura/ — бағдарламаның runtime файлдары. */
  serve(req, net) {
    const u = new URL(req.url);
    const id = u.hostname;
    const p = this.mgr.get(id);
    const headers = t => ({ 'Content-Type': t, 'Content-Security-Policy': csp(net), 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    if (!p || !p.manifest || req.method !== 'GET') return new Response('Not found', { status: 404 });
    let rel;
    try { rel = decodeURIComponent(u.pathname).replace(/^\/+/, ''); } catch (e) { return new Response('Bad request', { status: 400 }); }
    if (rel === '') {                     // хост беті түбірде: плагиннің салыстырмалы жолдары (fetch('config/…')) өз файлдарына барады
      const inst = this.inst.get(id);
      const init = JSON.stringify(inst ? inst.init : {}).replace(/</g, '\\u003c');
      const html = '<!doctype html><meta charset="utf-8"><title>' + id + '</title>' +
        '<script type="application/json" id="mura-init">' + init + '</script>' +
        '<script src="/__mura/geo.js"></script><script src="/__mura/attrs.js"></script><script src="/__mura/runtime.js"></script>' +
        '<script src="/' + p.manifest.entry.split('/').map(encodeURIComponent).join('/') + '"></script>';
      return new Response(html, { headers: headers('text/html; charset=utf-8') });
    }
    if (rel.startsWith('__mura/')) {
      const f = RUNTIME_FILES[rel.slice(7)];
      return f ? new Response(fs.readFileSync(f), { headers: headers('text/javascript; charset=utf-8') }) : new Response('Not found', { status: 404 });
    }
    const b = this.mgr.readFile(p, rel);
    if (!b) return new Response('Not found', { status: 404 });
    const ext = (rel.match(/\.([a-z0-9]+)$/i) || [])[1] || '';
    return new Response(b, { headers: headers((MIME[ext.toLowerCase()] || 'application/octet-stream') + (/^(js|json|md|txt|css|csv|xml|qml|geojson|svg)$/i.test(ext) ? '; charset=utf-8' : '')) });
  }

  /* ---------- Іске қосу / тоқтату ---------- */
  async activate(id) {
    const cur = this.inst.get(id);
    if (cur) return cur.readyP;
    const p = this.mgr.get(id);
    if (!this.mgr.runnable(p)) throw new PluginError(p && !p.compat.ok ? 'Плагин үйлесімсіз: ' + p.compat.reason : 'Плагин өшірулі не іске қосылмайды.', 'disabled');
    if (this.failed.has(id)) throw new PluginError('Плагин бірнеше рет құлады және бұл сеанста тоқтатылды. Оны өшіріп-қосыңыз не бағдарламаны қайта іске қосыңыз.', 'failed');
    const bad = this.mgr.verify(p);
    if (bad) { this.note(id, 'error', bad); throw new PluginError(bad, 'integrity'); }
    const net = p.granted.includes('network.access');
    const it = { id, p, net, ready: false, win: null, calls: new Map(), commands: new Set(), selection: null, lastPong: Date.now(), timer: null, pingN: 0,
      init: { id, version: p.manifest.version, appVersion: this.mgr.env.appVersion, platform: this.mgr.env.platform, lang: this.d.lang(), docLang: this.docLang, permissions: p.granted.slice() } };
    this.inst.set(id, it);
    it.readyP = new Promise((resolve, reject) => { it.onReady = resolve; it.onFail = reject; });
    it.readyP.catch(() => {});
    const win = new this.E.BrowserWindow({
      show: false, width: 320, height: 240, skipTaskbar: true, focusable: false, paintWhenInitiallyHidden: false,
      webPreferences: {
        preload: path.join(__dirname, 'sandbox-preload.js'), session: this.sessionFor(p, net), sandbox: true, contextIsolation: true,
        nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false, webSecurity: true, allowRunningInsecureContent: false,
        webviewTag: false, plugins: false, webgl: false, enableWebSQL: false, spellcheck: false, disableDialogs: true, navigateOnDragDrop: false,
        backgroundThrottling: false, autoplayPolicy: 'document-user-activation-required', devTools: !this.E.app.isPackaged,
      },
    });
    it.win = win;
    const wc = win.webContents;
    this.bySender.set(wc.id, it);
    if (wc.setWebRTCIPHandlingPolicy) wc.setWebRTCIPHandlingPolicy(net ? 'default_public_interface_only' : 'disable_non_proxied_udp');
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('will-navigate', e => e.preventDefault());
    wc.on('will-redirect', e => e.preventDefault());
    wc.on('will-attach-webview', e => e.preventDefault());
    wc.on('render-process-gone', (_e, det) => this.crashed(it, 'Плагин процесі тоқтады: ' + (det && det.reason || '')));
    wc.on('unresponsive', () => this.crashed(it, 'Плагин жауап бермей қалды (ұзақ есептеу не шексіз цикл).', true));
    wc.on('did-fail-load', (_e, code, desc) => this.crashed(it, 'Плагин беті жүктелмеді: ' + desc + ' (' + code + ')'));
    const to = setTimeout(() => { if (!it.ready) this.crashed(it, 'Плагин ' + ACTIVATE_TIMEOUT / 1000 + ' с ішінде іске қосылмады.', true); }, ACTIVATE_TIMEOUT);
    it.readyP.then(() => clearTimeout(to), () => clearTimeout(to));
    it.timer = setInterval(() => {
      if (!it.ready) return;
      if (Date.now() - it.lastPong > HANG_AFTER) { this.crashed(it, 'Плагин ' + HANG_AFTER / 1000 + ' с бойы жауап бермеді (шексіз цикл?) — тоқтатылды.', true); return; }
      this.post(it, { t: 'ping', n: ++it.pingN });
    }, HEARTBEAT);
    win.loadURL(SCHEME + '://' + id + '/').catch(() => {});
    return it.readyP;
  }
  post(it, m) { if (it.win && !it.win.isDestroyed()) it.win.webContents.send('mura-plugin:msg', m); }

  crashed(it, why, kill) {
    if (this.inst.get(it.id) !== it) return;
    this.note(it.id, 'error', why);
    const n = (this.crashes.get(it.id) || 0) + 1;
    this.crashes.set(it.id, n);
    if (n >= MAX_CRASHES) { this.failed.add(it.id); this.note(it.id, 'error', 'Плагин ' + n + ' рет құлады — бұл сеанста қайта іске қосылмайды.'); }
    this.stop(it.id, new PluginError(why, 'crashed'), kill);
  }
  /** Плагинді тоқтату: процесі жойылады, күтіп тұрған шақырулар қатемен аяқталады, оның қабаттары мен терезелері жабылады. */
  stop(id, err, kill) {
    const it = this.inst.get(id);
    if (!it) return;
    this.inst.delete(id);
    clearInterval(it.timer);
    if (it.win && !it.win.isDestroyed()) {
      this.bySender.delete(it.win.webContents.id);
      try { if (kill) it.win.webContents.forcefullyCrashRenderer(); } catch (e) { /* елемейміз */ }
      it.win.destroy();
    }
    const e = err || new PluginError('Плагин тоқтатылды.', 'stopped');
    if (!it.ready) it.onFail(e);
    for (const c of it.calls.values()) { clearTimeout(c.timer); c.reject(e); }
    it.calls.clear();
    this.d.ui(id, 'cleanup', []).catch(() => {});
    this.d.onStatus && this.d.onStatus();
  }
  stopAll() { for (const id of [...this.inst.keys()]) this.stop(id); }
  /** Өшірілген, жойылған, рұқсаты өзгерген плагиндерді тоқтату (келесі шақыруда жаңа рұқсаттармен қайта қосылады). */
  refresh(id) {
    if (id) { this.failed.delete(id); this.crashes.delete(id); }
    for (const [k, it] of this.inst) {
      const p = this.mgr.get(k);
      if (!this.mgr.runnable(p) || k === id || p.granted.join() !== it.p.granted.join()) this.stop(k);
    }
  }

  /* ---------- Команда шақыру (бағдарлама терезесінен: кеңейту нүктесіндегі батырма) ---------- */
  async invoke(id, command, ctx, selection) {
    const p = this.mgr.get(id);
    if (!p || !p.manifest) throw new PluginError('Плагин табылмады.');
    const point = String(ctx && ctx.point || '');
    const declared = (p.manifest.contributes[point] || []).some(c => c.command === command);
    if (!declared) throw new PluginError('Бұл команда манифестте осы кеңейту нүктесі үшін жарияланбаған.');
    if (ctx && (ctx.docLang === 'kk' || ctx.docLang === 'ru')) this.docLang = ctx.docLang;
    const it0 = this.inst.get(id);
    if (it0 && it0.ready) it0.init.docLang = this.docLang;
    await this.activate(id);
    const it = this.inst.get(id);
    if (!it) throw new PluginError('Плагин іске қосылмады.');
    it.selection = selection && typeof selection === 'object' ? clone(selection) : null;
    const cid = 'i' + (++this.seq);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { it.calls.delete(cid); reject(new PluginError('Плагин командасы тым ұзақ орындалды.', 'timeout')); }, INVOKE_TIMEOUT);
      it.calls.set(cid, { resolve, reject, timer });
      this.post(it, { t: 'invoke', id: cid, command, ctx: { point, lang: this.d.lang(), docLang: this.docLang, ...(ctx && ctx.service ? { service: String(ctx.service) } : {}), ...(ctx && (ctx.scope === 'all' || ctx.scope === 'current') ? { scope: ctx.scope } : {}), ...(ctx && ctx.zone ? { zone: clone(ctx.zone) } : {}) } });
    });
  }

  /* ---------- Плагиннен келген хабарлар ---------- */
  onMessage(it, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'pong') { it.lastPong = Date.now(); return; }
    if (m.t === 'ready') {
      if (Array.isArray(m.list)) it.commands = new Set(m.list.map(String));
      if (!it.ready) { it.ready = true; it.lastPong = Date.now(); this.crashes.set(it.id, 0); it.onReady(); this.d.onStatus && this.d.onStatus(); }
      return;
    }
    if (m.t === 'commands') { if (Array.isArray(m.list)) it.commands = new Set(m.list.map(String)); return; }
    if (m.t === 'log') { this.note(it.id, ['info', 'warn', 'error'].includes(m.level) ? m.level : 'info', String(m.text || '')); return; }
    if (m.t === 'result') {
      const c = it.calls.get(m.id);
      if (!c) return;
      it.calls.delete(m.id);
      clearTimeout(c.timer);
      if (m.ok) c.resolve(m.value);
      else { const msg = String(m.error && m.error.message || 'Белгісіз қате'); this.note(it.id, 'error', msg + (m.error && m.error.stack ? '\n' + m.error.stack : '')); c.reject(new PluginError(msg, 'plugin')); }
      return;
    }
    if (m.t === 'call') {
      if (!Number.isInteger(m.id)) return;
      it.open = (it.open || 0) + 1;
      const reply = (ok, value, error) => { it.open--; this.post(it, { t: 'reply', id: m.id, ok, value, error }); };
      if (it.open > MAX_PENDING) { reply(false, null, { message: 'Бір уақытта шақыру тым көп.', code: 'busy' }); return; }
      Promise.resolve().then(() => this.call(it, String(m.method || ''), Array.isArray(m.args) ? m.args : []))
        .then(v => reply(true, v === undefined ? null : v), e => reply(false, null, { message: e.message || String(e), code: e.code || 'error' }));
    }
  }

  need(it, perm) {
    if (!this.mgr.runnable(this.mgr.get(it.id))) throw new PluginError('Плагин өшірілген.', 'disabled');
    if (!it.p.granted.includes(perm)) throw new PluginError('Рұқсат жоқ: ' + perm + '. Оны «Баптаулар → Плагиндер» бөлімінде беруге болады.', 'permission');
  }
  data() { return this.d.data(); }
  layer(name) {
    if (!LAYERS.includes(name)) throw new PluginError('Белгісіз қабат: ' + name + ' (бар: ' + LAYERS.join(', ') + ').', 'arg');
    try { return ROWS[name](this.data()) || []; } catch (e) { return []; }
  }
  selection(it) { return LY.selection(it.selection); }

  /** API әдістері: әрқайсысының рұқсаты осы жерде тексеріледі. */
  async call(it, method, args) {
    const mgr = this.mgr, id = it.id;
    const page = (rows, o) => { const off = Math.max(0, Math.floor(+o.offset || 0)), lim = Math.max(1, Math.min(10000, Math.floor(+o.limit || 5000))); return rows.slice(off, off + lim); };
    switch (method) {
      case 'settings.get': return mgr.get(id).settings;
      case 'storage.get': { const k = keyArg(args[0]); const s = mgr.storageRead(id); return Object.prototype.hasOwnProperty.call(s, k) ? s[k] : null; }
      case 'storage.keys': return Object.keys(mgr.storageRead(id));
      case 'storage.set': { const k = keyArg(args[0]); const s = mgr.storageRead(id); s[k] = clone(args[1]); mgr.storageWrite(id, s); return true; }
      case 'storage.remove': { const k = keyArg(args[0]); const s = mgr.storageRead(id); delete s[k]; mgr.storageWrite(id, s); return true; }
      case 'project.info': {
        this.need(it, 'project.metadata');
        const pr = this.data().projects;
        const c = pr && pr.current ? pr.info().current : null;
        return c ? { open: true, name: c.name || '', oblast: c.oblast || '', district: c.district || '', counts: c.counts || {}, appVersion: mgr.env.appVersion } : { open: false, appVersion: mgr.env.appVersion };
      }
      case 'geometry.selection': { this.need(it, 'geometry.read'); const s = this.selection(it); return s ? { layer: s.layer, id: s.id, saved: s.saved, geometry: s.geometry } : null; }
      case 'attributes.selection': { this.need(it, 'attributes.read'); const s = this.selection(it); return s ? { layer: s.layer, id: s.id, saved: s.saved, attributes: s.attributes } : null; }
      case 'geometry.list': {
        this.need(it, 'geometry.read');
        const name = String(args[0] || ''), o = args[1] && typeof args[1] === 'object' ? args[1] : {};
        const rows = this.layer(name);
        let out = rows.map(r => ({ id: r.id, geometry: LY.geometry(name, r) })).filter(x => x.geometry);
        if (Array.isArray(o.bbox) && o.bbox.length === 4 && o.bbox.every(Number.isFinite)) {
          const [a, b, c, d] = o.bbox;
          out = out.filter(x => { const bb = GEO.bbox(x.geometry); return bb && bb[0] <= c && bb[2] >= a && bb[1] <= d && bb[3] >= b; });
        }
        return page(out, o);
      }
      case 'geometry.get': { this.need(it, 'geometry.read'); const name = String(args[0] || ''); const r = this.layer(name).find(x => x.id === String(args[1] || '')); return r ? { id: r.id, geometry: LY.geometry(name, r) } : null; }
      case 'attributes.list': { this.need(it, 'attributes.read'); const name = String(args[0] || ''); const rows = this.layer(name); return page(rows, args[1] && typeof args[1] === 'object' ? args[1] : {}).map(r => ({ id: r.id, attributes: LY.attributes(name, r) })); }
      case 'attributes.get': { this.need(it, 'attributes.read'); const name = String(args[0] || ''); const r = this.layer(name).find(x => x.id === String(args[1] || '')); return r ? { id: r.id, attributes: LY.attributes(name, r) } : null; }
      case 'export.saveFile': this.need(it, 'files.export'); return this.saveFile(it, args[0]);
      case 'files.open': this.need(it, 'files.import'); return this.openFiles(it, args[0]);
      case 'ui.notify': case 'ui.confirm': case 'ui.dialog': case 'ui.panel.open': case 'ui.panel.update': case 'ui.panel.close':
        sizeArg(args, 2e6);
        return this.d.ui(id, method.slice(3), clone(args));
      case 'map.addLayer': case 'map.removeLayer': case 'map.clearLayers': case 'map.showTemporary': case 'map.clearTemporary': case 'map.registerSymbol': case 'map.pick':
        this.need(it, 'map.layers');
        sizeArg(args, 25e6);
        return this.d.ui(id, method, clone(args));
      default: throw new PluginError('Белгісіз API әдісі: ' + method + ' (Plugin API ' + M.API_VERSION + ').', 'method');
    }
  }

  /** Export API: файл орнын әрқашан пайдаланушы таңдайды («Сақтау» терезесі), плагин жолды көрмейді. */
  async saveFile(it, o) {
    o = o && typeof o === 'object' ? o : {};
    let data;
    if (typeof o.text === 'string') data = Buffer.from(o.text, 'utf8');
    else if (typeof o.base64 === 'string') data = Buffer.from(o.base64, 'base64');
    else throw new PluginError('export.saveFile: data жоқ.', 'arg');
    if (data.length > 100 * 1024 * 1024) throw new PluginError('Файл тым үлкен (шегі 100 МБ).', 'arg');
    let name = String(o.suggestedName || 'export').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^[.\s]+/, '').slice(0, 120) || 'export';
    if (DANGEROUS_EXT.test(name)) throw new PluginError('Орындалатын не жүйелік файл түрін сақтауға рұқсат жоқ: ' + name, 'blocked');
    const filters = (Array.isArray(o.filters) ? o.filters : []).slice(0, 5).map(f => ({ name: String(f && f.name || '').slice(0, 60) || 'File',
      extensions: (Array.isArray(f && f.extensions) ? f.extensions : []).map(x => String(x).replace(/[^A-Za-z0-9]/g, '').slice(0, 10)).filter(x => x && !DANGEROUS_EXT.test('.' + x)).slice(0, 5) }))
      .filter(f => f.extensions.length);
    const win = this.d.mainWindow();
    const pname = M.localize(it.p.manifest.name, this.d.lang());
    const r = await this.E.dialog.showSaveDialog(win, {
      title: (this.d.lang() === 'ru' ? 'Плагин «' : 'Плагин «') + pname + (this.d.lang() === 'ru' ? '» — сохранение файла' : '» — файлды сақтау'),
      defaultPath: path.join(this.E.app.getPath('documents'), name), filters: filters.length ? filters : undefined,
    });
    if (r.canceled || !r.filePath) return { saved: false };
    if (DANGEROUS_EXT.test(r.filePath)) throw new PluginError('Бұл түрдегі файлды плагин сақтай алмайды.', 'blocked');
    const tmp = r.filePath + '.tmp-mura';
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, r.filePath);
    this.note(it.id, 'info', 'Файл сақталды: ' + path.basename(r.filePath) + ' (' + data.length + ' байт)');
    return { saved: true, name: path.basename(r.filePath), size: data.length };
  }

  /** Files API (files.import): файлды әрқашан пайдаланушы таңдайды («Ашу» терезесі); плагинге тек атауы мен мазмұны
      беріледі, толық жолы берілмейді. Шегі: ≤ 10 файл, әрқайсысы ≤ 100 МБ, барлығы ≤ 200 МБ. */
  async openFiles(it, o) {
    o = o && typeof o === 'object' ? o : {};
    const filters = (Array.isArray(o.filters) ? o.filters : []).slice(0, 5).map(f => ({ name: String(f && f.name || '').slice(0, 60) || 'File',
      extensions: (Array.isArray(f && f.extensions) ? f.extensions : []).map(x => String(x).replace(/[^A-Za-z0-9]/g, '').slice(0, 10)).filter(Boolean).slice(0, 8) }))
      .filter(f => f.extensions.length);
    const pname = M.localize(it.p.manifest.name, this.d.lang());
    const ru = this.d.lang() === 'ru';
    const r = await this.E.dialog.showOpenDialog(this.d.mainWindow(), {
      title: 'Плагин «' + pname + (ru ? '» — выбор файлов' : '» — файл таңдау') + (o.title ? ': ' + String(o.title).slice(0, 80) : ''),
      properties: ['openFile', ...(o.multiple ? ['multiSelections'] : [])], filters: filters.length ? filters : undefined,
    });
    if (r.canceled || !r.filePaths || !r.filePaths.length) return [];
    if (r.filePaths.length > 10) throw new PluginError(ru ? 'Можно выбрать не более 10 файлов.' : 'Бір рет 10 файлдан артық таңдауға болмайды.', 'arg');
    let total = 0;
    const out = [];
    for (const f of r.filePaths) {
      const st = fs.statSync(f);
      if (!st.isFile()) continue;
      if (st.size > 100 * 1024 * 1024) throw new PluginError((ru ? 'Файл слишком большой (предел 100 МБ): ' : 'Файл тым үлкен (шегі 100 МБ): ') + path.basename(f), 'arg');
      total += st.size;
      if (total > 200 * 1024 * 1024) throw new PluginError(ru ? 'Файлы слишком большие (всего не более 200 МБ).' : 'Файлдар тым үлкен (барлығы 200 МБ-тан аспауы керек).', 'arg');
      out.push({ name: path.basename(f), size: st.size, data: new Uint8Array(fs.readFileSync(f)) });
    }
    this.note(it.id, 'info', 'Файл оқылды: ' + out.map(x => x.name + ' (' + x.size + ' байт)').join(', '));
    return out;
  }
}

function keyArg(k) {
  if (typeof k !== 'string' || !/^[\w.\-:]{1,128}$/.test(k)) throw new PluginError('storage: кілт — 1–128 таңбалы жол (әріп, сан, _ . - :).', 'arg');
  return k;
}
function sizeArg(args, max) {
  let n;
  try { n = JSON.stringify(args).length; } catch (e) { throw new PluginError('Аргумент JSON-ға айналмайды.', 'arg'); }
  if (n > max) throw new PluginError('Дерек тым үлкен.', 'arg');
}

module.exports = { PluginHost, PluginError, SCHEME, LAYERS };
