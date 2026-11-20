/* Түтін тесті: бағдарламаны іске қосып, үлгі аймақты есептейді, сақтау API-ін, DOCX/PNG экспортын тексереді,
   терезенің скриншотын алады және шығады. Іске қосу: npx electron scripts/smoke.js [скриншот.png]
   Деректер уақытша қалтаға жазылады (нақты сақталған аймақтарға тимейді). */
const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mura-smoke-'));
app.setPath('userData', tmp);
// Жоба — уақытша .gpkg файлы (бағдарлама бастапқы терезесіз бірден ашады)
const gpkg = path.join(tmp, 'test.gpkg');
process.env.MURA_PROJECT = gpkg;
const countRows = t => { const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(gpkg); try { return db.prepare('SELECT count(*) AS n FROM "' + t + '"').get().n; } finally { db.close(); } };
const shot = process.argv.find(a => a.endsWith('.png')) || path.join(tmp, 'smoke.png');
const errors = [];

const tiles = {};
app.on('browser-window-created', (_e, win) => {
  win.webContents.session.webRequest.onCompleted({ urls: ['https://*/*'] }, d => { const h = new URL(d.url).host; const k = h + ' ' + (d.statusCode || d.error); tiles[k] = (tiles[k] || 0) + 1; });
  win.webContents.session.webRequest.onErrorOccurred({ urls: ['https://*/*'] }, d => { const k = new URL(d.url).host + ' ' + d.error; tiles[k] = (tiles[k] || 0) + 1; });
  win.webContents.on('console-message', (ev) => { if (ev.level === 'error' || ev.level === 3) errors.push(ev.message); });
  win.webContents.on('did-fail-load', (_e2, code, desc, url) => errors.push('did-fail-load ' + code + ' ' + desc + ' ' + url));
  win.webContents.once('did-finish-load', () => setTimeout(() => run(win).catch(e => { console.error('FAIL', e); app.exit(1); }), 3500));
});

