/* «Жоспар»: бет үлгісі — «Салтақ-III қорымы» жоспарының орналасуы (әдепкі A4 тік, жіңішке рамка; қағаз өлшемі — A5…A0, бағдары, өз өлшемі).
   Жоғарғы сол жақта — солтүстік көрсеткісі, жоғарғы оң жақта — ескерткіштің атауы, облыс, аудан және «Ескерткіш жоспары»,
   ортада — сызба аймағы, төменгі оң жақта — сызықтық масштаб. Алдын ала қарау мен PDF бір SVG-ді пайдаланады:
   өлшем бірлігі — миллиметр (A4-те viewBox 0 0 210 297), сондықтан PDF-те 1 бірлік = 1 мм (масштаб сақталады).
   Контурлар, өлшем сызықтары, белгішелер — вектор, жазулар — мәтін (PDF-те ізделеді).
   2-кезең (қорым, docs/PLAN-STAGE2.md): нысан түрлері мен материалдары, шартты белгілер блогы және экспликация кестесі —
   жоспарда қорғаннан басқа түр не материал болса ғана шығады; тек қорғандары бар жоспар 1-кезеңдегідей қалады.
   DOM-сыз модуль: scripts/test-plan.mjs тексереді. */
import { plane, contourXY, hasContour, toMm, SCALES, scaleBarStep, fmtNum, fmtMeasure, fmtDist, inverse, dist2, cmpNum } from './geo.js';

/* ======================= Қағаз өлшемі ======================= */
/** Стандарт пішімдер (ISO 216, мм, тік бағдарда); «custom» — пайдаланушы енгізген ені мен биіктігі. */
export const PAPERS = [
  { v: 'A5', w: 148, h: 210 }, { v: 'A4', w: 210, h: 297 }, { v: 'A3', w: 297, h: 420 },
  { v: 'A2', w: 420, h: 594 }, { v: 'A1', w: 594, h: 841 }, { v: 'A0', w: 841, h: 1189 },
];
export const PAPER_LIMITS = { min: 100, max: 3000 };
/** Жоспардың қағаз баптауы → бет өлшемі { w, h, name } (мм); әдепкі — A4 тік (1-кезеңдегідей). */
export function paperSize(paper) {
  const pp = paper && typeof paper === 'object' ? paper : {};
  let w, h, name;
  if (pp.size === 'custom' && pp.w >= PAPER_LIMITS.min && pp.w <= PAPER_LIMITS.max && pp.h >= PAPER_LIMITS.min && pp.h <= PAPER_LIMITS.max) {
    w = +pp.w; h = +pp.h; name = Math.round(w) + '×' + Math.round(h);
  } else {
    const st = PAPERS.find(x => x.v === pp.size) || PAPERS[1];
    [w, h] = pp.orient === 'landscape' ? [st.h, st.w] : [st.w, st.h];
    name = st.v;
  }
  return { w, h, name };
}
/* Беттің геометриясы ағымдағы қағаз өлшемінен есептеледі (renderPage / fitsAt / autoScale басында setPaper):
   рамка шеттен 7 мм, жоғарғы 50 мм — солтүстік көрсеткісі мен тақырып, төменгі ≈ 25 мм — масштаб сызығы. */
export let PAGE = { w: 210, h: 297 };
const FRAME = 7;                                        // рамканың шеттен қашықтығы, мм
export let AREA = { x0: 14, y0: 50, x1: 196, y1: 266 };     // сызба аймағы, мм (экспликациясыз)
let ZONE_BOTTOM = 272;                                  // экспликация аймағының төменгі шегі (масштаб сызығынан жоғары)
let EXPL_X = 98;                                        // жоспар бетіндегі экспликацияның сол жақ шегі
function setPaper(paper) {
  const z = paperSize(paper);
  PAGE = { w: z.w, h: z.h, name: z.name };
  AREA = { x0: 14, y0: 50, x1: z.w - 14, y1: z.h - 31 };
  ZONE_BOTTOM = z.h - 25;
  EXPL_X = Math.round(z.w / 2 - 7);
}
const COL = { fill: '#9c4f1c', line: '#111', blue: '#1f5f99', blue2: '#4d8fcf', soft: '#555' };
const FONT = "Arial, 'Segoe UI', 'Liberation Sans', sans-serif";
const FS = { num: 3.6, frac: 3.2, title: 4.6, text: 3.6, dim: 3.4, small: 3.0 };

/* ======================= Анықтамалықтар (main/plans.js кодтарымен бірдей) ======================= */
/** Нысан түрлері: интерфейстегі реті — ТЗ-дағы түрлер, қосылғандары, «Басқа нысан» соңында. */
export const KINDS = [
  { v: 'kurgan', kk: 'Қорған', ru: 'Курган' },
  { v: 'kesene', kk: 'Кесене', ru: 'Мавзолей' },
  { v: 'sagana', kk: 'Сағана там', ru: 'Саганатам' },
  { v: 'korshau', kk: 'Қоршау', ru: 'Ограда' },
  { v: 'kulpytas', kk: 'Құлпытас', ru: 'Кулпытас' },
  { v: 'koitas', kk: 'Қойтас', ru: 'Койтас' },
  { v: 'sandyktas', kk: 'Сандықтас', ru: 'Сандыктас' },
  { v: 'ushtas', kk: 'Үштас', ru: 'Уштас' },
  { v: 'bestas', kk: 'Бестас', ru: 'Бестас' },
  { v: 'other', kk: 'Басқа нысан', ru: 'Иной объект' },
];
export const MATERIALS = [
  { v: 'brick_fired', kk: 'Күйдірілген кірпіш', ru: 'Жжёный кирпич', kkS: 'Күйдір. кірпіш', ruS: 'Жжён. кирпич' },
  { v: 'brick_raw', kk: 'Шикі кірпіш', ru: 'Сырцовый кирпич', kkS: 'Шикі кірпіш', ruS: 'Сырц. кирпич' },
  { v: 'stone', kk: 'Табиғи тас', ru: 'Природный камень', kkS: 'Табиғи тас', ruS: 'Прир. камень' },
];
/** Құлпытастың типі (С. Е. Ажигали). */
export const SUBTYPES = [
  { v: 'block', kk: 'аз өңделген блок', ru: 'слабообработанный блок' },
  { v: 'classic', kk: 'классикалық', ru: 'классический' },
  { v: 'fert', kk: 'стелоферт', ru: 'стелоферт' },
  { v: 'anthropo', kk: 'антропоморфты', ru: 'антропоморфный' },
  { v: 'unique', kk: 'бірегей', ru: 'уникум' },
];
/** Техникалық жай-күйі (паспорттың 9-тармағы). */
export const STATES = [
  { v: 'good', kk: 'жақсы', ru: 'хорошее' },
  { v: 'fair', kk: 'қанағаттанарлық', ru: 'удовлетворительное' },
  { v: 'poor', kk: 'қанағаттанарлықсыз', ru: 'неудовлетворительное' },
  { v: 'emergency', kk: 'авариялық', ru: 'аварийное' },
];
const label = (list, v, lang, short) => { const x = list.find(k => k.v === v); return x ? (short && x[lang + 'S']) || x[lang] : ''; };
export const kindLabel = (v, lang) => label(KINDS, v, lang) || label(KINDS, 'other', lang);
export const materialLabel = (v, lang, short) => label(MATERIALS, v, lang, short);
export const subtypeLabel = (v, lang) => label(SUBTYPES, v, lang);
export const stateLabel = (v, lang) => label(STATES, v, lang);
/** 2-кезеңнің түрі (қорған мен «басқадан» өзге) не материалы бар ма — шартты белгілер мен экспликация шығады. */
export const isStage2 = objs => objs.some(o => (o.kind && o.kind !== 'kurgan' && o.kind !== 'other') || o.material);

