/* «Жоспар» есептерінің тесті (DOM-сыз): геодезиялық кері есеп, метрлік жазықтық, масштаб, бет үлгісі.
   Техникалық тапсырманың қабылдау сынақтарындағы сандар: 30 м → 1:500-де 60 мм, Ø 18 м → 1:200-де 90 мм,
   №1 қорғанның белгісі (1 | 0,7 / 13), дәл солтүстіктегі елді мекенге жебе жоғары қарайды, 22,6 км жазуы.
   Іске қосу: node scripts/test-plan.mjs */
import { SCALES, plane, inverse, fmtDist, fmtNum, fmtMeasure, parseNum, scaleBarStep, toMm, selfIntersects, cmpNum } from '../src/plan/geo.js';
import { renderPage, autoScale, fitsAt, objTitle, explRow, isStage2, paperSize, pdfHtml } from '../src/plan/sheet.js';

let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.error('✗ ' + msg); } else console.log('✓ ' + msg); };
const near = (a, b, eps) => Math.abs(a - b) <= eps;

/* ---------- Геодезия ---------- */
// Винсентидің классикалық тексеру мысалы (Flinders Peak → Buninyong)
const fb = inverse(-37.95103342, 144.42486789, -37.65282114, 143.92649554);
ok(near(fb.dist, 54972.271, 0.01) && near(fb.az, 306.86816, 1e-4), 'Винсенти: 54972,271 м, 306,868° (' + fb.dist.toFixed(3) + ', ' + fb.az.toFixed(5) + ')');
const nn = inverse(50.3, 57.2, 50.5, 57.2);
ok(near(nn.az, 0, 1e-9), 'дәл солтүстіктегі нүкте: азимут 0°');
ok(near(inverse(50.3, 57.2, 50.3, 57.5).az, 90, 0.2), 'шығыстағы нүкте: азимут ≈ 90°');

const P = plane(50.3, 57.2);
const q = P.inv(30, 40), back = P.fwd(q[0], q[1]);
ok(near(back[0], 30, 1e-9) && near(back[1], 40, 1e-9), 'жазықтық: тура және кері түрлендіру');
const gd = inverse(50.3, 57.2, q[0], q[1]).dist;
ok(near(gd, 50, 0.005), 'жазықтықтағы 50 м геодезиялық қашықтықпен сай (' + gd.toFixed(4) + ' м)');

/* ---------- Пішім ---------- */
ok(fmtDist(22600) === '22,6 км' && fmtDist(850.4) === '850 м' && fmtDist(1000) === '1,0 км', 'қашықтық: 22,6 км / 850 м / 1,0 км');
ok(fmtNum(0.7) === '0,7' && fmtNum(13) === '13' && fmtMeasure(null) === '—' && fmtMeasure(0) === '0', 'сан: 0,7 / 13 / «—» / 0');
ok(parseNum('0,7') === 0.7 && parseNum('') === null && Number.isNaN(parseNum('a')), 'енгізу: 0,7 / бос / қате');
ok(toMm(18, 200) === 90, 'Ø 18 м 1:200-де 90 мм');
ok([1, 2, 2.5, 5].some(m => [0.1, 1, 10, 100].some(k => near(scaleBarStep(500), m * k, 1e-9))), 'сызықтық масштаб қадамы: ' + scaleBarStep(500) + ' м (1:500)');
ok(selfIntersects([[0, 0], [10, 10], [10, 0], [0, 10]]) && !selfIntersects([[0, 0], [10, 0], [10, 10], [0, 10]]), 'өзімен қиылысатын контур анықталады');
ok(['10', '2', '1а', '1'].map(x => ({ num: x })).sort(cmpNum).map(o => o.num).join(',') === '1,1а,2,10', 'нөмірлердің табиғи реті');

/* ---------- Бет ---------- */
const mark = { id: 'a'.repeat(16), name: 'Салтақ-III қорымы', lat: 50.3, lon: 57.2 };
const names = { title: ['Салтақ-III қорымы', 'Ақтөбе облысы', 'Қарғалы ауданы'], ptr: 'Ақжайық ауылы' };
const at = (x, y) => { const p = P.inv(x, y); return { lat: p[0], lon: p[1] }; };
const nums = s => [...s.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="0.9"/g)].map(m => [+m[1], +m[2]]);

