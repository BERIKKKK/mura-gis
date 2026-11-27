/* «Жоспар» есептерінің тесті (DOM-сыз): геодезиялық кері есеп, метрлік жазықтық, масштаб, бет үлгісі.
   Техникалық тапсырманың қабылдау сынақтарындағы сандар: 30 м → 1:500-де 60 мм, Ø 18 м → 1:200-де 90 мм,
   №1 қорғанның белгісі (1 | 0,7 / 13), дәл солтүстіктегі елді мекенге жебе жоғары қарайды, 22,6 км жазуы.
   Іске қосу: node scripts/test-plan.mjs */
import { SCALES, plane, inverse, fmtDist, fmtNum, fmtMeasure, parseNum, scaleBarStep, toMm, selfIntersects, cmpNum } from '../src/plan/geo.js';
import { createRequire } from 'node:module';
import { renderPage, autoScale, fitsAt, objTitle, explRow, isStage2, paperSize, pdfHtml } from '../src/plan/sheet.js';
import { makeTransform, tmForward, helmert, guessCrs } from '../src/plan/crs.js';
import { parseDxf, parseCsv, guessColumns, csvItems, parseGeojson, groupsOf, toRecords } from '../src/plan/importer.js';
import { contours, delaunay } from '../src/plan/tin.js';

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

