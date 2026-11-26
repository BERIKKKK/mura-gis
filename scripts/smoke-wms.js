/* Түтін тесті: үстіңгі WMS қабаттары (js/wms.js, js/wms-ui.js).
   1) Желісіз бөлік: GetCapabilities талдау (1.1.1 / 1.3.0, мұрагерлік), осьтер реті (1.3.0 + EPSG:4326), GetFeatureInfo жауаптары.
   2) Нақты НИПД сервері (map.gov.kz; MURA_WMS_LIVE=0 — өткізіп жіберу): тексеру, Ақтөбе облысының шекаралары спутник және
      тарихи карта үстінде, бірнеше масштаб, мөлдірлік, бірнеше қабат, қабаттар реті, GetFeatureInfo, қолданушының WMS
      сервисі (1.1.1 + EPSG:4326), қате сервер, XML қатесі сурет ретінде алынбайтыны, интернетсіз жұмыс, баптаулардың сақталуы.
   Іске қосу: npm run smoke:wms [скриншот.png] */
const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mura-wms-'));
app.setPath('userData', tmp);
process.env.MURA_PROJECT = path.join(tmp, 'test.gpkg');
const shot = process.argv.find(a => a.endsWith('.png')) || path.join(tmp, 'wms.png');
const LIVE = process.env.MURA_WMS_LIVE !== '0';
const errors = [], reqs = {};
let loads = 0;

app.on('browser-window-created', (_e, win) => {
  win.webContents.session.webRequest.onCompleted({ urls: ['https://map.gov.kz/*'] }, d => { const k = (new URL(d.url).searchParams.get('REQUEST') || '?') + ' ' + d.statusCode; reqs[k] = (reqs[k] || 0) + 1; });
  win.webContents.on('console-message', ev => { if (ev.level === 'error' || ev.level === 3) errors.push(ev.message); });
  win.webContents.on('did-finish-load', () => { loads++; if (loads === 1) setTimeout(() => run(win).catch(e => { console.error('FAIL', e); app.exit(1); }), 3000); });
});

