/* Mura GIS — негізгі процесс.
   Интерфейс src/ ішінен mura://app/ мекенжайымен беріледі (тұрақты origin: localStorage, fetch, CORS дұрыс жұмыс істейді).
   Барлық деректер — ашық жобада: бір GeoPackage (.gpkg) файлы (main/gpkg.js, main/projects.js). Жоба ашылмаса, бет
   бастапқы терезені көрсетеді (жаңа жоба / соңғы жобалар / файлдан ашу — src/js/project.js).
   mura://app/api — сақталған аймақтар (main/store.js); mura://app/marks — ескерткіш белгілері (main/marks.js); mura://app/routes — маршруттар (main/routes.js); mura://app/places — өзге нысандар (main/places.js); mura://app/plans — «Жоспар» нысандары мен баптаулары (main/plans.js). Файлдарды жүктеу (GeoJSON, DOCX, PNG) — «Сақтау» терезесі арқылы. */
const { app, BrowserWindow, Menu, protocol, net, session, shell, dialog, ipcMain, clipboard, safeStorage } = require('electron');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { Store } = require('./store');
const { MarksStore } = require('./marks');
const { RoutesStore } = require('./routes');
const { PlacesStore } = require('./places');
const { PlansStore } = require('./plans');
const { Projects } = require('./projects');
const { noTable, Project } = require('./gpkg');
const { SyncManager } = require('./sync');
const { find: findRegion } = require('./regions');
const gpkgRead = require('./gpkg-read');
const updates = require('./updates');
const lang = require('./lang');
const prefs = require('./prefs');
const { tx } = lang;

const SRC = path.join(__dirname, '..', 'src');
const REPO_URL = 'https://github.com/BERIKKKK/mura-gis';
const UA = 'MuraGIS/' + app.getVersion() + ' (+' + REPO_URL + ')';