// 1) Екі қорғанның орталығы метрлік жазықтықта 30 м — 1:500-де 60 мм
const o1 = { id: '1'.repeat(16), num: '1', kind: 'kurgan', shape: '', ...at(0, 0), height: null, diam: null };
const o2 = { id: '2'.repeat(16), num: '2', kind: 'kurgan', shape: '', ...at(18, 24), height: null, diam: null };
let ctx = { mark, objects: [o1, o2], plan: null, lang: 'kk', names };
let pg = renderPage(ctx, 'general', null, 500);
const c = nums(pg.svg);
ok(c.length === 2 && near(Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]), 60, 0.01), 'жалпы жоспар 1:500: орталықтардың арасы 60 мм');
ok(pg.svg.includes('Салтақ-III қорымы') && pg.svg.includes('Ескерткіш жоспары') && pg.svg.includes('width="210mm"'), 'бет A4, тақырып пен «Ескерткіш жоспары»');

// 2) Ø 18 м қорған — 1:200-де контурдың диаметрі 90 мм, «Ø 18 м» жазуы
const k18 = { id: '3'.repeat(16), num: '1', kind: 'kurgan', shape: 'circle', diam: 18, height: 0.7, ...at(0, 0) };
ctx = { mark, objects: [k18], plan: null, lang: 'kk', names };
pg = renderPage(ctx, 'detail', k18, 200);
const ring = (pg.svg.match(/<polygon points="([^"]+)" fill="#9c4f1c" fill-opacity/) || [])[1].split(' ').map(s => s.split(',').map(Number));
const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
ok(near(Math.max(...xs) - Math.min(...xs), 90, 0.01) && near(Math.max(...ys) - Math.min(...ys), 90, 0.01), 'жеке жоспар 1:200: контурдың диаметрі 90 мм');
ok(pg.svg.includes('Ø 18 м') && pg.svg.includes('Масштаб 1:200') && pg.svg.includes('Биіктігі: 0,7 м'), '«Ø 18 м», «Масштаб 1:200», биіктігі жазылады');

// 3) №1 қорған: 0,7 м биіктік, 13 м диаметр — 1 сол жақта, 0,7 үстінде, 13 астында
const k13 = { id: '4'.repeat(16), num: '1', kind: 'kurgan', shape: 'circle', diam: 13, height: 0.7, ...at(0, 0) };
ctx = { mark, objects: [k13], plan: null, lang: 'kk', names };
pg = renderPage(ctx, 'general', null, 500);
const lbl = pg.svg.match(/<g class="pj-lbl"[^>]*>(.*?)<\/g>/)[1];
const tpos = s => { const m = lbl.match(new RegExp('<text x="([\\d.-]+)" y="([\\d.-]+)"[^>]*>' + s + '</text>')); return m ? [+m[1], +m[2]] : null; };
const t1 = tpos('1'), t07 = tpos('0,7'), t13 = tpos('13'), ly = +lbl.match(/<line x1="[\d.-]+" y1="([\d.-]+)"/)[1];
ok(t1 && t07 && t13 && t1[0] < t07[0] && t07[1] < ly && t13[1] > ly, 'белгі: 1 — сол жақта, 0,7 — сызықтың үстінде, 13 — астында');
const r13 = (pg.svg.match(/<polygon points="([^"]+)" fill="#9c4f1c" stroke/) || [])[1].split(' ').map(s => +s.split(',')[0]);
ok(near(Math.max(...r13) - Math.min(...r13), toMm(13, 500), 0.01), 'диаметр 13 м контурдың өлшемін анықтайды (1:500-де 26 мм)');