/* ---------- Жағдаят белгілері (3-кезең, docs/PLAN-STAGE3.md) ---------- */
{
  const F = (id, kind, x) => ({ id: id.repeat(16), mark_id: mark.id, kind, name: '', name_ru: '', value: null, lbl: null, ...x });
  const road = F('a', 'road', { name: 'Косестек – Сарыбұлақ', name_ru: 'Косестек – Сарыбулак', pts: [[at(-400, -50).lat, at(-400, -50).lon], [at(400, -50).lat, at(400, -50).lon]] });
  const track = F('b', 'track', { pts: [[at(-30, 40).lat, at(-30, 40).lon], [at(0, 60).lat, at(0, 60).lon], [at(40, 70).lat, at(40, 70).lon]] });
  const power = F('c', 'power', { pts: [[at(-50, -20).lat, at(-50, -20).lon], [at(0, -20).lat, at(0, -20).lon], [at(50, -20).lat, at(50, -20).lon]] });
  const cont = F('d', 'contour', { value: 427, pts: [[at(-300, 10).lat, at(-300, 10).lon], [at(300, 30).lat, at(300, 30).lon]] });
  const tree = F('e', 'tree', at(18, 24));
  const tower = F('f', 'tower', { ...at(-10, 10), name: 'байланыс мұнарасы', name_ru: 'вышка сотовой связи', lbl: [12, -6] });
  const h = F('1', 'height', { ...at(5, -5), value: 427.3 });
  const txt = F('2', 'text', { ...at(-20, -35), name: 'ЕГІСТІК', name_ru: 'ПАШНЯ', rot: 0 });
  const feats = [road, track, power, cont, tree, tower, h, txt];
  const base = { mark, objects: [o1, o2], plan: null, lang: 'kk', names };
  const withF = { ...base, features: feats };
  ok(autoScale(withF, 'general', null) === autoScale(base, 'general', null), 'жағдаят белгілері автоматты масштабқа әсер етпейді (1:' + autoScale(base, 'general', null) + ')');
  const s = renderPage(withF, 'general', null, 500).svg;
  ok(s.includes('<clipPath id="pj-fclip">') && s.includes('clip-path="url(#pj-fclip)"'), 'жағдаят сызба аймағымен қиылады');
  ok(s.indexOf('class="pj-feats"') < s.indexOf('r="0.9" fill="#111"') && s.indexOf('class="pj-feats-over"') > s.lastIndexOf('r="0.9" fill="#111"'), 'сызықтар нысандардың астында, нүктелік белгілер мен жазулар — үстінде');
  const cc = nums(s);
  const crown = [...s.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="1.2" fill="#6b9a34"/g)].map(m => [+m[1], +m[2]]);
  ok(crown.length === 1 && near(crown[0][0], cc[1][0], 0.01) && near(crown[0][1] + 0.5, cc[1][1], 0.01), 'ағаш өз координатасында (№2 қорғанмен бір нүктеде)');
  ok((s.match(/stroke="#111" stroke-width="1.5"/g) || []).length === 1 && (s.match(/stroke="#fff" stroke-width="1"/g) || []).length === 1, 'асфальт жол — қос тұтас сызық');
  ok((s.match(/stroke-dasharray="1.6 0.8"/g) || []).length === 1, 'дала жолы — біреуі үзік қос сызық');
  ok((s.match(/r="0.55" fill="#888"/g) || []).length === 3 && s.includes('>ЭБЖ<'), 'ЭБЖ: әр төбеде тірек, «ЭБЖ» жазуы');
  ok(/fill="#b06a1f"[^>]*>427</.test(s), 'горизонтальдың мәні (427) бойында, қоңыр');
  ok(s.includes('>427,3<') && s.includes('>ЕГІСТІК<') && s.includes('>Косестек – Сарыбұлақ<'), 'биіктік белгісі, жазу, жолдың атауы');
  ok(s.includes('data-drag') === false && renderPage(withF, 'general', null, 500, { editor: true }).svg.includes('data-drag="flbl:' + tower.id + '"'), 'жазуларды тек редакторда сүйреуге болады');
  ok(/stroke="#1f5f99" stroke-width="0.15"/.test(s), 'ығысқан жазуға сілтеме сызығы');
  ok(renderPage({ ...withF, lang: 'ru' }, 'general', null, 500).svg.includes('>ПАШНЯ<') && renderPage({ ...withF, lang: 'ru' }, 'general', null, 500).svg.includes('>ЛЭП<'), 'орысша: жазулар мен «ЛЭП»');
  ok(!s.includes('pj-legend'), '1-кезең жоспары (тек қорғандар): шартты белгілер блогы шықпайды');
  const kes = { id: '9'.repeat(16), num: '3', kind: 'kesene', shape: '', ...at(-15, 5) };
  const s2 = renderPage({ ...withF, objects: [o1, o2, kes] }, 'general', null, 0).svg;
  ok(s2.includes('pj-legend') && s2.includes('>горизонталь<') && s2.includes('>жеке ағаш<') && s2.includes('>электр беру желісі (ЭБЖ)<') && !s2.includes('>жазу<'), 'шартты белгілерде — кездесетін жағдаят түрлері (жазудан басқа)');
  ok(renderPage(base, 'general', null, 500).svg === renderPage({ ...base, features: [] }, 'general', null, 500).svg && !renderPage(base, 'general', null, 500).svg.includes('pj-feats'), 'жағдаятсыз жоспар бұрынғыдай');

  // Сервердің тексерісі (main/plans.js)
  const { cleanFeature } = createRequire(import.meta.url)('../main/plans.js');
  const err = d => { try { cleanFeature(d); return ''; } catch (e) { return e.field || e.message; } };
  ok(err({ mark_id: mark.id, kind: 'road', pts: [[50.3, 57.2]] }) === 'pts' && err({ mark_id: mark.id, kind: 'xyz', lat: 1, lon: 1 }) === 'kind' &&
    err({ mark_id: mark.id, kind: 'height', lat: 50, lon: 57 }) === 'value' && err({ mark_id: mark.id, kind: 'text', lat: 50, lon: 57 }) === 'name' && err({ mark_id: mark.id, kind: 'tree', lat: 'a', lon: 57 }) === 'lat',
    'тексеріс: сызықта 2 төбе, белгілі түр, биіктік мәні, жазу мәтіні, координата');
  const cf = cleanFeature({ mark_id: mark.id, kind: 'text', lat: 50.3, lon: 57.2, name: 'А', rot: 270, pts: [[1, 2]], extra: 1 });
  ok(cf.rot === -90 && cf.pts === null && !('extra' in cf) && cf.lat === 50.3, 'жазу: бұрыш −180…180, артық өрістер алынады');
  const cl = cleanFeature({ mark_id: mark.id, kind: 'contour', value: '427,5', pts: [[50.3, 57.2], [50.3, 57.2], [50.31, 57.21]], lat: 1, lon: 1 });
  ok(cl.value === 427.5 && cl.pts.length === 2 && cl.lat === null && cl.rot === null, 'горизонталь: мәні «427,5», қайталанған төбе алынады');
}

