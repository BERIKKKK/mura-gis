/* «Жоспар» есептерінің тесті (DOM-сыз): геодезиялық кері есеп, метрлік жазықтық, масштаб, бет үлгісі.
   Техникалық тапсырманың қабылдау сынақтарындағы сандар: 30 м → 1:500-де 60 мм, Ø 18 м → 1:200-де 90 мм,
   №1 қорғанның белгісі (1 | 0,7 / 13), дәл солтүстіктегі елді мекенге жебе жоғары қарайды, 22,6 км жазуы.
   Іске қосу: node scripts/test-plan.mjs */
import { SCALES, plane, inverse, fmtDist, fmtNum, fmtMeasure, parseNum, scaleBarStep, toMm, selfIntersects, cmpNum } from '../src/plan/geo.js';
import { renderPage, autoScale, fitsAt, objTitle } from '../src/plan/sheet.js';

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

console.log('\n' + (n - fails) + '/' + n + ' өтті');
if (fails) process.exit(1);