// 4) Дәл солтүстіктегі елді мекен — жебе жоғары; қолмен 22,6 км
const north = P.inv(0, 22000);
ctx = { mark, objects: [k13], lang: 'kk', names, plan: { mark_id: mark.id, ptr: { lat: north[0], lon: north[1] }, ptr_from: k13.id, ptr_az_man: null, ptr_dist_man: null } };
pg = renderPage(ctx, 'general', null, 500);
const ar = pg.svg.match(/<g class="pj-arrow"><line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/);
ok(ar && near(+ar[1], +ar[3], 0.01) && +ar[4] < +ar[2], 'солтүстіктегі елді мекенге жебе жоғары қарайды');
ok(pg.svg.includes('22,0 км') && pg.svg.includes('Ақжайық ауылы'), 'бағыттауышта атау мен есептелген қашықтық');
ctx.plan = { ...ctx.plan, ptr_dist_man: 22600, ptr_az_man: 135 };
pg = renderPage(ctx, 'general', null, 500);
const ar2 = pg.svg.match(/<g class="pj-arrow"><line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/);
ok(pg.svg.includes('22,6 км') && +ar2[3] > +ar2[1] && +ar2[4] > +ar2[2], 'қолмен түзету: 22,6 км, азимут 135° — жебе оңға төмен бұрылады');
ok(pg.arrowMid && pg.arrowMid.length === 2, 'қарындаш үшін бағыттауыштың ортасы есептеледі');

// 5) Масштаб: автоматты — ең ірі сыйымды; сыймайтын масштабта ұсыныс
const far = { id: '5'.repeat(16), num: '2', kind: 'kurgan', shape: 'circle', diam: 8, height: 0.3, ...at(400, 300) };
ctx = { mark, objects: [k13, far], plan: null, lang: 'kk', names };
const au = autoScale(ctx, 'general', null);
const prev = SCALES[SCALES.indexOf(au) - 1];
ok(fitsAt(ctx, 'general', null, au) && !fitsAt(ctx, 'general', null, prev), 'автоматты масштаб — ең ірі сыйымды: 1:' + au + ' (1:' + prev + ' сыймайды)');
pg = renderPage(ctx, 'general', null, 500);
ok(!pg.fits && pg.suggest === au && pg.warn.includes('nofit'), '1:500 сыймайды — 1:' + au + ' ұсынылады');

// 6) Орысша бет
ctx = { mark, objects: [k18], plan: null, lang: 'ru', names: { title: ['Могильник Салтак-III', 'Актюбинская область', 'Каргалинский район'], ptr: '' } };
pg = renderPage(ctx, 'general', null, 0);
ok(pg.svg.includes('План памятника') && pg.svg.includes('Могильник Салтак-III'), 'орысша: «План памятника»');
ok(objTitle(k18, 'ru') === 'Курган №1' && objTitle(k18, 'kk') === '№1 қорған', 'нысан атауы: «№1 қорған» / «Курган №1»');