/* ---------- Жағдаят, 2-кезең: аудандар, қалған сызықтар, қорғанның беті, өзге нысандар, жеке жоспар ---------- */
{
  const F = (id, kind, x) => ({ id: id.repeat(16), mark_id: mark.id, kind, name: '', name_ru: '', value: null, lbl: null, ...x });
  const ring = xy => xy.map(([x, y]) => { const q = P.inv(x, y); return [q[0], q[1]]; });
  const arable = F('a', 'arable', { name: 'ЕГІСТІК', name_ru: 'ПАШНЯ', pts: ring([[-60, 40], [60, 40], [60, 70], [-60, 70]]) });
  const fence = F('b', 'fence', { pts: ring([[-40, -30], [40, -30]]) });
  const river = F('c', 'river', { name: 'Ақбұлақсай', pts: ring([[-80, -60], [0, -50], [80, -65]]) });
  const ravine = F('d', 'ravine', { pts: ring([[-50, 20], [50, 25]]) });
  const k1 = { id: '5'.repeat(16), num: '1', kind: 'kurgan', shape: 'circle', diam: 15, height: 0.4, ...at(0, 0), surface: ['stones'] };
  const k2 = { id: '6'.repeat(16), num: '2', kind: 'kurgan', shape: 'circle', diam: 20, height: 0.7, ...at(30, 0), surface: ['pit'] };
  const well = { id: '7'.repeat(16), kind: 'well', name: 'Ескі құдық', name_ru: 'Старый колодец', ...at(-20, -15) };
  const plan2 = { places: [well.id], place_lbl: { [well.id]: [5, -3] } };
  const ctx2 = { mark, objects: [k1, k2], features: [arable, fence, river, ravine], places: [well], plan: plan2, lang: 'kk', names };
  const s = renderPage(ctx2, 'general', null, 500).svg;
  ok(/<polygon points="[^"]+" fill="url\(#pj-f-arable\)"/.test(s) && s.includes('<pattern id="pj-f-arable"') && s.includes('>ЕГІСТІК<'), 'егістік: «═» штрихы, ортасында жазуы');
  const fenceTicks = (s.match(/stroke="#111" stroke-width="0.18"/g) || []).length;
  ok(fenceTicks >= 63 && fenceTicks <= 65, 'шарбақ: әр 2,5 мм сайын штрих (80 м → 1:500-де 160 мм → ' + fenceTicks + ')');
  ok(/fill="#2f6db3" font-style="italic"[^>]*>Ақбұлақсай</.test(s) || /font-style="italic"[^>]*fill="#2f6db3"/.test(s) || /fill="#2f6db3"[^>]*font-style="italic"/.test(s), 'өзен: атауы көк, көлбеу');
  ok((s.match(/stroke="#7a5a2a" stroke-width="0.18"/g) || []).length > 10, 'жыра: тістері');
  const dots = (s.match(/<g class="pj-surface">(.*?)<\/g>/) || [])[1] || '';
  ok((dots.match(/fill="#111"/g) || []).length >= 5, 'тас үйінді: контурдың ішінде нүктелер (' + (dots.match(/fill="#111"/g) || []).length + ')');
  ok(/r="[\d.]+" fill="#d9822b"/.test(s), 'ойық: контурдың ортасында шеңбер');
  ok(s.includes('>Ескі құдық<') && s.includes('stroke="#2f6db3" stroke-width="0.3"'), 'жоспарға қосылған құдық: белгісі мен атауы');
  ok(/<g class="pj-flbl" transform="translate\(5 -3\)"><text[^>]*>Ескі құдық</.test(s) && renderPage(ctx2, 'general', null, 500, { editor: true }).svg.includes('data-drag="plbl:' + well.id + '"'), 'құдықтың жазуы: сақталған ығысу, редакторда сүйреледі');
  ok(renderPage({ ...ctx2, lang: 'ru' }, 'general', null, 500).svg.includes('>Старый колодец<') && renderPage({ ...ctx2, lang: 'ru' }, 'general', null, 500).svg.includes('>ПАШНЯ<'), 'орысша атаулар');
  // Шартты белгілер (қорым жоспарында)
  const kes = { id: '9'.repeat(16), num: '3', kind: 'kesene', shape: '', ...at(-15, 5) };
  const s2 = renderPage({ ...ctx2, objects: [k1, k2, kes] }, 'general', null, 0).svg;
  ok(['>тас үйінді<', '>ойық (тонау шұңқыры)<', '>егістік<', '>шарбақ<', '>өзен, жылға<', '>жыра<', '>құдық<'].every(t => s2.includes(t.replace('шарбақ', 'қоршау, шарбақ'))), 'шартты белгілерде: қорғанның беті, аудан, сызықтар, құдық');
  // Жеке жоспар: қорғанның беті және маңындағы жағдаят; қиюдың id-і бетке тән
  const d1 = renderPage(ctx2, 'detail', k1, 200).svg;
  ok(d1.includes('pj-surface') && d1.includes('<clipPath id="pj-fclip-' + k1.id + '">') && d1.includes('url(#pj-fclip-' + k1.id + ')') && !d1.includes('data-drag="flbl'), 'жеке жоспар: беті, жағдаят (бөлек қию, жазулар сүйретілмейді)');
  ok(renderPage({ mark, objects: [k13], plan: null, lang: 'kk', names }, 'detail', k13, 200).svg.indexOf('pj-feats') < 0, 'жағдаятсыз жеке жоспар бұрынғыдай');

  const req = createRequire(import.meta.url);
  const { cleanFeature, cleanObject, cleanPlan } = req('../main/plans.js');
  const ferr = d => { try { cleanFeature(d); return ''; } catch (e) { return e.field || e.message; } };
  ok(ferr({ mark_id: mark.id, kind: 'arable', pts: ring([[0, 0], [10, 0]]) }) === 'pts' && ferr({ mark_id: mark.id, kind: 'arable', pts: ring([[0, 0], [10, 10], [10, 0], [0, 10]]) }) === 'pts', 'аудан: кемінде үш төбе, өзімен қиылыспайды');
  const ca = cleanFeature({ mark_id: mark.id, kind: 'water', pts: ring([[0, 0], [10, 0], [10, 10], [0, 0]]) });
  ok(ca.pts.length === 3 && ca.lat === null, 'аудан: тұйықтау нүктесі алынады');
  ok(JSON.stringify(cleanObject({ mark_id: mark.id, num: '1', kind: 'kurgan', lat: 50, lon: 57, surface: ['pit', 'zzz', 'stones'] }).surface) === '["stones","pit"]' &&
    cleanObject({ mark_id: mark.id, num: '1', kind: 'kesene', lat: 50, lon: 57, surface: ['pit'] }).surface === null && cleanObject({ mark_id: mark.id, num: '1', lat: 50, lon: 57 }).surface === null,
    'қорғанның беті: тек белгілі кодтар, тек қорғанда; ескі жазбада — null');
  // Қазылған қорған: тек қорғанда сақталады, жоспарда қиғаш штрих, шартты белгілерде түсіндіріледі
  ok(cleanObject({ mark_id: mark.id, num: '1', kind: 'kurgan', lat: 50, lon: 57, dug: true }).dug === true &&
    cleanObject({ mark_id: mark.id, num: '1', kind: 'kesene', lat: 50, lon: 57, dug: true }).dug === null && cleanObject({ mark_id: mark.id, num: '1', lat: 50, lon: 57 }).dug === null,
    'қазылған қорған: тек қорғанда; ескі жазбада — null');
  // Қорғанның түрі (жер, тас, топырақ-тасты): тек қорғанда; экспликацияның «Түрі» бағанында
  ok(cleanObject({ mark_id: mark.id, num: '1', kind: 'kurgan', lat: 50, lon: 57, ktype: 'stone' }).ktype === 'stone' && cleanObject({ mark_id: mark.id, num: '1', kind: 'kurgan', lat: 50, lon: 57, ktype: 'ditch' }).ktype === 'ditch' &&
    cleanObject({ mark_id: mark.id, num: '1', kind: 'kurgan', lat: 50, lon: 57, ktype: 'zzz' }).ktype === '' &&
    cleanObject({ mark_id: mark.id, num: '1', kind: 'kesene', lat: 50, lon: 57, ktype: 'stone' }).ktype === '' && cleanObject({ mark_id: mark.id, num: '1', lat: 50, lon: 57 }).ktype === '',
    'қорғанның түрі: тек белгілі код, тек қорғанда; ескі жазбада — бос');
  ok(explRow({ num: '1', kind: 'kurgan', ktype: 'earth' }, 'kk').kind === 'Жер (топырақ) қорған' && explRow({ num: '1', kind: 'kurgan', ktype: 'earth_stone' }, 'ru').kind === 'Земляно-каменный курган' &&
    explRow({ num: '1', kind: 'kurgan' }, 'kk').kind === 'Қорған', 'қорғанның түрі экспликацияда');
  const kd = { ...k2, dug: true };
  const sd = renderPage({ ...ctx2, objects: [k1, kd] }, 'general', null, 500).svg;
  ok(sd.includes('<pattern id="pj-dug"') && (sd.match(/fill="url\(#pj-dug\)"/g) || []).length === 1 && renderPage(ctx2, 'general', null, 500).svg.indexOf('fill="url(#pj-dug)"') < 0,
    'қазылған қорған: жалпы жоспарда тек сол контур штрихталады');
  ok(renderPage({ ...ctx2, objects: [k1, kd] }, 'detail', kd, 200).svg.includes('fill="url(#pj-dug)"'), 'қазылған қорған: жеке жоспарда да штрих');
  const sl = renderPage({ ...ctx2, objects: [k1, kd, kes] }, 'general', null, 0).svg;
  ok(sl.includes('>қазылған қорған<') && renderPage({ ...ctx2, objects: [k1, kd, kes], lang: 'ru' }, 'general', null, 0).svg.includes('>раскопанный курган<') &&
    !s2.includes('>қазылған қорған<'), 'қазылған қорған: шартты белгілерде (тек бар болса)');
  const kdp = { id: 'a'.repeat(16), num: '4', kind: 'kurgan', shape: '', dug: true, ...at(-30, 5) };
  ok(/<circle [^>]*r="1.6" fill="url\(#pj-dug\)"/.test(renderPage({ ...ctx2, objects: [k1, kdp, kes] }, 'general', null, 500).svg), 'контурсыз қазылған қорған: штрихталған белгі');
  const cp = cleanPlan({ mark_id: mark.id, places: [well.id, 'x', well.id], place_lbl: { [well.id]: [1, 2], ['8'.repeat(16)]: [3, 4] } });
  ok(JSON.stringify(cp.places) === '["' + well.id + '"]' && JSON.stringify(cp.place_lbl) === '{"' + well.id + '":[1,2]}' && JSON.stringify(cleanPlan({ mark_id: mark.id }).places) === '[]', 'жоспардың өзге нысандары: тек id, ығысу тек солардікі');
}

/* ---------- Мұртты қорған: мұрттар (тас жалдар) ---------- */
{
  const ring = xy => xy.map(([x, y]) => { const q = P.inv(x, y); return [q[0], q[1]]; });
  const base = { id: 'c'.repeat(16), num: '1', kind: 'kurgan', shape: 'circle', diam: 8, height: 0.3, ...at(0, 0) };
  const mus = [ring([[5, 2], [40, 25], [90, 30]]), ring([[5, -2], [40, -25], [90, -30]])];
  const km = { ...base, mus };
  const ctxM = o => ({ mark, objects: [o], plan: null, lang: 'kk', names });
  const s = renderPage(ctxM(km), 'general', null, 1000).svg;
  const tri = ((s.match(/<g class="pj-mus">(.*?)<\/g>/) || [])[1] || '').match(/<polygon /g) || [];
  // Бір мұрттың ұзындығы ≈ 41,9 + 50,2 м → 1:1000-де ≈ 92 мм → 1,15 мм сайын 80 үшбұрыш; екеуі — 160
  ok(tri.length >= 156 && tri.length <= 162, 'мұрттар: жал бойымен үшбұрыштар тізбегі (' + tri.length + ')');
  ok(s.includes('<g class="pj-body"><g class="pj-mus">'), 'мұрттар контурдың астында салынады');
  ok(renderPage(ctxM(base), 'general', null, 0).scale < renderPage(ctxM(km), 'general', null, 0).scale, 'мұрттар автоматты масштабқа әсер етеді (' + renderPage(ctxM(base), 'general', null, 0).scale + ' → ' + renderPage(ctxM(km), 'general', null, 0).scale + ')');
  ok(renderPage(ctxM(base), 'general', null, 1000).svg.indexOf('pj-mus') < 0, 'мұртсыз қорған бұрынғыдай');
  const d = renderPage(ctxM(km), 'detail', km, 0);
  ok(d.svg.includes('pj-mus') && d.fits, 'жеке жоспар: мұрттары бар, бетке сыяды (1:' + d.scale + ')');
  const kes = { id: 'e'.repeat(16), num: '2', kind: 'kesene', shape: '', ...at(-15, 5) };
  ok(renderPage({ ...ctxM(km), objects: [km, kes] }, 'general', null, 0).svg.includes('>мұрт (тас жал)<'), 'шартты белгілерде: мұрт (тас жал)');

  const req = createRequire(import.meta.url);
  const { cleanObject } = req('../main/plans.js');
  const c = cleanObject({ mark_id: mark.id, num: '1', kind: 'kurgan', lat: 50, lon: 57, mus: [[[50, 57], [50, 57], [50.001, 57.002]], [[50, 57]], 'x', [[50, 57], [91, 57]]] });
  ok(c.mus.length === 1 && c.mus[0].length === 2, 'мұрттар: қайталанған және жарамсыз төбелер, бір төбелі сызық алынады');
  ok(cleanObject({ mark_id: mark.id, num: '1', kind: 'kesene', lat: 50, lon: 57, mus }).mus === null && cleanObject({ mark_id: mark.id, num: '1', lat: 50, lon: 57 }).mus === null &&
    cleanObject({ mark_id: mark.id, num: '1', kind: 'kurgan', lat: 50, lon: 57, mus: [] }).mus === null, 'мұрттар: тек қорғанда; ескі жазбада және бос тізімде — null');
  let field = '';
  try { cleanObject({ mark_id: mark.id, num: '1', kind: 'kurgan', lat: 50, lon: 57, mus: Array(9).fill(mus[0]) }); } catch (e) { field = e.field; }
  ok(field === 'mus', 'мұрттар: 8-ден көп болмайды');
}

/* ---------- 3-кезең: импорт, координаттар жүйелері, нүктелерден горизонтальдар ---------- */
{
  const req = createRequire(import.meta.url);
  // UTM 40N: тура есеп (gpkg-read.js) → кері есеп (crs.js) — бір нүктеге қайтады; gpkg-read түрлендіргішімен бірдей
  const GR = req('../main/gpkg-read.js');
  const fwd40 = GR.tmForward({ ell: GR.ELL.wgs84, k0: 0.9996, lon0: 57, fe: 500000, fn: 0 }), [vx, vy] = fwd40(57.2, 50.3);
  const u40 = makeTransform({ crs: 'utm', zone: 40 })(vx, vy), gr = GR.transformer({ organization: 'EPSG', organization_coordsys_id: 32640 }).fn(vx, vy);
  ok(near(u40[0], 50.3, 1e-7) && near(u40[1], 57.2, 1e-7) && near(gr[1], u40[0], 1e-9) && near(gr[0], u40[1], 1e-9), 'UTM 40N: кері есеп нүктеге қайтады, gpkg-read түрлендіргішімен бірдей');
  ok(!near(makeTransform({ crs: 'utm', zone: 41 })(vx, vy)[1], 57.2, 0.01), 'UTM: аймақ қате болса — басқа нүкте (аймақ маңызды)');
  // СК-42, Гаусс–Крюгер 10-аймақ (аймақ нөмірімен және онсыз) — gpkg-read (EPSG:28410) нәтижесімен бірдей
  const ck = helmert(57.2, 50.3, [6378245, 298.3], [23.57, -140.95, -79.8, 0, 0.35, 0.79, -0.22], true);       // WGS → Пулково
  const [gx, gy] = tmForward({ ell: [6378245, 298.3], k0: 1, lon0: 57, fe: 10500000 })(ck[0], ck[1]);
  const s1 = makeTransform({ crs: 'sk42', zone: 10 })(gx, gy), s2 = makeTransform({ crs: 'sk42', zone: 10 })(gx - 10e6, gy);
  const g28 = GR.transformer({ organization: 'EPSG', organization_coordsys_id: 28410 }).fn(gx, gy);
  ok(near(s1[0], 50.3, 2e-7) && near(s1[1], 57.2, 2e-7) && near(s2[0], s1[0], 1e-9) && near(g28[1], s1[0], 1e-9), 'СК-42 Гаусс–Крюгер: аймақ нөмірімен де, онсыз да; gpkg-read-пен бірдей (' + s1.map(v => v.toFixed(7)).join(', ') + ')');
  // Жергілікті жүйе: тірек нүктесі өз орнында; торды 90° бұрса — тордың «солтүстігі» шығысқа қарайды
  const loc = makeTransform({ crs: 'local', anchor: { x: 1000, y: 2000, lat: 50.3, lon: 57.2 }, rot: 0 });
  const l0 = loc(1000, 2000), l1 = loc(1000, 2030);
  ok(near(l0[0], 50.3, 1e-12) && near(l0[1], 57.2, 1e-12) && near(inverse(50.3, 57.2, l1[0], l1[1]).dist, 30, 0.01) && near(inverse(50.3, 57.2, l1[0], l1[1]).az, 0, 0.01), 'жергілікті жүйе: тірек нүктесі, 30 м солтүстікке');
  const l2 = makeTransform({ crs: 'local', anchor: { x: 0, y: 0, lat: 50.3, lon: 57.2 }, rot: 90 })(0, 10);
  ok(near(inverse(50.3, 57.2, l2[0], l2[1]).az, 90, 0.05), 'жергілікті жүйе: тор 90° бұрылған — азимут 90°');
  let e1 = ''; try { makeTransform({ crs: 'local', anchor: {} }); } catch (e) { e1 = e.field; }
  ok(e1 === 'anchor', 'жергілікті жүйе: тірек нүктесі толмаса — қате');
  ok(guessCrs([57.1, 57.3], [50.2, 50.4]).crs === 'wgs84' && guessCrs([vx, vx + 100], [vy, vy + 100], 57.2).crs === 'utm' && guessCrs([gx, gx + 50], [gy, gy + 50]).zone === 10 && guessCrs([100, 250], [500, 700]).crs === 'local', 'жүйені болжау: WGS 84, UTM, СК-42 (10-аймақ), жергілікті');

  // DXF: LWPOLYLINE (биіктігі 38 — горизонталь), тұйық LWPOLYLINE (егістік), POLYLINE/VERTEX, POINT (z), TEXT (бұрышы), LINE
  const dxf = ['0', 'SECTION', '2', 'HEADER', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
    '0', 'LWPOLYLINE', '8', 'Горизонтали', '90', '3', '70', '0', '38', '427', '10', '0', '20', '0', '10', '10', '20', '5', '10', '20', '20', '0',
    '0', 'LWPOLYLINE', '8', 'Пашня', '90', '4', '70', '1', '10', '-20', '20', '20', '10', '0', '20', '20', '10', '0', '20', '40', '10', '-20', '20', '40',
    '0', 'POLYLINE', '8', 'ЛЭП', '66', '1', '70', '0', '0', 'VERTEX', '8', 'ЛЭП', '10', '-30', '20', '-30', '0', 'VERTEX', '8', 'ЛЭП', '10', '30', '20', '-30', '0', 'SEQEND',
    '0', 'POINT', '8', 'Пикеты', '10', '5', '20', '5', '30', '426.85', '0', 'POINT', '8', 'Пикеты', '10', '6', '20', '6', '30', '426.9',
    '0', 'TEXT', '8', 'Надписи', '10', '0', '20', '-10', '40', '2', '1', 'ПАШНЯ', '50', '30',
    '0', 'LINE', '8', 'Забор', '10', '0', '20', '0', '30', '0', '11', '10', '21', '0', '31', '0',
    '0', 'ENDSEC', '0', 'EOF'].join('\r\n');
  const D = parseDxf(dxf);
  const G = groupsOf(D.items), gk = l => (G.find(g => g.label === l) || {}).kind;
  ok(D.items.length === 7 && !D.wgs, 'DXF: 7 нысан оқылды, жоспарлы координаттар');
  ok(gk('Горизонтали') === 'contour' && gk('Пашня') === 'arable' && gk('ЛЭП') === 'power' && gk('Пикеты') === 'height' && gk('Надписи') === 'text' && gk('Забор') === 'fence', 'DXF қабаттарынан белгі түрі ұсынылады (горизонталь, егістік, ЭБЖ, биіктік, жазу, шарбақ)');
  ok(D.items.find(i => i.group === 'Горизонтали').value === 427 && D.items.find(i => i.group === 'Пашня').geom === 'area' && D.items.find(i => i.group === 'Надписи').rot === -30, 'DXF: горизонтальдың мәні 427, тұйық сызық — аудан, жазудың бұрышы');
  const sel = Object.fromEntries(G.map(g => [g.key, g.kind]));
  const R = toRecords(D.items, sel, makeTransform({ crs: 'local', anchor: { x: 0, y: 0, lat: 50.3, lon: 57.2 } }), mark.id);
  const { cleanFeature, PlansStore } = req('../main/plans.js');
  let okAll = true;
  for (const x of R.recs) { try { cleanFeature(x); } catch (e) { okAll = false; console.error(x.kind, e.message); } }
  ok(R.recs.length === 7 && R.skipped === 0 && okAll && R.recs.find(x => x.kind === 'height').value === 426.85, 'DXF → жазбалар: бәрі сервер тексерісінен өтеді');

  // CSV (тахеометр: № X Y H — X солтүстік, ондық үтір, «;»)
  const T = parseCsv('№;X;Y;H\n1;5574321,12;8500123,45;427,30\n2;5574331,12;8500133,45;427,80\n3;5574311,12;8500143,45;426,95\n');
  const C = guessColumns(T);
  ok(T.hasHeader && T.rows.length === 3 && C.n === 1 && C.e === 2 && C.h === 3 && C.name === 0, 'CSV: тақырып, бағандар — X солтүстік, Y шығыс (геодезиялық)');
  const CI = csvItems(T, C).items;
  ok(CI.length === 3 && CI[0].xy[0] === 8500123.45 && CI[0].xy[1] === 5574321.12 && CI[0].xy[2] === 427.3 && CI[0].name === '1', 'CSV → нүктелер (ондық үтір)');
  const T2 = parseCsv('101 1000.000 2000.000 427.1\n102 1010.000 2000.000 427.4\n103 1005.000 2010.000 428.0');
  const C2 = guessColumns(T2);
  ok(!T2.hasHeader && C2.name === 0 && C2.n === 1 && C2.e === 2 && C2.h === 3, 'TXT (бос орынмен, тақырыпсыз): № X Y H');
  ok(parseGeojson('{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"427","elev":427},"geometry":{"type":"LineString","coordinates":[[57.2,50.3],[57.21,50.3]]}}]}').items[0].value === 427, 'GeoJSON: сызықтың биіктігі қасиеттен');

  // Нүктелерден горизонтальдар: конус (төбесі 420 м, 10 м-де 1 м төмендейді) — 417 м горизонталь ≈ 30 м радиуста
  const cone = [];
  for (let x = -50; x <= 50; x += 5) for (let y = -50; y <= 50; y += 5) cone.push([x, y, 420 - Math.hypot(x, y) / 10]);
  const CT = contours(cone, { step: 1 });
  const c417 = CT.lines.filter(l => l.value === 417), rr = c417.flatMap(l => l.pts.map(p => Math.hypot(p[0], p[1])));
  ok(c417.length === 1 && c417[0].closed && Math.min(...rr) > 29 && Math.max(...rr) < 31, 'TIN: 417 м горизонталь тұйық, радиусы ≈ 30 м (' + Math.min(...rr).toFixed(2) + '–' + Math.max(...rr).toFixed(2) + ')');
  ok(CT.lines.every(l => Number.isInteger(l.value)) && !CT.lines.some(l => l.value === 420), 'TIN: деңгейлер қима бойынша, төбедегі нүктеден жоғары горизонталь жоқ');
  ok(delaunay([[0, 0], [1, 0], [0, 1], [1, 1]]).length === 2, 'Делоне: шаршы → 2 үшбұрыш');
  ok(contours(cone.concat([[500, 500, 400]]), { step: 1 }).lines.every(l => l.pts.every(p => p[0] < 60 && p[1] < 60)), 'TIN: алыс жалғыз нүктеге ұзын үшбұрыштар салынбайды (қабырға шегі)');

  // Топтап импорт және бірнеше белгіні өшіру (main/plans.js)
  const mem = () => { let a = []; return { load: () => JSON.parse(JSON.stringify(a)), write: x => { a = JSON.parse(JSON.stringify(x)); } }; };
  const S = new PlansStore(mem(), mem(), mem());
  const r1 = S.importFeatures(JSON.stringify(R.recs.concat([{ mark_id: mark.id, kind: 'height', lat: 50, lon: 57 }])));
  ok(r1.added === 7 && r1.skipped === 1 && /Биіктік/.test(r1.error) && S.features().every(f => f.src === 'import'), 'fimport: 7 қосылды, мәні жоқ биіктік өткізілді, src = import');
  const ids = S.features().slice(0, 3).map(f => f.id);
  S.removeFeature(ids.join(','));
  ok(S.features().length === 4 && !S.features().some(f => ids.includes(f.id)), 'fdelete: бірнеше id үтір арқылы');
}

console.log('\n' + (n - fails) + '/' + n + ' өтті');
if (fails) process.exit(1);
