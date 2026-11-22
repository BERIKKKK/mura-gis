/* «Баптаулар → Синхрондау» түтін тесті: аккаунтсыз бағдарлама толық жұмыс істейді, бөлім ашылады, сақтау қызметтері
   (Google Drive — қолжетімді, OneDrive / Dropbox — кейін) көрсетіледі, кіру алдында деректер қайда сақталатыны айтылады,
   күй жолағында аккаунт қосылмаса синхрондау белгісі жоқ, бастапқы терезеде «Бұлттан…» батырмасы бар.
   Google-ға нақты кіру тексерілмейді (желі мен аккаунт керек) — ол docs/SYNC.md-дегі қолмен тексеру тізімінде.
   Іске қосу: npx electron scripts/smoke-sync.js   (деректер уақытша қалтада) */
const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mura-sync-'));
app.setPath('userData', tmp);
process.env.MURA_PROJECT = path.join(tmp, 'test.gpkg');
process.env.MURA_GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
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

  // Аккаунтсыз: белгі қою және сақтау бұрынғыдай
  await js("__marks.api('save', { data: JSON.stringify({ name: 'Аккаунтсыз', type: 'archeo', lat: 50.1, lon: 57.1 }) }).then(() => 0)");
  eq(await js('__marks.items.length'), 1, 'аккаунтсыз белгі сақталды');
  eq(await js("!document.getElementById('muraSyncCell') || document.getElementById('muraSyncCell').hidden"), true, 'аккаунт қосылмаған: күй жолағында синхрондау белгісі жоқ');

  await js("MuraProject.openSettings('sync'), 0"); await wait(600);
  eq(await js("!!document.querySelector('[data-tab=\"sync\"][aria-selected=\"true\"]')"), true, '«Синхрондау» қойындысы ашылды');
  const pane = () => js("document.getElementById('muraSyncPane').innerText");
  const t1 = await pane();
  out.providers = await js("[...document.querySelectorAll('[name=muraSyProv]')].map(i => i.value + (i.disabled ? '(кейін)' : '')).join(', ')");
  eq(out.providers, 'gdrive, onedrive(кейін), dropbox(кейін)', 'сақтау қызметтері');
  if (!/Аккаунт міндетті емес/.test(t1)) throw new Error('аккаунт міндетті емес деген түсініктеме жоқ');
  eq(await js("!!document.querySelector('[data-sy=\"ask\"]')"), true, '«Google арқылы кіру» батырмасы бар');
  await js("document.querySelector('[data-sy=\"ask\"]').click(), 0"); await wait(200);
  const t2 = await pane();
  if (!/өз Google Drive-ыңызда/.test(t2) || !/appDataFolder/.test(t2)) throw new Error('кіру алдында деректер қайда сақталатыны көрсетілмеді');
  eq(await js("!!document.querySelector('[data-sy=\"connect\"]')"), true, 'келісім батырмасы бар');
  const st = await js('mura.sync.status().then(r => r.status)');
  eq(st.account === null && st.configured === true && st.state === 'off', true, 'күй: аккаунт жоқ, клиент бапталған');
  eq(st.current && st.current.linked, false, 'ашық жоба синхрондалмайды (келісімсіз жүктелмейді)');
  out.consent = t2.split('\n').find(l => /Деректер қайда/.test(l));
  await js("document.querySelector('.mura-set [data-x]').click(), 0"); await wait(200);

  // Орысша мәтін
  console.log(JSON.stringify(out, null, 1));
  const real = errors.filter(e => !/tile|Failed to load resource/i.test(e));
  if (errors.length) console.log('Консоль қателері:\n  ' + errors.join('\n  '));
  console.log('OK');
  app.exit(real.length ? 1 : 0);
}

require('../main/main.js');
