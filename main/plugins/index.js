/* Плагиндер жүйесі: менеджер (manager.js) + оқшауланған хост (host.js) + бағдарлама терезесімен IPC (mura:plugins-*).
   Ядро плагиндерге тәуелді емес: бұл модуль жүктелмесе не қате берсе, main.js оны елемей жұмысын жалғастырады,
   ал терезеде «Плагиндер» бөлімі мен кеңейту нүктелері жай ғана бос болады.
   Плагиндердің ешқайсысы бағдарлама іске қосылғанда орындалмайды: интерфейс элементтері манифесттен (contributes)
   алынады, плагин коды пайдаланушы оның әрекетін бірінші рет таңдағанда ғана іске қосылады. */
const fs = require('node:fs');
const path = require('node:path');
const M = require('../../plugin-sdk/lib/manifest.cjs');
const { PluginManager } = require('./manager');
const { PluginHost, SCHEME, LAYERS } = require('./host');
const catalog = require('./catalog');

const SDK_DIR = path.join(__dirname, '..', '..', 'plugin-sdk');

/** Протокол схемасы — app.ready-ден бұрын main.js-тің registerSchemesAsPrivileged тізіміне қосылады. */
const schemePrivileges = { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false, stream: false, codeCache: false } };

function setup(o) {
  const { electron, userData, appVersion, mainWindow, data, lang, fromApp } = o;
  const { ipcMain, dialog, app } = electron;
  const tx = (kk, ru) => (lang() === 'ru' ? ru : kk);
  const mgr = new PluginManager(path.join(userData, 'plugins'), { appVersion, platform: 'desktop' });
  mgr.safeMode = !!o.safeMode;

  /* ---------- Бағдарлама терезесіндегі сұраныстар (диалог, панель, карта) ---------- */
  const uiPending = new Map();
  let rseq = 0;
  function ui(pluginId, op, args) {
    const w = mainWindow();
    if (!w || w.isDestroyed()) return Promise.reject(new Error(tx('Бағдарлама терезесі жоқ.', 'Нет окна программы.')));
    if (op === 'cleanup') {
      for (const [rid, q] of uiPending) if (q.plugin === pluginId) { uiPending.delete(rid); q.reject(new Error(tx('Плагин тоқтатылды.', 'Плагин остановлен.'))); }
      w.webContents.send('mura:plugins-ui', { rid: 0, plugin: pluginId, op: 'cleanup', args: [] });
      return Promise.resolve(true);
    }
    const p = mgr.get(pluginId);
    const name = p && p.manifest ? M.localize(p.manifest.name, lang()) : pluginId;
    return new Promise((resolve, reject) => {
      const rid = ++rseq;
      uiPending.set(rid, { resolve, reject, plugin: pluginId });
      w.webContents.send('mura:plugins-ui', { rid, plugin: pluginId, name, op, args });
    });
  }
  ipcMain.handle('mura:plugins-ui-reply', (e, rid, ok, value) => {
    if (!fromApp(e)) return false;
    const q = uiPending.get(rid);
    if (!q) return false;
    uiPending.delete(rid);
    if (ok) q.resolve(value === undefined ? null : value); else q.reject(new Error(String(value || tx('Қате', 'Ошибка'))));
    return true;
  });

  const changed = () => { const w = mainWindow(); if (w && !w.isDestroyed()) w.webContents.send('mura:plugins-changed'); };
  const host = new PluginHost({ electron, manager: mgr, data, ui, mainWindow, lang, onStatus: changed });

  /* ---------- Терезеге берілетін мәліметтер (файл жолдарынсыз) ---------- */
  const view = p => {
    const m = p.manifest;
    return {
      id: p.id, ok: !!m && !p.errors.length, errors: p.errors, compat: p.compat, enabled: p.enabled, runnable: mgr.runnable(p),
      name: m ? m.name : p.id, version: m ? m.version : '', author: m ? m.author : null, description: m ? m.description || '' : '', license: m ? m.license || '' : '',
      homepage: m ? m.homepage || m.repository || '' : '', apiVersion: m ? m.apiVersion : '', minAppVersion: m ? m.minAppVersion : '', platforms: m ? m.platforms : [],
      permissions: m ? m.permissions : [], granted: p.granted, reasons: p.reasons, settingsSchema: m ? m.settings : [], settings: p.settings,
      contributes: m ? m.contributes : {}, icon: mgr.iconOf(p), installed_at: p.installed_at, updated_at: p.updated_at,
      sha256: p.integrity && p.integrity.archive_sha256 || '', status: host.status(p.id), source: p.source,
    };
  };
  const listView = () => ({ suspended: mgr.state.suspended, safeMode: mgr.safeMode, plugins: mgr.list().map(view) });
  const contributions = () => {
    const out = [];
    for (const p of mgr.list()) {
      if (!mgr.runnable(p)) continue;
      for (const [point, items] of Object.entries(p.manifest.contributes)) for (const c of items) out.push({ plugin: p.id, pluginName: p.manifest.name, point, command: c.command, title: c.title, tooltip: c.tooltip || null, icon: mgr.iconOf(p) });
    }
    return out;
  };
  const after = id => { mgr.cache = null; host.refresh(id); changed(); };

  const handle = (ch, fn) => ipcMain.handle(ch, async (e, ...a) => {
    if (!fromApp(e)) return { ok: false, error: tx('Рұқсат жоқ', 'Нет доступа') };
    try { return { ok: true, ...(await fn(...a)) }; } catch (err) { return { ok: false, error: err.message || String(err), code: err.code || '' }; }
  });
  handle('mura:plugins-list', () => listView());
  handle('mura:plugins-contrib', () => ({ items: contributions() }));
  handle('mura:plugins-info', () => ({
    apiVersion: M.API_VERSION, supported: M.SUPPORTED_API, appVersion, platform: 'desktop', platforms: M.PLATFORMS, permissions: M.PERMISSIONS,
    points: M.EXTENSION_POINTS, settingTypes: M.SETTING_TYPES, layers: LAYERS, dir: mgr.dir,
  }));
  handle('mura:plugins-inspect', async file => {
    if (!file) {
      const r = await dialog.showOpenDialog(mainWindow(), {
        title: tx('Плагин орнату (.muraplug)', 'Установка плагина (.muraplug)'), properties: ['openFile'],
        filters: [{ name: tx('Mura GIS плагині', 'Плагин Mura GIS'), extensions: ['muraplug'] }, { name: 'ZIP', extensions: ['zip'] }],
      });
      if (r.canceled || !r.filePaths[0]) return { canceled: true };
      file = r.filePaths[0];
    }
    const report = mgr.inspect(path.resolve(String(file)));
    // Ұсынылған плагиннің id-ін бөтен файл иемденбейді: мәртебесі «тәуелсіз әзірлеуші» болып қалады, ескерту шығады
    if (report.manifest && catalog.ids().has(report.manifest.id)) {
      report.warnings.push(tx('Бұл id Mura GIS ұсынған плагинге тиесілі, бірақ файл бағдарламаның өз каталогынан емес. Сенімді көзден алынғанына көз жеткізіңіз; ресми нұсқасы — «Ұсынылған плагиндер».',
        'Этот id принадлежит плагину, рекомендованному Mura GIS, но файл не из каталога программы. Убедитесь в надёжности источника; официальная версия — в «Рекомендуемых плагинах».'));
    }
    return { report };
  });
  /** Ұсынылған плагиндер (бағдарламамен бірге келеді, Mura GIS әзірлеушісі жасаған) және олардың орнату күйі. */
  handle('mura:plugins-catalog', () => ({
    items: catalog.list().map(c => {
      const p = mgr.get(c.id), m = c.manifest;
      const inst = p && p.manifest ? { version: p.manifest.version, source: p.source, cmp: M.compareVersions(m.version, p.manifest.version) } : null;
      return { id: c.id, name: m.name, version: m.version, description: m.description || '', author: m.author, license: m.license || '', permissions: m.permissions,
        contributes: m.contributes, tags: c.tags, compat: M.compatibility(m, mgr.env), installed: inst,
        icon: m.icon ? (() => { try { const b = fs.readFileSync(path.join(c.dir, ...m.icon.split('/'))); return 'data:' + (/\.svg$/i.test(m.icon) ? 'image/svg+xml' : 'image/png') + ';base64,' + b.toString('base64'); } catch (e) { return null; } })() : null };
    }),
  }));
  handle('mura:plugins-inspect-catalog', id => {
    const c = catalog.list().find(x => x.id === String(id || ''));
    if (!c) throw new Error(tx('Ұсынылған плагин табылмады.', 'Рекомендуемый плагин не найден.'));
    return { report: mgr.inspectBuffer(catalog.pack(c.dir), c.id + '-' + c.manifest.version + '.muraplug', 'official') };
  });
  handle('mura:plugins-install', (token, grants) => { const p = mgr.install(token, grants); after(p.id); return { plugin: view(mgr.get(p.id)) }; });
  handle('mura:plugins-enable', (id, on) => { mgr.setEnabled(String(id), !!on); after(String(id)); return listView(); });
  handle('mura:plugins-grants', (id, list) => { mgr.setGrants(String(id), list); after(String(id)); return listView(); });
  handle('mura:plugins-settings', (id, values) => { const s = mgr.setSettings(String(id), values); changed(); return { settings: s }; });
  handle('mura:plugins-suspend', on => { mgr.setSuspended(!!on); after(''); return listView(); });
  handle('mura:plugins-uninstall', (id, opts) => { host.stop(String(id)); mgr.uninstall(String(id), { data: !!(opts && opts.data) }); after(String(id)); return listView(); });
  handle('mura:plugins-stop', id => { host.stop(String(id)); changed(); return listView(); });
  handle('mura:plugins-invoke', async (id, command, ctx, selection) => ({ value: await host.invoke(String(id), String(command), ctx || {}, selection || null) }));
  handle('mura:plugins-panel', (id, panel, kind, button, values) => {
    const it = host.inst.get(String(id));
    if (it) host.post(it, kind === 'closed' ? { t: 'panel-closed', panel: String(panel) } : { t: 'panel-action', panel: String(panel), button: String(button || ''), values: values && typeof values === 'object' ? values : {} });
    return {};
  });
  /** SDK-ны (құжаттама, типтер, үлгілер, құралдар) пайдаланушы таңдаған қалтаға көшіру — бастапқы кодсыз плагин жасау үшін. */
  handle('mura:plugins-sdk', async () => {
    const r = await dialog.showOpenDialog(mainWindow(), { title: tx('Plugin SDK сақталатын қалта', 'Папка для Plugin SDK'), properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    const dest = path.join(r.filePaths[0], 'mura-plugin-sdk');
    if (fs.existsSync(dest)) throw new Error(tx('Бұл қалтада mura-plugin-sdk бар. Басқа қалта таңдаңыз.', 'В этой папке уже есть mura-plugin-sdk. Выберите другую.'));
    copyDir(SDK_DIR, dest);
    electron.shell.showItemInFolder(path.join(dest, 'README.md'));
    return { path: dest };
  });

  app.on('will-quit', () => host.stopAll());
  return { manager: mgr, host, contributions };
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.writeFileSync(d, fs.readFileSync(s));
  }
}

module.exports = { setup, schemePrivileges };
