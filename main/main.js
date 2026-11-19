/* Mura GIS — негізгі процесс.
   Интерфейс src/ ішінен mura://app/ мекенжайымен беріледі (тұрақты origin: localStorage, fetch, CORS дұрыс жұмыс істейді).
   mura://app/api — сақталған аймақтар (main/store.js); mura://app/marks — ескерткіш белгілері (main/marks.js). Файлдарды жүктеу (GeoJSON, DOCX, PNG) — «Сақтау» терезесі арқылы. */
const { app, BrowserWindow, Menu, protocol, net, session, shell, dialog, ipcMain, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { Store } = require('./store');
const { MarksStore } = require('./marks');
const updates = require('./updates');

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

ipcMain.on('mura:version', e => { e.returnValue = app.getVersion(); });

/* Алмасу буфері (картаның оң жақ мәзірі: координатаны көшіру / қою) — тек бағдарламаның өз бетінен */
const fromApp = e => String(e.senderFrame && e.senderFrame.url || '').startsWith('mura://app/');
ipcMain.handle('mura:clip-read', e => (fromApp(e) ? clipboard.readText() : ''));
ipcMain.handle('mura:clip-write', (e, text) => { if (fromApp(e) && typeof text === 'string' && text.length < 1e6) clipboard.writeText(text); });

/* Ескерткіштер тізімін PDF-ке айналдыру: бет дайын HTML-ді жібереді, ол жасырын терезеде (JavaScript-сіз)
   ашылып, Chromium-ның өз баспа қозғалтқышымен A4 PDF болады. Файлды сақтау — беттің өзінде (жүктеу терезесі). */
ipcMain.handle('mura:pdf', async (e, html) => {
  if (!String(e.senderFrame && e.senderFrame.url || '').startsWith('mura://app/')) throw new Error('Рұқсат жоқ');
  if (typeof html !== 'string' || html.length > 20e6) throw new Error('Құжат тым үлкен');
  const tmp = path.join(app.getPath('temp'), 'mura-pdf-' + process.pid + '-' + Date.now() + '.html');
  fs.writeFileSync(tmp, html);
  const w = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true, spellcheck: false } });
  try {
    await w.loadFile(tmp);
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
        { label: 'Қию', role: 'cut', accelerator: 'CmdOrCtrl+X', enabled: !!f.canCut },
        { label: 'Көшіру', role: 'copy', accelerator: 'CmdOrCtrl+C', enabled: !!f.canCopy },
        { label: 'Қою', role: 'paste', accelerator: 'CmdOrCtrl+V', enabled: !!f.canPaste },
        { type: 'separator' },
        { label: 'Барлығын белгілеу', role: 'selectAll', accelerator: 'CmdOrCtrl+A', enabled: !!f.canSelectAll },
      ];
    } else if (p.selectionText && p.selectionText.trim()) {
      tpl = [{ label: 'Көшіру', role: 'copy', accelerator: 'CmdOrCtrl+C' }];
    }
    if (tpl) Menu.buildFromTemplate(tpl).popup({ window: win });
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('mura://app/')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const tpl = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'Файл',
      submenu: [
        { label: 'Сақталған аймақтарды файлға экспорттау…', click: exportStore },
        { label: 'Сақталған аймақтарды файлдан импорттау…', click: importStore },
        { type: 'separator' },
        { label: 'Деректер қалтасын ашу', click: () => shell.openPath(store.dir) },
        { type: 'separator' },
        isMac ? { role: 'close', label: 'Жабу' } : { role: 'quit', label: 'Шығу' },
      ],
    },
    {
      label: 'Түзету',
      submenu: [
        { role: 'undo', label: 'Болдырмау' }, { role: 'redo', label: 'Қайталау' }, { type: 'separator' },
        { role: 'cut', label: 'Қию' }, { role: 'copy', label: 'Көшіру' }, { role: 'paste', label: 'Қою' }, { role: 'selectAll', label: 'Барлығын белгілеу' },
      ],
    },
    {
      label: 'Көрініс',
      submenu: [
        { role: 'reload', label: 'Қайта жүктеу' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Қалыпты өлшем' }, { role: 'zoomIn', label: 'Үлкейту' }, { role: 'zoomOut', label: 'Кішірейту' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Толық экран' },
        { role: 'toggleDevTools', label: 'Әзірлеуші құралдары' },
      ],
    },
    {
      label: 'Анықтама',
      submenu: [
        { label: 'Жаңартуларды тексеру', click: () => updates.check(win, { manual: true }) },
        { label: 'Барлық нұсқалар (GitHub)', click: () => shell.openExternal(REPO_URL + '/releases') },
        { type: 'separator' },
        { label: 'Mura GIS туралы', click: about },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

function about() {
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
      'Деректер қалтасы: ' + store.dir + '\n' +
      'Electron ' + process.versions.electron,
  }).then(r => {
    if (r.response === 1) shell.openExternal(REPO_URL);
    if (r.response === 2) shell.openExternal('https://adilet.zan.kz/kaz/docs/Z1900000288');
  });
}

