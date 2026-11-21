/* «Жоспар»: бет үлгісі — «Салтақ-III қорымы» жоспарының орналасуы (A4 тік, жіңішке рамка).
   Жоғарғы сол жақта — солтүстік көрсеткісі, жоғарғы оң жақта — ескерткіштің атауы, облыс, аудан және «Ескерткіш жоспары»,
   ортада — сызба аймағы, төменгі оң жақта — сызықтық масштаб. Алдын ала қарау мен PDF бір SVG-ді пайдаланады:
   өлшем бірлігі — миллиметр (viewBox 0 0 210 297), сондықтан PDF-те 1 бірлік = 1 мм (масштаб сақталады).
   Контурлар, өлшем сызықтары, белгішелер — вектор, жазулар — мәтін (PDF-те ізделеді).
   DOM-сыз модуль: scripts/test-plan.mjs тексереді. */
import { plane, contourXY, hasContour, toMm, SCALES, scaleBarStep, fmtNum, fmtMeasure, fmtDist, inverse, dist2, cmpNum } from './geo.js';

export const PAGE = { w: 210, h: 297 };
const FRAME = 7;                                        // рамканың шеттен қашықтығы, мм
export const AREA = { x0: 14, y0: 50, x1: 196, y1: 266 };   // сызба аймағы, мм
const COL = { fill: '#9c4f1c', line: '#111', blue: '#1f5f99', blue2: '#4d8fcf' };
const FONT = "Arial, 'Segoe UI', 'Liberation Sans', sans-serif";
const FS = { num: 3.6, frac: 3.2, title: 4.6, text: 3.6, dim: 3.4, small: 3.0 };

export const TXT = {
  kk: { plan: 'Ескерткіш жоспары', detail: 'жеке жоспар', north: 'С', m: 'м', height: 'Биіктігі', scale: 'Масштаб', kinds: { kurgan: 'қорған', other: 'нысан' } },
  ru: { plan: 'План памятника', detail: 'индивидуальный план', north: 'С', m: 'м', height: 'Высота', scale: 'Масштаб', kinds: { kurgan: 'курган', other: 'объект' } },
};
/** Нысанның атауы құжатта: «№1 қорған» / «Курган №1». */
export function objTitle(o, lang) {
  const k = TXT[lang].kinds[o.kind] || TXT[lang].kinds.other;
  return lang === 'ru' ? k[0].toUpperCase() + k.slice(1) + ' №' + o.num : '№' + o.num + ' ' + k;
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n2 = v => Math.round(v * 1000) / 1000;
/** Мәтіннің шамамен ені (мм): Arial-дың орташа таңба ені ≈ 0,56 × өлшем. */
const textW = (s, size) => [...String(s)].length * size * 0.56;
const DEG = Math.PI / 180;

function text(x, y, s, size, o = {}) {
  return '<text x="' + n2(x) + '" y="' + n2(y) + '" font-size="' + size + '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') +
    (o.weight ? ' font-weight="' + o.weight + '"' : '') + (o.halo ? ' stroke="#fff" stroke-width="0.9" stroke-linejoin="round" paint-order="stroke"' : '') +
    (o.rot ? ' transform="rotate(' + n2(o.rot) + ' ' + n2(x) + ' ' + n2(y) + ')"' : '') + '>' + esc(s) + '</text>';
}
const poly = (pts, attrs) => '<polygon points="' + pts.map(p => n2(p[0]) + ',' + n2(p[1])).join(' ') + '" ' + attrs + '/>';
const line = (a, b, attrs) => '<line x1="' + n2(a[0]) + '" y1="' + n2(a[1]) + '" x2="' + n2(b[0]) + '" y2="' + n2(b[1]) + '" ' + attrs + '/>';
const bboxOf = pts => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1]; }
  return { x0, y0, x1, y1 };
};
const union = (a, b) => (a ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : { ...b });
/** Бет бағыты: азимут (°) → бірлік вектор (жоғары — солтүстік). */
const dirOf = az => [Math.sin(az * DEG), -Math.cos(az * DEG)];

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
    text(x, mid + 1.45, 'N', 4, { anchor: 'middle', weight: 'bold' }).replace('<text ', '<text fill="#fff" ') + '</g>';
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
  const xr = PAGE.w - FRAME - 13, x0 = xr - L, y = 282;
  let g = '<g class="pj-scalebar">';
  g += '<rect x="' + n2(x0) + '" y="' + y + '" width="' + n2(L) + '" height="1.3" fill="#fff" stroke="' + COL.line + '" stroke-width="0.25"/>';
  for (let i = 0; i < 5; i += 2) g += '<rect x="' + n2(x0 + i * seg) + '" y="' + y + '" width="' + n2(seg) + '" height="1.3" fill="' + COL.line + '"/>';
  for (const k of [0, 1, 3, 5]) g += text(x0 + k * seg, y - 1.6, fmtNum(k * s), FS.small, { anchor: 'middle' });
  g += text(xr + 2.2, y - 1.6, TXT[lang].m, FS.small);
  if (withNumeric) g += text(x0 - 4, y + 1.2, TXT[lang].scale + ' 1:' + scale, FS.small, { anchor: 'end' });
  return g + '</g>';
}