export const TXT = {
  kk: { plan: 'Ескерткіш жоспары', detail: 'жеке жоспар', north: 'С', m: 'м', height: 'Биіктігі', scale: 'Масштаб',
    legend: 'Шартты белгілер', legKinds: 'Нысан түрлері', legMats: 'Материалдар', noMat: 'материалы белгісіз', expl: 'Экспликация', cont: 'Экспликация (жалғасы)',
    next: 'Жалғасы келесі бетте', page: '-бет', head: { num: '№', kind: 'Түрі', material: 'Материалы', size: 'Өлшемі, м', state: 'Жай-күйі', note: 'Ескертпе' } },
  ru: { plan: 'План памятника', detail: 'индивидуальный план', north: 'С', m: 'м', height: 'Высота', scale: 'Масштаб',
    legend: 'Условные обозначения', legKinds: 'Типы объектов', legMats: 'Материалы', noMat: 'материал неизвестен', expl: 'Экспликация', cont: 'Экспликация (продолжение)',
    next: 'Продолжение на следующем листе', page: '-й лист', head: { num: '№', kind: 'Тип', material: 'Материал', size: 'Размеры, м', state: 'Состояние', note: 'Примечание' } },
};
/** Нысанның атауы құжатта: «№1 қорған» / «Курган №1». */
export function objTitle(o, lang) {
  const k = kindLabel(o.kind, lang);
  return lang === 'ru' ? k + ' №' + o.num : '№' + o.num + ' ' + k.toLocaleLowerCase('kk');
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n2 = v => Math.round(v * 1000) / 1000;
/** Мәтіннің шамамен ені (мм): Arial-дың орташа таңба ені ≈ 0,56 × өлшем. */
const textW = (s, size) => [...String(s)].length * size * 0.56;
const DEG = Math.PI / 180;

function text(x, y, s, size, o = {}) {
  return '<text x="' + n2(x) + '" y="' + n2(y) + '" font-size="' + size + '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') +
    (o.weight ? ' font-weight="' + o.weight + '"' : '') + (o.fill ? ' fill="' + o.fill + '"' : '') + (o.italic ? ' font-style="italic"' : '') +
    (o.halo ? ' stroke="#fff" stroke-width="0.9" stroke-linejoin="round" paint-order="stroke"' : '') +
    (o.rot ? ' transform="rotate(' + n2(o.rot) + ' ' + n2(x) + ' ' + n2(y) + ')"' : '') + '>' + esc(s) + '</text>';
}
const poly = (pts, attrs) => '<polygon points="' + pts.map(p => n2(p[0]) + ',' + n2(p[1])).join(' ') + '" ' + attrs + '/>';
const line = (a, b, attrs) => '<line x1="' + n2(a[0]) + '" y1="' + n2(a[1]) + '" x2="' + n2(b[0]) + '" y2="' + n2(b[1]) + '" ' + attrs + '/>';
const rectE = (x, y, w, h, attrs) => '<rect x="' + n2(x) + '" y="' + n2(y) + '" width="' + n2(w) + '" height="' + n2(h) + '" ' + attrs + '/>';
const bboxOf = pts => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1]; }
  return { x0, y0, x1, y1 };
};
const union = (a, b) => (a ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : { ...b });
/** Бет бағыты: азимут (°) → бірлік вектор (жоғары — солтүстік). */
const dirOf = az => [Math.sin(az * DEG), -Math.cos(az * DEG)];

/* ======================= Белгілер мен штрихтар (2-кезең) ======================= */
/* Материалдар: ГОСТ 2.306-68 п. 2 бойынша қосымша белгілер — «Шартты белгілер» блогында түсіндіріледі.
   PDF-ке бірнеше SVG бір HTML-де түседі: id-лер бірдей, анықтамалары да бірдей — қайшылық жоқ. */
const DEFS = '<defs>' +
  '<pattern id="pj-m-brick_fired" patternUnits="userSpaceOnUse" width="1.2" height="1.2" patternTransform="rotate(45)"><rect width="1.2" height="1.2" fill="#fff"/><line x1="0" y1="0" x2="0" y2="1.2" stroke="#111" stroke-width="0.2"/></pattern>' +
  '<pattern id="pj-m-brick_raw" patternUnits="userSpaceOnUse" width="2.4" height="2.4" patternTransform="rotate(45)"><rect width="2.4" height="2.4" fill="#fff"/><line x1="0" y1="0" x2="0" y2="2.4" stroke="#111" stroke-width="0.2" stroke-dasharray="0.9 0.6"/></pattern>' +
  '<pattern id="pj-m-stone" patternUnits="userSpaceOnUse" width="1.6" height="1.6"><rect width="1.6" height="1.6" fill="#fff"/><path d="M0 0L1.6 1.6M1.6 0L0 1.6" stroke="#111" stroke-width="0.16"/></pattern>' +
  '</defs>';
