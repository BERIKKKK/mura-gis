/* Жаңартулар: GitHub Releases (BERIKKKK/mura-gis).
   • Windows орнатқышы (NSIS) және Linux AppImage — electron-updater: жаңа нұсқа фонда жүктеліп, қайта іске қосқанда орнатылады.
   • Portable .exe, .deb және әзірлеу режимі — тек тексеріп, жүктеу бетін ашуды ұсынады. */
const { app, dialog, shell, net } = require('electron');
const { tx } = require('./lang');

const REPO = 'BERIKKKK/mura-gis';
const RELEASES = 'https://github.com/' + REPO + '/releases';

const isPortable = !!process.env.PORTABLE_EXECUTABLE_DIR;
const canAuto = app.isPackaged && !isPortable && (process.platform === 'win32' || !!process.env.APPIMAGE);

let busy = false;
let autoUpdater = null;

function cmp(a, b) {
  const pa = String(a).replace(/^v/, '').split(/[.-]/).map(n => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/, '').split(/[.-]/).map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
}

async function manualCheck(win, manual) {
  const r = await net.fetch('https://api.github.com/repos/' + REPO + '/releases/latest', { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'MuraGIS/' + app.getVersion() } });
  if (r.status === 404) { if (manual) dialog.showMessageBox(win, { type: 'info', message: tx('Әзірге жарияланған нұсқа жоқ.', 'Опубликованных версий пока нет.') }); return; }
  if (!r.ok) throw new Error(tx('GitHub жауабы: ', 'Ответ GitHub: ') + r.status);
  const j = await r.json();
  const latest = String(j.tag_name || '').replace(/^v/, '');
  if (latest && cmp(latest, app.getVersion()) > 0) {
    const res = await dialog.showMessageBox(win, {
      type: 'info', title: tx('Жаңа нұсқа', 'Новая версия'), buttons: [tx('Жүктеу бетін ашу', 'Открыть страницу загрузки'), tx('Кейін', 'Позже')], defaultId: 0, cancelId: 1,
      message: tx('Mura GIS ' + latest + ' нұсқасы шықты (қазіргісі — ' + app.getVersion() + ').', 'Вышла версия Mura GIS ' + latest + ' (текущая — ' + app.getVersion() + ').'),
      detail: (j.body || '').slice(0, 1200),
    });
    if (res.response === 0) shell.openExternal(j.html_url || RELEASES);
  } else if (manual) {
    dialog.showMessageBox(win, { type: 'info', message: tx('Сізде соңғы нұсқа орнатылған (' + app.getVersion() + ').', 'У вас установлена последняя версия (' + app.getVersion() + ').') });
  }
}

function initAuto(win) {
  if (autoUpdater) return autoUpdater;
  autoUpdater = require('electron-updater').autoUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', async info => {
    const res = await dialog.showMessageBox(win, {
      type: 'info', title: tx('Жаңарту дайын', 'Обновление готово'), buttons: [tx('Қазір қайта іске қосу', 'Перезапустить сейчас'), tx('Кейін (жабылғанда орнатылады)', 'Позже (установится при закрытии)')], defaultId: 0, cancelId: 1,
      message: tx('Mura GIS ' + info.version + ' жүктелді.', 'Mura GIS ' + info.version + ' загружена.'),
      detail: tx('Сақталмаған өзгерістер болса, алдымен «Сақтау» батырмасын басыңыз.', 'Если есть несохранённые изменения, сначала нажмите «Сохранить».'),
    });
    if (res.response === 0) setImmediate(() => autoUpdater.quitAndInstall());
  });
  return autoUpdater;
}

async function check(win, { manual }) {
  if (busy) return;
  busy = true;
  try {
    if (canAuto) {
      const u = initAuto(win);
      const r = await u.checkForUpdates();
      const v = r && r.updateInfo && r.updateInfo.version;
      if (manual) {
        if (v && cmp(v, app.getVersion()) > 0) dialog.showMessageBox(win, { type: 'info', message: tx('Mura GIS ' + v + ' нұсқасы жүктелуде. Дайын болғанда хабарлаймыз.', 'Загружается версия Mura GIS ' + v + '. Сообщим, когда она будет готова.') });
        else dialog.showMessageBox(win, { type: 'info', message: tx('Сізде соңғы нұсқа орнатылған (' + app.getVersion() + ').', 'У вас установлена последняя версия (' + app.getVersion() + ').') });
      }
    } else {
      await manualCheck(win, manual);
    }
  } catch (e) {
    if (manual) dialog.showMessageBox(win, { type: 'warning', message: tx('Жаңартуды тексеру мүмкін болмады.', 'Не удалось проверить обновления.'), detail: (e && e.message) || String(e), buttons: [tx('Жабу', 'Закрыть'), tx('Нұсқалар беті', 'Страница версий')], cancelId: 0 })
      .then(r => { if (r.response === 1) shell.openExternal(RELEASES); });
  } finally {
    busy = false;
  }
}

module.exports = { check };