async function run(win) {
  const js = s => win.webContents.executeJavaScript(s, true);
  const r = await js(`(async () => {
    const out = {};
    out.leaflet = !!window.L; out.basemaps = !!window.AqmBasemaps; out.qa = !!window.__qa; out.version = window.mura && window.mura.version;
    document.getElementById('qaSample').click();
    await new Promise(r => setTimeout(r, 1500));
    const R = __qa.R;
    out.points = __qa.state.pts.length;
    out.zones = R && !R.error && R.outer ? 'ok' : JSON.stringify(R);
    const g = __qa.geojson(); out.geoFeatures = g && g.features ? g.features.length : 0;
    const docx = await __qa.buildDocx(); out.docxBytes = docx && (docx.size || docx.byteLength || (docx.blob && docx.blob.size)) || 0;
    const fd = new FormData();
    fd.append('data', JSON.stringify({ fields: { name: 'Тест', d1: '40', d2: '40', d3: '40' }, pts: __qa.state.pts }));
    const s = await (await fetch(QA_API + '&op=save', { method: 'POST', body: fd })).json();
    out.save = s.ok ? 'ok ' + s.id : s.error;
    const l = await (await fetch(QA_API + '&op=list', { method: 'POST', body: new FormData() })).json();
    out.listed = l.items ? l.items.length : l.error;
    // GeoJSON импорты: бір файлда бірнеше ескерткіш
    const wait = t => new Promise(r => setTimeout(r, t));
    const must = (ok, msg) => { if (!ok) throw new Error('Импорт: ' + msg); };
    const list = async () => (await (await fetch(QA_API + '&op=list', { method: 'POST', body: new FormData() })).json()).items;
    const sq = (lat, lon, d = 0.0005) => [[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]];
    const gen = { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { name: 'А обасы' }, geometry: { type: 'Polygon', coordinates: [sq(50.1, 57.1)] } },
      { type: 'Feature', properties: { NAME: 'Б қорымы' }, geometry: { type: 'MultiPolygon', coordinates: [[sq(50.2, 57.2)], [sq(50.21, 57.2)]] } },
      { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [sq(50.3, 57.3)] } } ] };
    out.parseGeneric = __qa.parseZonesGeojson(gen, 'файл').map(m => m.name + ':' + m.pts.length).join(', ');
    must(out.parseGeneric === 'А обасы:4, Б қорымы (1-бөлік):4, Б қорымы (2-бөлік):4, файл — 4:4', out.parseGeneric);
    // Mura GIS пішімі, monument_id жоқ: аймақтар (қашықтықтарымен) файлдағы алдыңғы ескерткішке тиесілі
    const zf = (zone, p, c) => ({ type: 'Feature', properties: { zone, ...p }, geometry: { type: 'Polygon', coordinates: [c] } });
    const ours = { type: 'FeatureCollection', features: [
      zf('monument', { monument: 'В', district: 'Алға ауданы' }, sq(50.4, 57.4)), zf('protection', { distance_m: 50 }, sq(50.4, 57.4, 0.002)),
      zf('regulation', { distance_m: 100 }, sq(50.4, 57.4, 0.003)), zf('landscape', { distance_m: 300 }, sq(50.4, 57.4, 0.006)),
      zf('monument', { monument: 'Г' }, sq(50.5, 57.5)), zf('protection', { distance_m: 20 }, sq(50.5, 57.5, 0.002)) ] };
    out.parseOurs = __qa.parseZonesGeojson(ours).map(m => m.name + ' ' + [m.fields.d1, m.fields.d2, m.fields.d3].join('/') + ' ' + m.fields.district).join(', ');
    must(out.parseOurs === 'В 50/100/300 Алға ауданы, Г 20// ', out.parseOurs);
    // Mura GIS-тің өз «GeoJSON + QML» ZIP экспорты → терезе → барлығын тізімге қайта сақтау
    const fd2 = new FormData();   // екінші жазба — басқа қашықтықтармен (экспорттан қайта алынуы тексеріледі)
    fd2.append('data', JSON.stringify({ fields: { name: 'Тест-2', d1: '50', d2: '100', d3: '300' }, pts: __qa.state.pts.map(p => ({ lat: p.lat + 0.01, lon: p.lon })) }));
    await fetch(QA_API + '&op=save', { method: 'POST', body: fd2 });
    const l1 = await list();
    const recs = l1.filter(x => x.fields), zip = (await __qa.buildGeoBundle(recs)).blob;
    const inp = document.getElementById('qaGeoFile'), dt = new DataTransfer();
    dt.items.add(new File([zip], 'Qorgau_aimaqtary.zip')); inp.files = dt.files; inp.dispatchEvent(new Event('change')); await wait(800);
    const dlg = document.querySelector('.gj-dlg');
    must(dlg, 'терезе ашылмады (' + recs.length + ' жазба)');
    out.impRows = dlg.querySelectorAll('.gj-row').length + ' жол, тізімде бар ' + dlg.querySelectorAll('.gj-tag').length + ': ' + [...dlg.querySelectorAll('.gj-row')].map(r => r.textContent).join(' | ');
    must(recs.length >= 2 && dlg.querySelectorAll('.gj-row').length === recs.length && dlg.querySelectorAll('.gj-tag').length === recs.length, out.impRows);
    must(document.getElementById('gjSave').disabled, 'тізімде барлары әдепкіде белгіленбеуі керек');
    document.getElementById('gjAll').click(); document.getElementById('gjSave').click(); await wait(800);
    const l2 = await list();
    out.impSaved = (l2.length - l1.length) + ' жаңа жазба, терезе ' + !!document.querySelector('.gj-dlg') + ', панель ' + !document.getElementById('qaPanelSaved').hidden;
    must(l2.length === 2 * l1.length && !document.querySelector('.gj-dlg'), out.impSaved);
    const same = recs.every(r => l2.filter(x => x.name === r.name && x.fields.d1 === r.fields.d1 && x.fields.d3 === r.fields.d3 && x.pts.length === r.pts.length).length === 2);
    must(same, 'атауы, қашықтықтары, нүктелері сақталмады');
    // Бір ескерткіш — бұрынғыдай редакторға ашылады
    const one = { type: 'FeatureCollection', features: [gen.features[0]] };
    const dt1 = new DataTransfer(); dt1.items.add(new File([JSON.stringify(one)], 'bir.geojson')); inp.files = dt1.files; inp.dispatchEvent(new Event('change')); await wait(500);
    out.impOne = 'терезе ' + !!document.querySelector('.gj-dlg') + ', нүкте ' + __qa.state.pts.length;
    must(out.impOne === 'терезе false, нүкте 4', out.impOne);
    out.title = document.title; out.oldTop = !!document.querySelector('.qa-top');
    out.status = document.getElementById('muraRec').textContent + ' | ' + document.getElementById('muraScale').textContent; out.panelBtns = !!document.querySelector('.mura-bar #qaOpenInfo');
    return out;
  })()`);
  await new Promise(res => setTimeout(res, 2500));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(shot, img.toPNG());
  await js("document.getElementById('qaOpenInfo').click()");
  await new Promise(res => setTimeout(res, 1200));
  fs.writeFileSync(shot.replace(/.png$/, '-panel.png'), (await win.webContents.capturePage()).toPNG());
  // Карта қабаттары: мәзір, OpenTopoMap, Esri топо, спутник + атаулар қабаты
  await js("document.querySelector('#qaOpenInfo').click(); document.querySelector('.bm-trigger').click()");
  await new Promise(res => setTimeout(res, 600));
  fs.writeFileSync(shot.replace(/.png$/, '-layers.png'), (await win.webContents.capturePage()).toPNG());
  r.layers = await js(`(async () => {
    const pick = t => [...document.querySelectorAll('.mura-opt')].find(o => o.textContent.includes(t)).click();
    const out = {};
    for (const t of ['Esri World Topo', 'Спутник', 'OpenTopoMap', 'Генштаб 1:1', 'Генштаб (КСРО']) {
      pick(t); await new Promise(r => setTimeout(r, 2500));
      out[t] = (document.querySelector('.qa-map').classList.contains('is-sat') ? 'sat' : 'std') + ' / сызба фоны: ' + document.getElementById('qaSchemeBase').textContent;
    }
    // Генштаб: нақты масштабы z13 — картаны 4 деңгей кішірейтеміз
    for (let i = 0; i < 4; i++) { document.querySelector('.leaflet-control-zoom-out').click(); await new Promise(r => setTimeout(r, 500)); }
    await new Promise(r => setTimeout(r, 3000));
    out.gshTiles = [...document.querySelectorAll('.leaflet-tile-loaded')].filter(i => i.src.includes('nakarte')).length;
    out.onMap = [...document.querySelectorAll('.qa-map .leaflet-layer')].map(l => { const i = l.querySelector('img'); return (i ? new URL(i.src).host : '-') + ' z' + getComputedStyle(l).zIndex + ' op' + getComputedStyle(l).opacity; });
    pick('Атаулар'); await new Promise(r => setTimeout(r, 2000));
    out.saved = localStorage.getItem('mura.basemap') + ' ' + localStorage.getItem('mura.overlays');
    out.notice = !!document.querySelector('.bm-notice');
    // Өз XYZ картасын қосу: алдымен қате мекенжай, сосын дұрысы
    document.querySelector('.mura-add').click();
    const f = document.querySelector('.mura-dlg');
    f.elements.label.value = 'Тест XYZ'; f.elements.url.value = 'https://example.com/tiles';
    f.requestSubmit(); out.badUrl = document.querySelector('.mura-err').textContent;
    f.elements.url.value = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
    f.requestSubmit(); await new Promise(r => setTimeout(r, 1500));
    out.custom = !!document.querySelector('.mura-dlg') ? 'терезе жабылмады' : localStorage.getItem('mura.basemap') + ' | ' + [...document.querySelectorAll('.mura-opt')].map(o => o.textContent).filter(t => t.includes('Тест')).join();
    pick('Генштаб (КСРО'); await new Promise(r => setTimeout(r, 3000));   // скриншот — Генштаб картасымен
    return out;
  })()`);
  fs.writeFileSync(shot.replace(/.png$/, '-otm.png'), (await win.webContents.capturePage()).toPNG());
  r.tilesLoaded = await js("document.querySelectorAll('.leaflet-tile-loaded').length");
  r.requests = tiles;
  r.storeFile = countRows('zones') + ' жазба (GeoPackage)';
  console.log(JSON.stringify(r, null, 1));
  console.log('Скриншот:', shot);
  const real = errors.filter(e => !/tile|Failed to load resource/i.test(e));
  if (errors.length) console.log('Консоль қателері:\n  ' + errors.join('\n  '));
  app.exit(real.length || !r.zones || !r.docxBytes || !String(r.save).startsWith('ok') ? 1 : 0);
}

require('../main/main.js');