/* ---------- 2-кезең: қорым экспликациясы (docs/PLAN-STAGE2.md) ---------- */
const qo = (n, kind, x, y, extra = {}) => ({ id: String(n).padStart(16, '0'), num: String(n), kind, shape: '', height: null, diam: null, ...at(x, y), ...extra });
const tbl = svg => (svg.match(/<g class="pj-expl"[\s\S]*?<\/g>/) || [''])[0];
/** Экспликацияның нөмірі num жолындағы ұяшықтардың мәтіндері. */
const rowText = (svg, num) => {
  const ts = [...tbl(svg).matchAll(/<text x="[\d.]+" y="([\d.]+)"[^>]*>([^<]*)<\/text>/g)];
  const y = (ts.find(m => m[2] === num) || [])[1];
  return ts.filter(m => m[1] === y).map(m => m[2]);
};
// ТЗ: №4 шикі кірпіштен салынған сағана там
const k4 = qo(4, 'sagana', 10, 0, { shape: 'rect', ax_a: 6, ax_b: 4, ax_az: 0, material: 'brick_raw' });
ctx = { mark, objects: [k13, qo(2, 'kulpytas', -8, 6), qo(3, 'kesene', -15, -10, { shape: 'rect', ax_a: 7, ax_b: 7, material: 'brick_fired' }), k4], plan: null, lang: 'kk', names };
ok(isStage2(ctx.objects) && !isStage2([k13]), 'қорым режимі тек 2-кезеңнің түрі не материалы болса қосылады');
pg = renderPage(ctx, 'general', null, 0);
ok(rowText(pg.svg, '4').join('|') === '4|Сағана там|Шикі кірпіш|6 × 4|—', '№4 экспликацияда: «Сағана там», «Шикі кірпіш» бөлек бағандарда (' + rowText(pg.svg, '4').join('|') + ')');
ok(/fill="url\(#pj-m-brick_raw\)" stroke="#111" stroke-width="1.05"/.test(pg.svg), '№4 сызбада: шикі кірпіш штрихы, сағананың қос сызығы');
const leg = (pg.svg.match(/<g class="pj-legend">[\s\S]*?<\/g><\/g>/) || [''])[0];
ok(leg.includes('шикі кірпіш') && leg.includes('url(#pj-m-brick_raw)') && leg.includes('сағана там'), 'шартты белгі түсіндірмеде де бар');
ok(leg.includes('кесене') && leg.includes('құлпытас') && !leg.includes('қойтас') && !leg.includes('табиғи тас'), 'шартты белгілерде тек сызбада бар түрлер мен материалдар');
ok(rowText(pg.svg, '2')[2] === '—', 'материалы белгісіз құлпытас — «—»');
ok(!renderPage({ mark, objects: [k13], plan: null, lang: 'kk', names }, 'general', null, 500).svg.includes('pj-legend'), '1-кезеңнің беті өзгерген жоқ (шартты белгілер мен экспликациясыз)');
// Бетке сыймайтын экспликация: келесі бетте жалғасады, масштаб сақталады
const many = [k4];
for (let i = 5; i <= 70; i++) many.push(qo(i, i % 3 ? 'kulpytas' : 'koitas', (i % 10) * 4 - 20, Math.floor(i / 10) * 4 - 14));
ctx = { mark, objects: many, plan: null, lang: 'kk', names };
pg = renderPage(ctx, 'general', null, 1000);
ok(pg.scale === 1000 && pg.more.length >= 1 && pg.more[0].includes('Экспликация (жалғасы)') && tbl(pg.more[0]).includes('>Материалы<'),
  'экспликация келесі бетте жалғасады, тақырып жолы қайталанады, масштаб 1:1000 сақталды (' + (pg.more.length + 1) + ' бет)');
const enums = [pg.svg, ...pg.more].flatMap(sv => [...tbl(sv).matchAll(/text-anchor="middle">(\d+)</g)].map(m => +m[1]));
ok(enums.length === many.length && enums.every((v, i) => i === 0 || v > enums[i - 1]), 'барлық нысан экспликацияда бір рет, нөмір ретімен (' + enums.length + ')');
// Орысша
ctx = { mark, objects: [k4], plan: null, lang: 'ru', names: { title: ['Могильник'] } };
pg = renderPage(ctx, 'general', null, 0);
ok(rowText(pg.svg, '4')[1] === 'Саганатам' && /^Сырцовый( кирпич)?$/.test(rowText(pg.svg, '4')[2]) && pg.svg.includes('Условные обозначения'), 'орысша: «Саганатам», «Сырцовый кирпич»');
// Баптаулар: құлпытас типі, жай-күй бағаны, бөлек бет, жол биіктігі, тым кең баған
const kt = qo(7, 'kulpytas', 0, 3, { subtype: 'classic', state: 'poor' });
ok(explRow(kt, 'kk').kind === 'Құлпытас (классикалық)' && explRow(kt, 'kk', { subtype: false, cols: [] }).kind === 'Құлпытас', 'құлпытас типі «Түрі» бағанында (баптаумен өшіріледі)');
const E = { cols: [{ key: 'material', show: true, width: 0 }, { key: 'size', show: false, width: 0 }, { key: 'state', show: true, width: 0 }, { key: 'note', show: true, width: 0 }],
  row_h: 8, font: 3, place: 'separate', zone_h: 70, subtype: true };
