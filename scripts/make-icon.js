/* src/img/icon.svg → build/icon.png (512×512). electron-builder одан Windows .ico және Linux иконкаларын жасайды.
   Іске қосу: npm run icon */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SIZE = 512;

app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(ROOT, 'src/img/icon.svg'), 'utf8');
  const win = new BrowserWindow({ width: SIZE, height: SIZE, show: false, frame: false, transparent: true, useContentSize: true,
    webPreferences: { offscreen: true } });
  const html = '<html><body style="margin:0;background:transparent"><img style="display:block;width:' + SIZE + 'px;height:' + SIZE +
    'px" src="data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') + '"></body></html>';
  await win.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'));
  await new Promise(r => setTimeout(r, 400));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
  fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
  const png = img.resize({ width: SIZE, height: SIZE }).toPNG();
  fs.writeFileSync(path.join(ROOT, 'build/icon.png'), png);
  fs.writeFileSync(path.join(ROOT, 'src/img/icon.png'), png);
  console.log('build/icon.png', img.getSize());
  app.quit();
});