/** Контурсыз нысанның белгісі (≈ 4 мм, орталығы x, y). */
export function glyph(kind, x, y) {
  const t = (dx, dy) => [x + dx, y + dy];
  const R = (dx, dy, w, h, attrs) => rectE(x + dx, y + dy, w, h, attrs);
  const S = 'stroke="#111"';
  switch (kind) {
    case 'kulpytas': return '<path d="M' + n2(x - 0.8) + ' ' + n2(y + 1.8) + 'V' + n2(y - 1) + 'A0.8 0.8 0 0 1 ' + n2(x + 0.8) + ' ' + n2(y - 1) + 'V' + n2(y + 1.8) + 'Z" fill="#111"/>';
    case 'koitas': return R(-1.9, -0.75, 3.8, 1.5, 'rx="0.75" fill="#fff" ' + S + ' stroke-width="0.3"');
    case 'kesene': return R(-1.8, -1.8, 3.6, 3.6, 'fill="#fff" ' + S + ' stroke-width="0.4"') + '<circle cx="' + n2(x) + '" cy="' + n2(y) + '" r="1.1" fill="none" ' + S + ' stroke-width="0.25"/>';
    case 'sagana': return R(-1.9, -1.3, 3.8, 2.6, 'fill="#fff" ' + S + ' stroke-width="0.25"') + R(-1.3, -0.7, 2.6, 1.4, 'fill="none" ' + S + ' stroke-width="0.25"');
    case 'korshau': return R(-1.9, -1.3, 3.8, 2.6, 'fill="none" ' + S + ' stroke-width="0.3" stroke-dasharray="0.7 0.45"');
    case 'sandyktas': return R(-1.9, -1, 3.8, 2, 'fill="#fff" ' + S + ' stroke-width="0.3"') + line(t(-1.9, 0), t(1.9, 0), S + ' stroke-width="0.25"');
    case 'ushtas': return [-1.35, 0, 1.35].map(dx => R(dx - 0.35, -1, 0.7, 2, 'rx="0.3" fill="#111"')).join('');
    case 'bestas': return [-1.68, -0.84, 0, 0.84, 1.68].map(dx => R(dx - 0.27, -0.9, 0.55, 1.8, 'rx="0.25" fill="#111"')).join('');
    case 'kurgan': return '<circle cx="' + n2(x) + '" cy="' + n2(y) + '" r="1.6" fill="' + COL.fill + '" ' + S + ' stroke-width="0.25"/>';
    case 'other': return '<circle cx="' + n2(x) + '" cy="' + n2(y) + '" r="1.3" fill="#fff" ' + S + ' stroke-width="0.3"/>';
    default: return '<circle cx="' + n2(x) + '" cy="' + n2(y) + '" r="0.9" fill="#111"/>';
  }
}
/** Контурдың толтыруы: материал — штрих; материалсыз қорған — 1-кезеңнің қоңыр түсі; қоршау — толтырусыз (ішіндегілері көрінеді). */
const fillOf = (o, stage2) => (o.kind === 'korshau' ? 'none' : o.material ? 'url(#pj-m-' + o.material + ')' : (!o.kind || o.kind === 'kurgan') ? COL.fill : stage2 ? '#fff' : COL.fill);
/** Контурдың жиегі түріне қарай: кесене — жуан, сағанатам — қос сызық, қоршау — үзік сызық. */
function contourSvg(pts, o, stage2, attrs = '') {
  const f = fillOf(o, stage2);
  if (o.kind === 'sagana') {
    // Қос сызық: қара жуан сызықтың үстінен жіңішке ақ сызық
    return poly(pts, 'fill="' + f + '" stroke="#111" stroke-width="1.05"' + attrs) + poly(pts, 'fill="none" stroke="#fff" stroke-width="0.45"');
  }
  const w = o.kind === 'kesene' ? 0.5 : o.kind === 'korshau' ? 0.35 : 0.25;
  return poly(pts, 'fill="' + f + '" stroke="#111" stroke-width="' + w + '"' + (o.kind === 'korshau' ? ' stroke-dasharray="1.4 0.9"' : '') + attrs);
}

/* ======================= Ортақ бөліктер ======================= */
function frame() {
  return '<rect x="' + FRAME + '" y="' + FRAME + '" width="' + (PAGE.w - 2 * FRAME) + '" height="' + (PAGE.h - 2 * FRAME) + '" fill="none" stroke="' + COL.line + '" stroke-width="0.35"/>';
}
/** Солтүстік көрсеткісі: жоғарғы сол жақта, «С» әрпі және N белгісі бар найза. */
function north(lang) {
  const x = 24, top = 21, bot = 47, mid = 37;
  return '<g class="pj-north">' + text(x, 18, TXT[lang].north, 5, { anchor: 'middle' }) +
    poly([[x, top], [x, bot], [x - 2.6, mid + 3]], 'fill="' + COL.blue + '"') +
    poly([[x, top], [x, bot], [x + 2.6, mid + 3]], 'fill="' + COL.blue2 + '"') +
    '<circle cx="' + x + '" cy="' + mid + '" r="3.9" fill="none" stroke="' + COL.blue + '" stroke-width="0.4"/>' +
    line([x - 5.5, mid], [x + 5.5, mid], 'stroke="' + COL.blue + '" stroke-width="0.3"') +
    text(x, mid + 1.45, 'N', 4, { anchor: 'middle', weight: 'bold', fill: '#fff' }) + '</g>';
}
/** Тақырып: жоғарғы оң жақта, әр мәлімет жеке жолда (сол жақтан тураланған блок, оң жақ шегі — рамкадан 10 мм). */
function titleBlock(lines) {
  const ls = lines.filter(Boolean);
  const w = Math.max(...ls.map(s => textW(s, FS.title)));
  const x = Math.max(70, PAGE.w - FRAME - 6 - w);
  return '<g class="pj-title">' + ls.map((s, i) => text(x, 20 + i * 6, s, FS.title)).join('') + '</g>';
}
/** Сызықтық масштаб: төменгі оң жақта, 5 бөлік, жазулар 0, s, 3s, 5s (үлгідегідей «0 10 30 50 м»). */
function scaleBar(scale, lang, withNumeric) {
  const s = scaleBarStep(scale), seg = toMm(s, scale), L = 5 * seg;
  const xr = PAGE.w - FRAME - 13, x0 = xr - L, y = PAGE.h - 15;
  let g = '<g class="pj-scalebar">';
  g += '<rect x="' + n2(x0) + '" y="' + y + '" width="' + n2(L) + '" height="1.3" fill="#fff" stroke="' + COL.line + '" stroke-width="0.25"/>';
  for (let i = 0; i < 5; i += 2) g += '<rect x="' + n2(x0 + i * seg) + '" y="' + y + '" width="' + n2(seg) + '" height="1.3" fill="' + COL.line + '"/>';
  for (const k of [0, 1, 3, 5]) g += text(x0 + k * seg, y - 1.6, fmtNum(k * s), FS.small, { anchor: 'middle' });
  g += text(xr + 2.2, y - 1.6, TXT[lang].m, FS.small);
  if (withNumeric) g += text(x0 - 4, y + 1.2, TXT[lang].scale + ' 1:' + scale, FS.small, { anchor: 'end' });
  return g + '</g>';
}

/* ======================= Экспликация баптаулары ======================= */
const EXPL_DEF = { cols: [{ key: 'material', show: true, width: 0 }, { key: 'size', show: true, width: 0 }, { key: 'state', show: false, width: 0 }, { key: 'note', show: true, width: 0 }],
  row_h: 0, font: 2.8, short: false, subtype: true, place: 'sheet', zone_h: 70 };
