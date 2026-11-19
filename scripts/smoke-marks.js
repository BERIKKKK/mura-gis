/* «Белгі қою» түтін тесті: белгілерді API арқылы қосады, рим цифрлы сұрыптауды, режимдердің бір-біріне кедергі
   келтірмейтінін, GeoJSON / DOCX / PDF экспортын тексереді, скриншот алып шығады.
   Іске қосу: npx electron scripts/smoke-marks.js [скриншот.png]   (деректер уақытша қалтада) */
const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mura-marks-'));
app.setPath('userData', tmp);
const shot = process.argv.find(a => a.endsWith('.png')) || path.join(tmp, 'marks.png');
const errors = [];

app.on('browser-window-created', (_e, win) => {
  win.webContents.on('console-message', ev => { if (ev.level === 'error' || ev.level === 3) errors.push(ev.message); });
  if (win.webContents.getURL() || errors.started) return;
  errors.started = true;
  win.webContents.once('did-finish-load', () => setTimeout(() => run(win).catch(e => { console.error('FAIL', e); app.exit(1); }), 3500));
});

async function run(win) {
  const js = s => win.webContents.executeJavaScript(s, true);
  const r = await js(`(async () => {
    const out = {}, M = window.__marks, wait = t => new Promise(r => setTimeout(r, t));
    out.loaded = !!M; out.kk = Intl.Collator.supportedLocalesOf(['kk']).join();
    const base = { oblast: 'Ақтөбе облысы', category: 'local', status: 'state', type: 'archeo' };
    const add = [
      { name: 'Қабантау-V қорғаны', district: 'Мәртөк ауданы', lat: 50.71, lon: 56.51, period: 'ерте темір дәуірі', place: 'Қарабұтақ ауылынан 3 км шығыста' },
      { name: 'Қабантау-ІҮ қорғаны', district: 'Мәртөк ауданы', lat: 50.712, lon: 56.512, place: 'Қарабұтақ ауылынан 3,2 км шығыста' },
      { name: 'Қабантау-ІІ қорғаны', district: 'Мәртөк ауданы', lat: 50.713, lon: 56.513 },
      { name: 'Қабантау-Х қорғаны', district: 'Мәртөк ауданы', lat: 50.714, lon: 56.514 },
      { name: 'Абат-Байтақ кесенесі', district: 'Алға ауданы', lat: 50.1, lon: 57.2, type: 'arch', period: 'XIV ғасыр' },
      { name: 'Ескерткіш белгі', district: '', lat: 50.3, lon: 57.1, type: 'art', status: 'prelim' },
      { name: 'Райымбек батыр кесенесі', oblast: 'Алматы қаласы', district: 'Алмалы ауданы', lat: 43.25, lon: 76.93, type: 'sacred', status: 'archreg' },
      { name: 'Тас мүсін', oblast: 'Алматы қаласы', district: 'Медеу ауданы', lat: 43.2, lon: 77.0, type: 'ensemble', status: 'excluded' },
    ];
    for (const m of add) await M.api('save', { data: JSON.stringify({ ...base, ...m }) });
    out.count = M.items.length;
    M.openPanel(); await wait(300);
    out.order = M.filtered().map(m => (m.district || '—') + ' / ' + m.name);
    out.cards = document.querySelectorAll('#mkList .mk-card').length;
    out.title = document.getElementById('mkTitle').value;
    out.pins = document.querySelectorAll('.mk-pin').length;
    out.pinColors = [...new Set([...document.querySelectorAll('.mk-pin svg path')].map(p => p.getAttribute('fill')).filter(c => /^#/.test(c||'')))].join(' ');
    out.obFilter = !document.getElementById('mkFOblast').hidden;
    const ob = document.getElementById('qaOblast');
    out.regions = ob.tagName + ' ' + ob.options.length + ' / remembered ' + MuraRegions.remembered() + ' / districts ' + document.getElementById('qaDistrict').options.length;
    ob.value = 'Жетісу облысы'; out.progDistricts = [...document.getElementById('qaDistrict').options].map(o => o.value).slice(1, 4).join(', ');
    document.getElementById('qaDistrict').value = 'Ескі аудан'; out.legacy = document.getElementById('qaDistrict').value;
    ob.value = 'Шымкент қаласы'; ob.dispatchEvent(new Event('change', { bubbles: true })); out.remembered2 = MuraRegions.remembered() + ' / ' + document.getElementById('qaDistrict').options.length;

    // Режимдер: белгі қою → шекара нүктесі өшеді; шекара нүктесі → белгі қою өшеді
    const add0 = document.getElementById('qaAddMode').getAttribute('aria-pressed');
    M.setMarking(true); await wait(50);
    out.modeMark = [M.marking, document.getElementById('qaAddMode').getAttribute('aria-pressed'), document.getElementById('qaMap').className.includes('is-marking')].join();
    const pts0 = __qa.state.pts.length;
    const map = MuraMarks.map, c = map.getCenter();
    map.fire('click', { latlng: c, containerPoint: map.latLngToContainerPoint(c), originalEvent: new MouseEvent('click') });
    await wait(200);
    out.dialog = !!document.querySelector('.mk-dlg'); out.ptsAfterMarkClick = __qa.state.pts.length - pts0;
    document.getElementById('mkName').value = 'Тест-ІХ обасы';
    document.getElementById('mkName').dispatchEvent(new Event('input'));
    out.keyHint = document.getElementById('mkKey').textContent;
    document.querySelector('.mk-dlg').requestSubmit(); await wait(400);
    out.afterSave = M.items.length + ' / dialog ' + !!document.querySelector('.mk-dlg');
    document.getElementById('qaAddMode').click(); await wait(50);
    out.modeAdd = [M.marking, document.getElementById('qaAddMode').getAttribute('aria-pressed')].join();
    map.fire('click', { latlng: c, containerPoint: map.latLngToContainerPoint(c), originalEvent: new MouseEvent('click') });
    await wait(100);
    out.ptsAfterAddClick = __qa.state.pts.length - pts0; out.noDialog = !document.querySelector('.mk-dlg');
    out.pinPassThrough = getComputedStyle(document.querySelector('.mk-pin')).pointerEvents;
    __qa.state.pts.length = pts0;

    // Панельдер бір-бірін жабады
    document.getElementById('qaOpenInfo').click(); await wait(200);
    out.panels = 'marks hidden=' + document.getElementById('mkPanel').hidden + ', info hidden=' + document.getElementById('qaPanelInfo').hidden;
    M.openPanel(); await wait(200);
    out.panels += ' → marks hidden=' + document.getElementById('mkPanel').hidden + ', info hidden=' + document.getElementById('qaPanelInfo').hidden;

    const g = M.geojson(M.filtered(), 'x'); out.geo = g.features.length + ' ' + JSON.stringify(g.features[0].geometry);
    const d = await M.buildDocx(); out.docx = d.size;
    const p = await M.buildPdf(); out.pdf = p.size + ' ' + (await p.slice(0, 5).text());
    window.__docx = new Uint8Array(await d.arrayBuffer()); window.__pdf = new Uint8Array(await p.arrayBuffer());
    return out;
  })()`);
  fs.writeFileSync(path.join(tmp, 'list.docx'), Buffer.from(await js('Array.from(window.__docx)')));
  fs.writeFileSync(path.join(tmp, 'list.pdf'), Buffer.from(await js('Array.from(window.__pdf)')));
  await js("__marks.closePanel(); __marks.openPanel(); MuraMarks.map.setView([50.712, 56.512], 15); 0");
  await new Promise(res => setTimeout(res, 2500));
  fs.writeFileSync(shot, (await win.webContents.capturePage()).toPNG());
  await js("(__marks.openDialog(__marks.items.find(m => m.name.includes('ІҮ'))), 0)");
  await new Promise(res => setTimeout(res, 500));
  fs.writeFileSync(shot.replace(/\.png$/, '-dlg.png'), (await win.webContents.capturePage()).toPNG());
  r.files = tmp;
  r.storeFile = JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'marks.json'), 'utf8')).length + ' белгі';
  console.log(JSON.stringify(r, null, 1));
  const real = errors.filter(e => !/tile|Failed to load resource/i.test(e));
  if (errors.length) console.log('Консоль қателері:\n  ' + errors.join('\n  '));
  app.exit(real.length ? 1 : 0);
}

require('../main/main.js');