const wait = ms => new Promise(r => setTimeout(r, ms));
async function run(win) {
  const js = async s => {
    const v = await win.webContents.executeJavaScript('(async () => { try { return await (' + s + '); } catch (e) { return { __err: String(e && e.stack || e) }; } })()', true);
    if (v && v.__err) throw new Error(v.__err);
    return v;
  };
  const fail = [];
  // Скриншот — тек көмекші: GPU қатесі тестті құлатпайды
  const snap = async file => { try { fs.writeFileSync(file, (await win.webContents.capturePage()).toPNG()); } catch (e) { console.log('скриншот алынбады:', file, e.message); } };
  const must = (ok, msg) => { if (!ok) fail.push(msg); };

  /* ---------- 1. Желісіз бөлік ---------- */
  console.log("step unit");
  const u = await js(`(() => {
    const W = MuraWms, out = {};
    const c13 = '<?xml version="1.0"?><WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms" xmlns:xlink="http://www.w3.org/1999/xlink"><Service><Title>T13</Title></Service>' +
      '<Capability><Request><GetMap><Format>image/png</Format><Format>image/jpeg</Format><DCPType><HTTP><Get><OnlineResource xlink:href="http://internal:8080/wms?"/></Get></HTTP></DCPType></GetMap>' +
      '<GetFeatureInfo><Format>application/json</Format><DCPType><HTTP><Get><OnlineResource xlink:href="https://ex.kz/ows?SERVICE=WMS&amp;"/></Get></HTTP></DCPType></GetFeatureInfo></Request>' +
      '<Layer><Title>root</Title><CRS>EPSG:4326</CRS><CRS>EPSG:3857</CRS><EX_GeographicBoundingBox><westBoundLongitude>46</westBoundLongitude><eastBoundLongitude>88</eastBoundLongitude><southBoundLatitude>40</southBoundLatitude><northBoundLatitude>56</northBoundLatitude></EX_GeographicBoundingBox>' +
      '<Style><Name>base</Name><Title>Base</Title></Style><Attribution><Title>Иесі</Title></Attribution>' +
      '<Layer queryable="1"><Name>ws:a</Name><Title>А қабаты</Title><Style><Name>outline</Name><Title>Контур</Title></Style></Layer>' +
      '<Layer><Name>ws:b</Name><Title>B</Title><EX_GeographicBoundingBox><westBoundLongitude>56</westBoundLongitude><eastBoundLongitude>58</eastBoundLongitude><southBoundLatitude>50</southBoundLatitude><northBoundLatitude>51</northBoundLatitude></EX_GeographicBoundingBox></Layer></Layer></Capability></WMS_Capabilities>';
    const a = W.parseCaps(c13, 'https://ex.kz/wms?SERVICE=WMS&REQUEST=GetCapabilities');
    out.v13 = [a.version, a.layers.map(l => l.name + ':' + l.styles.map(s => s.name).join('+') + ':' + l.crs.join('+') + ':' + l.queryable + ':' + (l.attribution && l.attribution.title) + ':' + l.bbox.join('/')).join(' | '), a.getMap, a.getInfo].join(' ; ');
    const c11 = '<WMT_MS_Capabilities version="1.1.1"><Service><Title>T11</Title></Service><Capability><Request><GetMap><Format>image/png</Format></GetMap></Request>' +
      '<Layer><SRS>EPSG:4326</SRS><LatLonBoundingBox minx="50" miny="45" maxx="60" maxy="52"/><Layer queryable="0"><Name>x</Name><Title>X</Title></Layer></Layer></Capability></WMT_MS_Capabilities>';
    const b = W.parseCaps(c11, 'https://ex2.kz/cgi?map=a.map');
    out.v11 = [b.version, b.layers.map(l => l.name + ':' + l.crs.join('+') + ':' + l.bbox.join('/')).join(), b.getMap].join(' ; ');
    try { W.parseCaps('<ServiceExceptionReport><ServiceException code="InvalidFormat">bad</ServiceException></ServiceExceptionReport>', 'https://e.kz/'); out.exc = 'no error'; }
    catch (e) { out.exc = e.message + ' ' + e.detail; }
    // Осьтер реті: 1.3.0 + EPSG:4326 → BBOX = lat,lon; 1.1.1 → lon,lat; EPSG:3857 → метр
    const tu = (v, crs) => { const l = W.layer({ url: 'https://wms.example.invalid/wms', layers: ['a'], version: v, crs, opacity: 0 }).addTo(MuraMarks.map);
      const q = new URL(l.getTileUrl(Object.assign(L.point(42, 22), { z: 7 }))).searchParams; MuraMarks.map.removeLayer(l); return q; };
    const p13 = tu('1.3.0', 'EPSG:4326'), p11 = tu('1.1.1', 'EPSG:4326'), p3857 = tu('1.3.0', 'EPSG:3857');
    out.bbox13 = p13.get('CRS') + ' ' + p13.get('BBOX'); out.bbox11 = p11.get('SRS') + ' ' + p11.get('BBOX'); out.bbox3857 = p3857.get('CRS') + ' ' + p3857.get('BBOX');
    out.params = ['FORMAT', 'TRANSPARENT', 'EXCEPTIONS', 'WIDTH', 'STYLES'].map(k => k + '=' + p13.get(k)).join('&');
    out.infoJson = JSON.stringify(W.parseInfo('{"type":"FeatureCollection","features":[{"id":"f.1","properties":{"name_ru":"Актобе","geom":null}}]}', 'application/json'));
    out.infoHtml = JSON.stringify(W.parseInfo('<html><body><script>x()</script><table><tr><td>Аты</td><td>Ақтөбе</td></tr></table></body></html>', 'text/html'));
    out.infoExc = JSON.stringify(W.parseInfo('<?xml version="1.0"?><ServiceExceptionReport><ServiceException>LayerNotQueryable</ServiceException></ServiceExceptionReport>', 'text/xml'));
    return out;
  })()`);
  must(u.v13 === '1.3.0 ; ws:a:base+outline:EPSG:3857+EPSG:4326:true:Иесі:46/40/88/56 | ws:b:base:EPSG:3857+EPSG:4326:false:Иесі:56/50/58/51 ; https://ex.kz/wms ; https://ex.kz/ows', 'v13: ' + u.v13);
  must(u.v11 === '1.1.1 ; x:EPSG:4326:50/45/60/52 ; https://ex2.kz/cgi?map=a.map', 'v11: ' + u.v11);
  must(u.exc === 'exception InvalidFormat: bad', 'exc: ' + u.exc);
  const b13 = u.bbox13.split(' ')[1].split(',').map(Number), b11 = u.bbox11.split(' ')[1].split(',').map(Number);
  must(u.bbox13.startsWith('EPSG:4326') && b13[0] > 40 && b13[0] < 56 && b13[1] > 46 && b13[1] < 88, '1.3.0 осьтер реті (lat,lon): ' + u.bbox13);
  must(u.bbox11.startsWith('EPSG:4326') && b11[0] === b13[1] && b11[1] === b13[0], '1.1.1 осьтер реті (lon,lat): ' + u.bbox11);
  must(u.bbox3857.startsWith('EPSG:3857') && Math.abs(+u.bbox3857.split(' ')[1].split(',')[0]) > 1e5, '3857: ' + u.bbox3857);
  must(u.params === 'FORMAT=image/png&TRANSPARENT=true&EXCEPTIONS=XML&WIDTH=512&STYLES=', 'параметрлер: ' + u.params);
  must(/"name_ru":"Актобе"/.test(u.infoJson) && !/geom/.test(u.infoJson), 'GFI JSON: ' + u.infoJson);
  must(/Ақтөбе/.test(u.infoHtml), 'GFI HTML: ' + u.infoHtml);
  must(/"error":true/.test(u.infoExc), 'GFI қатесі: ' + u.infoExc);
  const r = { unit: u };

  if (LIVE) {
    /* ---------- 2. НИПД ---------- */
    console.log("step", "r.nipd = await js(".slice(2, 12), new Date().toISOString().slice(11, 19));
    r.nipd = await js(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms)), out = {};
      const O = MuraOverlays.current, map = MuraMarks.map;
      document.querySelector('.bm-trigger').click(); await wait(300);
      out.m1 = document.querySelector('.bm-menu').hidden;
      document.querySelector('.ov-sec[data-sec="nipd"]').click();
      out.m2 = document.querySelector('.bm-menu').hidden;
      for (let i = 0; i < 60 && document.querySelector('.ov-st--checking'); i++) await wait(500);
      out.status = [...document.querySelectorAll('.ov-row')].map(r => r.dataset.id.replace('nipd:', '') + '=' + r.querySelector('.ov-st').textContent).join(', ');
      out.m3 = document.querySelector('.bm-menu').hidden;
      document.querySelector('.ov-sec[data-sec="nipd"]').scrollIntoView({ block: 'start' });
      out.allOff = Object.values(O._state().st.items).every(x => !x.on);
      out.absentNote = !!document.querySelector('.ov-note') && document.body.textContent.includes('ауылдық округтердің');
      return out;
    })()`);
    await wait(500);
    await snap(shot.replace(/\.png$/, '-menu.png'));
    // Ақтөбе облысы: спутник үстінде облыс пен аудан шекаралары
    console.log("step", "r.aktobe = await js(".slice(2, 12), new Date().toISOString().slice(11, 19));
    r.aktobe = await js(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms)), out = {};
      const O = MuraOverlays.current, map = MuraMarks.map;
      const chk = id => document.querySelector('.ov-row[data-id="' + id + '"] .ov-chk');
      [...document.querySelectorAll('.mura-opt')].find(o => o.textContent.includes('Спутник (Esri)')).click();
      document.querySelector('.bm-trigger').click(); await wait(200);
      map.setView([48.8, 58.3], 7, { animate: false });
      const t1 = chk('nipd:border_regions'); t1.checked = true; t1.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(300);
      const t2 = chk('nipd:border_districts'); t2.checked = true; t2.dispatchEvent(new Event('change', { bubbles: true }));
      const tiles = () => [...document.querySelectorAll('.leaflet-tile-loaded')].filter(i => i.src.includes('map.gov.kz'));
      for (let i = 0; i < 40 && tiles().length < 4; i++) await wait(500);
      await wait(1500);
      out.tilesZ7 = tiles().length;
      if (!out.tilesZ7) return Object.assign(out, { diag: JSON.stringify({ on: O._state().on, items: O._state().st.items, status: O._state().status, chk: !!t1, rows: document.querySelectorAll(".ov-row").length, menu: document.querySelector(".bm-menu").hidden, imgs: [...document.querySelectorAll(".mura-wms img")].length }) });
      const src = new URL(tiles()[0].src).searchParams;
      out.url = ['VERSION', 'CRS', 'FORMAT', 'TRANSPARENT', 'EXCEPTIONS', 'WIDTH', 'LAYERS'].map(k => k + '=' + src.get(k)).join('&');
      out.attribution = document.querySelector('.leaflet-control-attribution').textContent;
      out.zorder = [...document.querySelectorAll('.qa-map .leaflet-tile-pane > .leaflet-layer')].map(l => { const i = l.querySelector('img[src]'); return (i ? (i.src.includes('map.gov.kz') ? new URL(i.src).searchParams.get('LAYERS') : new URL(i.src).host) : '-') + ':' + l.style.zIndex; }).join(' ');
      // Бағдарламада барлық панельдің z-index-і бірдей (maptool.css), реті — DOM реті: тайлдар векторлардан төмен
      const kids = [...map.getPane('mapPane').children];
      out.panes = ['tilePane', 'overlayPane', 'markerPane'].map(p => p + ':' + kids.indexOf(map.getPane(p)) + '/' + getComputedStyle(map.getPane(p)).zIndex).join(' ');
      out.pointer = getComputedStyle(tiles()[0]).pointerEvents + '/' + getComputedStyle(tiles()[0].parentNode).pointerEvents;
      return out;
    })()`);
    await snap(shot.replace(/\.png$/, '-aktobe-sat.png'));
    console.log("step", "r.more = await js(".slice(2, 12), new Date().toISOString().slice(11, 19));
    r.more = await js(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms)), out = {};
      const O = MuraOverlays.current, map = MuraMarks.map;
      const tiles = () => [...document.querySelectorAll('.leaflet-tile-loaded')].filter(i => i.src.includes('map.gov.kz') && i.closest('.leaflet-tile-container').style.visibility !== 'hidden');
      // Бірнеше масштаб
      out.zooms = [];
      for (const z of [5, 9, 11]) {
        map.setView([50.28, 57.17], z, { animate: false });
        for (let i = 0; i < 30; i++) { await wait(500); if ([...document.querySelectorAll('.leaflet-tile-loaded')].some(t => t.src.includes('map.gov.kz') && +t.closest('.leaflet-tile-container').style.zIndex === map.options.maxZoom)) break; }
        await wait(1200);
        out.zooms.push(z + ':' + [...document.querySelectorAll('.leaflet-tile-loaded')].filter(t => t.src.includes('map.gov.kz')).length);
      }
      // Мөлдірлік (0–100 %)
      document.querySelector('.bm-trigger').click(); await wait(200);
      const rg = document.querySelector('.ov-row[data-id="nipd:border_regions"] .ov-range');
      rg.value = 60; rg.dispatchEvent(new Event('input', { bubbles: true })); rg.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('.ov-sec[data-sec="nipd"]').scrollIntoView({ block: 'start' });
      out.opacity = O._layer('nipd:border_regions').getContainer().style.opacity + ' / ' + JSON.stringify(O._state().st.items['nipd:border_regions']);
      // Гидрография, жолдар, теміржол қатар
      for (const id of ['nipd:hydro', 'nipd:roads', 'nipd:rail']) { const c = document.querySelector('.ov-row[data-id="' + id + '"] .ov-chk'); if (c && !c.disabled) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); for (let i = 0; i < 60 && !O._layer(id); i++) await wait(250); } }
      map.setView([50.3, 57.2], 9, { animate: false });
      await wait(6000);
      out.onLayers = O._state().on.join(', ');
      out.zIdx = O._state().on.map(id => id.replace('nipd:', '') + ':' + O._layer(id).options.zIndex).join(' ');
      // Ретін өзгерту: аудандарды облыстардан жоғары/төмен
      const before = O._layer('nipd:border_districts').options.zIndex;
      O._move('nipd:border_districts', -1);
      out.reorder = before + '→' + O._layer('nipd:border_districts').options.zIndex + ' (облыс: ' + O._layer('nipd:border_regions').options.zIndex + ')';
      O._move('nipd:border_districts', 1);
      // GetFeatureInfo — Ақтөбе қаласы
      map.closePopup(); O.identify(L.latLng(50.28, 57.17));
      for (let i = 0; i < 90 && /Сұралуда/.test(document.querySelector('.ov-pop') ? document.querySelector('.ov-pop').textContent : 'Сұралуда'); i++) await wait(500);
      out.gfi = (document.querySelector('.ov-pop') || {}).textContent.replace(/\\s+/g, ' ').slice(0, 400);
      return out;
    })()`);
    await snap(shot.replace(/\.png$/, '-gfi.png'));
    await js(`(async () => { MuraMarks.map.closePopup(); const m = document.querySelector('.bm-menu'); if (m.hidden) document.querySelector('.bm-trigger').click(); await new Promise(r => setTimeout(r, 300)); document.querySelector('.ov-sec[data-sec="nipd"]').scrollIntoView({ block: 'start' }); return 1; })()`);
    await wait(400);
    await snap(shot.replace(/\.png$/, '-rows.png'));
    await js(`(() => { if (!document.querySelector('.bm-menu').hidden) document.querySelector('.bm-trigger').click(); return 1; })()`);
    // Тарихи карта үстінде
    console.log("step", "r.hist = await js(".slice(2, 12), new Date().toISOString().slice(11, 19));
    r.hist = await js(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      MuraMarks.map.closePopup();
      document.querySelector('.bm-trigger').click(); await wait(200);
      [...document.querySelectorAll('.mura-opt')].find(o => o.textContent.includes('Генштаб (КСРО')).click();
      document.querySelector('.bm-trigger').click();
      MuraMarks.map.setView([50.35, 57.3], 10, { animate: false }); await wait(6000);
      return [...document.querySelectorAll('.qa-map .leaflet-tile-pane > .leaflet-layer')].map(l => { const i = l.querySelector('img[src]'); return (i ? (i.src.includes('map.gov.kz') ? new URL(i.src).searchParams.get('LAYERS').replace('geonode:', '') : new URL(i.src).host) : '-') + ':' + l.style.zIndex; }).join(' ');
    })()`);
    await snap(shot.replace(/\.png$/, '-aktobe-gsh.png'));

    /* ---------- Қолданушының WMS сервисі ---------- */
    console.log("step", "r.user = await js(".slice(2, 12), new Date().toISOString().slice(11, 19));
    r.user = await js(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms)), out = {};
      const O = MuraOverlays.current;
      // Қате сервер
      O.openAddDialog();
      let f = document.querySelector('.ov-dlg');
      f.elements.url.value = 'https://wms.example.invalid/wms'; f.querySelector('.ov-test').click();
      for (let i = 0; i < 40 && /сұралуда/i.test(f.querySelector('.ov-dlg-st').textContent); i++) await wait(500);
      out.badServer = f.querySelector('.ov-dlg-st').textContent + ' | save disabled: ' + f.querySelector('[type=submit]').disabled;
      f.querySelector('[data-x]').click();
      // Нақты сервис (НИПД-тің жеке қабат қызметі — шағын каталог), WMS 1.1.1 + EPSG:4326
      O.openAddDialog();
      f = document.querySelector('.ov-dlg');
      f.elements.url.value = 'https://map.gov.kz/geoserver/geonode/border_districts/wms'; f.elements.version.value = '1.1.1';
      f.querySelector('.ov-test').click();
      for (let i = 0; i < 180 && !f.querySelector('.ov-dlg-item') && !f.querySelector('.ov-dlg-st.is-bad'); i++) await wait(500);
      out.caps = f.querySelector('.ov-dlg-st').textContent + ' | ' + [...f.querySelectorAll('.ov-dlg-item')].map(x => x.textContent).join('; ');
      const cb = f.querySelector('.ov-dlg-item input'); if (!cb) return out; cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
      f.elements.crs.value = 'EPSG:4326'; f.elements.label.value = 'Тест WMS'; f.elements.tr.value = '20';
      f.requestSubmit(); await wait(400);
      out.saved = JSON.stringify(JSON.parse(localStorage.getItem('mura.wms-services')).map(s => [s.label, s.ver, s.crs, s.format, s.opacity, s.layers.map(l => l.name)]));
      out.xyzUntouched = localStorage.getItem('mura.custom-maps');
      const row = document.querySelector('.ov-row[data-id^="u:"]');
      out.offInitially = !row.querySelector('.ov-chk').checked;
      row.querySelector('.ov-chk').checked = true; row.querySelector('.ov-chk').dispatchEvent(new Event('change', { bubbles: true }));
      const id = O._state().on.find(x => x.startsWith('u:'));
      const l = O._layer(id);
      await wait(5000);
      const imgs = [...l.getContainer().querySelectorAll('img')];
      out.userTiles = imgs.filter(i => i.classList.contains('leaflet-tile-loaded')).length + '/' + imgs.length;
      const p = new URL(imgs[0].src).searchParams;
      out.userUrl = ['VERSION', 'SRS', 'BBOX', 'EXCEPTIONS'].map(k => k + '=' + p.get(k)).join('&') + ' op=' + l.options.opacity + ' z=' + l.options.zIndex;
      // XML қатесі сурет ретінде алынбайды: жоқ қабат
      const bad = MuraWms.layer({ url: 'https://map.gov.kz/geoserver/wms', layers: ['geonode:no_such_layer_mura'], version: '1.3.0', crs: 'EPSG:3857' }).addTo(MuraMarks.map);
      let errs = 0; bad.on('tileerror', () => errs++);
      await wait(5000);
      out.xmlError = 'тайл қатесі ' + errs + ', жүктелгені ' + bad.getContainer().querySelectorAll('.leaflet-tile-loaded').length;
      MuraMarks.map.removeLayer(bad);
      return out;
    })()`);

    /* ---------- Интернетсіз ---------- */
    const dbg = win.webContents.debugger;
    dbg.attach('1.3');
    await dbg.sendCommand('Network.enable');
    await dbg.sendCommand('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await wait(800);
    console.log("step", "r.offline = await js(".slice(2, 12), new Date().toISOString().slice(11, 19));
    r.offline = await js(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms)), out = {};
      out.onLine = navigator.onLine;
      document.querySelector('.bm-trigger').click(); await wait(300);
      out.text = [...new Set([...document.querySelectorAll('.ov-row .ov-st')].map(s => s.textContent))].join(', ') + ' | ' + (document.querySelector('.ov-warn') || {}).textContent;
      document.querySelector('.bm-trigger').click();
      // Бағдарламаның қалған бөлігі жұмыс істейді: жергілікті деректер API-і (қорғау аймақтарының тізімі), ескерткіштер
      const l = await (await fetch(QA_API + '&op=list', { method: 'POST', body: new FormData() })).json();
      out.zones = Array.isArray(l.items) ? 'ok' : 'FAIL ' + JSON.stringify(l);
      out.marks = Array.isArray(__marks.items) ? 'ok' : 'FAIL';
      MuraMarks.map.setView([50.3, 57.2], 8, { animate: false }); await wait(1500);
      out.mapAlive = !!MuraMarks.map.getCenter();
      return out;
    })()`);
    await dbg.sendCommand('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    dbg.detach();
    await wait(1500);

    /* ---------- Баптаулардың сақталуы (бетті қайта жүктеу = бағдарламаны қайта ашу) ---------- */
    const before = await js(`JSON.stringify(MuraOverlays.current._state().on.sort())`);
    win.webContents.reload();
    for (let i = 0; i < 40 && loads < 2; i++) await wait(500);
    await wait(5000);
    console.log("step", "r.persist = await js(".slice(2, 12), new Date().toISOString().slice(11, 19));
    r.persist = await js(`(() => { const O = MuraOverlays.current; return { on: JSON.stringify(O._state().on.sort()), op: O._layer('nipd:border_regions') && O._layer('nipd:border_regions').options.opacity }; })()`);
    r.persist.before = before;

    const n = r.nipd, a = r.aktobe, m = r.more;
    must(/border_districts=қолжетімді/.test(n.status) && /border_regions=қолжетімді/.test(n.status), 'НИПД күйі: ' + n.status);
    must(n.allOff, 'жаңа қабаттар өшірулі болуы керек');
    must(n.absentNote, 'табылмаған қабаттар туралы ескерту');
    if (a.diag) console.log("DIAG", a.diag);
    must(a.tilesZ7 >= 4, 'Ақтөбе тайлдары: ' + a.tilesZ7);
    must(/CRS=EPSG:3857/.test(a.url) && /TRANSPARENT=true/i.test(a.url) && /EXCEPTIONS=XML/.test(a.url) && /FORMAT=image\/png/.test(a.url), 'GetMap: ' + a.url);
    must(/map\.gov\.kz/.test(a.attribution) && /Дереккөз/.test(a.attribution), 'атрибуция: ' + a.attribution);
    const pz = a.panes.split(' ').map(x => x.split(':')[1].split('/'));
    must(+pz[0][0] < +pz[1][0] && +pz[1][0] < +pz[2][0] && pz[0][1] === pz[1][1] && pz[1][1] === pz[2][1], 'панельдер: ' + a.panes);
    must(/^none\//.test(a.pointer) || /\/none$/.test(a.pointer), 'тайлдар тінтуірді ұстамауы керек: ' + a.pointer);
    must(m.zooms.every(z => +z.split(':')[1] > 0), 'масштабтар: ' + m.zooms);
    must(/^0\.4 /.test(m.opacity), 'мөлдірлік: ' + m.opacity);
    must(m.onLayers.split(', ').length >= 4, 'бірнеше қабат: ' + m.onLayers);
    // Топ ішінде әр қабаттың өз zIndex-і; әкімшілік шекаралар (10+) гидрография мен көліктен (30+) төмен
    const zi = Object.fromEntries(m.zIdx.split(' ').map(x => x.split(':')));
    must(new Set(Object.values(zi)).size === 5 && Math.max(zi.border_regions, zi.border_districts) < 30 && Math.min(zi.hydro, zi.roads, zi.rail) >= 30, 'zIndex: ' + m.zIdx);
    must(m.reorder === '12→11 (облыс: 12)', 'ретін өзгерту: ' + m.reorder);
    must(/Актобе|Актюбинская/.test(m.gfi), 'GetFeatureInfo: ' + m.gfi);
    must(/mt1\.google|server\.arcgisonline|nakarte/.test(r.hist) && /:1 /.test(r.hist + ' '), 'тарихи карта: ' + r.hist);
    const uu = r.user;
    must(/Сервер қолжетімсіз/.test(uu.badServer) && /true/.test(uu.badServer), 'қате сервер: ' + uu.badServer);
    must(/border_districts/.test(uu.caps), 'пайдаланушы каталогы: ' + uu.caps);
    must(/"Тест WMS","1\.1\.1","EPSG:4326","image\/png",0\.8/.test(uu.saved), 'сақталған сервис: ' + uu.saved);
    must(uu.offInitially, 'жаңа WMS қабаты өшірулі басталуы керек');
    must(/SRS=EPSG:4326/.test(uu.userUrl) && /EXCEPTIONS=application\/vnd\.ogc\.se_xml/.test(uu.userUrl) && / z=7\d/.test(uu.userUrl), 'пайдаланушы GetMap: ' + uu.userUrl);
    must(+uu.userTiles.split('/')[0] > 0, 'пайдаланушы тайлдары: ' + uu.userTiles);
    must(/жүктелгені 0$/.test(uu.xmlError) && !/қатесі 0,/.test(uu.xmlError), 'XML қатесі: ' + uu.xmlError);
    must(r.offline.onLine === false && /Офлайн режимде қолжетімсіз/.test(r.offline.text) && r.offline.zones === 'ok', 'офлайн: ' + JSON.stringify(r.offline));
    must(r.persist.on === r.persist.before && r.persist.op === 0.4, 'сақталу: ' + JSON.stringify(r.persist));
    await snap(shot);
  }

  r.requests = reqs;
  console.log(JSON.stringify(r, null, 1));
  const real = errors.filter(e => !/tile|Failed to load resource|ERR_INTERNET_DISCONNECTED|net::/i.test(e));
  if (errors.length) console.log('Консоль қателері:\n  ' + errors.join('\n  '));
  if (real.length) fail.push('консоль: ' + real.join(' | '));
  console.log(fail.length ? 'ҚАТЕ:\n  ' + fail.join('\n  ') : 'WMS: бәрі өтті');
  console.log('Скриншоттар:', shot.replace(/\.png$/, '-*.png'));
  app.exit(fail.length ? 1 : 0);
}

require('../main/main.js');