/** Жоспардың экспликация баптаулары (жоқ не толық емес болса — әдепкімен толықтырылады; main/plans.js cleanExpl-пен бірдей). */
export function explOf(plan) {
  const e = plan && plan.expl && typeof plan.expl === 'object' ? plan.expl : {};
  const cols = Array.isArray(e.cols) && e.cols.length ? e.cols.filter(c => EXPL_DEF.cols.some(d => d.key === c.key)) : [];
  for (const d of EXPL_DEF.cols) if (!cols.some(c => c.key === d.key)) cols.push({ ...d });
  return { ...EXPL_DEF, ...e, cols };
}
/** Жалпы жоспар бетіндегі сызба аймағы: экспликация не шартты белгілер болса — төменгі бөлігі соларға беріледі. */
function areaFor(ctx) {
  if (!isStage2(ctx.objects)) return { ...AREA, zone: 0 };
  const e = explOf(ctx.plan);
  const zh = e.place === 'separate' ? legendHeight(ctx) : Math.max(e.zone_h, legendHeight(ctx));
  const zt = ZONE_BOTTOM - zh;
  return { ...AREA, y1: zt - 4, zone: zh, zt };
}

/* ======================= Жалпы жоспар ======================= */
/** Бөлшек белгі мәтіндері: биіктігі үстінде, диаметрі (эллипсте — осьтері) астында. */
export function fraction(o) {
  const top = fmtMeasure(o.height);
  const bot = (o.shape === 'ellipse' || o.shape === 'rect') && o.ax_a > 0 ? fmtNum(o.ax_a) + ' × ' + fmtNum(o.ax_b) : fmtMeasure(o.diam);
  return { top, bot };
}
/** Белгі: қорғанда — нөмір мен бөлшек (биіктігі / диаметрі); қорымның басқа нысандарында — тек нөмір (өлшемдері экспликацияда). */
function labelBox(o, x, y) {
  const fr = fraction(o);
  const kurgan = !o.kind || o.kind === 'kurgan' || o.kind === 'other';
  const onlyNum = !kurgan || (!hasContour(o) && fr.top === '—' && fr.bot === '—');
  const nw = textW(o.num, FS.num), fw = onlyNum ? 0 : Math.max(textW(fr.top, FS.frac), textW(fr.bot, FS.frac), 2.5);
  return { x, y, nw, fw, fr, onlyNum, w: nw + (onlyNum ? 0 : 0.8 + fw), h: 8.6 };
}
function labelSvg(b) {
  let s = text(b.x, b.y + 1.25, b.num, FS.num, b.halo ? { halo: true } : {});
  if (!b.onlyNum) {
    const fx = b.x + b.nw + 0.8, cx = fx + b.fw / 2;
    s += text(cx, b.y - 0.9, b.fr.top, FS.frac, { anchor: 'middle' });
    s += line([fx, b.y], [fx + b.fw, b.y], 'stroke="' + COL.line + '" stroke-width="0.25"');
    s += text(cx, b.y + 3.6, b.fr.bot, FS.frac, { anchor: 'middle' });
  }
  return s;
}

/**
 * Жалпы жоспардың орналасуы берілген масштабта: нысандар мм-де, белгілер, сыю.
 * ctx: { mark, objects, plan, lang, names: { title[], ptr } } — names — құжат тіліндегі атаулар (шақырушы береді).
 */
function layoutGeneral(ctx, scale, area = areaFor(ctx)) {
  const objs = ctx.objects.slice().sort(cmpNum);
  const stage2 = isStage2(objs);
  const ref = objs.length ? [objs.reduce((s, o) => s + +o.lat, 0) / objs.length, objs.reduce((s, o) => s + +o.lon, 0) / objs.length] : [+ctx.mark.lat, +ctx.mark.lon];
  const P = plane(ref[0], ref[1]);
  const mm = xy => [toMm(xy[0], scale), -toMm(xy[1], scale)];
  const items = objs.map(o => {
    const c = mm(P.fwd(+o.lat, +o.lon));
    const ring = hasContour(o) ? contourXY(o, P).map(mm) : null;
    const g = stage2 && !ring ? 2 : 0.8;          // контурсыз нысанның белгісі (2-кезеңде ≈ 4 мм)
    const bb = ring ? bboxOf(ring) : { x0: c[0] - g, y0: c[1] - g, x1: c[0] + g, y1: c[1] + g };
    const off = Array.isArray(o.lbl) ? o.lbl : [0, 0];
    const lb = labelBox(o, bb.x1 + 1.5 + off[0], (bb.y0 + bb.y1) / 2 + 2 + off[1]);
    lb.num = o.num;
    return { o, c, ring, bb, lb };
  });
  let u = null;
  for (const it of items) {
    u = union(u, it.bb);
    u = union(u, { x0: it.lb.x, y0: it.lb.y - 4.4, x1: it.lb.x + it.lb.w, y1: it.lb.y + 4.4 });
  }
  if (!u) u = { x0: -1, y0: -1, x1: 1, y1: 1 };
  const aw = area.x1 - area.x0 - 4, ah = area.y1 - area.y0 - 4;
  const fits = u.x1 - u.x0 <= aw && u.y1 - u.y0 <= ah;
  const sx = (area.x0 + area.x1) / 2 - (u.x0 + u.x1) / 2, sy = (area.y0 + area.y1) / 2 - (u.y0 + u.y1) / 2;
  return { P, items, fits, shift: [sx, sy], mm, size: [u.x1 - u.x0, u.y1 - u.y0], area, stage2 };
}

/** Елді мекенге бағыттауыштың мәндері: азимут пен қашықтық — қолмен түзетілгені, болмаса есептелгені. */
export function pointerValues(ctx) {
  const pl = ctx.plan;
  if (!pl || !pl.ptr) return null;
  const from = pl.ptr_from ? ctx.objects.find(o => o.id === pl.ptr_from) : null;
  const o = from ? { lat: +from.lat, lon: +from.lon } : { lat: +ctx.mark.lat, lon: +ctx.mark.lon };
  const auto = inverse(o.lat, o.lon, +pl.ptr.lat, +pl.ptr.lon);
  const az = pl.ptr_az_man ?? auto.az, dist = pl.ptr_dist_man ?? auto.dist;
  return { from, origin: o, auto, az, dist, azMan: pl.ptr_az_man != null, distMan: pl.ptr_dist_man != null };
}