async function exportStore() {
  const r = await dialog.showSaveDialog(win, {
    title: 'Сақталған аймақтарды экспорттау',
    defaultPath: path.join(app.getPath('documents'), 'mura-gis-qorgau-' + new Date().toISOString().slice(0, 10) + '.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePath) return;
  try { store.exportTo(r.filePath); dialog.showMessageBox(win, { type: 'info', message: 'Экспортталды: ' + r.filePath }); }
  catch (e) { dialog.showErrorBox('Экспорт', e.message); }
}

async function importStore() {
  const r = await dialog.showOpenDialog(win, { title: 'Сақталған аймақтарды импорттау', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return;
  try {
    const { added, updated } = store.importFrom(r.filePaths[0]);
    await dialog.showMessageBox(win, { type: 'info', message: 'Импортталды: жаңа — ' + added + ', жаңартылған — ' + updated + '.', detail: 'Тізім жаңарту үшін бет қайта жүктеледі.' });
    win.webContents.reload();
  } catch (e) { dialog.showErrorBox('Импорт', e.message); }
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(() => {
  store = new Store(path.join(app.getPath('userData'), 'data'));
  marks = new MarksStore(store.dir);
  try { store.seedSample(); } catch (e) { console.error('Үлгі жазба қосылмады:', e.message); }

  protocol.handle('mura', req => {
    const u = new URL(req.url);
    if (u.host !== 'app') return new Response('Not found', { status: 404 });
    if (u.pathname === '/api') return store.handle(req);
    if (u.pathname === '/marks') return marks.handle(req);
    return serveFile(u.pathname);
  });

  // OpenStreetMap / OpenTopoMap / nakarte.me тайл саясаты: бағдарламаны анықтайтын User-Agent
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://*.tile.openstreetmap.org/*', 'https://tile.openstreetmap.org/*', 'https://*.tile.opentopomap.org/*', 'https://tiles.nakarte.me/*', 'https://*.tiles.nakarte.me/*'] }, (d, cb) => {
    d.requestHeaders['User-Agent'] = UA;
    cb({ requestHeaders: d.requestHeaders });
  });

  // Жүктелетін файлдар (GeoJSON, DOCX, PNG, ZIP) — әрдайым «Сақтау» терезесі
  session.defaultSession.on('will-download', (e, item) => {
    item.setSaveDialogOptions({ title: 'Файлды сақтау', defaultPath: path.join(app.getPath('documents'), item.getFilename()) });
  });

  // Тек геолокация т.б. рұқсаттары керек емес; толық экран — рұқсат
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'fullscreen' || perm === 'clipboard-sanitized-write'));

  buildMenu();
  createWindow();
  setTimeout(() => updates.check(win, { manual: false }), 4000);
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
