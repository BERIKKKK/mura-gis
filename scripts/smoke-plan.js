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
  // Қайта жүктеу: деректер жобада сақталған
  await new Promise(res => { win.webContents.once('did-finish-load', res); win.webContents.reload(); });
  await new Promise(res => setTimeout(res, 3000));
  Object.assign(r, await js(`(async () => {
    const out = {}, wait = t => new Promise(r => setTimeout(r, t));
    for (let i = 0; i < 30 && !MuraPlan.objects.length; i++) await wait(100);
    out.reload = MuraSvc.get() + ' / нысан: ' + MuraPlan.objects.length + ' / ' + (MuraPlan.plans[0]?.ptr_dist_man) + ' / ' + document.getElementById('pjMarkName').textContent;
    // Қызмет ауысқанда «Жоспар» панелі жабылады, 4 пернесі қайта ашады
    MuraPlan.openPanel(); await wait(100);
    document.getElementById('muraSvc-zone').click(); await wait(200);
    out.leave = MuraSvc.get() + ' / ' + (document.getElementById('pjPanel').hidden ? 'жабық' : 'ашық');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '4', bubbles: true })); await wait(200);
    out.key4 = MuraSvc.get();
    return out;
  })()`));
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

  const real = errors.filter(e => !/tile|Failed to load resource/i.test(e));
  if (errors.length) console.log('Консоль қателері:\n  ' + errors.join('\n  '));
  if (fails.length) console.log('СӘТСІЗ:\n  ' + fails.join('\n  '));
  else console.log('Барлық тексеріс өтті.');
  app.exit(real.length || fails.length ? 1 : 0);
}

require('../main/main.js');