function arrowSvg(ctx, L, editor) {
  const v = pointerValues(ctx);
  if (!v) return { svg: '', mid: null, tip: null, warn: '' };
  const A = L.area;
  const [sx, sy] = L.shift;
  const d = dirOf(v.az);
  const it = v.from ? L.items.find(i => i.o.id === v.from.id) : null;
  const c0 = it ? it.c : L.mm(L.P.fwd(v.origin.lat, v.origin.lon));
  const c = [c0[0] + sx, c0[1] + sy];
  let r = 0;
  if (it && it.ring) for (const p of it.ring) r = Math.max(r, (p[0] - c0[0]) * d[0] + (p[1] - c0[1]) * d[1]);
  let t0 = r + 2.5;
  // Бастапқы нысанның белгісі жебенің жолында тұрса — жебе белгіден кейін басталады
  if (it) {
    const b = { x0: it.lb.x - 0.8, x1: it.lb.x + it.lb.w + 0.8, y0: it.lb.y - 5, y1: it.lb.y + 5 };
    let lo = -Infinity, hi = Infinity;
    for (const [o, dd, a, z] of [[c0[0], d[0], b.x0, b.x1], [c0[1], d[1], b.y0, b.y1]]) {
      if (Math.abs(dd) < 1e-9) { if (o < a || o > z) { lo = Infinity; } continue; }
      const t1 = (a - o) / dd, t2 = (z - o) / dd;
      lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2));
    }
    if (lo <= hi && hi > 0) t0 = Math.max(t0, hi + 1.5);
  }
  const s = [c[0] + d[0] * t0, c[1] + d[1] * t0];
  // Сызба аймағының шетіне дейінгі бос орын — бағыттауыштың ұзындығы параққа бейімделеді
  const lim = t => { const p = [s[0] + d[0] * t, s[1] + d[1] * t]; return p[0] >= A.x0 + 2 && p[0] <= A.x1 - 2 && p[1] >= A.y0 + 2 && p[1] <= A.y1 - 2; };
  let space = 0;
  while (space < 60 && lim(space + 1)) space++;
  const len = Math.max(16, Math.min(55, space - 2));
  const e = [s[0] + d[0] * len, s[1] + d[1] * len];
  const nrm = [-d[1], d[0]];
  const head = [e, [e[0] - d[0] * 3.2 + nrm[0] * 1.1, e[1] - d[1] * 3.2 + nrm[1] * 1.1], [e[0] - d[0] * 3.2 - nrm[0] * 1.1, e[1] - d[1] * 3.2 - nrm[1] * 1.1]];
  let ang = Math.atan2(d[1], d[0]) / DEG;
  if (ang > 90 || ang < -90) ang += 180;           // жазу солдан оңға оқылады
  const m = [(s[0] + e[0]) / 2, (s[1] + e[1]) / 2];
  const up = [Math.sin(ang * DEG), -Math.cos(ang * DEG)];      // жазудың «үсті» (айналған жүйеде y теріс)
  const t1 = [m[0] + up[0] * 1.6, m[1] + up[1] * 1.6], t2 = [m[0] - up[0] * 4.6, m[1] - up[1] * 4.6];
  const svg = '<g class="pj-arrow"' + (editor ? ' data-arrow="1"' : '') + '>' +
    line(s, [e[0] - d[0] * 2.4, e[1] - d[1] * 2.4], 'stroke="' + COL.line + '" stroke-width="0.3"') + poly(head, 'fill="' + COL.line + '"') +
    text(t1[0], t1[1], ctx.names.ptr || '', FS.text, { anchor: 'middle', rot: ang }) +
    text(t2[0], t2[1], fmtDist(v.dist), FS.text, { anchor: 'middle', rot: ang }) + '</g>';
  return { svg, mid: m, tip: [e[0] + d[0] * 6, e[1] + d[1] * 6], warn: space < 18 ? 'arrow-space' : '' };
}

/* ======================= Шартты белгілер блогы ======================= */
/** Сызбада кездесетін түрлер мен материалдар (тек солар түсіндіріледі). */
function legendItems(ctx) {
  const objs = ctx.objects;
  const kinds = KINDS.filter(k => objs.some(o => (o.kind || 'kurgan') === k.v));
  const filled = objs.filter(o => hasContour(o) && o.kind !== 'korshau');
  const mats = MATERIALS.filter(m => filled.some(o => o.material === m.v));
  const noMat = filled.some(o => !o.material && o.kind && o.kind !== 'kurgan');
  return { kinds, mats, noMat };
}
function legendHeight(ctx) {
  const L = legendItems(ctx);
  return 13 + 5 * Math.max(L.kinds.length, L.mats.length + (L.noMat ? 1 : 0)) + 2;
}
function legendSvg(ctx, x, y) {
  const T = TXT[ctx.lang], L = legendItems(ctx);
  let s = '<g class="pj-legend">' + text(x, y + 5, T.legend, 3.8, { weight: 'bold' }) + '<g font-size="3">';
  s += text(x, y + 11, T.legKinds, 2.8, { fill: COL.soft });
  L.kinds.forEach((k, i) => { const yy = y + 15.5 + i * 5; s += glyph(k.v, x + 2, yy) + text(x + 6, yy + 1, k[ctx.lang].toLocaleLowerCase(ctx.lang === 'ru' ? 'ru' : 'kk'), 3); });
  const mx = x + 40;
  if (L.mats.length || L.noMat) s += text(mx, y + 11, T.legMats, 2.8, { fill: COL.soft });
  const rows = L.mats.map(m => ({ fill: 'url(#pj-m-' + m.v + ')', t: m[ctx.lang].toLocaleLowerCase(ctx.lang === 'ru' ? 'ru' : 'kk') }));
  if (L.noMat) rows.push({ fill: '#fff', t: T.noMat });
  rows.forEach((r, i) => { const yy = y + 13 + i * 5; s += rectE(mx, yy, 8, 4, 'fill="' + r.fill + '" stroke="#111" stroke-width="0.25"') + text(mx + 10, yy + 3, r.t, 3); });
  return s + '</g></g>';
}

