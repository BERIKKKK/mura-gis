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
      { name: 'Абат-Байтақ кесенесі', district: 'Алға ауданы', lat: 50.1, lon: 57.2, type: 'arch', period: 'XIV ғасыр', category: 'intl' },
      { name: 'Ескерткіш белгі', district: '', lat: 50.3, lon: 57.1, type: 'art', status: 'prelim' },
      { name: 'Райымбек батыр кесенесі', oblast: 'Алматы қаласы', district: 'Алмалы ауданы', lat: 43.25, lon: 76.93, type: 'sacred', status: 'archreg', category: 'rep' },
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
    out.sections = M.exportSections().map(x => x.title + ' [' + x.marks.length + ']');
    out.titleMulti = document.getElementById('mkTitle').disabled + ' ' + document.getElementById('mkTitleMulti').textContent.slice(0, 60);
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

    // Құралдар жолағының реті және «Аяқтау» → мәліметтер терезесі → сақтау
    M.closePanel();
    out.toolbar = [...document.querySelectorAll('#qaTmain .qa-tgroup')].map(g => [...g.querySelectorAll('.qa-tbtn')].map(b => b.id.replace(/^(qa|mk)/, '')).join(',')).join(' | ');
    out.savedLabel = document.querySelector('#qaOpenSaved .qa-tl').textContent + ' / ' + document.getElementById('qaPanelSavedT').textContent;
    out.finish0 = document.getElementById('qaFinish').disabled;
    out.saveHidden = getComputedStyle(document.getElementById('qaSave')).display;
    await M.api('save', { data: JSON.stringify({ name: 'Ішкі тест кешені', oblast: 'Ақтөбе облысы', district: 'Қарғалы ауданы', period: 'орта ғасырлар', place: 'Үлгі орны', type: 'ensemble', category: 'local', status: 'state', lat: 50.4123, lon: 57.0412 }) });
    document.getElementById('qaSample').click(); await wait(1200);
    document.getElementById('qaName').value = ''; document.getElementById('qaName').dispatchEvent(new Event('input'));
    out.finish1 = document.getElementById('qaFinish').disabled;
    document.getElementById('qaFinish').click(); await wait(200);
    const zd = document.querySelector('.zd-dlg');
    out.zdFields = !!(zd && zd.contains(document.getElementById('qaName')) && zd.contains(document.getElementById('qaD1')) && zd.contains(document.getElementById('qaRes')));
    out.zdAuto = (document.getElementById('zdMark') || {}).selectedOptions?.[0]?.textContent + ' → ' + document.getElementById('qaName').value + ' / ' + document.getElementById('qaType').value + ' / ' + document.getElementById('qaD1').value + ' м / ' + document.getElementById('qaPeriod').value;
    out.zdAddOff = document.getElementById('qaAddMode').getAttribute('aria-pressed');
    document.getElementById('qaName').value = ''; zd.requestSubmit(); await wait(100);
    out.zdNoName = document.getElementById('zdErr').textContent;
    document.getElementById('qaName').value = 'Аяқтау тесті қорымы'; document.getElementById('qaName').dispatchEvent(new Event('input'));
    zd.requestSubmit(); await wait(1500);
    out.zdAfter = 'dialog ' + !!document.querySelector('.zd-dlg') + ', loaded ' + __qa.state.loadedName + ', panelBack ' + document.getElementById('qaPanelInfo').contains(document.getElementById('qaName')) + ', saved ' + document.getElementById('qaSavedCount').textContent;
    out.titleLoaded = document.title + ' / ' + document.getElementById('qaLoaded').textContent + ' hidden=' + document.getElementById('qaLoaded').hidden;
    // Белгіден жаңа қорғау аймағын бастау: тазалауды растап, мәліметтер белгіден толтырылады
    const mk = M.items.find(m => m.name.startsWith('Абат'));
    const pz = MuraZone.startFromMark(mk); await wait(300);
    document.querySelector('.qa-dlg-back [data-v="1"]')?.click(); await pz; await wait(300);
    out.fromMark = __qa.state.pts.length + ' pts, name ' + document.getElementById('qaName').value + ' / ' + document.getElementById('qaDistrict').value + ' / ' + document.getElementById('qaType').value + ', add ' + document.getElementById('qaAddMode').getAttribute('aria-pressed');
    out.infoHidden = getComputedStyle(document.getElementById('qaOpenInfo')).display;
    // «Қорғау аймақтары» → «Өңдеу»: жазба ашылып, мәліметтер терезесі шығады
    document.getElementById('qaOpenSaved').click(); await wait(300);
    const ze = document.querySelector('[data-zedit]');
    out.savedActs = ze ? [...ze.parentNode.querySelectorAll('button')].map(b => b.textContent).join(', ') : 'жоқ';
    ze?.click(); await wait(800);
    out.zedit = 'dialog ' + !!document.querySelector('.zd-dlg') + ', loaded ' + __qa.state.loadedName + ', title ' + (document.getElementById('zdT') || {}).textContent;
    document.getElementById('zdCancel')?.click(); await wait(100);
    // Оң жақ батырма: картада
    const mp = MuraMarks.map, cc = mp.getCenter(), cp = mp.latLngToContainerPoint(cc), rr = document.getElementById('qaMap').getBoundingClientRect();
    const fireCtx = () => mp.fire('contextmenu', { latlng: cc, containerPoint: cp, originalEvent: new MouseEvent('contextmenu', { clientX: rr.left + cp.x, clientY: rr.top + cp.y }) });
    await mura.clipWrite('бос мәтін'); fireCtx(); await wait(300);
    out.ctxItems = [...document.querySelectorAll('.mura-ctx button')].map(b => (b.disabled ? '×' : '') + b.querySelector('span').firstChild.textContent).join(' | ');
    document.querySelector('.mura-ctx button[data-i="0"]').click(); await wait(200);
    out.ctxCopied = await mura.clipRead();
    await mura.clipWrite('50°24′44,4″ N, 57°02′28,4″ E'); fireCtx(); await wait(300);
    const pb = document.querySelector('.mura-ctx button[data-i="2"]');
    out.ctxPaste = (pb.disabled ? 'disabled' : 'enabled ' + pb.querySelector('small').textContent);
    pb.click(); await wait(300);
    out.ctxPasted = document.getElementById('qaInLat').value + ' / ' + document.getElementById('qaInLon').value;
    out.exportHidden = getComputedStyle(document.getElementById('qaExportBtn')).display;
    document.getElementById('qaOpenSaved').click(); await wait(300);
    out.savedActs2 = [...document.querySelector('.qa-sc-act').querySelectorAll('button')].filter(b => getComputedStyle(b).display !== 'none').map(b => b.textContent).join(', ');
    document.querySelector('[data-zexp]').click(); await wait(200);
    out.expMenu = [...document.querySelectorAll('.mura-ctx button')].map(b => b.querySelector('span').firstChild.textContent).join(' | ');
    out.expOpts = !!document.querySelector('#qaPanelSaved .zd-expopts #qaGeoMode') + ' / ' + (document.querySelector('.zd-combt') || {}).textContent;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    document.getElementById('qaOpenSaved').click(); await wait(200);
    // Шекараны 1-нүктені басып жабу → терезе ашылады
    document.getElementById('qaSample').click(); await wait(1200);
    document.querySelector('.qa-dlg-back [data-v="1"]')?.click(); await wait(1200);
    if (document.getElementById('qaAddMode').getAttribute('aria-pressed') !== 'true') document.getElementById('qaAddMode').click();
    await wait(200);
    const v1 = [...document.querySelectorAll('.qa-vx')].find(v => v.textContent.trim() === '1');
    const vr = v1.getBoundingClientRect(), xy = { clientX: vr.left + 5, clientY: vr.top + 5, bubbles: true };
    v1.dispatchEvent(new PointerEvent('pointerdown', xy)); v1.dispatchEvent(new MouseEvent('click', xy)); await wait(300);
    out.closeByFirst = 'dialog ' + !!document.querySelector('.zd-dlg') + ', pts ' + __qa.state.pts.length + ', add ' + document.getElementById('qaAddMode').getAttribute('aria-pressed');
    document.getElementById('zdCancel')?.click(); await wait(100);
    // Поповер батырманың астында
    document.getElementById('qaSnapBtn').click(); await wait(300);
    const pb2 = document.getElementById('qaSnapBtn').getBoundingClientRect(), pp = document.getElementById('qaPopMeasure').getBoundingClientRect();
    out.popUnder = Math.round(pp.left - pb2.left) + 'px / ' + Math.round(pp.top - pb2.bottom) + 'px';
    document.getElementById('qaSnapBtn').click(); await wait(100);
    document.getElementById('qaRectBtn').click(); await wait(300);
    const rb = document.getElementById('qaRectBtn').getBoundingClientRect(), rp = document.getElementById('qaPopRect').getBoundingClientRect();
    out.rectUnder = Math.round(rp.left - rb.left) + 'px / ' + Math.round(rp.top - rb.bottom) + 'px';
    document.getElementById('qaRectBtn').click(); await wait(100);
    out.moreMenu = [...document.querySelectorAll('#qaMoreMenu .qa-mi')].filter(b => getComputedStyle(b).display !== 'none' && !b.hidden).map(b => b.textContent.trim()).join(' | ');
    // Сызғыш: өлшеу, картадағы «×» арқылы өшіру
    document.getElementById('qaRuler').click(); await wait(100);
    const mq = MuraMarks.map, c0 = mq.getCenter(), c1 = { lat: c0.lat + 0.0003, lng: c0.lng + 0.0004 };
    for (const ll of [c0, c1]) { mq.fire('click', { latlng: ll, containerPoint: mq.latLngToContainerPoint(ll), originalEvent: new MouseEvent('click') }); await wait(150); }
    document.getElementById('qaRuler').click(); await wait(200);
    out.rulerBefore = document.querySelectorAll('#qaRulerList li').length + ' өлшем, × ' + document.querySelectorAll('.mura-rdel').length;
    document.querySelector('.mura-rdel')?.click(); await wait(200);
    out.rulerAfter = document.querySelectorAll('#qaRulerList li').length + ' өлшем, × ' + document.querySelectorAll('.mura-rdel').length;
    // Сызғышты шеткі нүктеден жалғастыру (магнит), циркуль, «Барлық өлшемді жабу»
    const at = (ll, dx = 0) => { const p = mq.latLngToContainerPoint(ll); p.x += dx; return { latlng: mq.containerPointToLatLng(p), containerPoint: p, originalEvent: new MouseEvent('click') }; };
    const click = async (ll, dx) => { mq.fire('click', at(ll, dx)); await wait(120); };
    const must = (ok, msg) => { if (!ok) throw new Error('Өлшеу: ' + msg); };
    // Шекарадан алыс бос жер, ірі масштаб — нүктелер сызықтарға магниттелмейді
    mq.setView([c0.lat + 0.05, c0.lng + 0.05], 18, { animate: false }); await wait(200);
    const b0 = mq.getCenter(), d0 = { lat: b0.lat, lng: b0.lng }, d1 = { lat: b0.lat + 0.0003, lng: b0.lng + 0.0004 };
    const c2 = { lat: b0.lat + 0.0006, lng: b0.lng - 0.0002 }, c3 = { lat: b0.lat - 0.0004, lng: b0.lng };
    document.getElementById('qaRuler').click(); await wait(100);
    await click(d0); await click(d1);                   // 1-кесінді
    await click(d1, 6); await click(c2);                // d1-ге 6 px жақын басу — соңынан жалғасады
    await click(d0, -5); await click(c3);               // басынан жалғасады
    const rli = document.querySelectorAll('#qaRulerList li');
    out.rulerChain = rli.length + ': ' + (rli[0] && rli[0].textContent);
    must(rli.length === 1 && /Σ/.test(rli[0].textContent) && /3 кесінді/.test(rli[0].textContent), 'жалғастыру: ' + out.rulerChain);
    const tot = [[c3, d0], [d0, d1], [d1, c2]].reduce((s, [a, b]) => s + mq.distance(a, b), 0);
    out.rulerTotal = 'Leaflet ' + tot.toFixed(2) + ' м / бағдарлама ' + rli[0].querySelector('b').textContent;
    must(Math.abs(parseFloat(rli[0].querySelector('b').textContent.replace('Σ', '').replace(',', '.')) - tot) < Math.max(0.5, tot * 0.01), 'жалпы ұзындық: ' + out.rulerTotal);
    document.getElementById('qaCompass').click(); await wait(100);
    out.modes = 'сызғыш ' + document.getElementById('qaRuler').getAttribute('aria-pressed') + ', циркуль ' + document.getElementById('qaCompass').getAttribute('aria-pressed');
    must(out.modes === 'сызғыш false, циркуль true', 'режимдер: ' + out.modes);
    await click(d0); await click(c2);
    const cli = document.querySelectorAll('#qaRulerList li');
    out.compass = cli.length + ' өлшем, × ' + document.querySelectorAll('.mura-rdel').length + ': ' + (cli[1] && cli[1].textContent);
    const R = mq.distance(d0, c2), Rv = parseFloat(cli[1].querySelector('b').textContent.replace('R', '').replace(',', '.'));
    must(cli.length === 2 && document.querySelectorAll('.mura-rdel').length === 2 && Math.abs(Rv - R) < Math.max(0.3, R * 0.01) && /D /.test(cli[1].textContent), 'циркуль: ' + out.compass);
    const clr = document.getElementById('qaMeasureClear');
    must(!clr.disabled, '«Жабу» батырмасы белсенді емес');
    clr.click(); await wait(150);
    out.cleared = document.querySelectorAll('#qaRulerList li').length + ' өлшем, жазу ' + document.querySelectorAll('.qa-rlbl').length + ', батырма ' + (clr.disabled ? 'өшік' : 'белсенді');
    must(out.cleared === '0 өлшем, жазу 0, батырма өшік', 'жабу: ' + out.cleared);
    document.getElementById('qaCompass').click(); await wait(100);
    // Импорт: KML, KMZ, GPX → «Импортталғандар», сәйкестендіру → белгі
    const kml = '<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Барлау 2025</name><Folder><name>Қорғандар</name>' +
      '<Placemark><name>Қорған-ІІІ</name><description><![CDATA[<b>диаметрі</b> 12 м]]></description><Point><coordinates>57.05,50.42,0</coordinates></Point></Placemark>' +
      '<Placemark><name>Қоршау</name><Polygon><outerBoundaryIs><LinearRing><coordinates>57.06,50.43 57.07,50.43 57.07,50.44 57.06,50.43</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Folder></Document></kml>';
    const gpx = '<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><wpt lat="50.45" lon="57.1"><name>Тас мүсін</name><desc>жол жиегінде</desc></wpt><wpt lat="50.46" lon="57.11"><name>WP2</name></wpt></gpx>';
    const ff = await new Promise(r => { const s = document.createElement('script'); s.src = 'vendor/fflate.js'; s.onload = () => r(globalThis.fflate); document.head.appendChild(s); });
    const kmz = ff.zipSync({ 'doc.kml': ff.strToU8(kml.replace('Қорған-ІІІ', 'Қорған-ІV')) });
    const dt = new DataTransfer();
    dt.items.add(new File([kml], 'barlau.kml')); dt.items.add(new File([kmz], 'barlau.kmz')); dt.items.add(new File([gpx], 'jol.gpx'));
    const inp = document.getElementById('mkGeoFile'); inp.files = dt.files; inp.dispatchEvent(new Event('change')); await wait(2500);
    out.imported = M.imports.length + ': ' + M.imports.map(x => x.name + '@' + x.file).join(', ');
    out.impDesc = (M.imports.find(x => x.name === 'Қорған-ІІІ') || {}).desc + ' / ' + (M.imports.find(x => x.name === 'Қоршау') || {}).desc;
    out.impTab = document.getElementById('mkTabImpB').getAttribute('aria-selected') + ' / cards ' + document.querySelectorAll('#mkImpList .mk-impcard').length + ' / map ' + document.querySelectorAll('.mk-imp:not(.mk-imp--inline)').length;
    const before = M.items.length, x0 = M.imports.find(x => x.name === 'Тас мүсін');
    M.identify(x0); await wait(300);
    out.identDlg = document.getElementById('mkDlgT').textContent + ' / ' + document.getElementById('mkName').value + ' / ' + document.getElementById('mkNote').value.split(String.fromCharCode(10)).join(' | ');
    document.querySelector('.mk-dlg').requestSubmit(); await wait(800);
    out.identAfter = 'marks +' + (M.items.length - before) + ', imports ' + M.imports.length + ', left: ' + M.imports.map(x => x.name).join(', ');
    out.title = document.title + ' / status: ' + document.getElementById('muraRec').textContent;
    const g = M.geojson(M.filtered(), 'x'); out.geo = g.features.length + ' ' + JSON.stringify(g.features[0].geometry);
    const d = await M.buildDocx(); out.docx = d.size;
    const p = await M.buildPdf(); out.pdf = p.size + ' ' + (await p.slice(0, 5).text());
    window.__docx = new Uint8Array(await d.arrayBuffer()); window.__pdf = new Uint8Array(await p.arrayBuffer());
    return out;
  })().catch(e => ({ ERROR: String(e && e.stack || e) }))`);
  if (r.ERROR) { console.error('FAIL', r.ERROR); app.exit(1); return; }
  fs.writeFileSync(path.join(tmp, 'list.docx'), Buffer.from(await js('Array.from(window.__docx)')));
  fs.writeFileSync(path.join(tmp, 'list.pdf'), Buffer.from(await js('Array.from(window.__pdf)')));
  await js("__marks.closePanel(); __marks.openPanel(); MuraMarks.map.setView([50.712, 56.512], 15); 0");
  await new Promise(res => setTimeout(res, 2500));
  fs.writeFileSync(shot, (await win.webContents.capturePage()).toPNG());
  await js("(__marks.openDialog(__marks.items.find(m => m.name.includes('ІҮ'))), 0)");
  await new Promise(res => setTimeout(res, 500));
  fs.writeFileSync(shot.replace(/\.png$/, '-dlg.png'), (await win.webContents.capturePage()).toPNG());
  await js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); __marks.closePanel(); MuraZone.openDialog(); 0");
  await new Promise(res => setTimeout(res, 500));
  fs.writeFileSync(shot.replace(/.png$/, '-zone.png'), (await win.webContents.capturePage()).toPNG());
  await js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); (() => { const mp = MuraMarks.map, c = mp.getCenter(), p = mp.latLngToContainerPoint(c), r = document.getElementById('qaMap').getBoundingClientRect(); mp.fire('contextmenu', { latlng: c, containerPoint: p, originalEvent: new MouseEvent('contextmenu', { clientX: r.left + p.x, clientY: r.top + p.y }) }); })(); 0");
  await new Promise(res => setTimeout(res, 500));
  fs.writeFileSync(shot.replace(/.png$/, '-ctx.png'), (await win.webContents.capturePage()).toPNG());
  await js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); __marks.setTab('imp'); const b = L.latLngBounds(__marks.imports.map(x => [x.lat, x.lon])); MuraMarks.map.fitBounds(b.pad(0.3)); 0");
  await new Promise(res => setTimeout(res, 2500));
  fs.writeFileSync(shot.replace(/.png$/, '-imp.png'), (await win.webContents.capturePage()).toPNG());
  r.files = tmp;
  r.storeFile = JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'marks.json'), 'utf8')).length + ' белгі';
  console.log(JSON.stringify(r, null, 1));
  const real = errors.filter(e => !/tile|Failed to load resource/i.test(e));
  if (errors.length) console.log('Консоль қателері:\n  ' + errors.join('\n  '));
  app.exit(real.length ? 1 : 0);
}

require('../main/main.js');
