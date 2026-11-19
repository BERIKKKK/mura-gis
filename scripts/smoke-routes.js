/* «Маршруттар» түтін тесті: картада маршрут сызу (ескерткішке жабысу), сақтау, GPX импорты, маршруттар желісі
   бойынша жол табу (маршрут 1 + маршрут 2), көлік сүзгісі, қызметтердің ауысуы, оң жақ мәзір; скриншоттар.
   Іске қосу: npx electron scripts/smoke-routes.js [скриншот.png]   (деректер уақытша қалтада) */
const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mura-routes-'));
app.setPath('userData', tmp);
const shot = process.argv.find(a => a.endsWith('.png')) || path.join(tmp, 'routes.png');
const errors = [];

app.on('browser-window-created', (_e, win) => {
  win.webContents.on('console-message', ev => { if (ev.level === 'error' || ev.level === 3) errors.push(ev.message); });
  if (win.webContents.getURL() || errors.started) return;
  errors.started = true;
  win.webContents.once('did-finish-load', () => setTimeout(() => run(win).catch(e => { console.error('FAIL', e); app.exit(1); }), 3500));
});

async function run(win) {
  const js = s => win.webContents.executeJavaScript(s, true);
  const snap = async name => { await new Promise(r => setTimeout(r, 1200)); fs.writeFileSync(shot.replace(/\.png$/, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  const r = await js(`(async () => {
    const out = {}, M = window.__marks, RT = window.MuraRoutes, map = MuraMarks.map, wait = t => new Promise(r => setTimeout(r, t));
    const $ = id => document.getElementById(id);
    out.loaded = !!RT;
    out.services = [...document.querySelectorAll('.mura-svc')].map(b => b.textContent).join(' | ');
    out.marksBtn = $('mkListBtn').textContent.trim();
    // Ескерткіштер
    const base = { oblast: 'Ақтөбе облысы', district: 'Мәртөк ауданы', category: 'local', status: 'state', type: 'archeo' };
    await M.api('save', { data: JSON.stringify({ ...base, name: 'Қабантау-V қорғаны', lat: 50.40, lon: 57.60 }) });
    await M.api('save', { data: JSON.stringify({ ...base, name: 'Абат-Байтақ кесенесі', type: 'arch', lat: 50.55, lon: 57.90 }) });
    await M.api('save', { data: JSON.stringify({ ...base, name: 'Есет батыр кесенесі', type: 'arch', lat: 50.20, lon: 57.95 }) });
    const m1 = M.items.find(m => m.name.startsWith('Қабантау')), m2 = M.items.find(m => m.name.startsWith('Абат')), m3 = M.items.find(m => m.name.startsWith('Есет'));
    // Қызмет: Маршруттар
    document.getElementById('muraSvc-routes').click(); await wait(200);
    out.svc = MuraSvc.get();
    out.row2 = [...document.querySelectorAll('#qaTmain .qa-tbtn')].filter(b => b.offsetParent).map(b => b.getAttribute('aria-label')).join(', ');
    // Маршрут 1: Ақтөбе → Қабантау-V (соңғы нүкте ескерткіштің жанында басылады — соған жабысуы керек)
    map.setView([50.34, 57.38], 10); await wait(300);
    const click = (lat, lon) => map.fire('click', { latlng: L.latLng(lat, lon) });
    $('rtDraw').click(); await wait(100);
    out.drawing = RT.drawing + ' / add ' + $('qaAddMode').getAttribute('aria-pressed') + ' / mk ' + $('mkMode').getAttribute('aria-pressed');
    click(50.2839, 57.1670); click(50.31, 57.30); click(50.36, 57.45); click(50.4005, 57.6008);
    await wait(100);
    out.hud = document.querySelector('.rt-hud').textContent;
    window.__shotDraw = true;
    return out;
  })()`);
  await snap('-draw');
  Object.assign(r, await js(`(async () => {
    const out = {}, RT = window.MuraRoutes, map = MuraMarks.map, wait = t => new Promise(r => setTimeout(r, t)), $ = id => document.getElementById(id);
    const M = window.__marks;
    const m1 = M.items.find(m => m.name.startsWith('Қабантау')), m2 = M.items.find(m => m.name.startsWith('Абат')), m3 = M.items.find(m => m.name.startsWith('Есет'));
    $('rtFinish').click(); await wait(200);
    out.dlg1 = $('rtA').value + ' | ' + $('rtB').value + ' | ' + $('rtName').value;
    $('rtA').value = 'Ақтөбе қаласы'; $('rtA').dispatchEvent(new Event('input'));
    $('rtVehD').value = 'car';
    out.dlg1name = $('rtName').value;
    document.querySelector('.rt-dlg [type=submit]').click(); await wait(400);
    out.saved1 = RT.items.length + ' / ' + RT.items[0]?.name + ' / ' + RT.items[0]?.vehicle;
    // Маршрут 2: Қабантау-V → Абат-Байтақ (басы ескерткіштен басталады)
    const click = (lat, lon) => map.fire('click', { latlng: L.latLng(lat, lon) });
    click(m1.lat + 0.0004, m1.lon - 0.0006); click(50.47, 57.75); click(m2.lat - 0.0003, m2.lon + 0.0004);
    $('rtFinish').click(); await wait(200);
    out.dlg2 = $('rtA').value + ' | ' + $('rtB').value + ' | ' + $('rtName').value;
    $('rtVehD').value = '4x4';
    document.querySelector('.rt-dlg [type=submit]').click(); await wait(400);
    out.saved2 = RT.items.length;
    $('rtDraw').click(); await wait(100);
    out.drawOff = RT.drawing;
    // Маршрут 3 — GPX импорты (трек: 1-маршруттың ортасынан Есет батыр кесенесіне)
    const gpx = '<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Тармақ: Есет батыр</name><trkseg>' +
      [[50.3605, 57.4497], [50.30, 57.70], [50.25, 57.85], [50.2003, 57.9496]].map(p => '<trkpt lat="' + p[0] + '" lon="' + p[1] + '"/>').join('') + '</trkseg></trk></gpx>';
    const dt = new DataTransfer(); dt.items.add(new File([gpx], 'jol.gpx', { type: 'application/gpx+xml' }));
    $('rtFile').files = dt.files; $('rtFile').dispatchEvent(new Event('change'));
    for (let i = 0; i < 30 && RT.items.length < 3; i++) await wait(100);
    out.imported = RT.items.length + ' / ' + (RT.items.find(x => x.name.startsWith('Тармақ'))?.vehicle || '?');
    const net = RT.network();
    out.net = net.nodes.length + ' түйін (' + net.nodes.map(n => n.name || 'торап').join(', ') + '), ' + net.edges.length + ' қабырға';
    // Жол табу: Ақтөбе қаласы → Абат-Байтақ (маршрут 1 + маршрут 2)
    RT.openPanel('find'); await wait(200);
    $('rtFrom').value = 'n:Ақтөбе қаласы';
    $('rtTo').value = 'm:' + m2.id;
    $('rtVeh').value = '4x4';
    $('rtGo').click(); await wait(300);
    out.find = document.querySelector('.rt-sum')?.textContent || document.querySelector('.rt-err')?.textContent;
    out.legs = [...document.querySelectorAll('.rt-legs li')].map(li => li.querySelector('.qa-sc-title').textContent).join(' + ');
    $('rtVeh').value = 'car'; $('rtVeh').dispatchEvent(new Event('change')); await wait(300);
    out.findCar = document.querySelector('.rt-err')?.textContent || 'табылды';
    $('rtVeh').value = '4x4'; $('rtVeh').dispatchEvent(new Event('change')); await wait(300);
    // Есет батыр → Абат-Байтақ: импортталған трек, 1-маршруттың бір бөлігі, 2-маршрут
    $('rtFrom').value = 'm:' + m3.id; $('rtGo').click(); await wait(300);
    out.find3 = document.querySelector('.rt-sum')?.textContent;
    out.legs3 = [...document.querySelectorAll('.rt-legs li')].map(li => li.querySelector('.qa-sc-title').textContent).join(' + ');
    window.__m2 = m2.id;
    return out;
  })()`));
  await snap('-find');
  Object.assign(r, await js(`(async () => {
    const out = {}, RT = window.MuraRoutes, wait = t => new Promise(r => setTimeout(r, t)), $ = id => document.getElementById(id);
    // Қызмет ауысуы: Ескерткіштер → маршрут панелі жабылады; оң жақ мәзір «Осы ескерткішке жол табу» → Маршруттар
    document.getElementById('muraSvc-marks').click(); await wait(200);
    out.leave = MuraSvc.get() + ' / panel ' + ($('rtPanel').hidden ? 'жабық' : 'ашық');
    const m2 = __marks.items.find(m => m.id === window.__m2);
    MuraCtx.forMark(m2, new MouseEvent('contextmenu', { clientX: 300, clientY: 300 })); await wait(100);
    const it = [...document.querySelectorAll('.mura-ctx button')].find(b => b.textContent.includes('жол табу'));
    out.ctx = !!it;
    it?.click(); await wait(300);
    out.ctxSvc = MuraSvc.get() + ' / ' + ($('rtPanel').hidden ? 'жабық' : 'ашық') + ' / қайда: ' + $('rtTo').selectedOptions[0]?.textContent;
    document.getElementById('qaAddMode').click(); await wait(100);
    out.zoneFollow = MuraSvc.get();
    document.getElementById('muraSvc-routes').click(); await wait(100);
    RT.openPanel('list'); await wait(300);
    out.cards = [...document.querySelectorAll('.rt-card .qa-sc-title')].map(b => b.textContent).join(' | ');
    return out;
  })()`));
  await snap('-list');
  await js(`(window.MuraRoutes.items[0] && document.querySelector('.rt-card [data-act=edit]').click(), 0)`);
  await snap('-dlg');
  r.files = tmp;
  r.storeFile = JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'routes.json'), 'utf8')).length + ' маршрут';
  console.log(JSON.stringify(r, null, 1));
  const real = errors.filter(e => !/tile|Failed to load resource/i.test(e));
  if (errors.length) console.log('Консоль қателері:\n  ' + errors.join('\n  '));
  app.exit(real.length ? 1 : 0);
}

require('../main/main.js');