ctx = { mark, objects: [k4, kt], plan: { expl: E }, lang: 'kk', names };
pg = renderPage(ctx, 'general', null, 0);
ok(!tbl(pg.svg) && pg.more.length === 1 && /<text[^>]*>Экспликация<\/text>/.test(pg.more[0]), 'кесте бөлек бетте');
ok(tbl(pg.more[0]).includes('>Жай-күйі<') && !tbl(pg.more[0]).includes('>Өлшемі, м<') && rowText(pg.more[0], '7').includes('қанағаттанарлықсыз'), 'жай-күй бағаны қосылды, өлшем бағаны өшірілді');
const ry = [...tbl(pg.more[0]).matchAll(/<line x1="[\d.]+" y1="([\d.]+)" x2="[\d.]+" y2="[\d.]+" stroke="#111" stroke-width="0.1"/g)].map(m => +m[1]);
ok(ry.length === 2 && near(ry[1] - ry[0], 8, 0.01), 'жол биіктігі 8 мм');
ctx.plan.expl = { ...E, place: 'sheet', cols: E.cols.map(c => ({ ...c, width: 90 })) };
ok(renderPage(ctx, 'general', null, 0).warn.includes('expl-width'), 'бағандардың ені беттен асса — ескерту');
// Тіктөртбұрыштың жеке жоспары
pg = renderPage({ mark, objects: [k4], plan: null, lang: 'kk', names }, 'detail', k4, 100);
ok(pg.svg.includes('>6 м<') && pg.svg.includes('>4 м<') && pg.svg.includes('6 × 4 м') && pg.svg.includes('Материалы: шикі кірпіш'), 'тіктөртбұрыштың жеке жоспары: ұзындығы, ені, материалы');

/* ---------- Қағаз өлшемі ---------- */
const z = (pp) => { const s = paperSize(pp); return s.w + '×' + s.h + ' ' + s.name; };
ok(z(null) === '210×297 A4' && z({ size: 'A3' }) === '297×420 A3' && z({ size: 'A0', orient: 'landscape' }) === '1189×841 A0' && z({ size: 'custom', w: 500, h: 700 }) === '500×700 500×700',
  'қағаз: әдепкі A4, A3, A0 жатық, өз өлшемі');
ok(z({ size: 'custom', w: 20, h: 700 }) === '210×297 A4', 'өз өлшемі шектен тыс болса — A4');
const pair = [o1, o2], ctxP = pp => ({ mark, objects: pair, plan: { paper: pp }, lang: 'kk', names });
pg = renderPage(ctxP({ size: 'A3' }), 'general', null, 500);
const c3 = nums(pg.svg);
ok(pg.svg.includes('viewBox="0 0 297 420"') && pg.svg.includes('width="297mm"') && pg.page.name === 'A3', 'A3 беті: 297 × 420 мм');
ok(c3.length === 2 && near(Math.hypot(c3[1][0] - c3[0][0], c3[1][1] - c3[0][1]), 60, 0.01), 'A3-те де 30 м → 1:500-де 60 мм (масштаб қағазға тәуелсіз)');
const far2 = { ...o2, ...at(600, 450) };
const aA4 = autoScale({ ...ctxP(null), objects: [o1, far2] }, 'general', null), aA1 = autoScale({ ...ctxP({ size: 'A1' }), objects: [o1, far2] }, 'general', null);
ok(aA1 < aA4, 'үлкен қағазда автоматты масштаб ірірек: A4 — 1:' + aA4 + ', A1 — 1:' + aA1);
pg = renderPage(ctxP({ size: 'A4', orient: 'landscape' }), 'general', null, 500);
ok(pg.svg.includes('viewBox="0 0 297 210"') && /<rect x="7" y="7" width="283" height="196"/.test(pg.svg), 'A4 жатық: рамка бетке сай');
ok(pdfHtml(['<svg/>'], 't', { w: 297, h: 420 }).includes('@page{size:297mm 420mm;margin:0}') && pdfHtml(['<svg/>'], 't').includes('@page{size:210mm 297mm'), 'PDF беті қағаз өлшемінде');

console.log('\n' + (n - fails) + '/' + n + ' өтті');
if (fails) process.exit(1);
