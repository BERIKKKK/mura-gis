/* Жаңартулар: GitHub Releases (BERIKKKK/mura-gis).
   • Windows орнатқышы (NSIS) және Linux AppImage — electron-updater: жаңа нұсқа фонда жүктеліп, қайта іске қосқанда орнатылады.
   • Portable .exe, .deb және әзірлеу режимі — тек тексеріп, жүктеу бетін ашуды ұсынады. */
const { app, dialog, shell, net } = require('electron');

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
  if (r.status === 404) { if (manual) dialog.showMessageBox(win, { type: 'info', message: 'Әзірге жарияланған нұсқа жоқ.' }); return; }
  if (!r.ok) throw new Error('GitHub жауабы: ' + r.status);
  const j = await r.json();
  const latest = String(j.tag_name || '').replace(/^v/, '');
  if (latest && cmp(latest, app.getVersion()) > 0) {
    const res = await dialog.showMessageBox(win, {
      type: 'info', title: 'Жаңа нұсқа', buttons: ['Жүктеу бетін ашу', 'Кейін'], defaultId: 0, cancelId: 1,
      message: 'Mura GIS ' + latest + ' нұсқасы шықты (қазіргісі — ' + app.getVersion() + ').',
      detail: (j.body || '').slice(0, 1200),
    });
    if (res.response === 0) shell.openExternal(j.html_url || RELEASES);
  } else if (manual) {
    dialog.showMessageBox(win, { type: 'info', message: 'Сізде соңғы нұсқа орнатылған (' + app.getVersion() + ').' });
  }
}

function initAuto(win) {
  if (autoUpdater) return autoUpdater;
  autoUpdater = require('electron-updater').autoUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', async info => {
    const res = await dialog.showMessageBox(win, {
      type: 'info', title: 'Жаңарту дайын', buttons: ['Қазір қайта іске қосу', 'Кейін (жабылғанда орнатылады)'], defaultId: 0, cancelId: 1,
      message: 'Mura GIS ' + info.version + ' жүктелді.',
      detail: 'Сақталмаған өзгерістер болса, алдымен «Сақтау» батырмасын басыңыз.',
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
        if (v && cmp(v, app.getVersion()) > 0) dialog.showMessageBox(win, { type: 'info', message: 'Mura GIS ' + v + ' нұсқасы жүктелуде. Дайын болғанда хабарлаймыз.' });
        else dialog.showMessageBox(win, { type: 'info', message: 'Сізде соңғы нұсқа орнатылған (' + app.getVersion() + ').' });
      }
    } else {
      await manualCheck(win, manual);
    }
  } catch (e) {
    if (manual) dialog.showMessageBox(win, { type: 'warning', message: 'Жаңартуды тексеру мүмкін болмады.', detail: (e && e.message) || String(e), buttons: ['Жабу', 'Нұсқалар беті'], cancelId: 0 })
      .then(r => { if (r.response === 1) shell.openExternal(RELEASES); });
  } finally {
    busy = false;
  }
}

module.exports = { check };
