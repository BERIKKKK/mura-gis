/* Плагиндер жүйесінің түтін тесті (Electron):
     • плагинсіз бағдарлама толық жұмыс істейді, кеңейту нүктелері бос;
     • NIPD үлгі плагині «Баптаулар → Плагиндер → Плагин орнату» интерфейсі арқылы орнатылады (жауапкершілік ескертуі, рұқсаттар,
       растау), «Қорғау аймағы → Нәтиже және экспорт» бөліміне батырма қосады, тек ескерткіш аумағының полигонын схемаға сай экспорттайды;
     • оқшаулау: плагинде require/process жоқ, желі (http, ws, img, beacon), mura://app/, file://, eval, жаңа терезе бұғатталған,
       рұқсатсыз API шақыруы мен .exe сақтау техникалық деңгейде қабылданбайды;
     • плагин қатесі, шексіз цикл — тек плагин процесі тоқтайды, бағдарлама жауап береді;
     • «Атау сәйкестендіргіш» (2.4.2): files.import арқылы екі файл (DOCX + PDF), белгі терезесінде «Плагин ұсынысы» өрістерді толтырады;
     • өшіру элементтерді жасырады, жою жоба деректерін сақтайды.
   Іске қосу: npx electron scripts/smoke-plugins.js   (деректер уақытша қалтада; «Сақтау»/«Ашу» терезелері ауыстырылған) */
const electron = require('electron');
const { app, dialog } = electron;
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const Z = require('../plugin-sdk/lib/zip.cjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mura-plugins-'));
app.setPath('userData', tmp);
process.env.MURA_PROJECT = path.join(tmp, 'test.gpkg');
process.env.MURA_OBLAST = '';
const errors = [];
const wait = t => new Promise(r => setTimeout(r, t));

// «Сақтау» және «Ашу» терезелері — тестте файл жолын бірден қайтарады
const saved = [];
let openPath = '', openPaths = null;
dialog.showSaveDialog = async (_w, o) => { const f = path.join(tmp, 'export', path.basename((o && o.defaultPath) || 'x')); fs.mkdirSync(path.dirname(f), { recursive: true }); saved.push(f); return { canceled: false, filePath: f }; };
dialog.showOpenDialog = async () => (openPaths ? { canceled: false, filePaths: openPaths } : { canceled: !openPath, filePaths: openPath ? [openPath] : [] });

// Плагин желіге шыға ала ма — жергілікті сервер әр сұранысты санайды
let hits = 0;
const srv = http.createServer((req, res) => { hits++; res.end('hello'); }).listen(0, '127.0.0.1');

