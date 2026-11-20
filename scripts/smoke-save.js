/* «Жобаны сақтау» түтін тесті: авто сақтау (әдепкі — қосулы), оны өшіргенде өзгерістер жадта жиналып, «Сақтау»
   батырмасымен файлға жазылатынын, бет қайта жүктелсе де сақталмаған күй жоғалмайтынын, қайта қосқанда бәрі жазылатынын тексереді.
   Іске қосу: npx electron scripts/smoke-save.js   (деректер уақытша қалтада) */
const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mura-save-'));
app.setPath('userData', tmp);
const gpkg = path.join(tmp, 'test.gpkg');
process.env.MURA_PROJECT = gpkg;
delete process.env.MURA_AUTOSAVE;
const rows = t => { const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(gpkg); try { return db.prepare('SELECT count(*) AS n FROM "' + t + '"').get().n; } finally { db.close(); } };
const errors = [];
const wait = t => new Promise(r => setTimeout(r, t));

app.on('browser-window-created', (_e, win) => {
  win.webContents.on('console-message', ev => { if (ev.level === 'error' || ev.level === 3) errors.push(ev.message); });
  if (errors.started) return;
  errors.started = true;
  win.webContents.once('did-finish-load', () => setTimeout(() => run(win).catch(e => { console.error('FAIL', e.message || e); app.exit(1); }), 3500));
});

async function run(win) {
  const js = s => win.webContents.executeJavaScript(s, true);
  const out = {};
  const eq = (a, b, what) => { if (a !== b) throw new Error(what + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)); };
  const mark = n => `__marks.api('save', { data: JSON.stringify({ name: 'Сақтау тесті ${n}', oblast: 'Ақтөбе облысы', type: 'archeo', lat: 50.${n}, lon: 57.${n} }) }).then(() => 0)`;
  const unsaved = () => js("!document.getElementById('muraUnsaved').hidden");

  eq(await js('!!document.getElementById("muraSaveBtn") && MuraProject.autosave'), true, 'әдепкі: батырма бар, авто сақтау қосулы');
  await js(mark(1)); await wait(200);
  eq(rows('marks'), 1, 'авто сақтау: бірден жазылды');
  eq(await unsaved(), false, 'авто сақтау: сақталмаған белгісі жоқ');

  await js('MuraProject.setAutosave(false), 0'); await wait(300);
  eq(JSON.parse(fs.readFileSync(path.join(tmp, 'settings.json'), 'utf8')).autosave, false, 'баптау сақталды');
  await js(mark(2)); await wait(300);
  eq(rows('marks') + ' / ' + await js('__marks.items.length'), '1 / 2', 'авто сақтау өшік: файлда — ескісі, бағдарламада — жаңасы');
  eq(await unsaved(), true, 'күй жолағында «Сақталмаған өзгерістер»');
  out.tip = await js("document.getElementById('muraSaveBtn').dataset.tip");

  win.webContents.reload(); await new Promise(r => win.webContents.once('did-finish-load', r)); await wait(3500);
  eq(await js('__marks.items.length') + ' ' + await unsaved(), '2 true', 'қайта жүктегенде сақталмаған күй жоғалмады');

  await js("document.getElementById('muraSaveBtn').click(), 0"); await wait(500);
  eq(rows('marks') + ' ' + await unsaved(), '2 false', '«Сақтау» батырмасы файлға жазды');
  out.toast = await js("document.getElementById('qaToast').textContent");

  await js(mark(3)); await wait(300);
  eq(rows('marks'), 2, 'тағы өзгеріс — әзірге жадта');
  await js('MuraProject.setAutosave(true), 0'); await wait(400);
  eq(rows('marks') + ' ' + await unsaved(), '3 false', 'авто сақтау қосылғанда жиналғаны жазылды');

  console.log(JSON.stringify(out, null, 1));
  const real = errors.filter(e => !/tile|Failed to load resource/i.test(e));
  if (errors.length) console.log('Консоль қателері:\n  ' + errors.join('\n  '));
  console.log('OK');
  app.exit(real.length ? 1 : 0);
}

require('../main/main.js');