protocol.registerSchemesAsPrivileged([
  { scheme: 'mura', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let win = null;
let store = null;
let marks = null;
let routes = null;
let places = null;
let plans = null;
let projects = null;
let sync = null;

/** Ашық жобаның қабаттарына қоймаларды байлау (жоба жоқ болса — бос тізім, жазу қате береді). */
function bindStores() {
  const p = projects.current;
  const t = name => (p ? p.table(name) : noTable);
  store = new Store(t('zones'));
  marks = new MarksStore(t('marks'), t('imports'));
  routes = new RoutesStore(t('routes'));
  places = new PlacesStore(t('places'));
  plans = new PlansStore(t('plan_objects'), t('plans'));
  if (p) { p.setAutosave(autosave()); p.onChange = sendDirty; }
  if (win) win.setTitle(p ? (projects.info().current.name + ' — Mura GIS') : 'Mura GIS');
  buildMenu();
}

ipcMain.on('mura:version', e => { e.returnValue = app.getVersion(); });
ipcMain.on('mura:lang', e => { e.returnValue = lang.get(); });
/** Интерфейс тілін ауыстыру («Баптаулар» терезесінен): баптау сақталады, мәзір қайта құрылады; бетті беттің өзі қайта жүктейді. */
ipcMain.handle('mura:set-lang', (e, v) => {
  if (!fromApp(e) || !lang.LANGS.includes(v)) return { ok: false };
  lang.set(v);
  buildMenu();
  return { ok: true, lang: lang.get() };
});
/* ---------- Жобаны сақтау: авто сақтау (баптау) не «Сақтау» батырмасы / Ctrl+S ---------- */
const autosave = () => prefs.get('autosave', true) !== false;
const isDirty = () => !!(projects && projects.current && projects.current.dirty());
function sendDirty() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('mura:dirty', isDirty());
  if (process.platform === 'darwin') win.setDocumentEdited(isDirty());
}
/** Сақталмаған өзгерістер болса (авто сақтау өшік): «Сақтау / Сақтамау / Бас тарту»; false — бас тартты. */
function confirmPending() {
  if (!isDirty()) return true;
  const p = projects.current, name = projects.info().current.name;
  const r = dialog.showMessageBoxSync(win, {
    type: 'warning', noLink: true, defaultId: 0, cancelId: 2,
    buttons: [tx('Сақтау', 'Сохранить'), tx('Сақтамау', 'Не сохранять'), tx('Бас тарту', 'Отмена')],
    title: 'Mura GIS', message: tx('«' + name + '» жобасында сақталмаған өзгерістер бар.', 'В проекте «' + name + '» есть несохранённые изменения.'),
    detail: tx('Сақтамасаңыз, соңғы сақтаудан кейінгі өзгерістер жоғалады.', 'Если не сохранить, изменения после последнего сохранения будут потеряны.'),
  });
  if (r === 2) return false;
  if (r === 0) p.save(); else p.discard();
  sendDirty();
  return true;
}
ipcMain.on('mura:prefs', e => { e.returnValue = { autosave: autosave() }; });
ipcMain.handle('mura:set-autosave', (e, v) => {
  if (!fromApp(e)) return { ok: false };
  prefs.set('autosave', !!v);
  if (projects && projects.current) projects.current.setAutosave(autosave());
  sendDirty();
  return { ok: true, autosave: autosave() };
});
ipcMain.handle('mura:project-save', e => {
  if (!fromApp(e)) return { ok: false, error: tx('Рұқсат жоқ', 'Нет доступа') };
  if (!projects || !projects.current) return { ok: false, error: tx('Жоба ашылмаған.', 'Проект не открыт.') };
  try { const saved = projects.current.save(); sendDirty(); if (sync) sync.localChanged(); return { ok: true, saved, autosave: autosave() }; }
  catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.on('mura:project-info', e => { e.returnValue = projects ? projects.info() : { current: null, recent: [], legacy: null }; });

/* Алмасу буфері (картаның оң жақ мәзірі: координатаны көшіру / қою) — тек бағдарламаның өз бетінен */
const fromApp = e => String(e.senderFrame && e.senderFrame.url || '').startsWith('mura://app/');
ipcMain.handle('mura:clip-read', e => (fromApp(e) ? clipboard.readText() : ''));
ipcMain.handle('mura:clip-write', (e, text) => { if (fromApp(e) && typeof text === 'string' && text.length < 1e6) clipboard.writeText(text); });

/* Ескерткіштер тізімін PDF-ке айналдыру: бет дайын HTML-ді жібереді, ол жасырын терезеде (JavaScript-сіз)
   ашылып, Chromium-ның өз баспа қозғалтқышымен A4 PDF болады. Файлды сақтау — беттің өзінде (жүктеу терезесі). */
ipcMain.handle('mura:pdf', async (e, html, opts) => {
  if (!String(e.senderFrame && e.senderFrame.url || '').startsWith('mura://app/')) throw new Error(tx('Рұқсат жоқ', 'Нет доступа'));
  if (typeof html !== 'string' || html.length > 20e6) throw new Error(tx('Құжат тым үлкен', 'Документ слишком большой'));
  const tmp = path.join(app.getPath('temp'), 'mura-pdf-' + process.pid + '-' + Date.now() + '.html');
  fs.writeFileSync(tmp, html);
  const w = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true, spellcheck: false } });
  try {
    await w.loadFile(tmp);
    // «Жоспар» сызбалары: беттің өрісі мен колонтитулы жоқ, өлшемі — CSS @page (A4), масштабы 1:1 сақталады
    if (opts && opts.exact) {
      return await w.webContents.printToPDF({
        pageSize: 'A4', printBackground: true, preferCSSPageSize: true, scale: 1,
        margins: { top: 0, bottom: 0, left: 0, right: 0 }, displayHeaderFooter: false,
      });
    }
    return await w.webContents.printToPDF({
      pageSize: 'A4', printBackground: true, preferCSSPageSize: true,
      displayHeaderFooter: true, headerTemplate: '<span></span>',
      footerTemplate: '<div style="width:100%;text-align:center;font:9px Times New Roman,serif;color:#444"><span class="pageNumber"></span></div>',
    });
  } finally {
    w.destroy();
    fs.rm(tmp, { force: true }, () => {});
  }
});

/* ---------- Жобалар: бастапқы терезе мен баптаулардан ---------- */
const ok = o => ({ ok: true, ...o });
const fail = e => ({ ok: false, error: e && e.message || String(e) });
const guard = fn => async (e, ...a) => {
  if (!fromApp(e)) return fail(tx('Рұқсат жоқ', 'Нет доступа'));
  try { return await fn(...a); } catch (err) { return fail(err); }
};
/** Жоба мәліметтерін тексеру: атауы, облыс (тізімнен не бос), аудан (сол облыстікі не бос). */
function cleanMeta(m) {
  m = m && typeof m === 'object' ? m : {};
  const cut = (v, n) => [...String(v ?? '').trim()].slice(0, n).join('');
  const name = cut(m.name, 120);
  if (!name) throw new Error(tx('Жоба атауын енгізіңіз.', 'Введите название проекта.'));
  const r = findRegion(cut(m.oblast, 80));
  const oblast = r ? r.name : '';
  const district = r && r.units.includes(cut(m.district, 80)) ? cut(m.district, 80) : '';
  return { name, oblast, district };
}
function afterSwitch() {
  bindStores();
  if (win) win.webContents.reload();
  if (sync) sync.localChanged();
}
const safeName = s => String(s).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || tx('Жоба', 'Проект');

async function newProject(meta, opts) {
  const m = cleanMeta(meta);
  const r = await dialog.showSaveDialog(win, {
    title: tx('Жаңа жобаны сақтау (GeoPackage)', 'Сохранить новый проект (GeoPackage)'),
    defaultPath: path.join(app.getPath('documents'), safeName(m.name) + '.gpkg'),
    filters: [{ name: 'GeoPackage', extensions: ['gpkg'] }],
  });
  if (r.canceled || !r.filePath) return ok({ canceled: true });
  if (!confirmPending()) return ok({ canceled: true });
  let file = r.filePath;
  if (!/\.gpkg$/i.test(file)) file += '.gpkg';
  if (projects.current && projects.current.file === path.resolve(file)) projects.close();   // ашық жобаның үстінен жазу
  projects.create(file, { ...m, app_version: app.getVersion() }, { importLegacy: !!(opts && opts.importLegacy) });
  afterSwitch();
  return ok({ path: file });
}
async function openProject(file) {
  if (!file) {
    const r = await dialog.showOpenDialog(win, {
      title: tx('Жобаны ашу', 'Открыть проект'), properties: ['openFile'],
      defaultPath: projects.current ? path.dirname(projects.current.file) : app.getPath('documents'),
      filters: [{ name: tx('Mura GIS жобасы (GeoPackage)', 'Проект Mura GIS (GeoPackage)'), extensions: ['gpkg'] }, { name: tx('Барлық файлдар', 'Все файлы'), extensions: ['*'] }],
    });
    if (r.canceled || !r.filePaths[0]) return ok({ canceled: true });
    file = r.filePaths[0];
  }
  file = path.resolve(String(file));
  if (projects.current && projects.current.file === file) return ok({ path: file, same: true });
  // Бөтен GeoPackage (Mura GIS жобасы емес): оның қабаттарын ашық жобаға импорттау ұсынылады — файлдың өзі өзгермейді
  if (fs.existsSync(file) && !gpkgRead.isMuraProject(file)) {
    const cur = !!projects.current;
    const r = await dialog.showMessageBox(win, {
      type: 'question', title: tx('Бөтен GeoPackage', 'Сторонний GeoPackage'),
      message: path.basename(file) + tx(' — Mura GIS жобасы емес.', ' — не проект Mura GIS.'),
      detail: cur
        ? tx('Оның қабаттарын (ескерткіштер, ескерткіш аумақтары, қорғау аймақтары, маршруттар) ашық «' + projects.info().current.name + '» жобасына импорттауға болады: атрибуттар сәйкестендіріледі, аймақтар заңнамаға сәйкестігі тексеріледі. Файлдың өзі өзгермейді.',
          'Его слои (памятники, территории памятников, охранные зоны, маршруты) можно импортировать в открытый проект «' + projects.info().current.name + '»: атрибуты будут сопоставлены, зоны проверены на соответствие законодательству. Сам файл не изменяется.')
        : tx('Деректерін алу үшін алдымен жаңа жоба құрып, «Файл → GeoPackage-тен импорттау» арқылы қабаттарын импорттаңыз (файлдың өзі өзгермейді). Не файлды жоба ретінде ашуға болады — оған Mura GIS қабаттары қосылады.',
          'Чтобы взять его данные, сначала создайте новый проект и импортируйте слои через «Файл → Импорт из GeoPackage» (сам файл не изменяется). Или откройте файл как проект — в него будут добавлены слои Mura GIS.'),
      buttons: cur ? [tx('Жобаға импорттау…', 'Импортировать в проект…'), tx('Жоба ретінде ашу', 'Открыть как проект'), tx('Бас тарту', 'Отмена')] : [tx('Жоба ретінде ашу', 'Открыть как проект'), tx('Бас тарту', 'Отмена')],
      defaultId: 0, cancelId: cur ? 2 : 1, noLink: true,
    });
    if (cur && r.response === 0) { ui('import-gpkg\n' + file); return ok({ canceled: true, importing: true }); }
    if (r.response !== (cur ? 1 : 0)) return ok({ canceled: true });
  }
  if (!confirmPending()) return ok({ canceled: true });
  projects.open(file);
  afterSwitch();
  return ok({ path: file });
}
/** GeoPackage импорты: файлды таңдау (берілмесе) және оқу — қабаттар, атрибуттар, WGS 84 геометриясы. */
ipcMain.handle('mura:gpkg-inspect', guard(async file => {
  if (!file) {
    const r = await dialog.showOpenDialog(win, {
      title: tx('GeoPackage-тен импорттау', 'Импорт из GeoPackage'), properties: ['openFile'],
      defaultPath: projects.current ? path.dirname(projects.current.file) : app.getPath('documents'),
      filters: [{ name: 'GeoPackage', extensions: ['gpkg'] }, { name: tx('Барлық файлдар', 'Все файлы'), extensions: ['*'] }],
    });
    if (r.canceled || !r.filePaths[0]) return ok({ canceled: true });
    file = r.filePaths[0];
  }
  file = path.resolve(String(file));
  if (projects.current && projects.current.file === file) throw new Error(tx('Бұл — ашық жобаның өз файлы.', 'Это файл самого открытого проекта.'));
  return ok({ data: gpkgRead.inspect(file) });
}));
ipcMain.handle('mura:project-new', guard((meta, opts) => newProject(meta, opts)));
ipcMain.handle('mura:project-open', guard(file => openProject(file)));
ipcMain.handle('mura:project-settings', guard(meta => {
  projects.updateMeta(cleanMeta(meta));
  afterSwitch();
  return ok();
}));
ipcMain.handle('mura:project-close', guard(() => { if (!confirmPending()) return ok({ canceled: true }); projects.close(); afterSwitch(); return ok(); }));
ipcMain.handle('mura:project-forget', guard(file => { projects.forget(file); buildMenu(); return ok({ recent: projects.recent() }); }));
ipcMain.handle('mura:project-reveal', guard(() => { if (projects.current) shell.showItemInFolder(projects.current.file); return ok(); }));

/** Мәзірден / бағдарламадан ашу (қате болса — хабар терезесі). */
async function openFromMenu(file) {
  const r = await guard(openProject)({ senderFrame: { url: 'mura://app/' } }, file);
  if (!r.ok) dialog.showErrorBox(tx('Жобаны ашу', 'Открыть проект'), r.error);
}
const ui = cmd => { if (win) win.webContents.send('mura:ui', cmd); };

function serveFile(urlPath) {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, '') || 'index.html';
  const file = path.normalize(path.join(SRC, rel));
  if (!file.startsWith(SRC + path.sep) || !fs.existsSync(file)) return new Response('Not found', { status: 404 });
  return net.fetch(pathToFileURL(file).toString());
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 820, minHeight: 540,
    title: 'Mura GIS',
    icon: path.join(SRC, 'img', 'icon.png'),
    backgroundColor: '#ebe5d8',
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: false },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  // Авто сақтау өшік болса — жабу алдында сақталмаған өзгерістер туралы сұраймыз
  win.on('close', e => { if (!confirmPending()) e.preventDefault(); });
  win.loadURL('mura://app/index.html');

  // Сыртқы сілтемелер — жүйенің браузерінде
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // Тінтуірдің оң жақ батырмасы: мәтін өрістерінде — Қию / Көшіру / Қою / Барлығын белгілеу, белгіленген мәтінде — Көшіру.
  // Картадағы мәзірді (координатаны көшіру, қою, осы жерге белгі…) беттің өзі көрсетеді (js/context-menu.js).
  win.webContents.on('context-menu', (_e, p) => {
    const f = p.editFlags || {};
    let tpl = null;
    if (p.isEditable) {
      tpl = [
        { label: tx('Қию', 'Вырезать'), role: 'cut', accelerator: 'CmdOrCtrl+X', enabled: !!f.canCut },
        { label: tx('Көшіру', 'Копировать'), role: 'copy', accelerator: 'CmdOrCtrl+C', enabled: !!f.canCopy },
        { label: tx('Қою', 'Вставить'), role: 'paste', accelerator: 'CmdOrCtrl+V', enabled: !!f.canPaste },
        { type: 'separator' },
        { label: tx('Барлығын белгілеу', 'Выделить всё'), role: 'selectAll', accelerator: 'CmdOrCtrl+A', enabled: !!f.canSelectAll },
      ];
    } else if (p.selectionText && p.selectionText.trim()) {
      tpl = [{ label: tx('Көшіру', 'Копировать'), role: 'copy', accelerator: 'CmdOrCtrl+C' }];
    }
    if (tpl) Menu.buildFromTemplate(tpl).popup({ window: win });
  });
  // Тіл ауысқанда бет қайта жүктеледі; сақталмаған өзгерістер болса (beforeunload) — пайдаланушыдан сұраймыз
  win.webContents.on('will-prevent-unload', e => {
    const r = dialog.showMessageBoxSync(win, {
      type: 'warning', buttons: [tx('Қайта жүктеу', 'Перезагрузить'), tx('Бас тарту', 'Отмена')], defaultId: 1, cancelId: 1,
      message: tx('Сақталмаған өзгерістер бар.', 'Есть несохранённые изменения.'),
      detail: tx('Бет қайта жүктелсе, олар жоғалады.', 'При перезагрузке страницы они будут потеряны.'),
    });
    if (r === 0) e.preventDefault();
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('mura://app/')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });
}