/* ======================= Экспликация кестесі ======================= */
/** Өлшемі: шеңбер — «Ø 6», эллипс пен тіктөртбұрыш — «6,2 × 4», биіктігі бар болса — «; h 1,2»; өлшенбеген — «—». */
export function sizeText(o) {
  let s = '';
  if (o.shape === 'circle' && o.diam > 0) s = 'Ø ' + fmtNum(o.diam);
  else if ((o.shape === 'ellipse' || o.shape === 'rect') && o.ax_a > 0) s = fmtNum(o.ax_a) + ' × ' + fmtNum(o.ax_b);
  else if (o.diam > 0) s = 'Ø ' + fmtNum(o.diam);
  if (o.height != null) s += (s ? '; ' : '') + 'h ' + fmtNum(o.height);
  return s || '—';
}
const noteOf = (o, lang) => String((lang === 'ru' ? o.note_ru || o.note : o.note || o.note_ru) || '').trim();
/** Экспликацияның бір жолының мәндері (бағанның кілті бойынша). */
export function explRow(o, lang, e = EXPL_DEF) {
  const kind = kindLabel(o.kind || 'kurgan', lang) + (e.subtype && o.kind === 'kulpytas' && o.subtype ? ' (' + subtypeLabel(o.subtype, lang) + ')' : '');
  return { num: String(o.num), kind, material: materialLabel(o.material, lang, e.short) || '—', size: sizeText(o), state: stateLabel(o.state, lang) || '—', note: noteOf(o, lang).replace(/\s+/g, ' ') || '—' };
}
/** Бағандар мен ені (мм): «авто» бағандар қалған енді мазмұнының ұзындығына қарай бөледі (ең ұзын сөз бөлінбейтіндей); бәрі сыймаса — ескерту. */
function explColumns(e, width, data = [], lang = 'kk') {
  const W = { kind: 10, material: 10, size: 8, state: 10, note: 12 };
  for (const k of Object.keys(W)) {
    const vals = data.map(r => String(r[k] || '')).concat(TXT[lang].head[k]);
    const longest = Math.max(...vals.map(v => v.length)), word = Math.max(...vals.flatMap(v => v.split(' ').map(w => w.length)));
    W[k] = Math.max(word + 1, Math.min(longest, k === 'note' ? 40 : 24), 4);
  }
  const numW = width > 120 ? 10 : 7;
  const cols = [{ key: 'num', w: numW, fixed: true }, { key: 'kind', w: 0, fixed: false }].concat(e.cols.filter(c => c.show).map(c => ({ key: c.key, w: c.width || 0, fixed: !!c.width })));
  const kindCol = e.cols.find(c => c.key === 'kind');
  if (kindCol && kindCol.width) { cols[1].w = kindCol.width; cols[1].fixed = true; }
  let fixedSum = cols.filter(c => c.fixed).reduce((s, c) => s + c.w, 0);
  let warn = '';
  if (fixedSum > width) {           // қолмен берілген ендер беттен асады — сыйғанша кішірейеді
    warn = 'expl-width';
    const k = width / fixedSum;
    cols.forEach(c => { if (c.fixed) c.w *= k; });
    fixedSum = width;
  }
  const auto = cols.filter(c => !c.fixed), rest = Math.max(0, width - fixedSum), wsum = auto.reduce((s, c) => s + W[c.key], 0) || 1;
  auto.forEach(c => { c.w = rest * W[c.key] / wsum; });
  if (auto.some(c => c.w < 6)) warn = 'expl-width';
  return { cols, warn };
}
/** Мәтінді баған еніне қарай жолдарға бөлу (шамамен — Arial таңба ені). */
function wrapText(s, w, size) {
  const max = Math.max(1, Math.floor(w / (size * 0.56)));
  const out = [];
  let cur = '';
  for (const word of String(s).split(' ')) {
    if (!cur) cur = word;
    else if ((cur + ' ' + word).length <= max) cur += ' ' + word;
    else { out.push(cur); cur = word; }
    while (cur.length > max) { out.push(cur.slice(0, max)); cur = cur.slice(max); }
  }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}
/** Кесте жолдары өлшемдерімен: { cells: [[жолдар]…], h }. */
function explRows(ctx, e, cols) {
  const fs = e.font, lh = fs * 1.3;
  return ctx.objects.slice().sort(cmpNum).map(o => {
    const r = explRow(o, ctx.lang, e);
    let cells = cols.map(c => wrapText(r[c.key], c.w - 2, fs));
    let h = Math.max(5, ...cells.map(l => l.length * lh + 1.6));
    if (e.row_h) {                   // қолмен берілген биіктік: сыймаған жолдар «…» болып қысқарады
      h = Math.max(e.row_h, fs * 1.5);
      const n = Math.max(1, Math.floor((h - 1.6) / lh));
      cells = cells.map(l => (l.length > n ? l.slice(0, n - 1).concat(l[n - 1].replace(/.?$/, '…')) : l));
    }
    return { cells, h };
  });
}
/** Кестенің бір бөлігі (x, y — жоғарғы сол бұрышы); қайтарады — svg және биіктігі. */
function tableSvg(ctx, e, cols, rows, x, y) {
  const T = TXT[ctx.lang], fs = e.font, lh = fs * 1.3, hh = Math.max(6, fs * 2.1);
  const width = cols.reduce((s, c) => s + c.w, 0);
  const total = hh + rows.reduce((s, r) => s + r.h, 0);
  let s = '<g class="pj-expl" font-size="' + fs + '">' + rectE(x, y, width, total, 'fill="none" stroke="#111" stroke-width="0.2"') +
    line([x, y + hh], [x + width, y + hh], 'stroke="#111" stroke-width="0.2"');
  let cx = x;
  cols.forEach((c, i) => {
    if (i) s += line([cx, y], [cx, y + total], 'stroke="#111" stroke-width="0.2"');
    s += c.key === 'num' ? text(cx + c.w / 2, y + hh / 2 + fs * 0.35, T.head.num, fs, { anchor: 'middle', weight: 'bold' })
      : wrapText(T.head[c.key], c.w - 2, fs).slice(0, 2).map((t, k, a) => text(cx + 1, y + hh / 2 + fs * 0.35 + (k - (a.length - 1) / 2) * lh, t, fs, { weight: 'bold' })).join('');
    cx += c.w;
  });
  let ry = y + hh;
  for (const r of rows) {
    cx = x;
    r.cells.forEach((lines, i) => {
      const c = cols[i];
      lines.forEach((t, k) => { s += c.key === 'num' ? text(cx + c.w / 2, ry + 0.8 + fs + k * lh, t, fs, { anchor: 'middle' }) : text(cx + 1, ry + 0.8 + fs + k * lh, t, fs); });
      cx += c.w;
    });
    ry += r.h;
    s += line([x, ry], [x + width, ry], 'stroke="#111" stroke-width="0.1"');
  }
  return { svg: s + '</g>', h: total, hh };
}
/** Жолдарды беттерге бөлу: бірінші бөлік — бос орны `first` мм, қалғандары — `next` мм (тақырып жолымен). */
function paginate(rows, hh, first, next) {
  const parts = [];
  let cur = [], room = first - hh;
  for (const r of rows) {
    if (r.h > room && (cur.length || room < next - hh)) { parts.push(cur); cur = []; room = next - hh; }
    cur.push(r); room -= r.h;
  }
  parts.push(cur);
  return parts;
}

