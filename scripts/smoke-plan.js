/* «Жоспар» түтін тесті: қызметтер қатары (Жоспар «Қорғау аймағынан» кейін), ескерткіш карточкасынан «Жоспарды ашу»,
   нысандарды қосу (негізгі координатаны көшіру, тексеріс қателері), картада еркін контур сызу, елді мекенге бағыттауыш
   (автоматты есеп, қолмен түзету, автоматты мәнге қайтару), алдын ала қарау, PDF (A4, вектор), қайта ашқанда сақталуы.
   Іске қосу: npx electron scripts/smoke-plan.js [скриншот.png]   (деректер уақытша қалтада) */
const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mura-plan-'));
app.setPath('userData', tmp);
const gpkg = path.join(tmp, 'test.gpkg');
process.env.MURA_PROJECT = gpkg;
const shot = process.argv.find(a => a.endsWith('.png')) || path.join(tmp, 'plan.png');
const errors = [];
const fails = [];
const check = (cond, msg) => { if (!cond) fails.push(msg); };

app.on('browser-window-created', (_e, win) => {
  win.webContents.on('console-message', ev => { if (ev.level === 'error' || ev.level === 3) errors.push(ev.message); });
  if (win.webContents.getURL() || errors.started) return;
  errors.started = true;
  win.webContents.once('did-finish-load', () => setTimeout(() => run(win).catch(e => { console.error('FAIL', e); app.exit(1); }), 3500));
});