function recentMenu() {
  const list = projects ? projects.recent().filter(x => x.exists) : [];
  if (!list.length) return [{ label: tx('Әзірге жоқ', 'Пока нет'), enabled: false }];
  return list.slice(0, 10).map((x, i) => ({ label: (i + 1) + '. ' + (x.name || path.basename(x.path)).replace(/&/g, '&&') + '  —  ' + x.path.replace(/&/g, '&&'), click: () => openFromMenu(x.path) }));
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const tpl = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: tx('Файл', 'Файл'),
      submenu: [
        { label: tx('Жаңа жоба…', 'Новый проект…'), accelerator: 'CmdOrCtrl+N', click: () => ui('new') },
        { label: tx('Жобаны ашу…', 'Открыть проект…'), accelerator: 'CmdOrCtrl+O', click: () => openFromMenu() },
        { label: tx('Соңғы жобалар', 'Последние проекты'), submenu: recentMenu() },
        { label: tx('Бастапқы терезе', 'Начальное окно'), click: () => ui('start') },
        { type: 'separator' },
        { label: tx('Жобаны сақтау', 'Сохранить проект'), accelerator: 'CmdOrCtrl+S', enabled: !!(projects && projects.current), click: () => ui('save') },
        { type: 'separator' },
        // Баптаулар жоба ашылмаса да қолжетімді: интерфейс тілі жобаға байланысты емес
        { label: tx('Баптаулар…', 'Настройки…'), accelerator: 'CmdOrCtrl+,', click: () => ui('settings') },
        { label: tx('Жоба қалтасын ашу', 'Открыть папку проекта'), enabled: !!(projects && projects.current), click: () => shell.showItemInFolder(projects.current.file) },
        { label: tx('Жобаны жабу', 'Закрыть проект'), enabled: !!(projects && projects.current), click: () => { if (!confirmPending()) return; projects.close(); afterSwitch(); } },
        { type: 'separator' },
        { label: tx('GeoPackage-тен импорттау…', 'Импорт из GeoPackage…'), accelerator: 'CmdOrCtrl+I', enabled: !!(projects && projects.current), click: () => ui('import-gpkg') },
        { label: tx('Сақталған аймақтарды файлға экспорттау…', 'Экспортировать сохранённые зоны в файл…'), enabled: !!(projects && projects.current), click: exportStore },
        { label: tx('Сақталған аймақтарды файлдан импорттау…', 'Импортировать сохранённые зоны из файла…'), enabled: !!(projects && projects.current), click: importStore },
        { type: 'separator' },
        isMac ? { role: 'close', label: tx('Жабу', 'Закрыть') } : { role: 'quit', label: tx('Шығу', 'Выход') },
      ],
    },
    {
      label: tx('Түзету', 'Правка'),
      submenu: [
        { role: 'undo', label: tx('Болдырмау', 'Отменить') }, { role: 'redo', label: tx('Қайталау', 'Повторить') }, { type: 'separator' },
        { role: 'cut', label: tx('Қию', 'Вырезать') }, { role: 'copy', label: tx('Көшіру', 'Копировать') }, { role: 'paste', label: tx('Қою', 'Вставить') }, { role: 'selectAll', label: tx('Барлығын белгілеу', 'Выделить всё') },
      ],
    },
    {
      label: tx('Көрініс', 'Вид'),
      submenu: [
        { role: 'reload', label: tx('Қайта жүктеу', 'Перезагрузить') },
        { type: 'separator' },
        { role: 'resetZoom', label: tx('Қалыпты өлшем', 'Обычный размер') }, { role: 'zoomIn', label: tx('Үлкейту', 'Увеличить') }, { role: 'zoomOut', label: tx('Кішірейту', 'Уменьшить') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: tx('Толық экран', 'Полноэкранный режим') },
        { role: 'toggleDevTools', label: tx('Әзірлеуші құралдары', 'Инструменты разработчика') },
      ],
    },
    {
      label: tx('Анықтама', 'Справка'),
      submenu: [
        { label: tx('Жаңартуларды тексеру', 'Проверить обновления'), click: () => updates.check(win, { manual: true }) },
        { label: tx('Барлық нұсқалар (GitHub)', 'Все версии (GitHub)'), click: () => shell.openExternal(REPO_URL + '/releases') },
        { type: 'separator' },
        { label: tx('Mura GIS туралы', 'О программе Mura GIS'), click: about },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

function about() {
  if (lang.get() === 'ru') return aboutRu();
  dialog.showMessageBox(win, {
    type: 'info', title: 'Mura GIS туралы', buttons: ['Жабу', 'GitHub беті', 'Заң (Әділет)'], cancelId: 0,
    message: 'Mura GIS ' + app.getVersion() + ' — тарихи-мәдени мұра объектілеріне арналған ГАЖ бағдарламасы',
    detail:
      'Мүмкіндіктері:\n' +
      '• ескерткіштерді картада белгілеу: атауы, орналасқан жері, түрі, санаты, мәртебесі; ескерткіштер тізімі (DOCX, PDF), GeoJSON;\n' +
      '• қорғау аймағын, құрылыс салуды реттеу аймағын және қорғалатын табиғи ландшафт аймағын есептеу, сызба мен құжат (DOCX, PNG, GeoJSON);\n' +
      '• Қазақстанның барлық облыстары, республикалық маңызы бар қалалары және аудандары; өлшеу құралдары, карта қабаттары.\n\n' +
      'Қолданылған нормативтік құқықтық актілер:\n' +
      '• ҚР «Тарихи-мәдени мұра объектілерін қорғау және пайдалану туралы» Заңы, 2019 жылғы 26 желтоқсан, № 288-VI ҚРЗ — ' +
      'ескерткіштердің түрлері (5-бап), санаттары (6-бап), мәртебесі (3–5-баптар), Мемлекеттік тізімдегі деректер (3-бап);\n' +
      '• ҚР Мәдениет және спорт министрінің 2020 жылғы 14 сәуірдегі № 86 бұйрығы — қорғау аймақтарының, құрылыс салуды ' +
      'реттеу аймақтарының және қорғалатын табиғи ландшафт аймақтарының шекаралары (7–9-тармақтар);\n' +
      '• ескерткіштер тізімі кестесінің үлгісі — облыс әкімдігінің жергілікті маңызы бар тарих және мәдениет ескерткіштерінің ' +
      'мемлекеттік тізімін бекіту туралы қаулысына қосымша (мыс. Түркістан облысы әкімдігінің 2020 ж. 17 қыркүйектегі № 188 қаулысы).\n\n' +
      (projects.current ? 'Ашық жоба: ' + projects.current.file + '\n' : '') +
      'Иконкалар: Lucide (lucide.dev), ISC лицензиясы.\n' +
      'Баптаулар қалтасы: ' + projects.dir + '\n' +
      'Electron ' + process.versions.electron,
  }).then(r => {
    if (r.response === 1) shell.openExternal(REPO_URL);
    if (r.response === 2) shell.openExternal('https://adilet.zan.kz/kaz/docs/Z1900000288');
  });
}

function aboutRu() {
  dialog.showMessageBox(win, {
    type: 'info', title: 'О программе Mura GIS', buttons: ['Закрыть', 'Страница GitHub', 'Закон (Әділет)'], cancelId: 0,
    message: 'Mura GIS ' + app.getVersion() + ' — ГИС для объектов историко-культурного наследия',
    detail:
      'Возможности:\n' +
      '• нанесение памятников на карту: наименование, местонахождение, вид, категория, статус; список памятников (DOCX, PDF), GeoJSON;\n' +
      '• расчёт охранной зоны, зоны регулирования застройки и зоны охраняемого природного ландшафта, схема и документ (DOCX, PNG, GeoJSON);\n' +
      '• все области, города республиканского значения и районы Казахстана; измерительные инструменты, слои карты.\n\n' +
      'Применённые нормативные правовые акты:\n' +
      '• Закон Республики Казахстан от 26 декабря 2019 года № 288-VI ЗРК «Об охране и использовании объектов историко-культурного наследия» — ' +
      'виды памятников (статья 5), категории (статья 6), основные понятия и Государственный список памятников истории и культуры (статья 3);\n' +
      '• приказ Министра культуры и спорта Республики Казахстан от 14 апреля 2020 года № 86 «Об утверждении Правил определения охранной зоны, ' +
      'зоны регулирования застройки и зоны охраняемого природного ландшафта памятника истории и культуры и режима их использования» (пункты 7–9);\n' +
      '• образец текста приложений о границах зон — постановление акимата Актюбинской области от 19 марта 2024 года № 66;\n' +
      '• образец таблицы списка памятников — приложение к постановлению акимата Туркестанской области от 17 сентября 2020 года № 188 ' +
      '«Об утверждении Государственного списка памятников истории и культуры местного значения Туркестанской области».\n\n' +
      (projects.current ? 'Открытый проект: ' + projects.current.file + '\n' : '') +
      'Иконки: Lucide (lucide.dev), лицензия ISC.\n' +
      'Папка настроек: ' + projects.dir + '\n' +
      'Electron ' + process.versions.electron,
  }).then(r => {
    if (r.response === 1) shell.openExternal(REPO_URL);
    if (r.response === 2) shell.openExternal('https://adilet.zan.kz/rus/docs/Z1900000288');
  });
}

async function exportStore() {
  const r = await dialog.showSaveDialog(win, {
    title: tx('Сақталған аймақтарды экспорттау', 'Экспорт сохранённых зон'),
    defaultPath: path.join(app.getPath('documents'), tx('Mura_GIS_қорғау_аймақтары_', 'Mura_GIS_охранные_зоны_') + new Date().toISOString().slice(0, 10) + '.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePath) return;
  try { fs.writeFileSync(r.filePath, store.exportJson()); dialog.showMessageBox(win, { type: 'info', message: tx('Экспортталды: ', 'Экспортировано: ') + r.filePath }); }
  catch (e) { dialog.showErrorBox(tx('Экспорт', 'Экспорт'), e.message); }
}

async function importStore() {
  const r = await dialog.showOpenDialog(win, { title: tx('Сақталған аймақтарды импорттау', 'Импорт сохранённых зон'), properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return;
  try {
    const { added, updated } = store.importFrom(fs.readFileSync(r.filePaths[0], 'utf8'));
    await dialog.showMessageBox(win, { type: 'info', message: tx('Импортталды: жаңа — ' + added + ', жаңартылған — ' + updated + '.', 'Импортировано: новых — ' + added + ', обновлённых — ' + updated + '.'), detail: tx('Тізім жаңарту үшін бет қайта жүктеледі.', 'Страница будет перезагружена для обновления списка.') });
    win.webContents.reload();
  } catch (e) { dialog.showErrorBox(tx('Импорт', 'Импорт'), e.message); }
}

/* ---------- Синхрондау (Баптаулар → Синхрондау; main/sync/) ---------- */
const MUTATING = new Set(['save', 'delete', 'import', 'patch']);
function oauthConfig() {
  let j = {};
  try { j = JSON.parse(fs.readFileSync(path.join(__dirname, 'sync', 'google-oauth.json'), 'utf8')) || {}; } catch (e) { j = {}; }
  return { google: { clientId: process.env.MURA_GOOGLE_CLIENT_ID || j.clientId || '', clientSecret: process.env.MURA_GOOGLE_CLIENT_SECRET || j.clientSecret || '' } };
}
/** Google-дан қайтқанда браузерде көрсетілетін бет. */
const authPage = good => '<!doctype html><meta charset="utf-8"><title>Mura GIS</title><body style="font:16px system-ui,sans-serif;background:#ebe5d8;color:#2b2b2b;display:grid;place-items:center;height:90vh">' +
  '<div style="max-width:30em;text-align:center"><h2>Mura GIS</h2><p>' + (good
    ? tx('Google аккаунты қосылды. Бұл бетті жауып, бағдарламаға оралыңыз.', 'Аккаунт Google подключён. Закройте эту страницу и вернитесь в программу.')
    : tx('Кіру аяқталмады. Бағдарламаға оралып, қайталап көріңіз.', 'Вход не завершён. Вернитесь в программу и попробуйте снова.')) + '</p></div>';
function createSync() {
  return new SyncManager({
    dir: path.join(app.getPath('userData'), 'sync'), projects, Project, prefs, config: oauthConfig(), authPage,
    crypt: { available: () => safeStorage.isAsyncEncryptionAvailable(), encrypt: s => safeStorage.encryptStringAsync(s), decrypt: b => safeStorage.decryptStringAsync(b).then(r => r.result) },
    http: (url, o) => net.fetch(url, o), online: () => net.isOnline(), openExternal: url => shell.openExternal(url),
    device: { name: os.hostname(), platform: 'desktop-' + process.platform, app: 'Mura GIS ' + app.getVersion() },
    onStatus: st => { if (win && !win.isDestroyed()) win.webContents.send('mura:sync', st); },
    onApplied: () => {
      if (!win || win.isDestroyed()) return;
      win.webContents.send('mura:sync-applied');
      if (projects.current) win.setTitle(projects.info().current.name + ' — Mura GIS');
    },
  });
}
const syncCall = fn => guard(async (...a) => { await fn(...a); return ok({ status: sync.status() }); });
ipcMain.handle('mura:sync-status', guard(() => ok({ status: sync.status() })));
ipcMain.handle('mura:sync-connect', guard(async () => {
  try { return ok({ status: await sync.connect() }); } catch (e) { return { ok: false, code: e.code || '', error: e.message, status: sync.status() }; }
}));
ipcMain.handle('mura:sync-cancel', guard(() => { sync.cancelConnect(); return ok(); }));
ipcMain.handle('mura:sync-disconnect', syncCall(() => sync.disconnect()));
ipcMain.handle('mura:sync-now', syncCall(() => sync.syncAll('manual')));
ipcMain.handle('mura:sync-link', syncCall(() => sync.linkCurrent()));
ipcMain.handle('mura:sync-unlink', syncCall(pid => sync.unlink(String(pid || ''))));
ipcMain.handle('mura:sync-resolve', syncCall((pid, key, choice) => sync.resolve(String(pid || ''), String(key || ''), choice === 'remote' ? 'remote' : 'local')));
/** Бұлттағы жобаны компьютерге алу: файл орнын таңдау, жаңа жоба құрып синхрондау, ашу. */
ipcMain.handle('mura:sync-download', guard(async pid => {
  const c = sync.status().cloud.find(x => x.id === pid);
  if (!c) throw new Error(tx('Жоба бұлтта табылмады.', 'Проект не найден в облаке.'));
  const r = await dialog.showSaveDialog(win, {
    title: tx('Бұлттағы жобаны осы компьютерге сақтау (GeoPackage)', 'Сохранить проект из облака на этот компьютер (GeoPackage)'),
    defaultPath: path.join(app.getPath('documents'), safeName(c.name || tx('Жоба', 'Проект')) + '.gpkg'),
    filters: [{ name: 'GeoPackage', extensions: ['gpkg'] }],
  });
  if (r.canceled || !r.filePath) return ok({ canceled: true });
  let file = r.filePath;
  if (!/\.gpkg$/i.test(file)) file += '.gpkg';
  if (projects.current && projects.current.file === path.resolve(file)) throw new Error(tx('Бұл — ашық жобаның файлы. Басқа атау таңдаңыз.', 'Это файл открытого проекта. Выберите другое имя.'));
  if (!confirmPending()) return ok({ canceled: true });
  const f = await sync.download(pid, file);
  projects.open(f);
  afterSwitch();
  return ok({ path: f });
}));
ipcMain.handle('mura:sync-open', guard(async pid => {
  const x = sync.status().projects.find(p => p.id === pid);
  if (!x || !x.exists) throw new Error(tx('Жоба файлы табылмады.', 'Файл проекта не найден.'));
  return openProject(x.path);
}));
/** Жоба файлы жылжытылса — жаңа орнын көрсету. */
ipcMain.handle('mura:sync-relink', guard(async pid => {
  const r = await dialog.showOpenDialog(win, { title: tx('Жоба файлының жаңа орны', 'Новое расположение файла проекта'), properties: ['openFile'], filters: [{ name: 'GeoPackage', extensions: ['gpkg'] }] });
  if (r.canceled || !r.filePaths[0]) return ok({ canceled: true });
  try { return ok({ status: sync.relink(String(pid || ''), r.filePaths[0]) }); }
  catch (e) { throw new Error(e.code === 'mismatch' ? tx('Бұл файл — басқа жоба.', 'Этот файл — другой проект.') : e.message); }
}));

/** Командалық жолда берілген .gpkg файлы (жобаны «Ашу» арқылы не файлды бағдарламаға сүйреп әкелгенде). */
const argProject = argv => argv.slice(1).find(a => /\.gpkg$/i.test(a) && fs.existsSync(a)) || '';

app.on('second-instance', (_e, argv) => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  const f = argProject(argv);
  if (f) openFromMenu(f);
});

app.whenReady().then(() => {
  // Тіл: баптау → орнатқышта таңдалғаны → жүйе тілі (main/lang.js)
  lang.init(app.getPath('userData'), { installFile: app.isPackaged ? path.join(process.resourcesPath, 'install-lang.txt') : '', locale: app.getLocale() });
  prefs.init(app.getPath('userData'));
  projects = new Projects(path.join(app.getPath('userData'), 'data'));
  // Бағдарлама бастапқы терезеден басталады; .gpkg файлы берілсе (не MURA_PROJECT — тесттер үшін), бірден сол ашылады
  const startFile = argProject(process.argv) || process.env.MURA_PROJECT || '';
  if (startFile) {
    try {
      if (fs.existsSync(startFile)) projects.open(startFile);
      else projects.create(startFile, { name: path.basename(startFile, '.gpkg'), oblast: process.env.MURA_OBLAST || '', district: process.env.MURA_DISTRICT || '', app_version: app.getVersion() });
    } catch (e) { console.error(tx('Жоба ашылмады:', 'Проект не открыт:'), e.message); }
  }
  bindStores();
  sync = createSync();

  protocol.handle('mura', req => {
    const u = new URL(req.url);
    if (u.host !== 'app') return new Response('Not found', { status: 404 });
    if (u.pathname === '/api') return store.handle(req);
    // Ескерткіш не маршрут өзгерсе — синхрондау кезегі (желі болса, біраздан кейін жіберіледі)
    if (u.pathname === '/marks') return marks.handle(req).then(r => { if (MUTATING.has(u.searchParams.get('op'))) sync.localChanged(); return r; });
    if (u.pathname === '/routes') return routes.handle(req).then(r => { if (MUTATING.has(u.searchParams.get('op'))) sync.localChanged(); return r; });
    if (u.pathname === '/places') return places.handle(req);
    if (u.pathname === '/plans') return plans.handle(req);
    return serveFile(u.pathname);
  });

  // OpenStreetMap / OpenTopoMap / nakarte.me тайл саясаты: бағдарламаны анықтайтын User-Agent
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://*.tile.openstreetmap.org/*', 'https://tile.openstreetmap.org/*', 'https://*.tile.opentopomap.org/*', 'https://tiles.nakarte.me/*', 'https://*.tiles.nakarte.me/*'] }, (d, cb) => {
    d.requestHeaders['User-Agent'] = UA;
    cb({ requestHeaders: d.requestHeaders });
  });

  // Жүктелетін файлдар (GeoJSON, DOCX, PNG, ZIP) — әрдайым «Сақтау» терезесі
  session.defaultSession.on('will-download', (e, item) => {
    item.setSaveDialogOptions({ title: tx('Файлды сақтау', 'Сохранить файл'), defaultPath: path.join(app.getPath('documents'), item.getFilename()) });
  });

  // Тек геолокация т.б. рұқсаттары керек емес; толық экран — рұқсат
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'fullscreen' || perm === 'clipboard-sanitized-write'));

  createWindow();
  bindStores();
  setTimeout(() => updates.check(win, { manual: false }), 4000);
  // Аккаунт қосылған болса — синхрондау жұмыс кезінде жалғасады (желі қалпына келгенде де)
  if (sync.account) { sync.start(); setTimeout(() => sync.syncAll('start').catch(() => {}), 6000); }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => { if (sync) sync.stop(); if (projects) projects.close(); });   // жоба файлы (SQLite) дұрыс жабылады
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