/** Жалпы жоспардың беті және экспликацияның жалғасы беттері. */
function renderGeneral(ctx, scale, editor) {
  const L = layoutGeneral(ctx, scale);
  const [sx, sy] = L.shift;
  const tr = p => [p[0] + sx, p[1] + sy];
  const dataObj = o => (editor ? ' data-obj="' + esc(o.id) + '"' : '');
  let body = '';
  // Қоршаулар астында (ішіндегі нысандар үстінен көрінеді), содан кейін қалған контурлар, соңында белгілер
  const order = L.items.slice().sort((a, b) => (a.o.kind === 'korshau' ? 0 : 1) - (b.o.kind === 'korshau' ? 0 : 1));
  for (const it of order) {
    if (it.ring) body += contourSvg(it.ring.map(tr), it.o, L.stage2, dataObj(it.o));
    else if (L.stage2) body += '<g' + dataObj(it.o) + '>' + glyph(it.o.kind || 'kurgan', it.c[0] + sx, it.c[1] + sy) + '</g>';
    else body += '<circle cx="' + n2(it.c[0] + sx) + '" cy="' + n2(it.c[1] + sy) + '" r="0.9" fill="' + COL.line + '"' + dataObj(it.o) + '/>';
  }
  for (const it of L.items) {
    const off = Array.isArray(it.o.lbl) ? it.o.lbl : [0, 0];
    // Белгінің өз орны (ығысусыз) + transform: алдын ала қарауда сүйреп жылжыту осы transform-ды өзгертеді
    const b = { ...it.lb, x: it.lb.x - off[0] + sx, y: it.lb.y - off[1] + sy, halo: L.stage2 };
    body += '<g class="pj-lbl"' + (editor ? ' data-drag="lbl:' + esc(it.o.id) + '"' : '') + ' transform="translate(' + n2(off[0]) + ' ' + n2(off[1]) + ')">' + labelSvg(b) + '</g>';
  }
  const ar = arrowSvg(ctx, L, editor);
  let zone = '', more = [], warn = '';
  if (L.stage2) {
    // Төменгі аймақ: сол жақта — шартты белгілер, оң жақта — экспликацияның басы (не бәрі бөлек беттерде)
    const e = explOf(ctx.plan), A = L.area, T = TXT[ctx.lang];
    zone += line([AREA.x0, A.zt], [AREA.x1, A.zt], 'stroke="#111" stroke-width="0.2"') + legendSvg(ctx, AREA.x0, A.zt + 1);
    const data = ctx.objects.map(o => explRow(o, ctx.lang, e));
    const half = explColumns(e, AREA.x1 - EXPL_X, data, ctx.lang), full = explColumns(e, AREA.x1 - AREA.x0, data, ctx.lang);
    warn = half.warn || full.warn;
    const rowsHalf = explRows(ctx, e, half.cols), rowsFull = explRows(ctx, e, full.cols);
    const hh = Math.max(6, e.font * 2.1);
    const contTop = 42, contRoom = ZONE_BOTTOM + 8 - contTop;      // жалғасы беттерінде кесте 42 мм-ден масштаб сызығының деңгейіне дейін
    let rest = rowsFull, idx = 0;
    if (e.place === 'sheet') {
      const room = ZONE_BOTTOM - (A.zt + 8) - 5;
      const first = paginate(rowsHalf, hh, room, room)[0];
      zone += text(EXPL_X, A.zt + 6, T.expl, 3.8, { weight: 'bold' });
      const t = tableSvg(ctx, e, half.cols, first, EXPL_X, A.zt + 8);
      zone += t.svg;
      idx = first.length;
      rest = rowsFull.slice(idx);
      if (rest.length) zone += text(AREA.x1, A.zt + 8 + t.h + 3.5, T.next, 2.6, { anchor: 'end', italic: true, fill: COL.soft });
    }
    if (rest.length) {
      const parts = paginate(rest, hh, contRoom, contRoom);
      more = parts.map((part, i) => {
        const head = e.place === 'separate' && i === 0 ? T.expl : T.cont;
        const t = tableSvg(ctx, e, full.cols, part, AREA.x0, contTop);
        return frame() + titleBlock([ctx.names.title[0], head]) + t.svg +
          (i < parts.length - 1 ? text(AREA.x1, contTop + t.h + 4, T.next, 2.6, { anchor: 'end', italic: true, fill: COL.soft }) : '') +
          text(PAGE.w / 2, PAGE.h - 11, (i + 2) + T.page, FS.small, { anchor: 'middle', fill: COL.soft });
      });
    }
  }
  const svg = frame() + north(ctx.lang) + titleBlock(ctx.names.title.concat(TXT[ctx.lang].plan)) + '<g class="pj-body">' + body + ar.svg + '</g>' + zone + scaleBar(scale, ctx.lang, false);
  return { svg, more, fits: L.fits, arrowMid: ar.mid, arrowTip: ar.tip, arrowWarn: ar.warn, explWarn: warn, size: L.size };
}

/* ======================= Жеке жоспар ======================= */
function dimLine(a, b, label, o = {}) {
  const d = [b[0] - a[0], b[1] - a[1]], len = Math.hypot(d[0], d[1]) || 1, u = [d[0] / len, d[1] / len], n = [-u[1], u[0]];
  const ah = (p, s) => poly([p, [p[0] - s * u[0] * 2.2 + n[0] * 0.8, p[1] - s * u[1] * 2.2 + n[1] * 0.8], [p[0] - s * u[0] * 2.2 - n[0] * 0.8, p[1] - s * u[1] * 2.2 - n[1] * 0.8]], 'fill="' + COL.line + '"');
  let ang = Math.atan2(u[1], u[0]) / DEG;
  if (ang > 90 || ang < -90) ang += 180;
  const up = [Math.sin(ang * DEG), -Math.cos(ang * DEG)];
  // Жазу сызықтың бойында (at — үлесі; эллипстің екі осінің жазулары орталықта қабаттаспайды)
  const at = o.at ?? 0.5;
  const m = [a[0] + (b[0] - a[0]) * at + up[0] * 1.4, a[1] + (b[1] - a[1]) * at + up[1] * 1.4];
  const off = o.off || [0, 0];
  const lx = m[0], ly = m[1];
  return { svg: line(a, b, 'stroke="' + COL.line + '" stroke-width="0.25"') + ah(b, 1) + ah(a, -1) +
    '<g class="pj-dimlbl"' + (o.drag ? ' data-drag="' + o.drag + '"' : '') + ' transform="translate(' + n2(off[0]) + ' ' + n2(off[1]) + ')">' + text(lx, ly, label, FS.dim, { anchor: 'middle', rot: ang, halo: true, weight: 'bold' }) + '</g>',
    box: { x0: lx + off[0] - textW(label, FS.dim) / 2, y0: ly + off[1] - 3.5, x1: lx + off[0] + textW(label, FS.dim) / 2, y1: ly + off[1] + 1 } };
}

function layoutDetail(ctx, o, scale, editor) {
  const P = plane(+o.lat, +o.lon);
  const mm = xy => [toMm(xy[0], scale), -toMm(xy[1], scale)];
  const ring = contourXY(o, P).map(mm);
  const m = TXT[ctx.lang].m;
  const dims = [];
  const drag = editor ? 'dim:' + o.id : '';
  const off = Array.isArray(o.dimlbl) ? o.dimlbl : [0, 0];
  if (o.shape === 'circle') {
    const r = toMm(o.diam / 2, scale), d = dirOf(o.dim_az ?? 90);
    dims.push(dimLine([-d[0] * r, -d[1] * r], [d[0] * r, d[1] * r], 'Ø ' + fmtNum(o.diam) + ' ' + m, { off, drag }));
  } else if (o.shape === 'ellipse' || o.shape === 'rect') {
    // Эллипс — екі ось; тіктөртбұрыш — ұзындығы мен ені (орталық арқылы, қабырғаларға параллель)
    const a = toMm(o.ax_a / 2, scale), b = toMm(o.ax_b / 2, scale), d = dirOf(o.ax_az || 0), q = dirOf((o.ax_az || 0) + 90);
    dims.push(dimLine([-d[0] * a, -d[1] * a], [d[0] * a, d[1] * a], fmtNum(o.ax_a) + ' ' + m, { off, drag, at: 0.75 }));
    dims.push(dimLine([-q[0] * b, -q[1] * b], [q[0] * b, q[1] * b], fmtNum(o.ax_b) + ' ' + m, { at: 0.25 }));
  } else if (o.shape === 'free' && Array.isArray(o.dim)) {
    const xy = o.pts.map(p => P.fwd(+p[0], +p[1]));
    const [i, j] = o.dim;
    if (xy[i] && xy[j]) dims.push(dimLine(mm(xy[i]), mm(xy[j]), fmtNum(dist2(xy[i], xy[j]), 1) + ' ' + m, { off, drag }));
  }
  let u = bboxOf(ring);
  for (const d of dims) u = union(u, d.box);
  const cap = o.shape === 'ellipse' || o.shape === 'rect' ? fmtNum(o.ax_a) + ' × ' + fmtNum(o.ax_b) + ' ' + m : '';
  if (cap) u = union(u, { x0: -textW(cap, FS.text) / 2, y0: u.y1, x1: textW(cap, FS.text) / 2, y1: u.y1 + 7 });
  const aw = AREA.x1 - AREA.x0 - 12, ah = AREA.y1 - AREA.y0 - 12;
  const fits = u.x1 - u.x0 <= aw && u.y1 - u.y0 <= ah;
  const shift = [(AREA.x0 + AREA.x1) / 2 - (u.x0 + u.x1) / 2, (AREA.y0 + AREA.y1) / 2 - (u.y0 + u.y1) / 2];
  return { ring, dims, cap, capY: bboxOf(ring).y1 + 6, fits, shift, size: [u.x1 - u.x0, u.y1 - u.y0] };
}