async function run(win) {
  const js = s => win.webContents.executeJavaScript(s, true);
  const snap = async name => { await new Promise(r => setTimeout(r, 900)); fs.writeFileSync(shot.replace(/\.png$/, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  const r = await js(`(async () => {
    const out = {}, M = window.__marks, wait = t => new Promise(r => setTimeout(r, t)), $ = id => document.getElementById(id);
    out.services = [...document.querySelectorAll('.mura-svc')].map(b => b.textContent).join(' | ');
    // Ескерткіш және елді мекен (Ақжайық — оңтүстік-шығыста ~22 км)
    await M.api('save', { data: JSON.stringify({ name: 'Салтақ-III қорымы', name_ru: 'Могильник Салтак-III', oblast: 'Ақтөбе облысы', district: 'Қарғалы ауданы', type: 'archeo', category: 'local', status: 'state', lat: 50.30, lon: 57.20 }) });
    const m = M.items[0];
    await __places.api('save', { data: JSON.stringify({ kind: 'settlement', name: 'Ақжайық ауылы', name_ru: 'село Акжайык', lat: 50.12, lon: 57.38 }) });
    // Карточкадан «Жоспарды ашу»
    M.openDialog(m); await wait(150);
    out.cardBtn = !!$('mkPlan');
    $('mkPlan').click(); await wait(300);
    out.svc = MuraSvc.get() + ' / ' + (MuraPlan.markId === m.id) + ' / panel ' + ($('pjPanel').hidden ? 'жабық' : 'ашық');
    out.row2 = [...document.querySelectorAll('#qaTmain .qa-tbtn')].filter(b => b.offsetParent).map(b => b.getAttribute('aria-label')).join(', ');
    // №1: негізгі координатаны көшіру, биіктігі 0,7, шеңбер Ø 13
    MuraPlan.openObjDialog(null); await wait(100);
    $('pjFromMark').click();
    out.copied = $('pjLat').value + ', ' + $('pjLon').value + ' / ' + !$('pjMarkHint').hidden;
    $('pjHeight').value = '0,7';
    $('pjShape').value = 'circle'; $('pjShape').dispatchEvent(new Event('change'));
    $('pjDiam').value = '0';
    document.querySelector('.pj-objdlg [type=submit]').click(); await wait(300);
    out.zeroDiam = document.querySelector('.pj-ferr[data-for="diam"]').textContent + ' / биіктік сақталды: ' + $('pjHeight').value;
    $('pjDiam').value = '13';
    document.querySelector('.pj-objdlg [type=submit]').click(); await wait(400);
    out.saved1 = MuraPlan.objects.map(o => o.num + ':' + o.shape + ':' + o.diam + ':' + o.height).join(', ');
    // Қайталанған нөмір
    MuraPlan.openObjDialog(null); await wait(100);
    $('pjNum').value = '1'; $('pjLat').value = '50.3001'; $('pjLon').value = '57.2001';
    $('pjHeight').value = '-1';
    document.querySelector('.pj-objdlg [type=submit]').click(); await wait(200);
    out.dup = document.querySelector('.pj-ferr[data-for="num"]').textContent + ' | ' + document.querySelector('.pj-ferr[data-for="height"]').textContent;
    document.querySelector('.pj-objdlg [data-x]').click();
    // №2 — тек нүкте, №1-ден метрлік жазықтықта 30 м шығысқа; №3 — эллипс
    const G = await import('mura://app/plan/geo.js');
    const o1 = MuraPlan.objects[0], P = G.plane(o1.lat, o1.lon), p2 = P.inv(30, 0), p3 = P.inv(-20, 25);
    await MuraPlan.api('save', { data: JSON.stringify({ mark_id: m.id, num: '2', kind: 'kurgan', lat: p2[0], lon: p2[1], shape: '' }) });
    await MuraPlan.api('save', { data: JSON.stringify({ mark_id: m.id, num: '3', kind: 'kurgan', lat: p3[0], lon: p3[1], shape: 'ellipse', ax_a: 22, ax_b: 16, ax_az: 30, height: 0.4 }) });
    out.count = $('pjCount').textContent;
    window.__ids = { m: m.id, o1: o1.id, o2: MuraPlan.objects.find(o => o.num === '2').id };
    return out;
  })()`);
  await snap('-panel');
  Object.assign(r, await js(`(async () => {
    const out = {}, wait = t => new Promise(r => setTimeout(r, t)), $ = id => document.getElementById(id), map = MuraMarks.map;
    // Жалпы жоспар 1:500 — №1 мен №2 орталықтарының арасы 60 мм (№2 — нүкте)
    let pg = MuraPlan.renderPage('general', '', 500);
    const ring = pg.svg.match(/<polygon points="([^"]+)" fill="#9c4f1c" stroke/)[1].split(' ').map(s => s.split(',').map(Number));
    const c1 = ring.reduce((s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length], [0, 0]);
    const dot = pg.svg.match(/<circle cx="([\\d.]+)" cy="([\\d.]+)" r="0.9"/);
    out.mm30 = Math.hypot(+dot[1] - c1[0], +dot[2] - c1[1]).toFixed(2);
    // №2 үшін картада еркін контур сызу
    MuraPlan.select(__ids.o2); await wait(300);
    $('pjDraw').click(); await wait(100);
    [...document.querySelectorAll('.mura-ctx button')].find(b => b.textContent.includes('Еркін'))?.click(); await wait(100);
    out.mode = MuraPlan.mode + ' / ' + $('qaMap').classList.contains('is-pjmap');
    const o2 = MuraPlan.objects.find(o => o.id === __ids.o2);
    const G = await import('mura://app/plan/geo.js'), P = G.plane(o2.lat, o2.lon);
    for (const [x, y] of [[-4, -3], [4, -3], [5, 3], [0, 5], [-5, 2]]) { const q = P.inv(x, y); map.fire('click', { latlng: L.latLng(q[0], q[1]) }); }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await wait(200);
    out.dlgAfterDraw = !!document.querySelector('.pj-objdlg') + ' / ' + $('pjShape').value + ' / ' + $('pjPtsInfo').textContent;
    $('pjDiam').value = '9,5';
    $('pjDimI').value = '0'; $('pjDimJ').value = '2'; $('pjDimJ').dispatchEvent(new Event('change'));
    out.dimLen = $('pjDimLen').textContent;
    document.querySelector('.pj-objdlg [type=submit]').click(); await wait(400);
    const s2 = MuraPlan.objects.find(o => o.id === __ids.o2);
    out.free = s2.shape + ' / ' + (s2.pts || []).length + ' төбе / dim ' + JSON.stringify(s2.dim) + ' / Ø ' + s2.diam;
    // Панель ашық, «Елді мекенді картадан таңдау» режимі: карта қабаттары батырмасы панельдің астында қалмауы керек
    MuraPlan.openPanel(); await wait(150);
    MuraPlan.openPtrDialog(); await wait(150);
    $('pjPlMap').click(); await wait(300);
    const bm = document.querySelector('.bm-trigger').getBoundingClientRect(), pnl = $('pjPanel').getBoundingClientRect();
    out.bmVisible = MuraPlan.mode + ' / ' + (bm.right <= pnl.left) + ' (' + Math.round(bm.right) + ' ≤ ' + Math.round(pnl.left) + ')';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(150);
    document.querySelector('.pj-ptrdlg [data-x]')?.click(); await wait(100);
    // Бағыттауыш: елді мекен тізімнен, бастапқы нүкте — №1
    MuraPlan.openPtrDialog(); await wait(150);
    const sel = $('pjPl');
    sel.value = [...sel.options].find(o => o.textContent.includes('Ақжайық')).value; sel.dispatchEvent(new Event('change'));
    $('pjFrom').value = __ids.o1; $('pjFrom').dispatchEvent(new Event('change'));
    out.auto = $('pjAuto').textContent + ' / ' + $('pjPtrName').value + ' / ' + $('pjPtrNameRu').value;
    document.querySelector('.pj-ptrdlg [type=submit]').click(); await wait(400);
    const pl = MuraPlan.plans[0];
    out.plan = pl.ptr_name + ' / from №1: ' + (pl.ptr_from === __ids.o1) + ' / ' + (pl.ptr_dist / 1000).toFixed(2) + ' км, ' + pl.ptr_az.toFixed(2) + '°';
    pg = MuraPlan.renderPage('general', '', 0);
    out.autoDist = (pg.svg.match(/>(\\d+,\\d км)</) || [])[1];
    // Қолмен түзету: 22,6 км және азимут 90°
    MuraPlan.openPtrDialog(); await wait(150);
    $('pjDistM').value = '22,6'; $('pjAzM').value = '90';
    document.querySelector('.pj-ptrdlg [type=submit]').click(); await wait(400);
    pg = MuraPlan.renderPage('general', '', 0);
    const ar = pg.svg.match(/<g class="pj-arrow"><line x1="([\\d.-]+)" y1="([\\d.-]+)" x2="([\\d.-]+)" y2="([\\d.-]+)"/);
    out.manual = pg.svg.includes('22,6 км') + ' / жебе шығысқа: ' + (Math.abs(+ar[2] - +ar[4]) < 0.01 && +ar[3] > +ar[1]);
    // Алдын ала қарау: жалпы жоспар, қарындаш
    MuraPlan.openPreview({ kind: 'general' }); await wait(400);
    out.preview = !!document.querySelector('#pjSheet svg') + ' / қарындаш ' + !$('pjPencil').hidden + ' / беттер: ' + [...$('pjPvPage').options].map(o => o.textContent).join(' | ');
    return out;
  })()`));
  await snap('-general');
  Object.assign(r, await js(`(async () => {
    const out = {}, wait = t => new Promise(r => setTimeout(r, t)), $ = id => document.getElementById(id);
    // Жеке жоспар (№1) 1:200
    $('pjPvPage').value = __ids.o1; $('pjPvPage').dispatchEvent(new Event('change')); await wait(200);
    $('pjPvScale').value = '200'; $('pjPvScale').dispatchEvent(new Event('change')); await wait(400);
    out.detail = (document.querySelector('#pjSheet svg').innerHTML.match(/Ø [\\d,]+ м/) || [])[0] + ' / ' + (document.querySelector('#pjSheet svg').innerHTML.includes('Масштаб 1:200'));
    // Сыймайтын масштаб: 1:20 жалпы жоспарда
    $('pjPvPage').value = 'general'; $('pjPvPage').dispatchEvent(new Event('change')); await wait(200);
    $('pjPvScale').value = '20'; $('pjPvScale').dispatchEvent(new Event('change')); await wait(400);
    out.nofit = !!$('pjUseScale') + ' / ' + ($('pjPvWarn').textContent.slice(0, 80));
    $('pjUseScale').click(); await wait(400);
    out.fixed = MuraPlan.plans[0].scale_general + ' / ескерту жоқ: ' + !$('pjUseScale');
    // Белгіні сүйреу (мм-дегі ығысу сақталады)
    const g = document.querySelector('#pjSheet [data-drag^="lbl:"]'), b = g.getBoundingClientRect();
    const ev = (t, x, y) => g.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
    ev('pointerdown', b.left + 2, b.top + 2); ev('pointermove', b.left + 32, b.top + 12); ev('pointerup', b.left + 32, b.top + 12); await wait(500);
    const lo = MuraPlan.objects.find(o => o.id === g.dataset.drag.split(':')[1]);
    out.drag = JSON.stringify(lo.lbl);
    // Қарындаш: автоматты мәнге қайтару
    $('pjPencil').click(); await wait(200);
    $('pjAutoReset').click();
    document.querySelector('.pj-ptrdlg [type=submit]').click(); await wait(400);
    out.reset = MuraPlan.plans[0].ptr_dist_man + ' / ' + (document.querySelector('#pjSheet svg').innerHTML.match(/>(\\d+,\\d км)</) || [])[1];
    // Қайтадан 22,6 км (қайта ашқанда сақталуын тексеру үшін)
    $('pjPencil').click(); await wait(200);
    $('pjDistM').value = '22,6';
    document.querySelector('.pj-ptrdlg [type=submit]').click(); await wait(400);
    return out;
  })()`));
  await snap('-preview');
  // PDF: біріктірілген (қазақша) және жалпы (орысша)
  Object.assign(r, await js(`(async () => {
    const out = {};
    document.querySelector('.pj-prev [data-x]').click();
    const S = await import('mura://app/plan/sheet.js');
    const pages = lang => {
      const ctx = MuraPlan.ctx(lang), list = [S.renderPage(ctx, 'general', null, 0).svg];
      for (const o of ctx.objects.filter(o => o.shape)) list.push(S.renderPage(ctx, 'detail', o, 0).svg);
      return list;
    };
    const kk = await window.mura.pdf(S.pdfHtml(pages('kk'), 'kk'), { exact: true });
    const ru = await window.mura.pdf(S.pdfHtml(pages('ru').slice(0, 1), 'ru'), { exact: true });
    window.__pdf = { kk: Array.from(kk), ru: Array.from(ru) };
    out.ruTitle = S.renderPage(MuraPlan.ctx('ru'), 'general', null, 0).svg.includes('Могильник Салтак-III') + ' / ' + S.renderPage(MuraPlan.ctx('ru'), 'general', null, 0).svg.includes('Актюбинская');
    out.markCoord = __marks.items[0].lat + ', ' + __marks.items[0].lon;
    return out;
  })()`));
  const pdf = await js('window.__pdf');
  for (const [k, bytes] of Object.entries(pdf)) {
    const b = Buffer.from(bytes), f = path.join(tmp, 'plan-' + k + '.pdf');
    fs.writeFileSync(f, b);
    const s = b.toString('latin1');
    // A4 = 595,28 × 841,89 pt (Chromium бет өлшемін пиксельге дөңгелектейді: ±1 pt)
    const mb = s.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
    r['pdf_' + k] = { file: f, bytes: b.length, pages: (s.match(/\/Type\s*\/Page[^s]/g) || []).length,
      a4: !!mb && Math.abs(+mb[1] - 595.28) < 1 && Math.abs(+mb[2] - 841.89) < 1, font: /\/FontFile2|\/FontFile3/.test(s) };
  }
  // ===== 3-кезең: жағдаят белгілері (docs/PLAN-STAGE3.md) — «Жағдаят» мәзірі, картада сызу, терезе, бет =====
  Object.assign(r, await js(`(async () => {
    const out = {}, wait = t => new Promise(r => setTimeout(r, t)), $ = id => document.getElementById(id), map = MuraMarks.map;
    const G = await import('mura://app/plan/geo.js'), o1 = MuraPlan.objects.find(o => o.num === '1'), P = G.plane(o1.lat, o1.lon);
    const at = (x, y) => { const q = P.inv(x, y); return L.latLng(q[0], q[1]); };
    const menu = async name => { $('pjSit').click(); await wait(100); [...document.querySelectorAll('.mura-ctx button')].find(b => b.textContent.includes(name))?.click(); await wait(100); };
    out.sitBtn = !$('pjSit').disabled;
    // Горизонталь: үш төбе, Enter → терезе, мәні 427
    await menu('Горизонталь');
    out.fmode = MuraPlan.mode + ' / ' + $('pjSit').getAttribute('aria-pressed');
    for (const [x, y] of [[-60, -10], [0, -14], [60, -8]]) map.fire('click', { latlng: at(x, y) });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await wait(200);
    out.fdlg = !!document.querySelector('.pj-featdlg') + ' / ' + !$('pjFValueF').hidden;
    $('pjFValue').value = '427';
    document.querySelector('.pj-featdlg [type=submit]').click(); await wait(400);
    // Ағаштар: терезесіз, қатарынан екеуі; Esc — аяқтау
    await menu('Жеке ағаш');
    map.fire('click', { latlng: at(10, 20) }); await wait(250);
    map.fire('click', { latlng: at(14, 22) }); await wait(250);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(100);
    out.treeMode = String(MuraPlan.mode);
    // Жазу: мәтінсіз — қате, содан кейін «ЕГІСТІК»
    await menu('Жазу');
    map.fire('click', { latlng: at(-20, 30) }); await wait(150);
    document.querySelector('.pj-featdlg [type=submit]').click(); await wait(200);
    out.textErr = document.querySelector('.pj-featdlg .pj-ferr[data-for="name"]').textContent;
    $('pjFName').value = 'ЕГІСТІК'; $('pjFNameRu').value = 'ПАШНЯ';
    document.querySelector('.pj-featdlg [type=submit]').click(); await wait(400);
    out.feats = MuraPlan.features.map(f => f.kind + (f.value != null ? ':' + f.value : '') + (f.pts ? ':' + f.pts.length : '')).join(', ');
    out.mapFeats = document.querySelectorAll('.pj-fpt').length + ' / ' + document.querySelectorAll('.pj-ftext').length;
    MuraPlan.openPanel(); await wait(150);
    out.featList = document.querySelectorAll('#pjFeatList .pj-fcard').length + ' / ' + $('pjFeatT').textContent;
    // Жалпы жоспар: жағдаят белгілері, жазуын сүйреу (flbl)
    MuraPlan.openPreview({ kind: 'general' }); await wait(300);
    const svg = document.querySelector('#pjSheet svg').innerHTML;
    out.sheetFeats = svg.includes('pj-feats') + ' / ' + />427</.test(svg) + ' / ' + />ЕГІСТІК</.test(svg) + ' / ' + (svg.match(/fill="#6b9a34"/g) || []).length;
    const g = document.querySelector('#pjSheet [data-drag^="flbl:"]');
    const rc = g.getBoundingClientRect(), x = rc.left + rc.width / 2, y = rc.top + rc.height / 2;
    g.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, pointerId: 1, bubbles: true }));
    g.dispatchEvent(new PointerEvent('pointermove', { clientX: x + 30, clientY: y + 10, pointerId: 1, bubbles: true }));
    g.dispatchEvent(new PointerEvent('pointerup', { clientX: x + 30, clientY: y + 10, pointerId: 1, bubbles: true })); await wait(400);
    out.flbl = JSON.stringify(MuraPlan.features.find(f => f.id === g.dataset.drag.slice(5)).lbl);
    document.querySelector('.pj-prev [data-x]').click();
    // Картада түзету: горизонтальдың бірінші төбесін жылжыту
    const c = MuraPlan.features.find(f => f.kind === 'contour');
    MuraPlan.openFeatDialog(c); await wait(100);
    $('pjFGeo').click(); await wait(150);
    out.feditMode = MuraPlan.mode + ' / тұтқа: ' + document.querySelectorAll('.pj-handle').length;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(100);
    // 2-кезең: егістік ауданы — төрт төбе, бірінші төбені басып тұйықтау
    await menu('Егістік');
    for (const [x, y] of [[-40, 40], [40, 40], [40, 70], [-40, 70], [-40, 40]]) map.fire('click', { latlng: at(x, y) });
    await wait(200);
    out.areaDlg = !!document.querySelector('.pj-featdlg') + ' / ' + /га|м²/.test(document.querySelector('.pj-featdlg').textContent);
    $('pjFName').value = 'ЕГІСТІК'; $('pjFNameRu').value = 'ПАШНЯ';
    document.querySelector('.pj-featdlg [type=submit]').click(); await wait(400);
    const ar = MuraPlan.features.find(f => f.kind === 'arable');
    out.area = ar ? ar.pts.length + ' төбе / ' + ar.name : 'жоқ';
    // Қорғанның беті: №1 — тас үйінді
    MuraPlan.openObjDialog(o1); await wait(100);
    out.surfShown = !document.querySelector('.pj-objdlg .pj-surf').closest('[data-kind]').hidden;
    document.querySelector('.pj-objdlg input[name="surface"][value="stones"]').checked = true;
    document.querySelector('.pj-objdlg [type=submit]').click(); await wait(400);
    out.surface = JSON.stringify(MuraPlan.objects.find(o => o.num === '1').surface);
    // Өзге нысан (құдық) жоспарға қосылады — сілтеме арқылы
    const wq = P.inv(-25, -20);
    await __places.api('save', { data: JSON.stringify({ kind: 'well', name: 'Ескі құдық', name_ru: 'Старый колодец', lat: wq[0], lon: wq[1] }) });
    await menu('Өзге нысандарды');
    const cb = [...document.querySelectorAll('.pj-pllist label')].find(l => l.textContent.includes('Ескі құдық')).querySelector('input');
    cb.checked = true;
    document.querySelector('.pj-pldlg [type=submit]').click(); await wait(400);
    out.places = (MuraPlan.plans[0].places || []).length + ' / ' + /Ескі құдық/.test($('pjFeatList').textContent);
    const g2 = MuraPlan.renderPage('general', '', 0).svg;
    out.sheet2 = g2.includes('url(#pj-f-arable)') +' / ' + g2.includes('pj-surface') + ' / ' + g2.includes('>Ескі құдық<') + ' / ' + g2.includes('>ЕГІСТІК<');
    // 3-кезең: тахеометрдің CSV файлы (жергілікті жүйе, № X Y H) → биіктік белгілері → горизонтальдар
    let csv = '№;X;Y;H\\n', k = 0;
    for (let x = -40; x <= 40; x += 8) for (let y = -40; y <= 40; y += 8) csv += (++k) + ';' + (1000 + y).toFixed(3).replace('.', ',') + ';' + (2000 + x).toFixed(3).replace('.', ',') + ';' + (427 - Math.hypot(x, y) / 12).toFixed(2).replace('.', ',') + '\\n';
    await MuraPlan.importFile(new File([csv], 'tach.csv', { type: 'text/csv' })); await wait(200);
    const dlg = document.querySelector('.pj-impdlg');
    out.impDlg = !!dlg + ' / ' + dlg.querySelector('[data-st="crs"]').value + ' / ' + dlg.querySelector('[data-col="n"]').value + dlg.querySelector('[data-col="e"]').value + dlg.querySelector('[data-col="h"]').value + ' / ' + dlg.querySelector('select[data-gk]').value;
    out.impInfo = $('pjImpInfo').textContent;
    const before = MuraPlan.features.length;
    dlg.querySelector('[type=submit]').click(); await wait(600);
    const hs = MuraPlan.features.filter(f => f.kind === 'height' && f.src === 'import');
    const c0 = hs.find(f => f.name === '61');                                   // (0, 0) нүктесі — тірек нүктесі (деректің ортасы) → ескерткіштің координатасы
    out.imported = (MuraPlan.features.length - before) + ' / ' + hs.length + ' / ' + (c0 ? Math.abs(c0.lat - __marks.items[0].lat) < 1e-7 && Math.abs(c0.lon - __marks.items[0].lon) < 1e-7 : 'жоқ');
    out.grouped = !!document.querySelector('#pjFeatList [data-fkind="height"]');
    // Горизонтальдар (қима 1 м)
    MuraPlan.openContourDialog(); await wait(150);
    $('pjTinStep').value = '1';
    document.querySelector('.pj-tindlg [type=submit]').click(); await wait(800);
    const tin = MuraPlan.features.filter(f => f.src === 'tin');
    out.tin = tin.length + ' / ' + [...new Set(tin.map(f => f.value))].sort().join(',');
    // Қайта құру: ескілері ауыстырылады
    MuraPlan.openContourDialog(); await wait(150);
    $('pjTinStep').value = '2';
    document.querySelector('.pj-tindlg [type=submit]').click(); await wait(800);
    out.tin2 = [...new Set(MuraPlan.features.filter(f => f.src === 'tin').map(f => f.value))].sort().join(',');
    const g3 = MuraPlan.renderPage('general', '', 0).svg;
    out.sheet3 = (g3.match(/stroke="#b06a1f" stroke-width="0.25"/g) || []).length;
    // DXF: қабаттар — топтар
    const dxf = ['0', 'SECTION', '2', 'ENTITIES', '0', 'LWPOLYLINE', '8', 'Дороги', '90', '2', '70', '0', '10', '1000', '20', '1950', '10', '1060', '20', '2050',
      '0', 'POINT', '8', 'Деревья', '10', '1010', '20', '2010', '30', '0', '0', 'ENDSEC', '0', 'EOF'].join('\\n');
    await MuraPlan.importFile(new File([dxf], 'site.dxf')); await wait(200);
    const dd = document.querySelector('.pj-impdlg');
    out.dxfGroups = [...dd.querySelectorAll('select[data-gk]')].map(x => x.value).join(',') + ' / ' + dd.querySelector('[data-st="crs"]').value;
    dd.querySelector('[data-x]').click();
    return out;
  })()`));
  await snap('-feats');
  // Қайта жүктеу: деректер жобада сақталған
  await new Promise(res => { win.webContents.once('did-finish-load', res); win.webContents.reload(); });
  await new Promise(res => setTimeout(res, 3000));
  Object.assign(r, await js(`(async () => {
    const out = {}, wait = t => new Promise(r => setTimeout(r, t));
    for (let i = 0; i < 30 && !MuraPlan.objects.length; i++) await wait(100);
    out.featsReload = MuraPlan.features.length;
    out.reload = MuraSvc.get() + ' / нысан: ' + MuraPlan.objects.length + ' / ' + (MuraPlan.plans[0]?.ptr_dist_man) + ' / ' + document.getElementById('pjMarkName').textContent;
    // Қызмет ауысқанда «Жоспар» панелі жабылады, 4 пернесі қайта ашады
    MuraPlan.openPanel(); await wait(100);
    document.getElementById('muraSvc-zone').click(); await wait(200);
    out.leave = MuraSvc.get() + ' / ' + (document.getElementById('pjPanel').hidden ? 'жабық' : 'ашық');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '4', bubbles: true })); await wait(200);
    out.key4 = MuraSvc.get();
    return out;
  })()`));
  // ===== 2-кезең: қорым экспликациясы (docs/PLAN-STAGE2.md) =====
  Object.assign(r, await js(`(async () => {
    const out = {}, wait = t => new Promise(r => setTimeout(r, t)), $ = id => document.getElementById(id), map = MuraMarks.map;
    const m = __marks.items[0], G = await import('mura://app/plan/geo.js'), P = G.plane(m.lat, m.lon);
    const setSel = (id, v) => { $(id).value = v; $(id).dispatchEvent(new Event('change')); };
    // ТЗ: №4 — шикі кірпіштен салынған сағана там (тіктөртбұрыш 6 × 4 м)
    MuraPlan.openObjDialog(null); await wait(100);
    out.num4 = $('pjNum').value;
    setSel('pjKind', 'sagana'); setSel('pjMat', 'brick_raw');
    out.subHidden = $('pjSub').closest('[data-kind]').hidden;
    let q = P.inv(-40, 10); $('pjLat').value = q[0].toFixed(7); $('pjLon').value = q[1].toFixed(7);
    setSel('pjShape', 'rect');
    out.rectLabels = document.querySelector('label[for=pjAxA]').textContent + ' / ' + document.querySelector('label[for=pjAxB]').textContent;
    $('pjAxA').value = '6'; $('pjAxB').value = '4'; $('pjAxAz').value = '0';
    document.querySelector('.pj-objdlg [type=submit]').click(); await wait(400);
    const o4 = MuraPlan.objects.find(o => o.num === '4');
    out.o4 = [o4.kind, o4.material, o4.shape, o4.ax_a, o4.ax_b].join(' ');
    // №5 — құлпытас, типі классикалық, материалы белгісіз, тек нүкте
    MuraPlan.openObjDialog(null); await wait(100);
    setSel('pjKind', 'kulpytas');
    out.subShown = !$('pjSub').closest('[data-kind]').hidden;
    setSel('pjSub', 'classic'); setSel('pjState', 'fair');
    q = P.inv(-35, 4); $('pjLat').value = q[0].toFixed(7); $('pjLon').value = q[1].toFixed(7);
    document.querySelector('.pj-objdlg [type=submit]').click(); await wait(400);
    const o5 = MuraPlan.objects.find(o => o.num === '5');
    out.o5 = [o5.kind, o5.subtype, o5.state, o5.material || '-'].join(' ');
    // №6 — кесене: тіктөртбұрышты картада сызу (орталық → ұзын қабырға → ені)
    MuraPlan.openObjDialog(null); await wait(100);
    setSel('pjKind', 'kesene'); setSel('pjMat', 'brick_fired'); setSel('pjShape', 'rect');
    $('pjDrawHere').click(); await wait(150);
    out.drawMode = MuraPlan.mode;
    for (const [x, y] of [[-50, -10], [-50, -5], [-46, -10]]) { const p = P.inv(x, y); map.fire('click', { latlng: L.latLng(p[0], p[1]) }); }
    await wait(200);
    out.drawn = $('pjShape').value + ' ' + $('pjAxA').value + ' × ' + $('pjAxB').value + ' / ' + $('pjAxAz').value + '°';
    document.querySelector('.pj-objdlg [type=submit]').click(); await wait(400);
    const o6 = MuraPlan.objects.find(o => o.num === '6');
    out.o6 = o6 ? [o6.kind, o6.shape, o6.ax_a, o6.ax_b, o6.material].join(' ') : 'жоқ';
    out.glyphs = document.querySelectorAll('.pj-glyph').length;
    // Жалпы жоспар: экспликация мен шартты белгілер
    const pg = MuraPlan.renderPage('general', '', 0, 'kk');
    const expl = (pg.svg.match(/<g class="pj-expl"[\\s\\S]*?<\\/g>/) || [''])[0];
    out.explRow4 = /Сағана там/.test(expl) && /Шикі кірпіш/.test(expl) && /Құлпытас/.test(expl) && /классикалық/.test(expl);   // тар бағанда «(классикалық)» келесі жолға тасымалдануы мүмкін
    out.legend = /pj-legend/.test(pg.svg) && /шикі кірпіш/.test(pg.svg) && /url\\(#pj-m-brick_raw\\)/.test(pg.svg);
    // Алдын ала қарау: экспликация баптаулары — жай-күй бағаны, бөлек бет
    MuraPlan.openPreview({ kind: 'general' }); await wait(300);
    out.setBox = !$('pjExplBox').hidden;
    $('pjExplBox').open = true;
    const stateBox = [...document.querySelectorAll('#pjExplSet input[data-ex=show]')][2];
    stateBox.checked = true; stateBox.dispatchEvent(new Event('change', { bubbles: true })); await wait(400);
    out.stateCol = MuraPlan.plans[0].expl.cols.find(c => c.key === 'state').show + ' / ' + /Жай-күйі/.test(document.querySelector('#pjSheet svg').innerHTML);
    const place = document.querySelector('#pjExplSet select[data-ex=place]');
    place.value = 'separate'; place.dispatchEvent(new Event('change', { bubbles: true })); await wait(400);
    out.pages = [...$('pjPvPage').options].map(o => o.textContent).join(' | ');
    out.placeSaved = MuraPlan.plans[0].expl.place;
    document.querySelector('.pj-prev [data-x]').click();
    // PDF: жалпы жоспар + экспликация беті
    const S = await import('mura://app/plan/sheet.js');
    const g = S.renderPage(MuraPlan.ctx('kk'), 'general', null, 0);
    const bytes = await window.mura.pdf(S.pdfHtml([g.svg, ...g.more], 'qorym'), { exact: true });
    window.__pdf2 = Array.from(bytes);
    out.pdf2pages = 1 + g.more.length;
    return out;
  })()`));
  await snap('-stage2');
  // Қағаз өлшемі: алдын ала қараудан A3 таңдау → сақталады, бет пен PDF осы өлшемде
  Object.assign(r, await js(`(async () => {
    const out = {}, wait = t => new Promise(r => setTimeout(r, t)), $ = id => document.getElementById(id);
    MuraPlan.openPreview({ kind: 'general' }); await wait(300);
    const sel = document.querySelector('#pjPaper [data-pp=size]');
    out.paperOpts = [...sel.options].map(o => o.value).join(',');
    sel.value = 'A3'; sel.dispatchEvent(new Event('change', { bubbles: true })); await wait(400);
    const svg = document.querySelector('#pjSheet svg');
    out.paper = MuraPlan.plans[0].paper.size + ' ' + MuraPlan.plans[0].paper.orient + ' / ' + svg.getAttribute('viewBox');
    const or = document.querySelector('#pjPaper [data-pp=orient]');
    or.value = 'landscape'; or.dispatchEvent(new Event('change', { bubbles: true })); await wait(400);
    out.land = document.querySelector('#pjSheet svg').getAttribute('viewBox');
    const or2 = document.querySelector('#pjPaper [data-pp=orient]');    // бөлім қайта салынды — элементті қайта аламыз
    or2.value = 'portrait'; or2.dispatchEvent(new Event('change', { bubbles: true })); await wait(400);
    document.querySelector('.pj-prev [data-x]').click();
    const S = await import('mura://app/plan/sheet.js');
    const g = S.renderPage(MuraPlan.ctx('kk'), 'general', null, 0);
    window.__pdf3 = Array.from(await window.mura.pdf(S.pdfHtml([g.svg, ...g.more], 'a3', g.page), { exact: true }));
    return out;
  })()`));
  {
    const b = Buffer.from(await js('window.__pdf3')), f = path.join(tmp, 'plan-a3.pdf');
    fs.writeFileSync(f, b);
    const mb = b.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
    r.pdf_a3 = { file: f, mediabox: mb ? mb[1] + ' × ' + mb[2] : '' };
  }
  {
    const b = Buffer.from(await js('window.__pdf2')), f = path.join(tmp, 'plan-stage2.pdf');
    fs.writeFileSync(f, b);
    r.pdf_stage2 = { file: f, pages: (b.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length };
  }
  r.files = tmp;
  console.log(JSON.stringify(r, null, 1));

  check(/Белгі қою \| Маршруттар \| Қорғау аймағы \| Жоспар/.test(r.services), 'қызметтер реті');
  check(r.cardBtn && r.svc === 'plan / true / panel ашық', 'карточкадан «Жоспарды ашу»');
  check(/50\.3000000, 57\.2000000 \/ true/.test(r.copied), 'негізгі координатаны көшіру');
  check(/Нөлден үлкен/.test(r.zeroDiam) && /0,7$/.test(r.zeroDiam), 'нөлдік диаметр — қате, қалған мән сақталды');
  check(r.saved1 === '1:circle:13:0.7', '№1 сақталды');
  check(/бар/.test(r.dup) && /Биіктік/.test(r.dup), 'қайталанған нөмір мен теріс биіктік');
  check(r.mm30 === '60.00', '30 м → 1:500-де 60 мм');
  check(/^free \/ 5 төбе \/ dim \[0,2\] \/ Ø 9.5$/.test(r.free), 'еркін контур сызылды');
  check(/^Ақжайық ауылы \/ from №1: true \/ 2\d\.\d\d км/.test(r.plan), 'бағыттауыш сақталды');
  check(/^pickPtr \/ true/.test(r.bmVisible), 'карта қабаттары батырмасы «Жоспар» панелінің астында қалмайды (' + r.bmVisible + ')');
  check(/true \/ жебе шығысқа: true/.test(r.manual), 'қолмен түзету 22,6 км, азимут');
  check(/true \/ қарындаш true/.test(r.preview), 'алдын ала қарау мен қарындаш');
  check(r.detail === 'Ø 13 м / true', 'жеке жоспар 1:200');
  check(r.nofit.startsWith('true') && /ескерту жоқ: true/.test(r.fixed), 'сыймайтын масштаб ұсынылады');
  check(r.drag && r.drag !== 'null', 'белгіні сүйреу сақталды');
  check(/^null \/ \d+,\d км/.test(r.reset), 'автоматты мәнге қайтару');
  check(r.pdf_kk.pages === 4 && r.pdf_kk.a4 && r.pdf_kk.font, 'біріктірілген PDF: 4 бет, A4, қаріп енгізілген');
  check(r.pdf_ru.pages === 1 && r.ruTitle === 'true / true', 'орысша PDF');
  check(r.markCoord === '50.3, 57.2', 'ескерткіштің негізгі координатасы өзгермеді');
  check(/^plan \/ нысан: 3 \/ 22600 \/ Салтақ-III қорымы$/.test(r.reload), 'қайта ашқанда сақталған');
  check(r.leave === 'zone / жабық' && r.key4 === 'plan', 'қызмет ауысуы');
  // 3-кезең: жағдаят белгілері
  check(r.sitBtn && r.fmode === 'fdraw / true' && r.fdlg === 'true / true', '«Жағдаят» мәзірі: горизонталь сызу, терезеде мәні');
  check(r.treeMode === 'null' && /Жазудың мәтінін/.test(r.textErr), 'ағаштар қатарынан қойылады, Esc аяқтайды; жазусыз мәтін — қате');
  check(r.feats === 'contour:427:3, tree, tree, text', 'белгілер сақталды (' + r.feats + ')');
  check(r.mapFeats === '2 / 1' && /^4 \/ Жағдаят белгілері: 4$/.test(r.featList), 'картада және панельде көрінеді');
  check(r.sheetFeats === 'true / true / true / 2', 'жалпы жоспарда: горизонталь (427), жазу, ағаштар');
  check(r.flbl && r.flbl !== 'null', 'жағдаят жазуын сүйреу сақталды');
  check(/^fedit \/ тұтқа: 3$/.test(r.feditMode), 'картада түзету: әр төбеде тұтқа');
  check(r.areaDlg === 'true / true' && r.area === '4 төбе / ЕГІСТІК', 'егістік ауданы картада сызылды (' + r.area + ')');
  check(r.surfShown && r.surface === '["stones"]', 'қорғанның беті: тас үйінді сақталды');
  check(r.places === '1 / true', 'құдық жоспарға қосылды (сілтеме), панельде көрінеді');
  check(r.sheet2 === 'true / true / true / true', 'жалпы жоспарда: егістік, тас үйінді, құдық');
  check(/^true \/ local \/ 123 \/ height$/.test(r.impDlg) && /Импортталады: 121/.test(r.impInfo), 'CSV импорты: жергілікті жүйе, X — солтүстік, биіктік белгілері (' + r.impDlg + ' | ' + r.impInfo + ')');
  check(r.imported === '121 / 121 / true' && r.grouped, 'CSV-тен 121 биіктік белгісі, деректің ортасы ескерткіштің орнында; панельде бір жолмен');
  check(/^\d+ \/ 423,424,425,426$/.test(r.tin) && r.tin2 === '424,426', 'нүктелерден горизонтальдар (1 м), қайта құрғанда (2 м) ескілері ауыстырылды (' + r.tin + ' | ' + r.tin2 + ')');
  check(r.sheet3 >= 2, 'жалпы жоспарда құрылған горизонтальдар');
  check(r.dxfGroups === 'track,tree / local', 'DXF қабаттары → белгі түрлері (' + r.dxfGroups + ')');
  check(r.featsReload > 120, 'қайта ашқанда жағдаят белгілері сақталған (' + r.featsReload + ')');
  // 2-кезең
  check(r.num4 === '4' && r.subHidden === true && r.subShown === true, 'құлпытас типі тек құлпытаста көрінеді');
  check(/Ұзындығы/.test(r.rectLabels) && /Ені/.test(r.rectLabels), 'тіктөртбұрыштың өрістері: ұзындығы, ені');
  check(r.o4 === 'sagana brick_raw rect 6 4', '№4 шикі кірпіштен сағана там сақталды');
  check(r.o5 === 'kulpytas classic fair -', '№5 құлпытас: типі, жай-күйі, материалы белгісіз');
  check(r.drawMode === 'draw' && /^rect 10 × 8 \/ 0°$/.test(r.drawn) && r.o6 === 'kesene rect 10 8 brick_fired', 'кесене картада тіктөртбұрыш болып сызылды');
  check(r.glyphs >= 1, 'картада қорым нысанының белгісі');
  check(r.explRow4 && r.legend, 'экспликация мен шартты белгілер жалпы жоспарда');
  check(r.setBox && r.stateCol === 'true / true' && r.placeSaved === 'separate' && /Экспликация — 2-бет/.test(r.pages), 'экспликация баптаулары сақталады');
  check(r.pdf_stage2.pages === r.pdf2pages && r.pdf2pages === 2, 'қорым PDF-і: жоспар + экспликация беті');
  // Қағаз өлшемі (A3 = 841,89 × 1190,55 pt)
  check(r.paperOpts === 'A5,A4,A3,A2,A1,A0,custom', 'қағаз өлшемдерінің тізімі');
  check(r.paper === 'A3 portrait / 0 0 297 420' && r.land === '0 0 420 297', 'A3 таңдалып сақталды, жатық бағдар бетті бұрады');
  check((m => m && Math.abs(+m[1] - 841.89) < 1 && Math.abs(+m[2] - 1190.55) < 1)(r.pdf_a3.mediabox.match(/([\d.]+) × ([\d.]+)/)), 'PDF беті A3 өлшемінде (' + r.pdf_a3.mediabox + ')');

  const real = errors.filter(e => !/tile|Failed to load resource/i.test(e));
  if (errors.length) console.log('Консоль қателері:\n  ' + errors.join('\n  '));
  if (fails.length) console.log('СӘТСІЗ:\n  ' + fails.join('\n  '));
  else console.log('Барлық тексеріс өтті.');
  app.exit(real.length || fails.length ? 1 : 0);
}

require('../main/main.js');