/* ======================= Жалпы жоспар ======================= */
/** Бөлшек белгі мәтіндері: биіктігі үстінде, диаметрі (эллипсте — осьтері) астында. */
export function fraction(o) {
  const top = fmtMeasure(o.height);
  const bot = o.shape === 'ellipse' && o.ax_a > 0 ? fmtNum(o.ax_a) + ' × ' + fmtNum(o.ax_b) : fmtMeasure(o.diam);
  return { top, bot };
}
function labelBox(o, x, y) {
  const fr = fraction(o);
  const onlyNum = !hasContour(o) && fr.top === '—' && fr.bot === '—';
  const nw = textW(o.num, FS.num), fw = onlyNum ? 0 : Math.max(textW(fr.top, FS.frac), textW(fr.bot, FS.frac), 2.5);
  return { x, y, nw, fw, fr, onlyNum, w: nw + (onlyNum ? 0 : 0.8 + fw), h: 8.6 };
}
function labelSvg(b) {
  let s = text(b.x, b.y + 1.25, b.num, FS.num);
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
function layoutGeneral(ctx, scale) {
  const objs = ctx.objects.slice().sort(cmpNum);
  const ref = objs.length ? [objs.reduce((s, o) => s + +o.lat, 0) / objs.length, objs.reduce((s, o) => s + +o.lon, 0) / objs.length] : [+ctx.mark.lat, +ctx.mark.lon];
  const P = plane(ref[0], ref[1]);
  const mm = xy => [toMm(xy[0], scale), -toMm(xy[1], scale)];
  const items = objs.map(o => {
    const c = mm(P.fwd(+o.lat, +o.lon));
    const ring = hasContour(o) ? contourXY(o, P).map(mm) : null;
    const bb = ring ? bboxOf(ring) : { x0: c[0] - 0.8, y0: c[1] - 0.8, x1: c[0] + 0.8, y1: c[1] + 0.8 };
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
  const aw = AREA.x1 - AREA.x0 - 4, ah = AREA.y1 - AREA.y0 - 4;
  const fits = u.x1 - u.x0 <= aw && u.y1 - u.y0 <= ah;
  const sx = (AREA.x0 + AREA.x1) / 2 - (u.x0 + u.x1) / 2, sy = (AREA.y0 + AREA.y1) / 2 - (u.y0 + u.y1) / 2;
  return { P, items, fits, shift: [sx, sy], mm, size: [u.x1 - u.x0, u.y1 - u.y0] };
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
  const lim = t => { const p = [s[0] + d[0] * t, s[1] + d[1] * t]; return p[0] >= AREA.x0 + 2 && p[0] <= AREA.x1 - 2 && p[1] >= AREA.y0 + 2 && p[1] <= AREA.y1 - 2; };
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

function renderGeneral(ctx, scale, editor) {
  const L = layoutGeneral(ctx, scale);
  const [sx, sy] = L.shift;
  const tr = p => [p[0] + sx, p[1] + sy];
  let body = '';
  for (const it of L.items) {
    if (it.ring) body += poly(it.ring.map(tr), 'fill="' + COL.fill + '" stroke="' + COL.line + '" stroke-width="0.25"' + (editor ? ' data-obj="' + esc(it.o.id) + '"' : ''));
    else body += '<circle cx="' + n2(it.c[0] + sx) + '" cy="' + n2(it.c[1] + sy) + '" r="0.9" fill="' + COL.line + '"' + (editor ? ' data-obj="' + esc(it.o.id) + '"' : '') + '/>';
  }
  for (const it of L.items) {
    const off = Array.isArray(it.o.lbl) ? it.o.lbl : [0, 0];
    // Белгінің өз орны (ығысусыз) + transform: алдын ала қарауда сүйреп жылжыту осы transform-ды өзгертеді
    const b = { ...it.lb, x: it.lb.x - off[0] + sx, y: it.lb.y - off[1] + sy };
    body += '<g class="pj-lbl"' + (editor ? ' data-drag="lbl:' + esc(it.o.id) + '"' : '') + ' transform="translate(' + n2(off[0]) + ' ' + n2(off[1]) + ')">' + labelSvg(b) + '</g>';
  }
  const ar = arrowSvg(ctx, L, editor);
  const svg = frame() + north(ctx.lang) + titleBlock(ctx.names.title.concat(TXT[ctx.lang].plan)) + '<g class="pj-body">' + body + ar.svg + '</g>' + scaleBar(scale, ctx.lang, false);
  return { svg, fits: L.fits, arrowMid: ar.mid, arrowTip: ar.tip, arrowWarn: ar.warn, size: L.size };
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
  } else if (o.shape === 'ellipse') {
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
  const cap = o.shape === 'ellipse' ? fmtNum(o.ax_a) + ' × ' + fmtNum(o.ax_b) + ' ' + m : '';
  if (cap) u = union(u, { x0: -textW(cap, FS.text) / 2, y0: u.y1, x1: textW(cap, FS.text) / 2, y1: u.y1 + 7 });
  const aw = AREA.x1 - AREA.x0 - 12, ah = AREA.y1 - AREA.y0 - 12;
  const fits = u.x1 - u.x0 <= aw && u.y1 - u.y0 <= ah;
  const shift = [(AREA.x0 + AREA.x1) / 2 - (u.x0 + u.x1) / 2, (AREA.y0 + AREA.y1) / 2 - (u.y0 + u.y1) / 2];
  return { ring, dims, cap, capY: bboxOf(ring).y1 + 6, fits, shift, size: [u.x1 - u.x0, u.y1 - u.y0] };
}

function renderDetail(ctx, o, scale, editor) {
  const L = layoutDetail(ctx, o, scale, editor);
  const [sx, sy] = L.shift;
  let body = poly(L.ring, 'fill="' + COL.fill + '" fill-opacity="0.45" stroke="' + COL.line + '" stroke-width="0.35"');
  if (o.shape !== 'free') body += line([-1.5, 0], [1.5, 0], 'stroke="' + COL.line + '" stroke-width="0.2"') + line([0, -1.5], [0, 1.5], 'stroke="' + COL.line + '" stroke-width="0.2"');
  else body += L.ring.map(p => '<circle cx="' + n2(p[0]) + '" cy="' + n2(p[1]) + '" r="0.45" fill="' + COL.line + '"/>').join('');
  body += L.dims.map(d => d.svg).join('');
  if (L.cap) body += text(0, L.capY, L.cap, FS.text, { anchor: 'middle' });
  const T = TXT[ctx.lang];
  const info = T.height + ': ' + (o.height == null ? '—' : fmtNum(o.height) + ' ' + T.m);
  const svg = frame() + north(ctx.lang) +
    titleBlock(ctx.names.title.concat(objTitle(o, ctx.lang) + ' — ' + T.detail, ctx.names.obj ? ctx.names.obj : '')) +
    '<g class="pj-body" transform="translate(' + n2(sx) + ' ' + n2(sy) + ')">' + body + '</g>' +
    text(FRAME + 7, 283.2, info, FS.text) + scaleBar(scale, ctx.lang, true);
  return { svg, fits: L.fits, size: L.size };
}

/* ======================= Бет ======================= */
const wrap = inner => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + PAGE.w + ' ' + PAGE.h + '" width="' + PAGE.w + 'mm" height="' + PAGE.h + 'mm" font-family="' + FONT + '" fill="' + COL.line + '">' +
  '<rect width="' + PAGE.w + '" height="' + PAGE.h + '" fill="#fff"/>' + inner + '</svg>';

/** Берілген масштабта бет сыя ма (жалпы жоспар не нысанның жеке жоспары). */
export function fitsAt(ctx, kind, o, scale) {
  return kind === 'detail' ? layoutDetail(ctx, o, scale, false).fits : layoutGeneral(ctx, scale).fits;
}
/** Автоматты масштаб: сызба мен белгілерді сызба аймағына толық сыйдыратын ең ірі масштаб. */
export function autoScale(ctx, kind, o) {
  for (const s of SCALES) if (fitsAt(ctx, kind, o, s)) return s;
  return SCALES[SCALES.length - 1];
}

/**
 * Бір бет: kind — 'general' | 'detail'; o — жеке жоспардың нысаны; scale — 0 (автоматты) не 1:N бөлімі.
 * Нәтиже: { svg, scale, auto, fits, suggest, arrowMid / arrowTip (мм; бағыттауыштың ортасы мен ұшының жаны — қарындаш батырмасы үшін), warn[] }.
 */
export function renderPage(ctx, kind, o, scale = 0, opts = {}) {
  const auto = autoScale(ctx, kind, o);
  const s = scale > 0 ? scale : auto;
  const r = kind === 'detail' ? renderDetail(ctx, o, s, !!opts.editor) : renderGeneral(ctx, s, !!opts.editor);
  const warn = [];
  if (!r.fits) warn.push('nofit');
  if (r.arrowWarn) warn.push(r.arrowWarn);
  return { svg: wrap(r.svg), scale: s, auto, fits: r.fits, suggest: r.fits ? 0 : auto, arrowMid: r.arrowMid || null, arrowTip: r.arrowTip || null, warn };
}

/** PDF-ке арналған HTML: әр бет — A4, өрісі жоқ (main.js → printToPDF, exact). */
export function pdfHtml(pages, title) {
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' +
    '@page{size:210mm 297mm;margin:0}html,body{margin:0;padding:0;background:#fff}' +
    '.pg{width:210mm;height:297mm;overflow:hidden;break-after:page;page-break-after:always}.pg:last-child{break-after:auto;page-break-after:auto}' +
    'svg{display:block;width:210mm;height:297mm}</style></head><body>' +
    pages.map(p => '<div class="pg">' + p + '</div>').join('') + '</body></html>';
}