function packDir(dir) {
  const out = [];
  const walk = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith('.') || e.name === 'dist') continue; const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(path.join(d, e.name), r); else out.push([r, fs.readFileSync(path.join(d, e.name))]); } };
  walk(dir, '');
  return Z.writeZip(out);
}
function evilPlugin(port) {
  const H = 'http://127.0.0.1:' + port + '/';
  const main = `
mura.commands.register('probe', async () => {
  const r = {};
  r.require = typeof require; r.process = typeof process; r.module = typeof module; r.electron = typeof globalThis.electron;
  r.bridge = Object.keys(globalThis.__muraBridge || {}).sort().join(',');
  const f = async u => { try { const x = await fetch(u); return 'OK ' + x.status; } catch (e) { return 'blocked'; } };
  r.http = await f('${H}fetch'); r.https = await f('https://127.0.0.1:${port}/'); r.app = await f('mura://app/marks?op=list');
  r.file = await f('file:///etc/hostname'); r.own = await f('/manifest.json'); r.other = await f('mura-plugin://kz.mura.nipd-exporter/manifest.json');
  r.ws = await new Promise(res => { try { const w = new WebSocket('ws://127.0.0.1:${port}/'); w.onopen = () => res('open'); w.onerror = () => res('blocked'); setTimeout(() => res('timeout'), 3000); } catch (e) { res('blocked'); } });
  const img = new Image(); img.src = '${H}img'; document.body.appendChild(img);
  try { navigator.sendBeacon('${H}beacon', 'x'); } catch (e) {}
  r.popup = (() => { try { return window.open('${H}popup') ? 'opened' : 'blocked'; } catch (e) { return 'blocked'; } })();
  r.eval = (() => { try { return String(eval('1+1')); } catch (e) { return 'blocked'; } })();
  r.fn = (() => { try { return String(new Function('return 2')()); } catch (e) { return 'blocked'; } })();
  r.origin = location.origin;
  try { await mura.attributes.list('marks'); r.noperm = 'allowed'; } catch (e) { r.noperm = e.code; }
  try { await mura.project.info(); r.noperm2 = 'allowed'; } catch (e) { r.noperm2 = e.code; }
  try { await mura.export.saveFile({ suggestedName: 'evil.exe', data: 'MZ' }); r.exe = 'saved'; } catch (e) { r.exe = e.code; }
  try { await mura.export.saveFile({ suggestedName: 'ok.txt', data: 'hello' }); r.txt = 'saved'; } catch (e) { r.txt = e.code; }
  await new Promise(res => setTimeout(res, 800));
  return r;
});
mura.commands.register('throw', async () => { throw new Error('плагин қатесі (әдейі)'); });
mura.commands.register('hang', async () => { for (;;) {} });
mura.commands.register('layer', async () => { await mura.map.addLayer('t', { type: 'Point', coordinates: [68.3, 42.85] }, { color: '#ff0000' }); return true; });
mura.commands.register('dlg', async () => mura.ui.dialog({ title: '<img src=x onerror=alert(1)>', body: [{ type: 'text', text: '<b id="evilHtml">x</b>' }] }));
`;
  const manifest = { id: 'kz.test.evil', name: 'Evil test', version: '0.1.0', apiVersion: '1', minAppVersion: '2.0.0', author: 'Tester', entry: 'main.js',
    permissions: ['files.export', 'network.access', 'map.layers', 'project.metadata'],
    contributes: { 'tools.menu': ['probe', 'throw', 'hang', 'layer', 'dlg'].map(c => ({ command: c, title: 'Evil ' + c })) } };
  return Z.writeZip([['manifest.json', Buffer.from(JSON.stringify(manifest))], ['main.js', Buffer.from(main)]]);
}

app.on('browser-window-created', (_e, win) => {
  if (errors.started) return;
  errors.started = true;
  win.webContents.on('console-message', ev => { if (ev.level === 'error' || ev.level === 3) errors.push(ev.message); });
  win.webContents.once('did-finish-load', () => setTimeout(() => run(win).catch(e => { console.error('FAIL', e.stack || e.message || e); app.exit(1); }), 3500));
});