function renderDetail(ctx, o, scale, editor) {
  const L = layoutDetail(ctx, o, scale, editor);
  const [sx, sy] = L.shift;
  const stage2 = isStage2(ctx.objects);
  const f = fillOf(o, stage2);
  let body = f === COL.fill ? poly(L.ring, 'fill="' + COL.fill + '" fill-opacity="0.45" stroke="' + COL.line + '" stroke-width="0.35"') : contourSvg(L.ring, o, stage2);
  if (o.shape !== 'free') body += line([-1.5, 0], [1.5, 0], 'stroke="' + COL.line + '" stroke-width="0.2"') + line([0, -1.5], [0, 1.5], 'stroke="' + COL.line + '" stroke-width="0.2"');
  else body += L.ring.map(p => '<circle cx="' + n2(p[0]) + '" cy="' + n2(p[1]) + '" r="0.45" fill="' + COL.line + '"/>').join('');
  body += L.dims.map(d => d.svg).join('');
  if (L.cap) body += text(0, L.capY, L.cap, FS.text, { anchor: 'middle' });
  const T = TXT[ctx.lang];
  const info = [T.height + ': ' + (o.height == null ? '—' : fmtNum(o.height) + ' ' + T.m)];
  if (o.material) info.push(T.head.material + ': ' + materialLabel(o.material, ctx.lang).toLocaleLowerCase(ctx.lang === 'ru' ? 'ru' : 'kk'));
  const sub = o.kind === 'kulpytas' && o.subtype ? ' (' + subtypeLabel(o.subtype, ctx.lang) + ')' : '';
  const svg = frame() + north(ctx.lang) +
    titleBlock(ctx.names.title.concat(objTitle(o, ctx.lang) + sub + ' — ' + T.detail, ctx.names.obj ? ctx.names.obj : '')) +
    '<g class="pj-body" transform="translate(' + n2(sx) + ' ' + n2(sy) + ')">' + body + '</g>' +
    info.map((t, i) => text(FRAME + 7, PAGE.h - 13.8 - (info.length - 1 - i) * 5, t, FS.text)).join('') + scaleBar(scale, ctx.lang, true);
  return { svg, fits: L.fits, size: L.size };
}

/* ======================= Бет ======================= */
const wrap = inner => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + PAGE.w + ' ' + PAGE.h + '" width="' + PAGE.w + 'mm" height="' + PAGE.h + 'mm" font-family="' + FONT + '" fill="' + COL.line + '">' +
  DEFS + '<rect width="' + PAGE.w + '" height="' + PAGE.h + '" fill="#fff"/>' + inner + '</svg>';

/** Берілген масштабта бет сыя ма (жалпы жоспар не нысанның жеке жоспары). */
export function fitsAt(ctx, kind, o, scale) {
  setPaper(ctx.plan && ctx.plan.paper);
  return kind === 'detail' ? layoutDetail(ctx, o, scale, false).fits : layoutGeneral(ctx, scale).fits;
}
/** Автоматты масштаб: сызба мен белгілерді сызба аймағына толық сыйдыратын ең ірі масштаб. */
export function autoScale(ctx, kind, o) {
  for (const s of SCALES) if (fitsAt(ctx, kind, o, s)) return s;
  return SCALES[SCALES.length - 1];
}

/**
 * Бір бет: kind — 'general' | 'detail'; o — жеке жоспардың нысаны; scale — 0 (автоматты) не 1:N бөлімі.
 * Қағаз өлшемі — ctx.plan.paper (paperSize). Нәтиже: { svg, more[] (жалпы жоспарда — экспликацияның жалғасы беттері), page { w, h, name }, scale, auto, fits, suggest,
 *   arrowMid / arrowTip (мм; бағыттауыштың ортасы мен ұшының жаны — қарындаш батырмасы үшін), warn[] }.
 */
export function renderPage(ctx, kind, o, scale = 0, opts = {}) {
  const auto = autoScale(ctx, kind, o);
  setPaper(ctx.plan && ctx.plan.paper);
  const s = scale > 0 ? scale : auto;
  const r = kind === 'detail' ? renderDetail(ctx, o, s, !!opts.editor) : renderGeneral(ctx, s, !!opts.editor);
  const warn = [];
  if (!r.fits) warn.push('nofit');
  if (r.arrowWarn) warn.push(r.arrowWarn);
  if (r.explWarn) warn.push(r.explWarn);
  return { svg: wrap(r.svg), more: (r.more || []).map(wrap), scale: s, auto, fits: r.fits, suggest: r.fits ? 0 : auto, arrowMid: r.arrowMid || null, arrowTip: r.arrowTip || null, warn, page: { ...PAGE } };
}

/** PDF-ке арналған HTML: барлық бет бір қағаз өлшемінде (page — renderPage().page; әдепкі A4), өрісі жоқ (main.js → printToPDF, exact). */
export function pdfHtml(pages, title, page = { w: 210, h: 297 }) {
  const W = page.w + 'mm', H = page.h + 'mm';
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' +
    '@page{size:' + W + ' ' + H + ';margin:0}html,body{margin:0;padding:0;background:#fff}' +
    '.pg{width:' + W + ';height:' + H + ';overflow:hidden;break-after:page;page-break-after:always}.pg:last-child{break-after:auto;page-break-after:auto}' +
    'svg{display:block;width:' + W + ';height:' + H + '}</style></head><body>' +
    pages.map(p => '<div class="pg">' + p + '</div>').join('') + '</body></html>';
}