async function run(win) {
  const js = s => win.webContents.executeJavaScript(s, true);
  const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(what + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)); };
  const until = async (expr, ms = 8000, what = expr) => { const t0 = Date.now(); for (;;) { if (await js(expr)) return; if (Date.now() - t0 > ms) throw new Error('күтілмеді: ' + what); await wait(150); } };
  const port = srv.address().port;
  const out = {};

  // 1. Плагинсіз
  eq(await js('mura.plugins.contributions().then(r => r.items.length)'), 0, 'плагинсіз: кеңейту жоқ');
  eq(await js("!!document.getElementById('muraPlZoneExp') || !!document.getElementById('muraPlMenu')"), false, 'плагинсіз: элементтер жоқ');
  await js("document.getElementById('qaSample').click(), 0"); await wait(1200);
  eq(await js('!!(__qa.R && !__qa.R.error)'), true, 'плагинсіз: аймақ есептеледі');

  // 2. Интерфейс арқылы орнату: (а) «Ұсынылған плагиндер» — NIPD (Mura GIS әзірлеушісі), (ә) файлдан — тәуелсіз әзірлеуші
  await js("MuraProject.openSettings('plugins'), 0"); await wait(600);
  eq(await js("[...document.querySelectorAll('.mura-pl-sub [data-sub]')].map(b => b.dataset.sub).join()"), 'installed,install,dev', 'үш бөлім');
  await js("document.querySelector('.mura-pl-sub [data-sub=install]').click(), 0"); await wait(300);
  eq(await js("[...document.querySelectorAll('[data-cat]')].map(b => b.dataset.cat).join()"), 'kz.mura.nipd-exporter,kz.mura.decree-matcher', 'ұсынылған плагиндер');
  if (!/Mura GIS әзірлеушісі/.test(await js("document.querySelector('.mura-pl-cat').innerText"))) throw new Error('ұсынылған плагин мәртебесі жоқ');
  await js("document.querySelector('[data-cat]').click(), 0");
  await until("!!document.querySelector('.mura-pl-disc')", 8000, 'тексеру нәтижесі');
  const disc = await js("document.querySelector('.mura-pl-disc').innerText");
  if (!/Mura GIS әзірлеушісі жасаған ұсынылған/.test(disc) || !/geometry\.read/.test(disc)) throw new Error('ресми плагин ескертуі: ' + disc);
  eq(await js("document.querySelector('[data-install]').disabled"), true, 'келісімсіз орнату батырмасы сөнік');
  await js("document.getElementById('muraPlAgree').click(), 0");
  await js("document.querySelector('[data-install]').click(), 0");
  await until("document.querySelectorAll('.mura-pl-list .mura-pl-it').length === 1", 8000, 'орнатылған тізім');
  out.installed = await js("document.querySelector('.mura-pl-it').innerText.split('\\n')[0]");
  eq(await js("!!document.querySelector('.mura-pl-it .mura-pl-src.is-official')"), true, 'мәртебе: Mura GIS әзірлеушісі');
  // Файлдан: шаблон плагин → «Тәуелсіз әзірлеуші»; ресми id-ді иемденген файл — ескерту
  const helloFile = path.join(tmp, 'hello.muraplug');
  fs.writeFileSync(helloFile, packDir(path.join(__dirname, '..', 'plugin-sdk', 'template')));
  openPath = helloFile;
  await js("document.querySelector('.mura-pl-sub [data-sub=install]').click(), 0"); await wait(300);
  eq(await js("document.querySelector('.mura-pl-cat').innerText.includes('Орнатылған')"), true, 'каталогта «Орнатылған»');
  await js("document.querySelector('[data-pick]').click(), 0");
  await until("!!document.querySelector('.mura-pl-disc')", 8000, 'файл тексерісі');
  if (!/тәуелсіз әзірлеуші жасаған/.test(await js("document.querySelector('.mura-pl-disc').innerText"))) throw new Error('тәуелсіз әзірлеуші ескертуі жоқ');
  await js("document.getElementById('muraPlAgree').click(); document.querySelector('[data-install]').click(), 0");
  await until("document.querySelectorAll('.mura-pl-list .mura-pl-it').length === 2", 8000, 'екі плагин');
  eq(await js("[...document.querySelectorAll('.mura-pl-list .mura-pl-it')].map(li => li.querySelector('.mura-pl-src').classList.contains('is-official')).join()"), 'false,true', 'мәртебелер (hello, nipd)');
  const fake = path.join(tmp, 'fake-nipd.muraplug');
  fs.writeFileSync(fake, packDir(path.join(__dirname, '..', 'plugin-sdk', 'examples', 'nipd-exporter')));
  const fr = await js(`mura.plugins.inspect(${JSON.stringify(fake)}).then(r => r.report)`);
  eq(fr.source, 'file', 'файлдың көзі'); if (!fr.warnings.some(w => /каталогынан емес/.test(w))) throw new Error('ресми id ескертуі жоқ');
  await js("mura.plugins.uninstall('kz.example.hello', {})");
  await js("document.querySelector('.mura-set [data-x]').click(), 0"); await wait(300);

  // 3. Кеңейту нүктесі: «Қорғау аймағы → Нәтиже және экспорт → NIPD GeoJSON»
  await until("!!document.querySelector('#muraPlZoneExp button[data-plugin]')", 5000, 'NIPD батырмасы');
  eq(await js("document.querySelector('#muraPlZoneExp button').innerText.trim()"), 'NIPD GeoJSON', 'батырма атауы');
  // Сақталмаған, ескерткішке байланыспаған үлгі аймақ: ортақ өрістер бос → НИПД схемасына сай емес, сақтау жоқ
  await js("document.querySelector('#muraPlZoneExp button').click(), 0");
  await until("!!document.querySelector('.mura-pl-dlg [data-btn=next]')", 15000, 'плагин диалогы (1)');
  const d0 = await js("document.querySelector('.mura-pl-dlg').innerText");
  if (!/Плагин: NIPD GeoJSON Exporter/.test(d0) || !/бір рет енгізіледі/.test(d0)) throw new Error('диалог 1: ' + d0.slice(0, 400));
  await js("document.querySelector('.mura-pl-dlg [data-btn=next]').click(), 0");
  await until("!!document.querySelector('.mura-pl-dlg [data-btn=cancel]') && /Қатесі бар нысандар/.test(document.querySelector('.mura-pl-dlg').innerText)", 15000, 'тексеру терезесі');
  eq(await js("!!document.querySelector('.mura-pl-dlg [data-btn=save]')"), false, 'схемаға сай емес — сақтау жоқ');
  await js("document.querySelector('.mura-pl-dlg [data-btn=cancel]').click(), 0"); await wait(300);
  eq(saved.length, 0, 'файл сақталмады');

  // Ескерткіш белгісі + сақталған аймақ, ортақ өрістер бір рет енгізіледі: экспорт НИПД үлгісіне сай
  const ids = await js(`(async () => {
    const m = await __marks.api('save', { data: JSON.stringify({ name: 'Отырар қалашығы', name_ru: 'Городище Отырар', type: 'archeo', category: 'rep', status: 'state', period: 'I–XVIII ғғ.', oblast: 'Түркістан облысы', district: 'Отырар ауданы', lat: 42.851, lon: 68.304 }) });
    const fd = new FormData();
    fd.append('data', JSON.stringify({ fields: { name: 'Отырар қалашығы', oblast: 'Түркістан облысы', d1: '40', d2: '40', d3: '40' }, pts: __qa.state.pts, mark_id: m.id }));
    const z = await (await fetch(QA_API + '&op=save', { method: 'POST', body: fd })).json();
    return { mark: m.id, zone: z.id };
  })()`);
  const before = await js("fetch(QA_API + '&op=list', { method: 'POST', body: new FormData() }).then(r => r.json()).then(r => r.items.length)");
  const inv = js(`mura.plugins.invoke('kz.mura.nipd-exporter', 'export', { point: 'zone.export', docLang: 'kk' },
    { layer: 'zones', id: '${ids.zone}', saved: true, markId: '${ids.mark}', fields: Object.assign(__qa.snapshot().fields, { oblast: 'Түркістан облысы' }), pts: __qa.state.pts })`);
  await until("!!document.querySelector('.mura-pl-dlg [data-btn=next]')", 15000, 'диалог 1');
  await js(`(() => { const set = (k, v) => { document.querySelector('.mura-pl-dlg [data-key="' + k + '"]').value = v; };
    set('inclusion_date', '2020-08-18'); set('included_by_authority', 'Акимат Туркестанской области');
    set('responsible_organization', 'Управление культуры Туркестанской области'); set('website_link', 'https://adilet.zan.kz/rus/docs/x');
    document.querySelector('.mura-pl-dlg [data-btn=next]').click(); return 0; })()`);
  await until("!!document.querySelector('.mura-pl-dlg [data-btn=save]')", 15000, 'сақтау батырмасы');
  await js("document.querySelector('.mura-pl-dlg [data-btn=save]').click(), 0");
  const ir = await inv;
  if (!ir.ok || !ir.value.saved) throw new Error('экспорт: ' + JSON.stringify(ir));
  const fc = JSON.parse(fs.readFileSync(saved[0], 'utf8'));
  const sample = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugin-sdk', 'examples', 'nipd-exporter', 'config', 'nipd-sample.geojson'), 'utf8'));
  eq(fc.features.length, 1, 'бір нысан'); eq(fc.features[0].geometry.type, 'Polygon');
  eq(fc.features[0].geometry.coordinates[0].length, (await js('__qa.state.pts.length')) + 1, 'тек ескерткіш аумағының нүктелері');
  eq(Object.keys(fc.features[0].properties), Object.keys(sample.features[0].properties), 'НИПД өрістері мен реті');
  eq(fc.crs, sample.crs, 'QazTRF-23 белгісі');
  eq(fc.features[0].properties.name, 'Городище Отырар', 'НИПД деректері — орысша (интерфейс қазақша)');
  eq(fc.features[0].properties.monument_kind, 'Городище', 'түрі атаудан');
  eq(fc.features[0].id, ids.mark, 'Feature.id — ескерткіш id-і');
  out.nipd = fc.features[0].properties;
  // Ортақ өрістер есте қалды: келесі экспортта алдын ала толтырылған
  const inv2 = js(`mura.plugins.invoke('kz.mura.nipd-exporter', 'export', { point: 'zone.export' }, { layer: 'zones', id: '${ids.zone}', saved: true, markId: '${ids.mark}', fields: { oblast: 'Түркістан облысы' }, pts: __qa.state.pts })`);
  await until("!!document.querySelector('.mura-pl-dlg [data-key=included_by_authority]')", 15000, 'диалог 1 (қайта)');
  eq(await js("document.querySelector('.mura-pl-dlg [data-key=included_by_authority]').value"), 'Акимат Туркестанской области', 'ортақ өріс есте қалды');
  await js("document.querySelector('.mura-pl-dlg [data-btn=cancel]').click(), 0"); await inv2;
  // «Қорғау аймақтары» тізіміндегі батырма: әдепкі қамту — барлық сақталған аймақтар
  eq(await js("document.querySelectorAll('#muraPlSavedExp button[data-plugin]').length"), 1, 'тізімдегі NIPD батырмасы');
  await js("document.querySelector('#muraPlSavedExp button').click(), 0");
  await until("!!document.querySelector('.mura-pl-dlg [data-key=__scope]')", 15000, 'тізімнен шақырылған диалог');
  eq(await js("document.querySelector('.mura-pl-dlg [data-key=__scope]').value"), 'all', 'қамту — барлық сақталғандар');
  await js("document.querySelector('.mura-pl-dlg [data-btn=cancel]').click(), 0"); await wait(300);

  // 3б. «Атау сәйкестендіргіш»: каталогтан орнату, қаулының екі файлы (қазақша DOCX + орысша PDF), белгі терезесінде ұсыныс
  const FX = require('./fixtures/decree-fixture.cjs');
  const kkFile = path.join(tmp, 'q306.kaz.docx'), ruFile = path.join(tmp, 'q306.rus.pdf');
  fs.writeFileSync(kkFile, FX.makeDocx()); fs.writeFileSync(ruFile, FX.makePdf());
  const dmr = await js("mura.plugins.inspectCatalog('kz.mura.decree-matcher').then(r => r.report)");
  eq([dmr.ok, dmr.source], [true, 'official'], 'атау сәйкестендіргіш тексерілді');
  await js(`mura.plugins.install('${dmr.token}', ['files.import', 'attributes.read', 'geometry.read'])`); await wait(500);
  // Кең терезеде құралдар сыйса да, «⋯» батырмасы плагин әрекеттері үшін көрінеді (2.4.3)
  win.setSize(1920, 1080); await wait(800);
  const overflow = await js("[...document.querySelectorAll('#qaTmain .qa-tbtn[data-prio]')].some(b => b.hidden && !b.closest('.mura-off'))");
  out.wideOverflow = overflow;
  eq(await js("!document.getElementById('qaMoreBtn').hidden && document.querySelectorAll('#muraPlMenu button[data-plugin=\"kz.mura.decree-matcher\"]').length"), 1, '«⋯» көрінеді, ішінде «Қаулылар…»');
  // Бір файл — қабылданбайды
  openPaths = [kkFile];
  const mg1 = js("mura.plugins.invoke('kz.mura.decree-matcher', 'manage', { point: 'tools.menu' }, null)");
  await until("!!document.querySelector('.mura-pl-panel [data-btn=load]')", 15000, 'қаулылар панелі');
  await mg1;
  await js("document.querySelector('.mura-pl-panel [data-btn=load]').click(), 0");
  await until("/Кемінде 2 файл/.test(document.querySelector('.mura-pl-panel').innerText)", 15000, '1 файлға ескерту');
  // Екі файл — тексеру терезесі, сан енгізіледі, сақталады
  openPaths = [kkFile, ruFile];
  await js("document.querySelector('.mura-pl-panel [data-btn=load]').click(), 0");
  await until("!!document.querySelector('.mura-pl-dlg [data-btn=save]')", 20000, 'тексеру терезесі');
  const chk = await js("document.querySelector('.mura-pl-dlg').innerText");
  if (!/q306.kaz.docx/.test(chk) || !/q306.rus.pdf/.test(chk) || !/№ 306/.test(chk)) throw new Error('тексеру терезесі: ' + chk.slice(0, 500));
  await js("document.querySelector('.mura-pl-dlg [data-key=exp_r7334]').value = '2'; document.querySelector('.mura-pl-dlg [data-btn=save]').click(), 0");
  await until("/Сақталды/.test(document.querySelector('.mura-pl-panel').innerText)", 15000, 'қаулы сақталды');
  openPaths = null;
  out.decreePanel = (await js("document.querySelector('.mura-pl-panel').innerText")).split(/\n/).filter(l => /306/.test(l)).slice(0, 2);
  await js("document.querySelector('.mura-pl-panel [data-btn=close]').click(), 0"); await wait(300);
  // Белгі терезесі: атауы жазылғанда ұсыныс шығады, таңдалса екі тілдегі өрістер толтырылады
  const nMarks = await js('__marks.items.length');
  await js("__marks.openDialog({ lat: 50.2, lon: 57.3 }), 0");
  await until("!!document.getElementById('mkName')", 5000, 'белгі терезесі');
  await js("const i = document.getElementById('mkName'); i.value = 'Тест-3 қорғаны'; i.dispatchEvent(new Event('input', { bubbles: true })), 0");
  await until("!document.getElementById('mkSugBox').hidden && document.getElementById('mkSugSel').options.length > 1", 20000, 'плагин ұсынысы');
  out.suggest = await js("[...document.getElementById('mkSugSel').options].slice(1).map(o => o.text)");
  if (!/^№1 Тест-ІІІ қорғаны/.test(out.suggest[0])) throw new Error('ұсыныс: ' + JSON.stringify(out.suggest));
  await js("const s = document.getElementById('mkSugSel'); s.value = '1'; s.dispatchEvent(new Event('change', { bubbles: true })), 0");
  const filled = await js("({ name: mkName.value, name_ru: document.querySelector('[name=name_ru]').value, period: document.querySelector('[name=period]').value, period_ru: document.querySelector('[name=period_ru]').value, type: mkType.value, cat: mkCat.value })");
  eq(filled, { name: 'Тест-ІІІ қорғаны', name_ru: 'Курган Тест-ІІІ', period: 'Қола дәуірі', period_ru: 'Эпоха бронзы', type: 'archeo', cat: 'local' }, 'өрістер толтырылды');
  eq(await js('__marks.items.length'), nMarks, 'ұсыныс белгіні өзі сақтамайды');
  await js("document.getElementById('mkCancel').click(), 0"); await wait(300);
  // 2.4.4: атауы бос белгі — тізім жасырын, плагиннің кеңесі көрінеді
  await js("__marks.openDialog({ lat: 50.2, lon: 57.3 }), 0");
  await until("!document.getElementById('mkSugBox').hidden", 20000, 'кеңес (белгі)');
  eq(await js("[document.getElementById('mkSugSel').hidden, /Атауын жаза бастаңыз/.test(document.getElementById('mkSugHint').textContent)]"), [true, true], 'атаусыз: тек кеңес');
  await js("document.getElementById('mkCancel').click(), 0"); await wait(300);
  // 2.4.4: қорғау аймағының мәліметтер терезесі («Аяқтау») — атауы жазылғанда ұсыныс, таңдалса өрістер толтырылады
  await js("document.getElementById('qaFinish').click(), 0");
  await until("!!document.querySelector('.zd-dlg') && !!document.getElementById('zdSug')", 8000, 'аймақ терезесі');
  await js(`(() => { const ob = document.getElementById('qaOblast');
    if (ob && [...(ob.options || [])].some(o => o.value === 'Ақтөбе облысы')) { ob.value = 'Ақтөбе облысы'; ob.dispatchEvent(new Event('change', { bubbles: true })); }
    else if (ob) { ob.value = 'Ақтөбе облысы'; ob.dispatchEvent(new Event('input', { bubbles: true })); }
    const n = document.getElementById('qaName'); n.value = 'Айтпайка'; n.dispatchEvent(new Event('input', { bubbles: true })); return 0; })()`);
  await until("document.getElementById('zdSug').options.length > 1 && !document.getElementById('zdSug').hidden", 20000, 'аймақ: плагин ұсынысы');
  out.zoneSuggest = await js("[...document.getElementById('zdSug').options].slice(1).map(o => o.text)");
  await js("(() => { const z = document.getElementById('zdSug'); z.value = '1'; z.dispatchEvent(new Event('change', { bubbles: true })); return 0; })()");
  eq(await js("[qaName.value, qaPeriod.value, document.getElementById('qaPlaceRu') ? document.getElementById('qaPlaceRu').value : '']"),
    ['Айтпайка бейіті', 'Ерте темір дәуірі', 'в 3 километрах к юго западу от села Кос-Истек'], 'аймақ өрістері толтырылды');
  await js("document.getElementById('zdCancel').click(), 0"); await wait(300);

  // 4. Оқшаулау
  const evilFile = path.join(tmp, 'evil.muraplug');
  fs.writeFileSync(evilFile, evilPlugin(port));
  const rep = await js(`mura.plugins.inspect(${JSON.stringify(evilFile)}).then(r => r.report)`);
  eq(rep.ok, true, 'evil тексерілді');
  await js(`mura.plugins.install('${rep.token}', ['files.export', 'map.layers'])`);
  const probe = (await js("mura.plugins.invoke('kz.test.evil', 'probe', { point: 'tools.menu' }, null)")).value;
  out.probe = probe;
  const expect = { require: 'undefined', process: 'undefined', module: 'undefined', electron: 'undefined', bridge: 'onMessage,send', http: 'blocked', https: 'blocked', app: 'blocked',
    file: 'blocked', own: 'OK 200', other: 'blocked', ws: 'blocked', popup: 'blocked', eval: 'blocked', fn: 'blocked', origin: 'mura-plugin://kz.test.evil',
    noperm: 'permission', noperm2: 'permission', exe: 'blocked', txt: 'saved' };
  for (const [k, v] of Object.entries(expect)) eq(probe[k], v, 'оқшаулау: ' + k);
  eq(hits, 0, 'рұқсатсыз: жергілікті серверге бірде-бір сұраныс келмеді (fetch, ws, img, beacon, window.open)');
  // network.access берілсе де — тек HTTPS (http, ws бұрынғыдай бұғатталған)
  await js("mura.plugins.grants('kz.test.evil', ['files.export', 'map.layers', 'network.access'])");
  const probe2 = (await js("mura.plugins.invoke('kz.test.evil', 'probe', { point: 'tools.menu' }, null)")).value;
  eq([probe2.http, probe2.ws], ['blocked', 'blocked'], 'network.access: http/ws бәрібір бұғатталған');
  eq(hits, 0, 'network.access: http сұранысы серверге жетпеді');
  // Плагин мәтіні HTML ретінде салынбайды
  const dl = js("mura.plugins.invoke('kz.test.evil', 'dlg', { point: 'tools.menu' }, null)");
  await until("!!document.querySelector('.mura-pl-dlg')", 8000, 'evil диалогы');
  eq(await js("!!document.getElementById('evilHtml') || !!document.querySelector('.mura-pl-dlg img')"), false, 'HTML енгізілмеді');
  await js("document.querySelector('.mura-pl-dlg [data-btn]').click(), 0"); await dl;
  eq((await js("mura.plugins.invoke('kz.test.evil', 'layer', { point: 'tools.menu' }, null)")).ok, true, 'map.addLayer');
  eq(await js("MuraMarks.map.getPane('muraPlugins').querySelectorAll('path').length"), 1, 'плагин қабаты картада');

  // 5. Қате және шексіз цикл — бағдарлама жұмысын жалғастырады
  const th = await js("mura.plugins.invoke('kz.test.evil', 'throw', { point: 'tools.menu' }, null)");
  eq(th.ok, false, 'қате қайтарылды'); if (!/әдейі/.test(th.error)) throw new Error('қате мәтіні: ' + th.error);
  const t0 = Date.now();
  const hang = js("mura.plugins.invoke('kz.test.evil', 'hang', { point: 'tools.menu' }, null)");
  await wait(1500);
  const t1 = Date.now();
  eq(await js('1 + 1'), 2, 'бағдарлама беті жауап береді');
  out.mainLatencyMs = Date.now() - t1;
  if (out.mainLatencyMs > 1000) throw new Error('бағдарлама беті баяулады: ' + out.mainLatencyMs + ' мс');
  const hr = await hang;
  out.hangKilledAfterS = Math.round((Date.now() - t0) / 1000);
  eq(hr.ok, false, 'шексіз цикл тоқтатылды');
  eq(await js("MuraMarks.map.getPane('muraPlugins').querySelectorAll('path').length"), 0, 'тоқтатылған плагиннің қабаты алынды');
  eq((await js("mura.plugins.invoke('kz.test.evil', 'throw', { point: 'tools.menu' }, null)")).error.includes('әдейі'), true, 'плагин қайта іске қосылады');
  eq(await js("__marks.items.length"), 1, 'ескерткіштер орнында');

  // 6. Өшіру интерфейс элементтерін жасырады; жою жоба деректерін сақтайды
  await js("mura.plugins.enable('kz.mura.nipd-exporter', false)"); await wait(500);
  eq(await js("document.getElementById('muraPlZoneExp').hidden"), true, 'өшірілген плагиннің батырмасы жасырылды');
  eq((await js("mura.plugins.invoke('kz.mura.nipd-exporter', 'export', { point: 'zone.export' }, null)")).ok, false, 'өшірілген плагин орындалмайды');
  await js("mura.plugins.enable('kz.mura.nipd-exporter', true)"); await wait(500);
  eq(await js("document.getElementById('muraPlZoneExp').hidden"), false, 'қайта қосылды');
  eq(await js("document.querySelectorAll('#muraPlMenu button[data-plugin]').length"), 6, '⋯ мәзірінде evil әрекеттері (5) + атау сәйкестендіргіш');
  await js("mura.plugins.uninstall('kz.mura.nipd-exporter', { data: true })");
  await js("mura.plugins.uninstall('kz.test.evil', {})");
  await js("mura.plugins.uninstall('kz.mura.decree-matcher', { data: true })"); await wait(500);
  eq(await js("mura.plugins.contributions().then(r => r.items.length)"), 0, 'жойылғаннан кейін кеңейту жоқ');
  eq(await js("!document.getElementById('muraPlMenu') || document.getElementById('muraPlMenu').hidden"), true, '⋯ мәзірі тазартылды');
  if (!(await js("[...document.querySelectorAll('#qaTmain .qa-tbtn[data-prio]')].some(b => b.hidden && !b.closest('.mura-off'))")) && (await js("MuraSvc.get()")) !== 'zone')
    eq(await js("document.getElementById('qaMoreBtn').hidden"), true, 'плагинсіз, құралдар сыйса — «⋯» жасырын');
  eq(await js("fetch(QA_API + '&op=list', { method: 'POST', body: new FormData() }).then(r => r.json()).then(r => r.items.length)"), before, 'аймақтар сақталды');
  eq(await js("__marks.api('list', {}).then(r => r.items.length)"), 1, 'ескерткіштер сақталды');
  eq(fs.existsSync(path.join(tmp, 'plugins', 'installed', 'kz.mura.nipd-exporter')), false, 'плагин файлдары жойылды');

  console.log(JSON.stringify(out, null, 1));
  const real = errors.filter(e => !/tile|Failed to load resource|ERR_BLOCKED_BY_CLIENT|net::/i.test(e));
  if (errors.length) console.log('Консоль қателері:\n  ' + errors.join('\n  '));
  srv.close();
  console.log(real.length ? 'FAIL: консоль қателері' : 'OK');
  app.exit(real.length ? 1 : 0);
}

require('../main/main.js');
