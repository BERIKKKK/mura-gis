/* Mura GIS: «Қорғау аймағы» қызметі.
   ҚР МСМ 2020 ж. 14 сәуірдегі № 86 бұйрығымен бекітілген қағидалар:
     7-т. қорғау аймағы: археологиялық — 40 м; ансамбль/кешен — 20 м;
          сәулет/монументалды өнер/киелі ғимарат: биіктігі ≤ 40 м → 2×биіктік, > 40 м → 1×биіктік;
     8-т. құрылыс салуды реттеу аймағы — қорғау аймағының шетінен сол шамамен;
     9-т. қорғалатын табиғи ландшафт аймағы — реттеу аймағының шетінен сол шамамен.
   Аймақтар ескерткіш шекарасынан сыртқа қарай тұрақты қашықтыққа ығысқан полигон ретінде есептеледі
   (жергілікті метрлік проекцияда; дөңес бұрыштар — шеңберге сырттай сызылған сынық сызықпен, сондықтан
   шекараның еш нүктесі белгіленген қашықтықтан жақын емес). Экспорт: GeoJSON, PNG сызба, DOCX.
   Өлшеу құралдары: азимут көрсеткіші, қабырғаны дәл бұрышқа (45°, 90° т.б.) туралау, сызықтарға
   магниттелетін перпендикуляр сызғыш. Бәрі браузерде жүреді. */

const L = globalThis.L;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ZONES = [
  { key: 'monument',  color: '#1f9d3a', docColor: '1F9D3A', border: 'ескерткіштің шекарасы',                          area: 'ескерткіштің ауданы',                               feature: 'Ескерткіштің шекарасы' },
  { key: 'protection', color: '#f2d02b', docColor: 'E0B800', border: 'қорғау аймағының шекарасы',                     area: 'қорғау аймағының ауданы',                           feature: 'Қорғау аймағы' },
  { key: 'regulation', color: '#2a3fb8', docColor: '2A3FB8', border: 'құрылыс салуды реттеу аймағының шекарасы',       area: 'құрылыс салуды реттеу аймағының ауданы',            feature: 'Құрылыс салуды реттеу аймағы' },
  { key: 'landscape', color: '#d6261f', docColor: 'D6261F', border: 'қорғалатын табиғи ландшафт аймағының шекарасы',  area: 'қорғалатын табиғи ландшафт аймағының ауданы',       feature: 'Қорғалатын табиғи ландшафт аймағы' },
];
const MIN_POINTS = 4;
const STORE_KEY = 'qa-draft-v1' + (globalThis.mura?.project?.current ? ':' + globalThis.mura.project.current.key : '');   // әр жобаның өз жұмыс нұсқасы
const SAT_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/* ======================= Қазақ тілінің жалғаулары ======================= */
const VOWELS = 'аәеоөұүыіэюяиё';
const FRONT = 'әеөүіэи';
function lastVowelFront(w) {
  let lv = '';
  for (const c of w) if (VOWELS.includes(c) || c === 'у') lv = c;
  return FRONT.includes(lv);
}
function tailWord(s) {
  const m = s.match(/[A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]+$/);
  return m ? m[0].toLowerCase() : '';
}
/** Ілік септік: «бейіті» → «бейітінің», «қорған» → «қорғанның», «мешіт» → «мешіттің». */
export function genitive(s) {
  s = String(s || '').trim();
  const w = tailWord(s);
  if (!w) return s;
  const last = w.slice(-1);
  // дауысты, м, н, ң → -ның/-нің; ж, з, л, р, й, у → -дың/-дің; қатаң дауыссыз → -тың/-тің
  const cons = (VOWELS.includes(last) || 'мнң'.includes(last)) ? 'н' : ('жзлрйу'.includes(last) ? 'д' : 'т');
  return s + cons + (lastVowelFront(w) ? 'ің' : 'ың');
}
/** Жатыс септік: «Қарғалы ауданы» → «Қарғалы ауданында», «Ақтөбе облысы» → «Ақтөбе облысында». */
function locative(s) {
  s = String(s || '').trim();
  const w = tailWord(s);
  if (!w) return s;
  const last = w.slice(-1), front = lastVowelFront(w);
  if (last === 'ы' || last === 'і') return s + (front ? 'нде' : 'нда');
  if ('бвгдкқпстфхцчшщ'.includes(last)) return s + (front ? 'те' : 'та');
  return s + (front ? 'де' : 'да');
}

/* ======================= Сандарды пішімдеу ======================= */
const comma = s => String(s).replace('.', ',');
function roundHa(m2) {
  const v = m2 / 10000;
  const dec = v >= 0.1 ? 2 : v >= 0.01 ? 3 : 4;
  return Number(v.toFixed(dec));
}
const fmtHa = v => comma(String(Number(v.toFixed(4))));
const fmtM = v => comma(String(Number(Number(v).toFixed(1))));
function dms(v) {
  const a = Math.abs(v);
  let d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf), s = (mf - m) * 60;
  s = Number(s.toFixed(2));
  if (s >= 60) { s = 0; m++; }
  if (m >= 60) { m = 0; d++; }
  return d + '°' + String(m).padStart(2, '0') + '′' + comma(s.toFixed(2).padStart(5, '0')) + '″';
}

/* ======================= Геометрия ======================= */
function makeProj(pts) {
  const lat0 = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const lon0 = pts.reduce((s, p) => s + p.lon, 0) / pts.length;
  const f = lat0 * Math.PI / 180;
  const kx = 111412.84 * Math.cos(f) - 93.5 * Math.cos(3 * f);
  const ky = 111132.92 - 559.82 * Math.cos(2 * f) + 1.175 * Math.cos(4 * f);
  return {
    fwd: p => [(p.lon - lon0) * kx, (p.lat - lat0) * ky],
    inv: q => ({ lat: lat0 + q[1] / ky, lon: lon0 + q[0] / kx }),
  };
}
const signedArea = P => { let s = 0; for (let i = 0, n = P.length; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
const unit = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];

function cleanRing(P) {
  let out = P.filter((p, i) => { const q = P[(i + 1) % P.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.01; });
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length], p = out[i], b = out[(i + 1) % out.length];
      const t1 = unit(p[0] - a[0], p[1] - a[1]), t2 = unit(b[0] - p[0], b[1] - p[1]);
      if (Math.abs(t1[0] * t2[1] - t1[1] * t2[0]) < 1e-7 && t1[0] * t2[0] + t1[1] * t2[1] > 0) { out.splice(i, 1); changed = true; break; }
    }
  }
  return out;
}

/** Сағат тіліне қарсы (CCW) полигонды d метрге сыртқа ығыстыру. */
function offsetRing(P, d) {
  const n = P.length, out = [];
  let spike = false;
  for (let i = 0; i < n; i++) {
    const a = P[(i - 1 + n) % n], p = P[i], b = P[(i + 1) % n];
    const t1 = unit(p[0] - a[0], p[1] - a[1]), t2 = unit(b[0] - p[0], b[1] - p[1]);
    const n1 = [t1[1], -t1[0]], n2 = [t2[1], -t2[0]];
    const th = Math.atan2(t1[0] * t2[1] - t1[1] * t2[0], t1[0] * t2[0] + t1[1] * t2[1]);
    if (th > 1e-6) {                       // дөңес бұрыш: шеңбер доғасына сырттай сызылған сынық
      const m = Math.max(1, Math.ceil(th / (Math.PI / 4) - 1e-9));
      const al = th / m, r = d / Math.cos(al / 2);
      for (let k = 0; k < m; k++) { const v = rot(n1, (k + 0.5) * al); out.push([p[0] + r * v[0], p[1] + r * v[1]]); }
    } else if (th < -1e-6) {               // ойыс бұрыш: ығысқан сызықтардың қиылысы
      const dt = n1[0] * n2[0] + n1[1] * n2[1];
      if (1 + dt < 0.15) spike = true;
      const k = d / (1 + dt);
      out.push([p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k]);
    }
  }
  return { ring: cleanRing(out), spike };
}

function segCross(p1, p2, p3, p4) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
function selfIntersects(P) {
  const n = P.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) continue;
    if (segCross(P[i], P[(i + 1) % n], P[j], P[(j + 1) % n])) return true;
  }
  return false;
}
function hull(P) {
  const pts = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/** Нөмірлеу реті: сағат тілімен, батыс-солтүстік-батыстағы нүктеден бастап (үлгідегідей). */
function numbered(P) {
  const R = P.slice().reverse();                       // CCW → CW
  const cx = R.reduce((s, p) => s + p[0], 0) / R.length, cy = R.reduce((s, p) => s + p[1], 0) / R.length;
  let best = 0, bd = 1e9;
  R.forEach((p, i) => {
    const b = (Math.atan2(p[0] - cx, p[1] - cy) * 180 / Math.PI + 360) % 360;
    const dd = Math.min(Math.abs(b - 285), 360 - Math.abs(b - 285));
    if (dd < bd) { bd = dd; best = i; }
  });
  return R.slice(best).concat(R.slice(0, best));
}

/** Негізгі есеп. pts — [{lat, lon}], dists — [d1, d2, d3] метр.
    custom — импортталған дайын аймақ полигондары { rings: [қорғау, реттеу, ландшафт] (әрқайсысы [{lat, lon}] не null), source }:
    берілген аймақ есептелмей, сол полигон алынады; берілмегені алдыңғы аймақтан есептеледі. */
export function computeZones(pts, dists, custom) {
  if (pts.length < MIN_POINTS) return { error: 'few' };
  const proj = makeProj(pts);
  let P = pts.map(proj.fwd);
  if (selfIntersects(P)) return { error: 'self' };
  const userCW = signedArea(P) < 0;
  let C = userCW ? P.slice().reverse() : P.slice();
  C = cleanRing(C);
  const monArea = Math.abs(signedArea(C));
  if (C.length < 3 || monArea < 1) return { error: 'flat' };
  const notes = [];
  const rings = [C];
  let src = C;
  let usedCustom = false;
  for (let i = 0; i < 3; i++) {
    const cr = custom && Array.isArray(custom.rings) ? custom.rings[i] : null;
    if (Array.isArray(cr) && cr.length >= 3) {
      let Q = cleanRing(cr.map(p => proj.fwd({ lat: +p.lat, lon: +p.lon })));
      if (signedArea(Q) < 0) Q.reverse();
      if (Q.length >= 3 && !selfIntersects(Q)) { rings.push(Q); src = Q; usedCustom = true; continue; }
      notes.push(ZONES[i + 1].feature + ': импортталған полигон жарамсыз (өзін-өзі қиып өтеді) — аймақ ескерткіш шекарасынан есептелді.');
    }
    const d = dists[i];
    let res = offsetRing(src, d);
    if (res.spike || res.ring.length < 3 || selfIntersects(res.ring) || signedArea(res.ring) <= signedArea(src)) {
      res = offsetRing(hull(src), d);
      notes.push(ZONES[i + 1].feature + ': ескерткіш шекарасы тым ойыс болғандықтан аймақ оның дөңес қабықшасынан есептелді.');
    }
    rings.push(res.ring);
    src = res.ring;
  }
  if (usedCustom) notes.push('Аймақтар импортталған полигондардан алынды' + (custom.source ? ' (' + custom.source + ')' : '') + ', ескерткіш шекарасынан есептелмеген.');
  const outer = rings.map(r => Math.abs(signedArea(r)));
  const ringArea = outer.map((a, i) => i === 0 ? a : a - outer[i - 1]);
  const toLL = r => r.map(proj.inv);
  return {
    proj, notes, custom: usedCustom,
    ccw: rings.map(toLL),                                        // GeoJSON үшін (RFC 7946: сыртқы шекара CCW)
    num: [pts.slice(), ...rings.slice(1).map(r => toLL(numbered(r)))], // сызба мен кесте үшін
    outer, ringArea, dists: [0, ...dists],
  };
}

/* ======================= Күй ======================= */
const state = { pts: [], custom: null, add: false, loadedId: null, loadedName: '' };   // loadedId — ашық тұрған сақталған жазба
let R = null;
let genTouched = false;

const F = {
  name: $('qaName'), gen: $('qaNameGen'), period: $('qaPeriod'), oblast: $('qaOblast'), district: $('qaDistrict'),
  place: $('qaPlace'), desc: $('qaDesc'), type: $('qaType'), height: $('qaHeight'), d1: $('qaD1'), d2: $('qaD2'), d3: $('qaD3'),
};
const FIELD_KEYS = Object.keys(F);

function save() {
  try {
    const o = { pts: state.pts, custom: state.custom, genTouched, loadedId: state.loadedId, loadedName: state.loadedName, f: {} };
    for (const k of FIELD_KEYS) o.f[k] = F[k].value;
    localStorage.setItem(STORE_KEY, JSON.stringify(o));
  } catch (e) { /* жеке режим т.б. — елемейміз */ }
}
function load() {
  try {
    const o = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!o) return false;
    for (const k of FIELD_KEYS) if (o.f && typeof o.f[k] === 'string') F[k].value = o.f[k];
    state.pts = Array.isArray(o.pts) ? o.pts.filter(p => isFinite(p.lat) && isFinite(p.lon)) : [];
    state.custom = o.custom && Array.isArray(o.custom.rings) ? o.custom : null;
    genTouched = !!o.genTouched;
    state.loadedId = typeof o.loadedId === 'string' ? o.loadedId : null;
    state.loadedName = typeof o.loadedName === 'string' ? o.loadedName : '';
    return true;
  } catch (e) { return false; }
}

/** Растау: бет ішіндегі терезе (ui.js) — browser confirm() толық экраннан шығарып жібереді. */
const ask = (msg, o) => (globalThis.QAUI && globalThis.QAUI.confirm ? globalThis.QAUI.confirm(msg, o) : Promise.resolve(confirm(msg)));

function toast(msg, err) {
  const t = $('qaToast');
  t.textContent = msg; t.classList.toggle('is-err', !!err); t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, err ? 5000 : 2600);
}

/* ======================= Заңнамаға сәйкестік (импортталған аймақ полигондары) =======================
   ҚР МСМ 14.04.2020 № 86 бұйрығы, 7–9-тармақтар: қорғау аймағының ені — d (ескерткіш түрі мен биіктігіне қарай),
   құрылыс салуды реттеу аймағы — қорғау аймағынан тағы d, қорғалатын табиғи ландшафт аймағы — тағы d.
   Импортталған полигон ескерткіш шекарасынан қаншалықты алыс жатқаны өлшенеді: ең жақын жері талаптан тар болса,
   не әдеттегі (медиана) қашықтығы талаптан едәуір кең болса, не ескерткішті толық қамтымаса — сәйкес емес. */
export function legalDistance(f) {
  f = f || {};
  const h = parseFloat(String(f.height ?? '').replace(',', '.'));
  if (f.type === 'archeo' || !f.type) return 40;
  if (f.type === 'ensemble') return 20;
  if (f.type === 'custom' || !(h > 0)) return null;
  return h <= 40 ? Math.round(h * 2 * 10) / 10 : h;
}
function pointInRing(p, P) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i], b = P[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
/** pts — ескерткіш шекарасы, custom — { rings }, f — өрістер (түрі, биіктігі). null — тексеретін импортталған полигон жоқ. */
export function checkLegal(pts, custom, f) {
  const rs = custom && Array.isArray(custom.rings) ? custom.rings : [];
  if (!rs.some(r => Array.isArray(r) && r.length >= 3) || !pts || pts.length < 3) return null;
  const d = legalDistance(f);
  const proj = makeProj(pts), M = pts.map(p => proj.fwd({ lat: +p.lat, lon: +p.lon }));
  const toM = p => { let m = Infinity; for (let i = 0; i < M.length; i++) m = Math.min(m, segDist(p, M[i], M[(i + 1) % M.length])); return m; };
  const items = [];
  rs.forEach((r, i) => {
    if (!Array.isArray(r) || r.length < 3) return;
    const Z = r.map(p => proj.fwd({ lat: +p.lat, lon: +p.lon }));
    let per = 0;
    for (let k = 0; k < Z.length; k++) per += Math.hypot(Z[(k + 1) % Z.length][0] - Z[k][0], Z[(k + 1) % Z.length][1] - Z[k][1]);
    const step = Math.max(0.5, per / 600), ds = [];
    for (let k = 0; k < Z.length; k++) {
      const a = Z[k], b = Z[(k + 1) % Z.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(len / step));
      for (let j = 0; j < n; j++) ds.push(toM([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]));
    }
    ds.sort((x, y) => x - y);
    const min = ds[0], med = ds[Math.floor(ds.length / 2)];
    const req = d == null ? null : d * (i + 1);
    let status = 'ok';
    if (!M.every(p => pointInRing(p, Z))) status = 'outside';
    else if (req != null && min < req - Math.max(1, req * 0.05)) status = 'narrow';
    else if (req != null && med > req + Math.max(2, req * 0.1)) status = 'wide';
    items.push({ zone: i + 1, name: ZONES[i + 1].feature, min, med, req, status });
  });
  return { d, items, ok: items.every(x => x.status === 'ok'), norule: d == null };
}
/** Тексеру нәтижесінің қысқа мәтіні (әр аймақ бір жол). */
export function legalLines(Lg) {
  if (!Lg) return [];
  return Lg.items.map(x => x.name + ': ' + (
    x.status === 'outside' ? 'ескерткіш аумағын толық қамтымайды'
      : x.status === 'narrow' ? 'тар — ең жақын жері ' + fmtM(x.min) + ' м, талап — ' + fmtM(x.req) + ' м'
      : x.status === 'wide' ? 'кең — шамамен ' + fmtM(x.med) + ' м, талап — ' + fmtM(x.req) + ' м'
      : x.req == null ? 'шамамен ' + fmtM(x.med) + ' м (бұл түрге қашықтық ережесі жоқ)' : 'сәйкес (' + fmtM(x.med) + ' м, талап — ' + fmtM(x.req) + ' м)'));
}

/* ======================= Ережелер ======================= */
function ruleDistance() {
  const t = F.type.value, h = parseFloat(F.height.value);
  if (t === 'archeo') return { d: 40, text: '7-тармақтың 3) тармақшасы: археологиялық ескерткіш (киелі объектілер) мәдени қабаттарын табудың шеткі шекарасынан, ескерткіштер тобы болса — сыртқы шеткі шекарасынан 40 метр қорғау аймағымен қоршалады.' };
  if (t === 'ensemble') return { d: 20, text: '7-тармақтың 4) тармақшасы: ансамбльдер мен кешендер шеткі объектісінің шекарасынан 20 метр күзет аймағымен қоршалады.' };
  if (t === 'custom') return { d: null, text: '7-тармақтың соңғы бөлігі: ескерткіш қолданыстағы сәулет ортасында орналасса, қорғау аймағы оның қоршаған ортасы мен орналасуын ескере отырып, айналасындағы бос кеңістікті барынша қамтып айқындалады. Қашықтықтарды қолмен енгізіңіз.' };
  if (!(h > 0)) return { d: null, text: 'Биіктігін енгізіңіз.' };
  if (h <= 40) return { d: Math.round(h * 2 * 10) / 10, text: '7-тармақтың 1) тармақшасы: биіктігі 40 метрге дейінгі нысан жерден ең жоғары нүктесіне дейінгі қашықтықтың екі шамасына тең аймақпен қоршалады: 2 × ' + fmtM(h) + ' = ' + fmtM(h * 2) + ' м.' };
  return { d: h, text: '7-тармақтың 2) тармақшасы: биіктігі 40 метрден асатын нысан жерден ең жоғары нүктесіне дейінгі қашықтықтың бір шамасына тең аймақпен қоршалады: ' + fmtM(h) + ' м.' };
}
function applyRule(setDistances) {
  const t = F.type.value;
  $('qaHeightWrap').hidden = !['arch', 'art', 'sacred'].includes(t);
  const r = ruleDistance();
  $('qaRuleText').textContent = r.text;
  if (setDistances && r.d) { F.d1.value = r.d; F.d2.value = r.d; F.d3.value = r.d; }
}
function dists() {
  return [F.d1, F.d2, F.d3].map(i => { const v = parseFloat(String(i.value).replace(',', '.')); return v > 0 ? v : NaN; });
}

/* ======================= Карта ======================= */
const mapEl = $('qaMap');
const map = L.map(mapEl, { scrollWheelZoom: true, doubleClickZoom: false }).setView([48.6, 58.2], 6);
// Қабаттар — бағдарламаның «Карта қабаттары» модулі (js/basemaps.js).
// Сызбаның фоны картада таңдалған қабатқа сәйкес: Спутник → Esri суреті, қалғандары → OpenStreetMap.
const basemaps = globalThis.AqmBasemaps ? globalThis.AqmBasemaps.attach(map, mapEl) : null;
if (!basemaps) L.tileLayer(OSM_URL, { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
const schemeIsSat = () => !!(basemaps && basemaps.mode && basemaps.mode() === 'sat');
function paintSchemeBase() {
  const el = $('qaSchemeBase');
  if (el) el.textContent = schemeIsSat() ? 'Спутник (Esri)' : 'OpenStreetMap';
}
map.on('basemapchange', paintSchemeBase);
const zoneLayer = L.layerGroup().addTo(map);
const labelLayer = L.layerGroup().addTo(map);
const markerLayer = L.layerGroup().addTo(map);
const previewLayer = L.layerGroup().addTo(map);   // сақталған аймақтың алдын ала көрінісі (ағымдағы жұмысты ауыстырмайды)
const tempLayer = L.layerGroup().addTo(map);      // координата панеліндегі «Көрсету» маркері
new ResizeObserver(() => map.invalidateSize()).observe(mapEl);
// Шартты белгілер мен нүкте саны — картаның оң жақ төменгі бұрышында (атрибуцияның үстінде)
const LegendCtl = L.Control.extend({
  options: { position: 'bottomright' },
  onAdd() { const el = $('qaLegend'); L.DomEvent.disableClickPropagation(el); return el; },
});
new LegendCtl().addTo(map);

function drawZones() {
  zoneLayer.clearLayers();
  labelLayer.clearLayers();
  const pts = state.pts;
  if (R && !R.error) {
    for (let i = 3; i >= 1; i--) {
      L.polygon(R.num[i].map(p => [p.lat, p.lon]), { color: ZONES[i].color, weight: 3, fill: false, interactive: false }).addTo(zoneLayer);
      R.num[i].forEach((p, k) => {
        L.marker([p.lat, p.lon], {
          interactive: false, keyboard: false,
          icon: L.divIcon({ className: '', html: '<span class="qa-lbl" style="color:' + ZONES[i].color + '">' + (k + 1) + '</span>', iconSize: [20, 14], iconAnchor: [-3, 16] }),
        }).addTo(labelLayer);
      });
    }
  }
  if (pts.length >= 2) {
    const ll = pts.map(p => [p.lat, p.lon]);
    (pts.length >= 3 ? L.polygon(ll, { color: ZONES[0].color, weight: 3, fillOpacity: 0.12, interactive: false })
                     : L.polyline(ll, { color: ZONES[0].color, weight: 3, interactive: false })).addTo(zoneLayer);
    if (tool.sideLabels) sides().forEach(sd => {
      const m = { lat: (sd.a.lat + sd.b.lat) / 2, lon: (sd.a.lon + sd.b.lon) / 2 };
      L.marker([m.lat, m.lon], {
        interactive: false, keyboard: false,
        icon: L.divIcon({ className: '', html: '<span class="qa-slbl">' + fmtAz(sd.az) + ' · ' + fmtLen(sd.len) + ' м</span>', iconSize: [0, 0], iconAnchor: [0, 0] }),
      }).addTo(labelLayer);
    });
  }
}

function drawMarkers() {
  markerLayer.clearLayers();
  state.pts.forEach((p, i) => {
    const ruling = tool.mode === 'ruler';         // сызғыш режимінде нүктелер басуды картаға өткізеді
    const mk = L.marker([p.lat, p.lon], {
      draggable: !ruling, interactive: !ruling, autoPan: true, title: 'Нүкте ' + (i + 1),
      icon: L.divIcon({ className: '', html: '<div class="qa-vx">' + (i + 1) + '</div>', iconSize: [24, 24], iconAnchor: [12, 12] }),
    });
    mk.on('dragstart', () => { dragging = true; clearGuide(); });
    mk.on('drag', e => {
      const l = e.target.getLatLng(), nb = neighbors(i);
      const sn = snapFrom(nb.anchor, nb.prev, { lat: l.lat, lon: l.lng });
      if (sn.snapped) e.target.setLatLng([sn.p.lat, sn.p.lon]);
      state.pts[i] = sn.p;
      recompute(false);
      if (nb.anchor) showHud(bearing(nb.anchor, sn.p), 'Нүкте ' + (i + 1) + ': ' + fmtLen(distM(nb.anchor, sn.p)) + ' м', sn.snapped ? 'туралау: ' + tool.snap + '°' : '');
    });
    // Туралау маркерді курсордан жылжытуы мүмкін — тінтуірді жібергендегі «басу» картаға түсіп, жаңа нүкте қоспасын
    mk.on('dragend', () => { dragging = false; dragEndAt = Date.now(); hideHud(); recompute(true); });
    mk.on('contextmenu', e => { L.DomEvent.preventDefault(e.originalEvent || e); removePoint(i); });
    mk.on('click', e => L.DomEvent.stopPropagation(e));
    mk.addTo(markerLayer);
  });
}

/* ======================= Өлшеу құралдары: азимут, бұрышты туралау, сызғыш ======================= */
// Азимут — шынайы (географиялық) солтүстіктен сағат тілімен, 0–360°. Есеп жергілікті метрлік проекцияда
// (makeProj) — бірнеше шақырымға дейінгі қашықтықта қателігі миллиметрден аз.
const TOOLS_KEY = 'qa-tools-v1';
const tool = { mode: 'none', snap: 0, ref: 'north', perp: true, sideLabels: true };   // mode: add | ruler | none
try {
  const o = JSON.parse(localStorage.getItem(TOOLS_KEY) || 'null');
  if (o) {
    if ([0, 1, 5, 15, 30, 45, 90].includes(+o.snap)) tool.snap = +o.snap;
    if (o.ref === 'side') tool.ref = 'side';
    if (o.perp === false) tool.perp = false;
    if (o.sideLabels === false) tool.sideLabels = false;
  }
} catch (e) { /* елемейміз */ }
function saveTools() {
  try { localStorage.setItem(TOOLS_KEY, JSON.stringify({ snap: tool.snap, ref: tool.ref, perp: tool.perp, sideLabels: tool.sideLabels })); } catch (e) { /* елемейміз */ }
}

const DEG = Math.PI / 180;
const norm360 = a => ((a % 360) + 360) % 360;
/** a → b азимуты, градус. */
function bearing(a, b) { const q = makeProj([a]).fwd(b); return norm360(Math.atan2(q[0], q[1]) / DEG); }
/** a мен b арасы, метр. */
function distM(a, b) { const pr = makeProj([a, b]), p = pr.fwd(a), q = pr.fwd(b); return Math.hypot(q[0] - p[0], q[1] - p[1]); }
/** a нүктесінен az азимутымен d метр жердегі нүкте. */
function destPoint(a, az, d) { return makeProj([a]).inv([d * Math.sin(az * DEG), d * Math.cos(az * DEG)]); }
const fmtAz = a => { let v = Number(norm360(a).toFixed(1)); if (v >= 360) v = 0; return comma(v.toFixed(1)) + '°'; };
const fmtAzIn = a => { let v = Number(norm360(a).toFixed(2)); if (v >= 360) v = 0; return comma(String(v)); };
function fmtAzDM(a) { const x = splitDeg(norm360(a), 1); return (x.d >= 360 ? 0 : x.d) + '°' + comma(x.m.toFixed(1).padStart(4, '0')) + '′'; }
const fmtLen = v => comma(v.toFixed(2));
const parseNum = s => { const v = parseFloat(String(s ?? '').replace(/\s+/g, '').replace(',', '.')); return isFinite(v) ? v : NaN; };
function parseAz(s) { const r = parseOne(s); return r.err || r.v < 0 || r.v > 360 ? NaN : norm360(r.v); }

/** Ескерткіш шекарасының қабырғалары: i-нүктеден келесі нүктеге (тұйық, егер нүкте ≥ 3). */
function sides() {
  const P = state.pts, n = P.length, out = [];
  const m = n >= 3 ? n : n - 1;
  for (let i = 0; i < m; i++) { const a = P[i], b = P[(i + 1) % n]; out.push({ i, a, b, az: bearing(a, b), len: distM(a, b) }); }
  return out;
}
/** i-нүктені туралау үшін: тірек нүкте (алдыңғы) және одан бұрынғы нүкте (қабырғадан санағанда). */
function neighbors(i) {
  const P = state.pts, n = P.length, closed = n >= 3;
  const ia = i > 0 ? i - 1 : (closed ? n - 1 : -1);
  const ib = ia > 0 ? ia - 1 : (ia === 0 && closed ? n - 1 : -1);
  return { anchor: ia >= 0 && ia !== i ? P[ia] : null, prev: ib >= 0 && ib !== i && ib !== ia ? P[ib] : null };
}

let altDown = false, dragging = false, dragEndAt = 0;
addEventListener('keydown', e => {
  if (e.key === 'Alt') altDown = true;
  if (e.key === 'Escape' && ruler.a) { cancelRuler(); }
});
addEventListener('keyup', e => { if (e.key === 'Alt') altDown = false; });
addEventListener('blur', () => { altDown = false; });

/**
 * Бұрышты туралау: anchor-дан p-ға қарай бағытты ең жақын «қадам» еселігіне бұрып, p-ны сол сәулеге проекциялайды.
 * Санақ: солтүстіктен (азимут) не алдыңғы қабырғадан (prev → anchor бағыты).
 */
function snapFrom(anchor, prev, p) {
  if (!tool.snap || altDown || !anchor) return { p, snapped: false };
  const pr = makeProj([anchor]), q = pr.fwd(p), d = Math.hypot(q[0], q[1]);
  if (d < 0.01) return { p, snapped: false };
  const base = tool.ref === 'side' && prev ? bearing(prev, anchor) : 0;
  const az = norm360(Math.atan2(q[0], q[1]) / DEG);
  const saz = norm360(base + Math.round(norm360(az - base) / tool.snap) * tool.snap);
  const len = Math.max(0, d * Math.cos((az - saz) * DEG));
  return { p: pr.inv([len * Math.sin(saz * DEG), len * Math.cos(saz * DEG)]), snapped: true, az: saz };
}

/* ---------- Азимут көрсеткіші (картаның сол жақ төменгі бұрышы) ---------- */
const Hud = L.Control.extend({
  options: { position: 'bottomleft' },
  onAdd() { const d = L.DomUtil.create('div', 'qa-hud'); d.hidden = true; return d; },
});
const hudEl = new Hud().addTo(map).getContainer();
function showHud(az, line1, line2) {
  const r = 21;
  hudEl.innerHTML = '<svg width="48" height="48" viewBox="-24 -24 48 48" aria-hidden="true">' +
    '<circle r="' + r + '" fill="#fff" stroke="#333" stroke-width="1.5"/>' +
    [0, 90, 180, 270].map(a => '<line x1="0" y1="' + -r + '" x2="0" y2="' + (-r + 5) + '" stroke="#333" stroke-width="1.5" transform="rotate(' + a + ')"/>').join('') +
    '<text x="0" y="-9" text-anchor="middle" font-size="9" font-weight="700" fill="#c0261d">С</text>' +
    '<g transform="rotate(' + az.toFixed(2) + ')"><path d="M0,-17 L4.5,-6 L1.2,-7 L1.2,12 L-1.2,12 L-1.2,-7 L-4.5,-6 Z" fill="#e8178a"/></g>' +
    '<circle r="2" fill="#111"/></svg>' +
    '<div>Азимут <b>' + fmtAz(az) + '</b> <span style="font-weight:400">(' + fmtAzDM(az) + ')</span>' +
    (line1 ? '<small>' + esc(line1) + '</small>' : '') + (line2 ? '<small>' + esc(line2) + '</small>' : '') + '</div>';
  hudEl.hidden = false;
}
function hideHud() { hudEl.hidden = true; }

/* ---------- Нүкте қою кезіндегі көмекші сызық ---------- */
const guideLayer = L.layerGroup().addTo(map);
function clearGuide() { guideLayer.clearLayers(); }
function guideMove(e) {
  if (dragging) return;
  clearGuide();
  const n = state.pts.length;
  if (tool.mode !== 'add' || !n) { if (tool.mode !== 'ruler') hideHud(); return; }
  const ins = insertIndexAt(e.containerPoint);
  if (ins >= 0) { hideHud(); return; }
  const a = state.pts[n - 1], sn = snapFrom(a, state.pts[n - 2], { lat: e.latlng.lat, lon: e.latlng.lng });
  L.polyline([[a.lat, a.lon], [sn.p.lat, sn.p.lon]], { color: '#e8178a', weight: 2, dashArray: '6 5', interactive: false }).addTo(guideLayer);
  if (sn.snapped) L.circleMarker([sn.p.lat, sn.p.lon], { radius: 4, color: '#e8178a', weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(guideLayer);
  let extra = '';
  if (n >= 2) {                                    // алдыңғы қабырғамен арадағы бұрыш (сағат тілімен бұрылу)
    const turn = norm360(bearing(a, sn.p) - bearing(state.pts[n - 2], a));
    extra = 'алдыңғы қабырғадан бұрылу: ' + fmtAz(turn);
  }
  showHud(bearing(a, sn.p), n + '-нүктеден: ' + fmtLen(distM(a, sn.p)) + ' м' + (sn.snapped ? ' · туралау ' + tool.snap + '°' : ''), extra);
}
map.on('mousemove', e => { if (tool.mode === 'ruler') rulerMove(e); else guideMove(e); });
mapEl.addEventListener('mouseleave', () => { clearGuide(); if (tool.mode !== 'ruler' || !ruler.a) hideHud(); });

/* ---------- Қабырғаны кестеден дәл азимут/ұзындықпен беру ---------- */
function editSide(i, key, raw) {
  const S = sides(), sd = S[i];
  if (!sd) return;
  const v = key === 'az' ? parseAz(raw) : parseNum(raw);
  if (!isFinite(v) || (key === 'len' && !(v > 0))) { toast(key === 'az' ? 'Азимут 0–360° аралығында болуы керек.' : 'Ұзындық оң сан болуы керек (метр).', true); renderTable(); return; }
  const j = (i + 1) % state.pts.length;
  state.pts[j] = destPoint(sd.a, key === 'az' ? v : sd.az, key === 'len' ? v : sd.len);
  recompute(true, true);
  toast((j + 1) + '-нүкте жылжытылды: ' + (i + 1) + '→' + (j + 1) + ' қабырғасы ' + fmtAz(key === 'az' ? v : sd.az) + ', ' + fmtLen(key === 'len' ? v : sd.len) + ' м.');
}
function addTraverse() {
  const az = parseAz($('qaTrAz').value), len = parseNum($('qaTrLen').value), n = state.pts.length;
  if (!n) { toast('Алдымен бірінші нүктені қойыңыз.', true); return; }
  if (!isFinite(az)) { toast('Азимутты енгізіңіз (0–360°).', true); $('qaTrAz').focus(); return; }
  if (!(len > 0)) { toast('Қашықтықты метрмен енгізіңіз.', true); $('qaTrLen').focus(); return; }
  state.pts.push(destPoint(state.pts[n - 1], az, len));
  recompute(true, true); fit();
  $('qaTrLen').value = ''; $('qaTrAz').select();
  toast((n + 1) + '-нүкте қосылды: ' + n + '-нүктеден ' + fmtAz(az) + ', ' + fmtLen(len) + ' м.');
}
$('qaTrAdd').addEventListener('click', addTraverse);
for (const id of ['qaTrAz', 'qaTrLen']) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addTraverse(); } });

/* ---------- Дәл өлшемді тіктөртбұрыш / шаршы ---------- */
const rectEl = { L: $('qaRectL'), W: $('qaRectW'), az: $('qaRectAz'), at: $('qaRectAt'), sq: $('qaRectSq') };
function syncSquare() {
  rectEl.W.disabled = rectEl.sq.checked;
  if (rectEl.sq.checked) rectEl.W.value = rectEl.L.value;
}
rectEl.sq.addEventListener('change', syncSquare);
rectEl.L.addEventListener('input', () => { if (rectEl.sq.checked) rectEl.W.value = rectEl.L.value; });
/** Тіктөртбұрыштың 4 бұрышы: 1→2 — az бағытында L метр, 2→3 — az+90° бағытында W метр (сағат тілімен). */
export function rectangle(origin, L, W, az, fromP1) {
  const pr = makeProj([origin]);
  const u = [Math.sin(az * DEG), Math.cos(az * DEG)], v = [Math.sin((az + 90) * DEG), Math.cos((az + 90) * DEG)];
  const o = fromP1 ? [0, 0] : [-u[0] * L / 2 - v[0] * W / 2, -u[1] * L / 2 - v[1] * W / 2];
  return [[0, 0], [L, 0], [L, W], [0, W]].map(([a, b]) => pr.inv([o[0] + u[0] * a + v[0] * b, o[1] + u[1] * a + v[1] * b]));
}
$('qaRectFrom').addEventListener('click', () => {
  const S = sides();
  if (S.length < 2) { toast('Алдымен кемінде 3 нүкте қойыңыз.', true); return; }
  const r1 = v => String(Number(v.toFixed(2))).replace('.', ',');
  rectEl.L.value = r1(S[0].len); rectEl.W.value = r1(S[1].len); rectEl.az.value = r1(S[0].az);
  rectEl.sq.checked = false; syncSquare();
  toast('Өлшемдер қазіргі фигурадан алынды — қажетінше түзетіп, «Тіктөртбұрыш салу» басыңыз.');
});
$('qaRectRun').addEventListener('click', async () => {
  const L = parseNum(rectEl.L.value), W = rectEl.sq.checked ? L : parseNum(rectEl.W.value);
  const az = rectEl.az.value.trim() === '' ? 0 : parseAz(rectEl.az.value);
  if (!(L > 0)) { toast('Ұзындығын метрмен енгізіңіз.', true); rectEl.L.focus(); return; }
  if (!(W > 0)) { toast('Енін метрмен енгізіңіз.', true); rectEl.W.focus(); return; }
  if (!isFinite(az)) { toast('Бағыты 0–360° аралығында болуы керек.', true); rectEl.az.focus(); return; }
  const P = state.pts, at = rectEl.at.value;
  let origin, fromP1 = false;
  if (at === 'p1' && P.length) { origin = P[0]; fromP1 = true; }
  else if (at !== 'map' && P.length) {               // ортасы — қазіргі нүктелердің орта нүктесі
    origin = { lat: P.reduce((s, p) => s + p.lat, 0) / P.length, lon: P.reduce((s, p) => s + p.lon, 0) / P.length };
  } else { const c = map.getCenter(); origin = { lat: c.lat, lon: c.lng }; }
  if (P.length && !(await ask('Бар ' + P.length + ' нүкте ' + fmtLen(L) + ' × ' + fmtLen(W) + ' м тіктөртбұрышпен ауыстырылады. Жалғастырасыз ба?', { ok: 'Ауыстыру' }))) return;
  state.pts = rectangle(origin, L, W, az, fromP1);
  recompute(true, true); fit();
  toast((L === W ? 'Шаршы' : 'Тіктөртбұрыш') + ' салынды: ' + fmtLen(L) + ' × ' + fmtLen(W) + ' м, бағыты ' + fmtAz(az) + '.');
});

/* ---------- Сызғыш: сызықтарға магниттеледі, екінші сызыққа перпендикуляр түседі ---------- */
const VERTEX_PX = 11, EDGE_PX = 14;
const ruler = { a: null, list: [], seq: 0 };
const rulerLayer = L.layerGroup().addTo(map);
const rulerTmp = L.layerGroup().addTo(map);
/** Магниттелетін сызықтар: ескерткіш шекарасы және үш аймақ шекарасы. */
function snapLines() {
  const out = [], n = state.pts.length;
  if (n >= 2) out.push({ key: 0, name: 'Ескерткіш', pts: state.pts, closed: n >= 3 });
  if (R && !R.error) for (let i = 1; i <= 3; i++) out.push({ key: i, name: ZONES[i].feature, pts: R.num[i], closed: true });
  return out;
}
/** Курсор жанындағы бұрылыс нүктесі (басым) не сызық. skipEdgesOf — осы сызықтың қабырғалары ескерілмейді. */
function snapAt(cp, skipEdgesOf = -1) {
  const lines = snapLines();
  let best = null;
  for (const ln of lines) ln.px = ln.pts.map(p => map.latLngToContainerPoint([p.lat, p.lon]));
  for (const ln of lines) ln.px.forEach((q, k) => {
    const d = Math.hypot(q.x - cp.x, q.y - cp.y);
    if (d < VERTEX_PX && (!best || d < best.d)) best = { kind: 'vertex', d, line: ln.key, name: ln.name, ll: ln.pts[k], idx: k };
  });
  if (best) return best;
  for (const ln of lines) {
    if (ln.key === skipEdgesOf) continue;
    const n = ln.pts.length, m = ln.closed ? n : n - 1;
    for (let k = 0; k < m; k++) {
      const a = ln.px[k], b = ln.px[(k + 1) % n], d = distToSeg(cp, a, b);
      if (d < EDGE_PX && (!best || d < best.d)) best = { kind: 'edge', d, line: ln.key, name: ln.name, a: ln.pts[k], b: ln.pts[(k + 1) % n] };
    }
  }
  // Сызықтағы нүкте метрлік проекцияда дәл есептеледі (Leaflet экран нүктелерін пиксельге дөңгелектейді)
  if (best) { const c = map.containerPointToLatLng(cp); best.ll = footOn({ lat: c.lat, lon: c.lng }, best.a, best.b).p; }
  return best;
}
/** p нүктесінен [a, b] кесіндісіне түсірілген перпендикулярдың табаны (кесінді шегінде). */
function footOn(p, a, b) {
  const pr = makeProj([p]), A = pr.fwd(a), B = pr.fwd(b);
  const dx = B[0] - A[0], dy = B[1] - A[1], l2 = dx * dx + dy * dy;
  const t0 = l2 ? -(A[0] * dx + A[1] * dy) / l2 : 0, t = Math.max(0, Math.min(1, t0));
  return { p: pr.inv([A[0] + t * dx, A[1] + t * dy]), exact: t0 >= 0 && t0 <= 1 };
}
/** Сызғыштың нүктесін анықтау (бірінші не екінші). */
function rulerPoint(e) {
  const raw = { lat: e.latlng.lat, lon: e.latlng.lng }, A = ruler.a;
  if (!A) { const s = altDown ? null : snapAt(e.containerPoint); return { ll: s ? s.ll : raw, snap: s }; }
  // Екінші нүкте: перпендикуляр режимінде бірінші нүкте жатқан сызықтың өз қабырғаларына магниттелмейміз
  const s = altDown ? null : snapAt(e.containerPoint, tool.perp && A.snap ? A.snap.line : -1);
  if (s && s.kind === 'vertex') return { ll: s.ll, snap: s };
  if (s && s.kind === 'edge') {
    if (tool.perp) { const f = footOn(A.ll, s.a, s.b); return { ll: f.p, snap: s, perp: f.exact }; }
    return { ll: s.ll, snap: s };
  }
  if (!altDown && tool.perp && A.snap && A.snap.kind === 'edge') {   // бос жер: бірінші сызыққа перпендикуляр бойымен
    const pr = makeProj([A.ll]), a = pr.fwd(A.snap.a), b = pr.fwd(A.snap.b), q = pr.fwd(raw);
    const u = unit(b[0] - a[0], b[1] - a[1]), nr = [-u[1], u[0]], t = q[0] * nr[0] + q[1] * nr[1];
    return { ll: pr.inv([nr[0] * t, nr[1] * t]), snap: null, perp: true };
  }
  const sn = snapFrom(A.ll, null, raw);
  return { ll: sn.p, snap: null, angle: sn.snapped };
}
function rulerLabel(a, b, sub) {
  return '<span class="qa-rlbl">' + fmtLen(distM(a, b)) + ' м' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>';
}
function drawRulerLine(layer, a, b, label) {
  const ll = [[a.lat, a.lon], [b.lat, b.lon]];
  L.polyline(ll, { color: '#000', weight: 5, opacity: 0.6, interactive: false }).addTo(layer);
  L.polyline(ll, { color: '#fff', weight: 2.5, dashArray: '7 5', interactive: false }).addTo(layer);
  for (const p of [a, b]) L.circleMarker([p.lat, p.lon], { radius: 4, color: '#111', weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(layer);
  L.marker([(a.lat + b.lat) / 2, (a.lon + b.lon) / 2], { interactive: false, keyboard: false, icon: L.divIcon({ className: '', html: label, iconSize: [0, 0], iconAnchor: [0, 0] }) }).addTo(layer);
}
function snapDot(layer, s) {
  if (!s) return;
  L.marker([s.ll.lat, s.ll.lon], { interactive: false, keyboard: false, icon: L.divIcon({ className: '', html: '<div class="qa-snapdot' + (s.kind === 'edge' ? ' is-edge' : '') + '"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }) }).addTo(layer);
}
const snapName = s => s ? s.name + (s.kind === 'vertex' ? ' (' + (s.idx + 1) + '-нүкте)' : '') : 'бос нүкте';
function rulerMove(e) {
  rulerTmp.clearLayers();
  const P = rulerPoint(e);
  if (!ruler.a) {
    snapDot(rulerTmp, P.snap);
    hideHud();
    return;
  }
  const A = ruler.a;
  snapDot(rulerTmp, A.snap);
  if (P.snap) snapDot(rulerTmp, { kind: P.snap.kind, ll: P.ll });
  const sub = fmtAz(bearing(A.ll, P.ll)) + (P.perp ? ' · ⊥' : '');
  drawRulerLine(rulerTmp, A.ll, P.ll, rulerLabel(A.ll, P.ll, sub));
  showHud(bearing(A.ll, P.ll), 'Сызғыш: ' + fmtLen(distM(A.ll, P.ll)) + ' м' + (P.perp ? ' (перпендикуляр)' : ''),
    snapName(A.snap) + ' → ' + snapName(P.snap));
}
function rulerClick(e) {
  const P = rulerPoint(e);
  if (!ruler.a) { ruler.a = P; rulerMove(e); return; }
  const A = ruler.a;
  if (distM(A.ll, P.ll) < 0.005) return;
  ruler.list.push({ id: ++ruler.seq, a: A.ll, b: P.ll, d: distM(A.ll, P.ll), az: bearing(A.ll, P.ll), from: snapName(A.snap), to: snapName(P.snap), perp: !!P.perp });
  ruler.a = null;
  rulerTmp.clearLayers();
  renderRuler();
  hideHud();
}
function cancelRuler() { ruler.a = null; rulerTmp.clearLayers(); hideHud(); }
function clearRuler() { cancelRuler(); ruler.list = []; renderRuler(); }
function renderRuler() {
  rulerLayer.clearLayers();
  ruler.list.forEach((m, k) => drawRulerLine(rulerLayer, m.a, m.b, rulerLabel(m.a, m.b, (k + 1) + ' · ' + fmtAz(m.az) + (m.perp ? ' · ⊥' : ''))));
  const ul = $('qaRulerList');
  ul.hidden = !ruler.list.length;
  $('qaRulerClear').hidden = !ruler.list.length;
  ul.innerHTML = ruler.list.map((m, k) => '<li><span>' + (k + 1) + '.</span><span>' + esc(m.from) + ' → ' + esc(m.to) + ':</span> <b>' + fmtLen(m.d) + ' м</b>' +
    '<span class="muted">азимут ' + fmtAz(m.az) + (m.perp ? ', перпендикуляр' : '') + '</span>' +
    '<button type="button" class="qa-x" data-rdel="' + m.id + '" aria-label="' + (k + 1) + '-өлшемді өшіру">×</button></li>').join('');
}
$('qaRulerList').addEventListener('click', e => {
  const b = e.target.closest('[data-rdel]'); if (!b) return;
  ruler.list = ruler.list.filter(m => m.id !== +b.dataset.rdel); renderRuler();
});
$('qaRulerClear').addEventListener('click', clearRuler);
map.on('contextmenu', () => { if (tool.mode === 'ruler' && ruler.a) cancelRuler(); });

/* ---------- Режимдер мен баптаулар ---------- */
function setMode(m) {
  tool.mode = m;
  state.add = m === 'add';
  const b = $('qaAddMode');                       // құралдар жолағындағы иконка-батырма: күйі aria-pressed арқылы
  b.setAttribute('aria-pressed', state.add ? 'true' : 'false');
  b.dataset.tip = 'Нүкте қою: ' + (state.add ? 'қосулы' : 'өшірулі');
  const r = $('qaRuler'), on = m === 'ruler';
  r.setAttribute('aria-pressed', on ? 'true' : 'false');
  r.dataset.tip = on ? 'Сызғыш: қосулы (Esc — өлшеуден бас тарту)' : 'Сызғыш: сызықтарға магниттеледі, перпендикуляр түседі';
  mapEl.classList.toggle('is-adding', state.add);
  mapEl.classList.toggle('is-ruler', on);
  cancelRuler(); clearGuide();
  drawMarkers();
}
$('qaRuler').addEventListener('click', () => setMode(tool.mode === 'ruler' ? 'none' : 'ruler'));
$('qaSnap').value = String(tool.snap);
$('qaSnapRef').value = tool.ref;
$('qaPerp').checked = tool.perp;
$('qaSideLbl').checked = tool.sideLabels;
$('qaSnap').addEventListener('change', e => { tool.snap = +e.target.value || 0; saveTools(); });
$('qaSnapRef').addEventListener('change', e => { tool.ref = e.target.value === 'side' ? 'side' : 'north'; saveTools(); });
$('qaPerp').addEventListener('change', e => { tool.perp = e.target.checked; saveTools(); });
$('qaSideLbl').addEventListener('change', e => { tool.sideLabels = e.target.checked; saveTools(); drawZones(); });

function distToSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
/** Басылған жер шекара сызығының жанында болса — сол аралықтың нөмірі (нүкте кірістіріледі), әйтпесе −1. */
function insertIndexAt(cp) {
  const n = state.pts.length;
  if (n < 3) return -1;
  const px = state.pts.map(p => map.latLngToContainerPoint([p.lat, p.lon]));
  let best = -1, bd = 10;
  for (let i = 0; i < n; i++) { const d = distToSeg(cp, px[i], px[(i + 1) % n]); if (d < bd) { bd = d; best = i; } }
  return best;
}
map.on('click', e => {
  if (Date.now() - dragEndAt < 250) return;
  if (tool.mode === 'ruler') { rulerClick(e); return; }
  if (!state.add) return;
  const pt = { lat: e.latlng.lat, lon: e.latlng.lng };
  const best = insertIndexAt(e.containerPoint);
  if (best >= 0) { state.pts.splice(best + 1, 0, pt); recompute(true, true); return; }
  const n = state.pts.length;
  state.pts.push(snapFrom(state.pts[n - 1], state.pts[n - 2], pt).p);   // бұрышты туралау — алдыңғы нүктеден
  recompute(true, true);
  guideMove(e);
});

function removePoint(i) { state.pts.splice(i, 1); recompute(true, true); }

function fit() {
  const all = R && !R.error ? R.num[3] : state.pts;
  if (!all.length) return;
  fitTo(all);
}
/** Нүктелерді картаға сыйғызу — қалқымалы панельдер (құралдар жолағы, ашық панель) жабатын жиектерді ескеріп. */
function fitTo(all) {
  if (all.length === 1) { map.setView([all[0].lat, all[0].lon], 17); return; }
  const p = globalThis.QAUI ? globalThis.QAUI.pad() : { tl: [30, 30], br: [30, 30] };
  map.fitBounds(L.latLngBounds(all.map(q => [q.lat, q.lon])), { paddingTopLeft: p.tl, paddingBottomRight: p.br, maxZoom: 19 });
}

/* ======================= Интерфейс ======================= */
function renderTable() {
  const tb = $('qaPts');
  renderPosOptions();
  if (!state.pts.length) { tb.innerHTML = '<tr><td colspan="6" class="muted">Нүкте жоқ. Картаны басып белгілеңіз немесе координатаны төменгі панельге енгізіңіз.</td></tr>'; return; }
  const S = sides(), n = state.pts.length;
  tb.innerHTML = state.pts.map((p, i) => {
    const sd = S[i], to = (i + 1) % n + 1;
    const sideCells = sd
      ? '<td><input class="qa-side" data-side="' + i + '" data-k="az" value="' + esc(fmtAzIn(sd.az)) + '" title="' + (i + 1) + '→' + to + ' қабырғасының азимуты" aria-label="' + (i + 1) + '–' + to + ' қабырғасының азимуты"></td>' +
        '<td><input class="qa-side" data-side="' + i + '" data-k="len" value="' + esc(fmtLen(sd.len)) + '" title="' + (i + 1) + '→' + to + ' қабырғасының ұзындығы" aria-label="' + (i + 1) + '–' + to + ' қабырғасының ұзындығы"></td>'
      : '<td class="muted">—</td><td class="muted">—</td>';
    return '<tr><td><strong>' + (i + 1) + '</strong></td>' +
    '<td><input data-i="' + i + '" data-k="lat" value="' + esc(fmtCoord(p.lat)) + '" aria-label="Нүкте ' + (i + 1) + ' ендігі"></td>' +
    '<td><input data-i="' + i + '" data-k="lon" value="' + esc(fmtCoord(p.lon)) + '" aria-label="Нүкте ' + (i + 1) + ' бойлығы"></td>' + sideCells +
    '<td><button type="button" class="qa-x" data-del="' + i + '" aria-label="Нүкте ' + (i + 1) + ' өшіру">×</button></td></tr>';
  }).join('');
}
$('qaPts').addEventListener('change', e => {
  const sideInp = e.target.closest('input[data-side]');
  if (sideInp) { editSide(+sideInp.dataset.side, sideInp.dataset.k, sideInp.value); return; }
  const inp = e.target.closest('input[data-i]'); if (!inp) return;
  const r = parseOne(inp.value), i = +inp.dataset.i, k = inp.dataset.k;
  const lim = k === 'lat' ? 90 : 180;
  if (r.err || Math.abs(r.v) > lim) { toast('Координата дұрыс емес (' + inp.value + '): ' + (r.err || 'шектен тыс'), true); renderTable(); return; }
  const v = r.v;
  state.pts[i][k] = v;
  recompute(true, true);
});
$('qaPts').addEventListener('click', e => { const b = e.target.closest('[data-del]'); if (b) removePoint(+b.dataset.del); });

function msg(html, kind) { $('qaMsg').innerHTML = html ? '<p class="qa-msg qa-msg--' + kind + '">' + html + '</p>' : ''; }
$('qaMsg').addEventListener('click', e => {
  const b = e.target.closest('[data-legal]');
  if (!b || !state.custom) return;
  if (b.dataset.legal === 'keep') { state.custom = { ...state.custom, accepted: true }; toast('Импортталған аймақтар қалдырылды. Өзгерісті сақтауды ұмытпаңыз.'); }
  else { state.custom = null; applyRule(true); toast('Аймақтар ескерткіш аумағынан қайта есептелді. Өзгерісті сақтауды ұмытпаңыз.'); }
  recompute(true, true);
});

function recompute(full, markers) {
  const n = state.pts.length;
  const D = dists();
  R = null;
  if (n >= MIN_POINTS) {
    if (D.some(d => !isFinite(d))) R = { error: 'dist' };
    else R = computeZones(state.pts, D, state.custom);
  }
  const c = $('qaCount');
  c.textContent = 'Нүктелер: ' + n + (n < MIN_POINTS ? ' (кемінде ' + MIN_POINTS + ')' : '');
  c.classList.toggle('is-bad', n < MIN_POINTS);
  if (R && R.error === 'self') msg('Шекара сызығы өзін-өзі қиып өтеді. Нүктелердің ретін түзетіңіз немесе «Ретке келтіру» батырмасын басыңыз.', 'err');
  else if (R && R.error === 'flat') msg('Нүктелер бір сызықта жатыр — ескерткіш ауданы жоқ.', 'err');
  else if (R && R.error === 'dist') msg('Аймақ қашықтықтарын (метр) енгізіңіз.', 'err');
  else if (R && state.custom) {
    // Импортталған аймақ полигондары: заңнамаға сәйкестігі және «Қалдыру / Қайта есептеу»
    const Lg = checkLegal(state.pts, state.custom, fieldValues());
    const bad = Lg && !Lg.ok, acc = !!state.custom.accepted;
    msg((bad ? '<b>' + (acc ? 'Заңнамаға сәйкес емес (қалдырылған)' : '⚠ Аймақтар қолданыстағы заңнамаға сәйкес емес') + '</b><br>' : '') +
      R.notes.map(esc).join('<br>') + (Lg ? '<br>' + legalLines(Lg).map(esc).join('<br>') : '') +
      '<span class="qa-legal-act">' + (bad && !acc ? '<button type="button" class="lnk" data-legal="keep">Қалдыру</button>' : '') +
      '<button type="button" class="lnk" data-legal="recalc">Ескерткіш аумағынан қайта есептеу</button></span>', bad && !acc ? 'err' : 'warn');
  }
  else if (R && R.notes.length) msg(R.notes.map(esc).join('<br>'), 'warn');
  else msg('', '');
  drawZones();
  if (markers) drawMarkers();
  if (full) { renderTable(); renderResults(); save(); paintDirty(); }
}

/* ---------- Сақталмаған өзгерістерді бақылау ----------
   Ағымдағы өрістер мен нүктелердің «қолтаңбасы» соңғы сақталған (не ашылған) күймен салыстырылады.
   Сервер мәндерді trim() жасап, координаталарды 8 таңбаға дөңгелектейді — салыстыру да солай. */
let cleanSig = null;                               // null — ашық жазбаның серверлік күйі әлі белгісіз
function sigOf(f, pts, custom) {
  const v = k => String(f[k] ?? '').trim();
  // Ілік септігі атаудан автоматты жасалса — бос деп есептейміз (сервер бос сақтаған болуы мүмкін)
  const val = k => (k === 'gen' && v('gen') === genitive(v('name')) ? '' : v(k));
  return JSON.stringify([FIELD_KEYS.map(val),
    (pts || []).map(p => [Math.round(+p.lat * 1e8) / 1e8, Math.round(+p.lon * 1e8) / 1e8]), customSig(custom)]);
}
const customSig = c => (c && Array.isArray(c.rings) ? [!!c.accepted, c.rings.map(r => (Array.isArray(r) ? r.length : 0))] : null);
const curSig = () => sigOf(fieldValues(), state.pts, state.custom);
function isDirty() {
  if (!state.loadedId) return state.pts.length > 0;          // жаңа жазба: нүкте қойылса — сақталмаған
  return cleanSig !== null && cleanSig !== curSig();
}
function markClean(rec) { cleanSig = rec ? sigOf(rec.fields || {}, rec.pts, rec.custom) : curSig(); paintDirty(); }
function paintDirty() {
  const d = isDirty();
  $('qaSave').classList.toggle('is-dirty', d);
  $('qaDirty').hidden = !d;
}
addEventListener('beforeunload', e => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });

function renderResults() {
  const ok = R && !R.error;
  for (const id of ['qaGeo', 'qaDocx', 'qaPng']) $(id).disabled = !ok;
  if (!ok) {
    $('qaRes').innerHTML = '<tr><td colspan="5" class="muted">' + (state.pts.length < MIN_POINTS ? 'Кемінде ' + MIN_POINTS + ' нүкте белгілеңіз.' : 'Есептеу мүмкін емес — жоғарыдағы хабарламаны қараңыз.') + '</td></tr>';
    $('qaPreview').hidden = true;
    return;
  }
  const H = haValues();
  $('qaRes').innerHTML = ZONES.map((z, i) =>
    '<tr><td><i class="qa-sw" style="border-color:' + z.color + '"></i>' + esc(z.feature) + '</td>' +
    '<td class="num">' + (i ? fmtM(R.dists[i]) : '—') + '</td>' +
    '<td class="num">' + fmtHa(H.parts[i]) + '</td>' +
    '<td class="num">' + fmtHa(roundHa(R.outer[i])) + '</td>' +
    '<td class="num">' + R.num[i].length + '</td></tr>').join('') +
    '<tr><td><strong>Барлығы (кешен аумағы)</strong></td><td></td><td class="num"><strong>' + fmtHa(H.total) + '</strong></td><td></td><td></td></tr>';
  const T = docText();
  $('qaPreview').innerHTML = '<h3>' + esc(T.title) + '</h3>' + (T.period ? '<p class="c">(' + esc(T.period) + ')</p>' : '') +
    T.body.map(t => '<p>' + esc(t) + '</p>').join('');
  $('qaPreview').hidden = false;
}

function haValues(Rx = R) {
  const parts = Rx.ringArea.map(roundHa);
  return { parts, total: Number(parts.reduce((s, v) => s + v, 0).toFixed(4)) };
}

/* ======================= Құжат мәтіні ======================= */
/** Өрістердің мәндері (жол) → құжатқа керек деректер. f — { name, gen, period, oblast, district, place, desc, … }. */
function infoFrom(f) {
  const s = k => String(f[k] ?? '').trim();
  const name = s('name') || 'Ескерткіш';
  return {
    name, gen: s('gen') || genitive(name), period: s('period'),
    oblast: s('oblast'), district: s('district'),
    place: s('place').replace(/[.;,\s]+$/, ''), desc: s('desc'),
  };
}
function fieldValues() { return Object.fromEntries(FIELD_KEYS.map(k => [k, F[k].value])); }
function info() { return infoFrom(fieldValues()); }
function docText(Rx = R, I = info()) {
  const H = haValues(Rx), d = Rx.dists;
  let where = I.district ? (I.oblast ? genitive(I.oblast) + ' ' : '') + locative(I.district) : (I.oblast ? locative(I.oblast) : '');
  if (I.place) where = where ? where + ', ' + I.place : I.place;
  const body = [
    'Ескерткіштің қорғау аймағы ' + (where ? where + ' ' : '') + 'орналасқан ' + I.gen + ' бөлінбес функционалдық бөлігі болып табылатын ландшафттың шекаралары бойынша өтеді.',
    ...I.desc.split(/\n+/).map(s => s.trim()).filter(Boolean),
    'Қорғау аймақтары кіретін кешен аумағының жалпы ауданы – ' + fmtHa(H.total) + ' гектарды құрайды. Оның ішінде:',
    'ескерткіштің ауданы – ' + fmtHa(H.parts[0]) + ' гектар;',
    'қорғау аймағының шекарасы ескерткіш аумағының шекарасынан ' + fmtM(d[1]) + ' метрге шегінеді және ауданы – ' + fmtHa(H.parts[1]) + ' гектарды құрайды;',
    'құрылыс салуды реттеу аймағы қорғау аймағы шекарасының шетінен ' + fmtM(d[2]) + ' метр шегіне отырып, ескерткіштің қорғау аймағына іргелес жатқан аумақты алып жатыр және ' + fmtHa(H.parts[2]) + ' гектарды құрайды;',
    'қорғалатын табиғи ландшафт аймағы құрылыс салуды реттеу шекарасының сызығынан ' + fmtM(d[3]) + ' метр шегіне отырып, ескерткіштің құрылыс салуды реттеу аймағының шекараларына іргелес аумақты алып жатыр және ауданы ' + fmtHa(H.parts[3]) + ' гектарды құрайды. Оған тарих және ескерткіш үшін маңызды, жоғары ғылыми құндылыққа және жоғары эстетикалық сапаға ие табиғи орта енеді.',
  ];
  return {
    I, H, body,
    title: I.gen + ' қорғау аймағының, құрылыс салуды реттеу аймағының және қорғалатын табиғи ландшафт аймағының шекаралары',
    period: I.period,
    schemeTitle: [I.name, [I.oblast, I.district].filter(Boolean).join(', '), 'қорғау аймағы, құрылыс салуды реттеу аймағы мен қорғалатын табиғи ландшафт аймағының шекаралары'].filter(Boolean),
  };
}

/* ======================= Экспорт: GeoJSON ======================= */
const r7 = v => Math.round(v * 1e7) / 1e7;
function ringLL(pts, cw) {
  const a = pts.map(p => [r7(p.lon), r7(p.lat)]);
  if (cw) a.reverse();
  a.push(a[0].slice());
  return a;
}
const geoMeta = () => ({ generator: 'Mura GIS — Қорғау аймағы', rules: 'ҚР МСМ 14.04.2020 № 86 бұйрығы, 7–9-тармақтар', crs: 'EPSG:4326 (WGS 84)', created: new Date().toISOString() });
function geojson(Rx = R, I = info(), id = state.loadedId || null) {
  const H = haValues(Rx), full = $('qaGeoMode').value === 'full';
  const features = ZONES.map((z, i) => {
    const rings = [ringLL(Rx.ccw[i], false)];
    if (i > 0 && !full) rings.push(ringLL(Rx.ccw[i - 1], true));
    return {
      type: 'Feature',
      properties: {
        zone: z.key, zone_name: z.feature, monument_id: id, monument: I.name, period: I.period || null,
        district: I.district || null, distance_m: i ? Rx.dists[i] : 0,
        area_ha: full ? roundHa(Rx.outer[i]) : H.parts[i], zone_area_ha: H.parts[i], outer_area_ha: roundHa(Rx.outer[i]),
        geometry_mode: i === 0 ? 'polygon' : (full ? 'full' : 'ring'),
        stroke: z.color, 'stroke-width': 3, 'fill-opacity': 0,
      },
      geometry: { type: 'Polygon', coordinates: rings },
    };
  });
  return { type: 'FeatureCollection', name: I.name, metadata: geoMeta(), features };
}

/* ---------- Бірнеше сақталған ескерткіш: бір GeoJSON + QGIS стилі (.qml) ---------- */
/** QGIS ережелер ағашы: әр ескерткіш — бөлек тармақ, оның ішінде әр аймақ — бөлек құсбелгі. */
function qmlStyle(mons) {
  const rgba = (hex, a) => [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16)).join(',') + ',' + a;
  const q = v => "'" + String(v).replace(/'/g, "''") + "'";   // QGIS өрнегіндегі жол
  // Ескі (prop) және жаңа (Option) пішім қатар — QGIS 3.x-тің кез келген нұсқасы оқиды
  const opts = o => Object.entries(o).map(([k, v]) => '<prop k="' + k + '" v="' + v + '"/>').join('') +
    '<Option type="Map">' + Object.entries(o).map(([k, v]) => '<Option name="' + k + '" type="QString" value="' + v + '"/>').join('') + '</Option>';
  // QGIS әр ережеге жеке символ талап етеді (ортақ символ тек біріншісіне тиеді) — атауы: ескерткіш*4 + аймақ
  const symbol = (z, i, name) => '<symbol type="fill" name="' + name + '" alpha="1" clip_to_extent="1" force_rhr="0"><layer class="SimpleFill" enabled="1" locked="0" pass="0">' +
    opts({ color: rgba(z.color, i ? 0 : 90), style: i ? 'no' : 'solid', outline_color: rgba(z.color, 255), outline_style: 'solid',
      outline_width: i ? '0.8' : '0.6', outline_width_unit: 'MM', joinstyle: 'miter', offset: '0,0', offset_unit: 'MM' }) +
    '</layer></symbol>';
  const rules = mons.map((m, k) => '<rule key="m' + k + '" label="' + xml(m.name) + '" filter="' + xml('"monument_id" = ' + q(m.id)) + '">' +
    ZONES.map((z, i) => '<rule key="m' + k + 'z' + i + '" label="' + xml(z.feature) + '" symbol="' + (k * ZONES.length + i) + '" filter="' + xml('"zone" = ' + q(z.key)) + '"/>').join('') +
    '</rule>').join('');
  const symbols = mons.map((m, k) => ZONES.map((z, i) => symbol(z, i, k * ZONES.length + i)).join('')).join('');
  return "<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>\n<qgis version=\"3.28.0\" styleCategories=\"Symbology\">" +
    '<renderer-v2 type="RuleRenderer" symbollevels="0" enableorderby="0" forceraster="0" referencescale="-1">' +
    '<rules key="root">' + rules + '</rules><symbols>' + symbols + '</symbols></renderer-v2></qgis>\n';
}
/** Таңдалған жазбалардан ZIP: Qorgau_aimaqtary.geojson + аттас .qml (QGIS аттас стильді өзі қолданады). */
async function buildGeoBundle(records) {
  const fflate = await loadFflate();
  const features = [], mons = [], skipped = [];
  for (const rec of sortRecords(records)) {
    const Rk = recordZones(rec);
    if (!Rk || Rk.error) { skipped.push(rec.name); continue; }
    const I = infoFrom(rec.fields || {});
    features.push(...geojson(Rk, I, rec.id).features);
    mons.push({ id: rec.id, name: I.name });
  }
  if (!mons.length) throw new Error('Таңдалған жазбалардың ешқайсысынан аймақ есептелмеді.');
  const base = 'Qorgau_aimaqtary';
  const fc = { type: 'FeatureCollection', name: base, metadata: geoMeta(), features };
  const zip = fflate.zipSync({
    [base + '/' + base + '.geojson']: fflate.strToU8(JSON.stringify(fc, null, 2)),
    [base + '/' + base + '.qml']: fflate.strToU8(qmlStyle(mons)),
  }, { level: 6 });
  return { blob: new Blob([zip], { type: 'application/zip' }), count: mons.length, skipped };
}
function fileBaseOf(name) {
  return (String(name || '').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 80) || 'eskertkish') + '_qorgau_aimagy';
}
const fileBase = () => fileBaseOf(info().name);
function download(data, type, name) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ======================= Экспорт: сызба (canvas) ======================= */
function mercX(lon, z) { return (lon + 180) / 360 * 256 * 2 ** z; }
function mercY(lat, z) { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** z; }
/** Esri спутник суреті бар ең үлкен масштаб (кей өңірде 18-масштабта «Map data not yet available» шығады). */
const satZoomCache = new Map();
async function satMaxZoom(lat, lon, zTop = 18) {
  const key = lat.toFixed(3) + ',' + lon.toFixed(3) + ',' + zTop;
  if (satZoomCache.has(key)) return satZoomCache.get(key);
  let found = 13;
  for (let z = zTop; z >= 14; z--) {
    const x = Math.floor(mercX(lon, z) / 256), y = Math.floor(mercY(lat, z) / 256);
    try {
      const r = await fetch(SAT_URL.replace('/tile/{z}/{y}/{x}', '/tilemap/' + z + '/' + y + '/' + x + '/1/1'));
      const j = await r.json();
      if (j && Array.isArray(j.data) && j.data[0] === 1) { found = z; break; }
    } catch (e) { found = zTop; break; }             // тексеру мүмкін болмаса — әдепкі масштаб
  }
  satZoomCache.set(key, found);
  return found;
}
function loadImg(src) {
  return new Promise(res => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => res(im); im.onerror = () => res(null);
    im.src = src;
  });
}
async function renderScheme(fmt = 'image/png', Rx = R, sat = schemeIsSat()) {
  const R = Rx;                                   // төмендегі код жергілікті R-мен жұмыс істейді
  const outer = R.num[3];
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of outer) { minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat); minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon); }
  const pl = (maxLat - minLat) * 0.14, pn = (maxLon - minLon) * 0.14;
  minLat -= pl; maxLat += pl; minLon -= pn; maxLon += pn;
  const W = 2000, HMAX = 1800, ZMAX = sat ? await satMaxZoom((minLat + maxLat) / 2, (minLon + maxLon) / 2) : 19;
  let z = ZMAX;
  for (; z > 3; z--) {
    const w = mercX(maxLon, z) - mercX(minLon, z), h = mercY(minLat, z) - mercY(maxLat, z);
    if (w <= W && h <= HMAX) break;
  }
  const x0 = mercX(minLon, z), y0 = mercY(maxLat, z), x1 = mercX(maxLon, z), y1 = mercY(minLat, z);
  const s = Math.min(W / (x1 - x0), HMAX / (y1 - y0));
  const cw = Math.round((x1 - x0) * s), ch = Math.round((y1 - y0) * s);
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const g = cv.getContext('2d');
  g.fillStyle = sat ? '#5b5f50' : '#eceae4'; g.fillRect(0, 0, cw, ch);
  const jobs = [];
  for (let tx = Math.floor(x0 / 256); tx <= Math.floor(x1 / 256); tx++) for (let ty = Math.floor(y0 / 256); ty <= Math.floor(y1 / 256); ty++) {
    const url = (sat ? SAT_URL : OSM_URL).replace('{z}', z).replace('{x}', tx).replace('{y}', ty);
    jobs.push(loadImg(url).then(im => { if (im) g.drawImage(im, (tx * 256 - x0) * s, (ty * 256 - y0) * s, 256 * s + 0.6, 256 * s + 0.6); }));
  }
  await Promise.all(jobs);
  const P = p => [(mercX(p.lon, z) - x0) * s, (mercY(p.lat, z) - y0) * s];
  const lw = Math.max(4, cw / 380), fs = Math.round(Math.max(22, cw / 62));
  g.lineJoin = 'round';
  for (let i = 3; i >= 0; i--) {
    const pts = R.num[i].map(P);
    g.beginPath(); pts.forEach((q, k) => k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = lw + 3; g.stroke();
    g.strokeStyle = ZONES[i].color; g.lineWidth = lw; g.stroke();
  }
  g.font = 'bold ' + fs + 'px "Times New Roman", Times, serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 3; i >= 0; i--) {
    const pts = R.num[i].map(P);
    const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length, cy = pts.reduce((a, q) => a + q[1], 0) / pts.length;
    const off = i === 0 ? fs * 0.75 : fs * 0.95;
    pts.forEach((q, k) => {
      const u = unit(q[0] - cx, q[1] - cy), x = q[0] + u[0] * off, y = q[1] + u[1] * off;
      g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(String(k + 1), x, y);
      g.fillStyle = ZONES[i].color; g.fillText(String(k + 1), x, y);
    });
  }
  // Масштаб сызғышы
  const mpp = 156543.03392 * Math.cos(((minLat + maxLat) / 2) * Math.PI / 180) / 2 ** z / s;
  const want = cw * 0.18 * mpp;
  const nice = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].reduce((b, v) => (v <= want ? v : b), 5);
  const bw = nice / mpp, bx = 30, by = ch - 40, sf = Math.round(fs * 0.75);
  g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(bx - 14, by - sf - 22, bw + 28 + sf * 3, sf + 44);
  g.fillStyle = '#111'; g.fillRect(bx, by, bw, 6); g.fillRect(bx, by - 8, 3, 14); g.fillRect(bx + bw - 3, by - 8, 3, 14);
  g.font = 'bold ' + sf + 'px "Times New Roman", serif'; g.textAlign = 'left'; g.textBaseline = 'bottom';
  g.fillText(nice >= 1000 ? (nice / 1000) + ' км' : nice + ' м', bx + bw + 10, by + 8);
  // Солтүстік бағыты
  const nx = cw - 48, ny = 30, na = fs * 1.6;
  g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(nx, ny + na / 2 + 6, na * 0.75, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#111'; g.beginPath(); g.moveTo(nx, ny); g.lineTo(nx + na * 0.32, ny + na); g.lineTo(nx, ny + na * 0.75); g.lineTo(nx - na * 0.32, ny + na); g.closePath(); g.fill();
  g.font = 'bold ' + sf + 'px "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'top';
  g.fillText('С', nx, ny + na + 4);
  // Карта дереккөзі
  const attr = sat ? 'Сурет: © Esri, Maxar, Earthstar Geographics' : '© OpenStreetMap contributors';
  g.font = Math.round(sf * 0.7) + 'px Arial, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'bottom';
  const aw = g.measureText(attr).width;
  g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(cw - aw - 16, ch - sf - 4, aw + 16, sf + 4);
  g.fillStyle = '#222'; g.fillText(attr, cw - 8, ch - 4);
  let blob;
  try { blob = await new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('toBlob'))), fmt, 0.9)); }
  catch (e) { throw new Error('Сызбаны суретке айналдыру мүмкін болмады (карта тайлдары бұғатталған). «Карта қабаттары» мәзірінен OpenStreetMap таңдап, қайталап көріңіз.'); }
  return { blob, w: cw, h: ch };
}

/* ======================= Экспорт: DOCX ======================= */
function loadFflate() {
  if (globalThis.fflate) return Promise.resolve(globalThis.fflate);
  return new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = globalThis.QA_FFLATE || 'assets/koordinat/vendor/fflate.js';
    sc.onload = () => (globalThis.fflate ? res(globalThis.fflate) : rej(new Error('fflate жүктелмеді')));
    sc.onerror = () => rej(new Error('fflate жүктелмеді'));
    document.head.appendChild(sc);
  });
}
const xml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function run(text, o = {}) {
  const pr = (o.b ? '<w:b/><w:bCs/>' : '') + (o.color ? '<w:color w:val="' + o.color + '"/>' : '') + (o.sz ? '<w:sz w:val="' + o.sz + '"/><w:szCs w:val="' + o.sz + '"/>' : '');
  return String(text).split('\n').map((t, i) => (i ? '<w:r><w:br/></w:r>' : '') + '<w:r>' + (pr ? '<w:rPr>' + pr + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + xml(t) + '</w:t></w:r>').join('');
}
function para(runs, o = {}) {
  return '<w:p><w:pPr>' + (o.keepNext ? '<w:keepNext/>' : '') + (o.pageBreak ? '<w:pageBreakBefore/>' : '') +
    '<w:spacing w:before="0" w:after="' + (o.after || 0) + '" w:line="240" w:lineRule="auto"/>' +
    (o.indent ? '<w:ind w:firstLine="709"/>' : o.hang ? '<w:ind w:left="' + o.hang + '" w:hanging="' + o.hang + '"/>' : '') + '<w:jc w:val="' + (o.align || 'both') + '"/></w:pPr>' + runs + '</w:p>';
}
const CONTENT_W = 9354; // A4: 11906 − сол жақ 1701 − оң жақ 851 (twip)
function tableXml(cols, rows, borders) {
  const b = borders ? '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(k => '<w:' + k + ' w:val="single" w:sz="4" w:space="0" w:color="000000"/>').join('') + '</w:tblBorders>' : '';
  const cell = (c, w) => '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + (c.span ? '<w:gridSpan w:val="' + c.span + '"/>' : '') + (c.shade ? '<w:shd w:val="clear" w:color="auto" w:fill="' + c.shade + '"/>' : '') + '</w:tcPr>' + c.xml + '</w:tc>';
  return '<w:tbl><w:tblPr><w:tblW w:w="' + CONTENT_W + '" w:type="dxa"/>' + b + '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
    '<w:tblGrid>' + cols.map(w => '<w:gridCol w:w="' + w + '"/>').join('') + '</w:tblGrid>' +
    rows.map(r => '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + (() => { let ci = 0; return r.map(c => { const span = c.span || 1; const w = cols.slice(ci, ci + span).reduce((a, v) => a + v, 0); ci += span; return cell(c, w); }).join(''); })() + '</w:tr>').join('') +
    '</w:tbl>';
}
function imageXml(cx, cy, idx = 1) {
  return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' +
    '<wp:docPr id="' + idx + '" name="Сызба ' + idx + '"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="' + idx + '" name="scheme' + idx + '.jpg"/><pic:cNvPicPr/></pic:nvPicPr>' +
    '<pic:blipFill><a:blip r:embed="rIdImg' + idx + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
    '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>' +
    '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
}

/** Оң жақ шеттегі қосымша белгісі: «Ақтөбе облысы әкімдігінің / 2024 жылғы 19 наурыздағы / № 66 қаулысына N-қосымша». */
const DECREE_DEFAULT = 'Ақтөбе облысы әкімдігінің\n2024 жылғы 19 наурыздағы\n№ 66 қаулысына';
/** Мәтін жолдарының Times New Roman 14 pt-тегі ені, twip-пен (браузердің өз қаріпімен өлшенеді). */
let measureCtx = null;
function textWidthTwips(lines) {
  measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
  measureCtx.font = '14pt "Times New Roman", Times, serif';
  const px = Math.max(...lines.map(l => measureCtx.measureText(l).width));   // CSS px (1px = 0,75 pt = 15 twip)
  return Math.ceil(px * 15);
}
/**
 * Блок оң жақ шетке тығыз қойылады: сол жақ шегінісі = мәтін ені − ең ұзын жолдың ені (аз қор қалдырып),
 * жолдар блок ішінде ортасынан тураланады (үлгідегідей). Сонда ең ұзын жол оң жақ шетпен тұспа-тұс келеді.
 */
function appendixXml(n, decree, pageBreak) {
  const text = String(decree || DECREE_DEFAULT).trim().replace(/\r/g, '') + ' ' + n + '-қосымша';
  const lines = text.split('\n').map(s => s.trim());
  const w = Math.round(textWidthTwips(lines) * 1.04) + 60;                        // Word-тағы аздаған айырмаға қор
  const left = Math.max(0, Math.min(CONTENT_W - 1500, CONTENT_W - w));
  return '<w:p><w:pPr>' + (pageBreak ? '<w:pageBreakBefore/>' : '') + '<w:spacing w:before="0" w:after="360" w:line="240" w:lineRule="auto"/>' +
    '<w:ind w:left="' + left + '" w:right="0"/><w:jc w:val="center"/></w:pPr>' + run(lines.join('\n')) + '</w:p>';
}

/**
 * Бір ескерткіштің бөлімі: мәтін беті + сызба беті (+ қаласа координаттар кестесі).
 * o.first — құжаттың алғашқы бөлімі (бет үзілісі қойылмайды); o.appendix — [мәтін нөмірі, сызба нөмірі] не null.
 */
function sectionXml(T, Rx, img, idx, o = {}) {
  const H = T.H;
  let b = '';
  const ap = o.appendix;
  if (ap) b += appendixXml(ap[0], o.decree, !o.first);
  b += para(run(T.title, { b: true }), { align: 'center', pageBreak: !ap && !o.first });
  b += para('', {});
  if (T.period) { b += para(run('(' + T.period + ')', { b: true }), { align: 'center' }); b += para('', {}); }
  for (const t of T.body) b += para(run(t), { indent: true });

  // Сызба беті
  if (ap) b += appendixXml(ap[1], o.decree, true);
  b += para(run(T.schemeTitle.join('\n'), { b: true }), { align: 'center', pageBreak: !ap, after: 160, keepNext: true });
  const EMU_CM = 360000;
  let wcm = 16.5, hcm = wcm * img.h / img.w;
  const hMax = ap ? 15.5 : 17.5;                 // қосымша белгісі орын алады
  if (hcm > hMax) { hcm = hMax; wcm = hcm * img.w / img.h; }
  b += para(imageXml(Math.round(wcm * EMU_CM), Math.round(hcm * EMU_CM), idx), { align: 'center', after: 160, keepNext: true });
  const sz = 24;
  const left = para(run('шартты белгілері:', { b: true, sz }), { align: 'left', after: 60 }) +
    ZONES.map(z => para(run('━━━━━', { b: true, color: z.docColor, sz }) + '<w:r><w:tab/></w:r>' + run(z.border, { sz }), { align: 'left', hang: 1500 })).join('');
  const right = para(run('ауданы:', { b: true, sz }), { align: 'left', after: 60 }) +
    ZONES.map((z, i) => para(run(z.area + ' – ' + fmtHa(H.parts[i]) + ' га', { sz }), { align: 'left' })).join('');
  b += tableXml([4950, CONTENT_W - 4950], [[{ xml: left }, { xml: right }]], false);

  if (o.coordTable) {
    b += para(run('Бұрылыс нүктелерінің координаттары (WGS 84)', { b: true }), { align: 'center', pageBreak: true, after: 160 });
    const cols = [800, 1900, 1900, 2377, 2377];
    const c = (t, oo = {}) => ({ xml: para(run(t, { sz: 22, b: oo.b }), { align: oo.align || 'center' }), span: oo.span, shade: oo.shade });
    const rows = [[c('№', { b: true, shade: 'EDEDED' }), c('Ендік, °', { b: true, shade: 'EDEDED' }), c('Бойлық, °', { b: true, shade: 'EDEDED' }), c('Ендік (° ′ ″)', { b: true, shade: 'EDEDED' }), c('Бойлық (° ′ ″)', { b: true, shade: 'EDEDED' })]];
    ZONES.forEach((z, i) => {
      rows.push([c(z.feature + (i ? ' (' + fmtM(Rx.dists[i]) + ' м)' : ''), { b: true, span: 5, align: 'left', shade: 'F7F7F7' })]);
      Rx.num[i].forEach((p, k) => rows.push([c(String(k + 1)), c(comma(p.lat.toFixed(6))), c(comma(p.lon.toFixed(6))), c(dms(p.lat) + ' N'), c(dms(p.lon) + ' E')]));
    });
    b += tableXml(cols, rows, true);
  }
  return b;
}

/** Дайын дене (body XML) мен суреттерден DOCX буу. pics — Uint8Array тізімі (JPEG), реті rIdImg1…N. */
async function packDocx(body, pics, title) {
  const fflate = await loadFflate();
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const doc = HEAD + '<w:document ' + NS + '><w:body>' + body +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="851" w:bottom="1134" w:left="1701" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>';
  const styles = HEAD + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="28"/><w:szCs w:val="28"/><w:lang w:val="kk-KZ" w:eastAsia="ru-RU" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
    '</w:styles>';
  const ct = HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';
  const rels = HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';
  const docRels = HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    pics.map((_, i) => '<Relationship Id="rIdImg' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/scheme' + (i + 1) + '.jpg"/>').join('') +
    '</Relationships>';
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const core = HEAD + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>' + xml(title) + '</dc:title><dc:language>kk-KZ</dc:language>' +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified></cp:coreProperties>';
  const u = fflate.strToU8;
  const files = {
    '[Content_Types].xml': u(ct), '_rels/.rels': u(rels), 'docProps/core.xml': u(core),
    'word/document.xml': u(doc), 'word/styles.xml': u(styles), 'word/_rels/document.xml.rels': u(docRels),
  };
  pics.forEach((p, i) => { files['word/media/scheme' + (i + 1) + '.jpg'] = [p, { level: 0 }]; });
  const zip = fflate.zipSync(files, { level: 6 });
  return new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
const blobBytes = async b => new Uint8Array(await b.arrayBuffer());

/** Ағымдағы ескерткіштің жеке DOCX-і (қаулы белгісінсіз). */
async function buildDocx() {
  const T = docText();
  const img = await renderScheme('image/jpeg');
  const body = sectionXml(T, R, img, 1, { first: true, coordTable: $('qaCoordTable').checked });
  return packDocx(body, [await blobBytes(img.blob)], T.title);
}

/** Сақталған жазбадан аймақтарды есептеу. */
function recordZones(rec) {
  const f = rec.fields || {};
  const D = ['d1', 'd2', 'd3'].map(k => parseFloat(String(f[k] ?? '').replace(',', '.')));
  if (D.some(d => !(d > 0))) return { error: 'dist' };
  return computeZones((rec.pts || []).map(p => ({ lat: +p.lat, lon: +p.lon })), D, rec.custom);
}
const collator = new Intl.Collator('kk', { sensitivity: 'base', numeric: true });
/** Құжаттағы рет: аудан, содан кейін атау (ауданы жоқтар соңында). */
function sortRecords(list) {
  return list.slice().sort((a, b) => {
    const da = String(a.district || ''), db = String(b.district || '');
    if (!da !== !db) return da ? -1 : 1;
    return collator.compare(da, db) || collator.compare(String(a.name || ''), String(b.name || ''));
  });
}

/**
 * Бірнеше сақталған аймақтан бір DOCX: әр ескерткішке екі қосымша —
 * тақ нөмір (start, start+2, …) мәтін беті, жұп нөмір (start+1, …) сызба беті.
 */
async function buildCombined(records, opt, progress) {
  const list = sortRecords(records);
  let body = '';
  const pics = [], skipped = [];
  let k = 0;
  for (const rec of list) {
    progress && progress(k + 1, list.length, rec.name);
    const Rk = recordZones(rec);
    if (!Rk || Rk.error) { skipped.push(rec.name); continue; }
    const T = docText(Rk, infoFrom(rec.fields || {}));
    const img = await renderScheme('image/jpeg', Rk, opt.sat);
    pics.push(await blobBytes(img.blob));
    const n = opt.start + 2 * k;
    body += sectionXml(T, Rk, img, pics.length, { first: k === 0, appendix: [n, n + 1], decree: opt.decree, coordTable: opt.coordTable });
    k++;
  }
  if (!k) throw new Error('Таңдалған жазбалардың ешқайсысынан аймақ есептелмеді.');
  const blob = await packDocx(body, pics, 'Қорғау аймақтары, ' + opt.start + '–' + (opt.start + 2 * k - 1) + '-қосымшалар');
  return { blob, count: k, skipped, last: opt.start + 2 * k - 1 };
}

/* ======================= Координаталарды енгізу ======================= */
/*
 * Қабылданатын пішімдер (бір мән):
 *   ондық градус ........... 50.412345 · 50,412345 · 50.412345° · N50.412345 · -57.1
 *   градус + ондық минут ... 50°24.7407′ · 50 24.7407 · 50:24.7407 · 50°24,7407'N
 *   градус + минут + секунд  50°24′44.44″ · 50 24 44.44 · 50:24:44.44 · 50°24'44,44"С · 50 24 44.44 с.ш.
 * Жарты шар әріптері: N/С (солтүстік), S/Ю/О (оңтүстік), E/В/Ш (шығыс), W/З/Б (батыс).
 */
const LETTER_RE = /[A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]+/g;
const NEG_HEMI = 'SWЮЗОБ', LON_HEMI = 'EWЕВЗШБ';     // «Е» — кириллица (латын E-ге ұқсас)
function normCoord(s) {
  return String(s ?? '')
    .replace(/[−–—]/g, '-').replace(/''/g, '″').replace(/[‘’`´′]/g, '\'').replace(/[“”″]/g, '"').replace(/[º˚]/g, '°')
    .replace(/(\d),(\d)/g, '$1.$2').replace(/\s+/g, ' ').trim();
}
/** Бір координата мәні → { v } немесе { err }. */
export function parseOne(str) {
  let s = normCoord(str);
  if (!s) return { err: 'бос' };
  const letters = (s.match(LETTER_RE) || []).join('').toUpperCase();
  const hemi = letters.charAt(0);
  s = s.replace(LETTER_RE, ' ').replace(/\./g, (m, i, all) => (/\d/.test(all[i - 1] || '') && /\d/.test(all[i + 1] || '') ? '.' : ' '));
  const toks = [...s.matchAll(/(-?\+?\d+(?:\.\d+)?)\s*([°'"])?/g)].map(m => ({ v: parseFloat(m[1].replace('+', '')), neg: m[1].startsWith('-'), mark: m[2] || '' }));
  if (!toks.length) return { err: 'сан табылмады' };
  if (toks.length > 3) return { err: 'сан тым көп' };
  // Белгісі барлары (° ′ ″) өз орнына, белгісіздері қалған орындарға ретімен: градус → минут → секунд
  const slot = [null, null, null], IDX = { '°': 0, '\'': 1, '"': 2 };
  for (const t of toks) if (t.mark) { if (slot[IDX[t.mark]]) return { err: 'белгі қайталанады' }; slot[IDX[t.mark]] = t; }
  for (const t of toks) if (!t.mark) { const k = slot.indexOf(null); if (k < 0) return { err: 'сан тым көп' }; slot[k] = t; }
  if (!slot[0]) return { err: 'градус жоқ' };
  if (slot[2] && !slot[1]) return { err: 'минут жоқ' };
  let d = slot[0].v, m = slot[1]?.v ?? 0, sec = slot[2]?.v ?? 0;
  const neg = toks[0].neg || (hemi !== '' && NEG_HEMI.includes(hemi));
  d = Math.abs(d);
  if (toks.length > 1 && !Number.isInteger(d)) return { err: 'минут не секунд бар болса, градус бүтін сан болуы керек' };
  if (m < 0 || m >= 60) return { err: 'минут 0–59 аралығында болуы керек' };
  if (sec < 0 || sec >= 60) return { err: 'секунд 0–59,99 аралығында болуы керек' };
  if (toks.length === 3 && !Number.isInteger(m)) return { err: 'секунд бар болса, минут бүтін сан болуы керек' };
  const v = d + m / 60 + sec / 3600;
  return { v: neg ? -v : v, hemi, isLon: hemi !== '' && LON_HEMI.includes(hemi) };
}
function parseCoordValue(s) { const r = parseOne(s); return r.err ? NaN : r.v; }

/** Бір жолдағы ендік пен бойлықты бөліп алу → [мәтін1, мәтін2] немесе null. */
function splitPair(line) {
  let s = normCoord(line).replace(/^(№\s*)?\d{1,4}\s*[).:\-]\s+/, '');      // «1) …», «№2. …»
  // 1) Анық бөлгіштер
  for (const sep of [/\s*[;\t|]\s*/, /\s*,\s+/, /\s*\/\s*/]) {
    const parts = s.split(sep).filter(p => /\d/.test(p));
    if (parts.length === 2) return parts;
    if (parts.length === 3 && /^\s*\d{1,4}\s*$/.test(parts[0])) return parts.slice(1);
  }
  // 2) Жарты шар әріптері (N50 … E57 немесе 50 … N 57 … E)
  const hemiRe = /(?:^|[\s\d°'"])([NSEWСЮЕВЗШБО])(?:\.?\s*[шдШД]\.?)?(?=[\s\d]|$)/gi;
  const hs = [...s.matchAll(hemiRe)];
  if (hs.length >= 2) {
    const firstDigit = s.search(/\d/), pos1 = hs[0].index + hs[0][0].indexOf(hs[0][1]);
    if (pos1 < firstDigit) {                                          // префикс түрі
      const pos2 = hs[1].index + hs[1][0].indexOf(hs[1][1]);
      return [s.slice(0, pos2), s.slice(pos2)];
    }
    const end1 = hs[0].index + hs[0][0].length;                       // суффикс түрі
    return [s.slice(0, end1), s.slice(end1)];
  }
  // 3) Градус белгілері: екінші «°» алдынан бөлеміз
  const degs = [...s.matchAll(/-?\d+(?:\.\d+)?\s*°/g)];
  if (degs.length >= 2) return [s.slice(0, degs[1].index), s.slice(degs[1].index)];
  // 4) Сандар саны: 2 → ондық; 4 → градус+минут; 6 → градус+минут+секунд (тақ болса — басындағы реттік нөмір)
  let nums = [...s.matchAll(/-?\d+(?:\.\d+)?/g)].map(m => m[0]);
  if (nums.length % 2 === 1 && nums.length >= 3 && /^\d{1,4}$/.test(nums[0])) nums = nums.slice(1);
  if ([2, 4, 6].includes(nums.length)) { const h = nums.length / 2; return [nums.slice(0, h).join(' '), nums.slice(h).join(' ')]; }
  return null;
}

/** Қазақстан шегі (шамамен): ендік 40,5–55,5; бойлық 46,4–87,4. Ендік пен бойлық ауысып кетсе — түзетеміз. */
const inLat = v => v >= 40.5 && v <= 55.5, inLon = v => v >= 46.4 && v <= 87.4;
function fixOrder(lat, lon) {
  if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) return { lat: lon, lon: lat, swapped: true };
  if (!inLat(lat) && inLon(lat) && inLat(lon)) return { lat: lon, lon: lat, swapped: true };
  return { lat, lon, swapped: false };
}
/** Жұп (ендік, бойлық) → { lat, lon, swapped } немесе { err }. */
function parsePair(a, b) {
  const A = parseOne(a), B = parseOne(b);
  if (A.err) return { err: 'ендік: ' + A.err };
  if (B.err) return { err: 'бойлық: ' + B.err };
  let lat = A.v, lon = B.v, swapped = false;
  if (A.isLon && B.hemi && !B.isLon) { [lat, lon] = [lon, lat]; swapped = true; }
  else { const f = fixOrder(lat, lon); lat = f.lat; lon = f.lon; swapped = f.swapped; }
  if (Math.abs(lat) > 90) return { err: 'ендік ±90° шегінен асады' };
  if (Math.abs(lon) > 180) return { err: 'бойлық ±180° шегінен асады' };
  return { lat, lon, swapped };
}
function parseLines(text) {
  const out = [], bad = [];
  text.split(/\n+/).forEach((raw, i) => {
    if (!raw.trim()) return;
    const pair = splitPair(raw);
    const r = pair ? parsePair(pair[0], pair[1]) : { err: 'ендік пен бойлық бөлінбеді' };
    if (r.err) bad.push((i + 1) + '-жол: ' + r.err); else out.push({ lat: r.lat, lon: r.lon });
  });
  return { pts: out, bad };
}

/* ---------- Кестедегі пішім ---------- */
const FMT_KEY = 'qa-coord-fmt';
let coordFmt = 'dd';
try { coordFmt = localStorage.getItem(FMT_KEY) || 'dd'; } catch (e) { /* елемейміз */ }
function splitDeg(v, minDec, secDec) {
  const a = Math.abs(v);
  let d = Math.floor(a), mf = (a - d) * 60;
  if (secDec === undefined) {
    let m = Number(mf.toFixed(minDec));
    if (m >= 60) { m = 0; d++; }
    return { d, m };
  }
  let m = Math.floor(mf), s = Number(((mf - m) * 60).toFixed(secDec));
  if (s >= 60) { s = 0; m++; }
  if (m >= 60) { m = 0; d++; }
  return { d, m, s };
}
export function fmtCoord(v, mode = coordFmt) {
  const sign = v < 0 ? '-' : '';
  if (mode === 'dm') { const x = splitDeg(v, 4); return sign + x.d + '°' + x.m.toFixed(4).padStart(7, '0') + '′'; }
  if (mode === 'dms') { const x = splitDeg(v, 0, 3); return sign + x.d + '°' + String(x.m).padStart(2, '0') + '′' + x.s.toFixed(3).padStart(6, '0') + '″'; }
  return v.toFixed(7);
}
function describe(r, axis) {
  if (r.err) return '<span class="qa-bad">' + esc(r.err) + '</span>';
  const v = axis === 'lat' && r.lat !== undefined ? r.lat : axis === 'lon' && r.lon !== undefined ? r.lon : r.v;
  return '= ' + v.toFixed(7) + '° · ' + fmtCoord(v, 'dm') + ' · ' + fmtCoord(v, 'dms');
}
function importGeojson(o) {
  const feats = o.type === 'FeatureCollection' ? o.features : o.type === 'Feature' ? [o] : [{ type: 'Feature', properties: {}, geometry: o }];
  const pick = feats.find(f => f?.properties?.zone === 'monument') || feats.find(f => /Polygon/.test(f?.geometry?.type || '')) || feats.find(f => f?.geometry?.type === 'LineString');
  let ring = null;
  if (pick) {
    const g = pick.geometry;
    ring = g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates[0][0] : g.coordinates;
    const p = pick.properties || {};
    if (p.monument && !F.name.value.trim()) { F.name.value = p.monument; syncGen(); }
  } else {
    ring = feats.filter(f => f?.geometry?.type === 'Point').map(f => f.geometry.coordinates);
  }
  if (!ring || !ring.length) throw new Error('Файлда полигон не нүктелер табылмады.');
  let pts = ring.map(c => ({ lat: +c[1], lon: +c[0] })).filter(p => isFinite(p.lat) && isFinite(p.lon));
  if (pts.length > 1) { const a = pts[0], z = pts[pts.length - 1]; if (a.lat === z.lat && a.lon === z.lon) pts.pop(); }
  return pts;
}

/* ======================= Оқиғалар ======================= */
function syncGen() { if (!genTouched) F.gen.value = genitive(F.name.value); }
F.name.addEventListener('input', () => { syncGen(); recompute(true); });
F.gen.addEventListener('input', () => { genTouched = F.gen.value.trim() !== ''; recompute(true); });
for (const k of ['period', 'oblast', 'district', 'place', 'desc']) F[k].addEventListener('input', () => recompute(true));
F.district.addEventListener('change', () => recompute(true));
F.type.addEventListener('change', () => { applyRule(true); recompute(true); });
F.height.addEventListener('input', () => { applyRule(true); recompute(true); });
for (const k of ['d1', 'd2', 'd3']) F[k].addEventListener('input', () => recompute(true));
F.d1.addEventListener('change', () => { // 8–9-тармақ: реттеу мен ландшафт аймақтары қорғау аймағына тең
  if (F.type.value === 'custom') { F.d2.value = F.d1.value; F.d3.value = F.d1.value; recompute(true); }
});

$('qaAddMode').addEventListener('click', () => setMode(tool.mode === 'add' ? 'none' : 'add'));
$('qaUndo').addEventListener('click', () => { if (state.pts.length) { state.pts.pop(); recompute(true, true); } });
$('qaSort').addEventListener('click', () => {
  if (state.pts.length < 3) return;
  const cx = state.pts.reduce((s, p) => s + p.lon, 0) / state.pts.length, cy = state.pts.reduce((s, p) => s + p.lat, 0) / state.pts.length;
  const k = Math.cos(cy * Math.PI / 180);
  const bearing = p => (Math.atan2((p.lon - cx) * k, p.lat - cy) * 180 / Math.PI + 360) % 360;
  // Ортасынан қарағандағы азимут бойынша — сағат тілімен; батыс-солтүстік-батыстағы нүктеден бастап
  const off = b => (b - 285 + 360) % 360;
  state.pts.sort((a, b) => off(bearing(a)) - off(bearing(b)));
  recompute(true, true);
  toast('Нүктелер сағат тілімен ретке келтірілді.');
});
$('qaFit').addEventListener('click', fit);
$('qaClear').addEventListener('click', async () => {
  if (!state.pts.length || !(await ask('Барлық нүктені өшіресіз бе?', { ok: 'Өшіру', danger: true }))) return;
  state.pts = []; recompute(true, true);
});
$('qaPasteRun').addEventListener('click', () => {
  const { pts, bad } = parseLines($('qaPasteText').value);
  $('qaPasteErr').innerHTML = bad.length ? 'Оқылмаған жолдар:<br>' + bad.map(esc).join('<br>') : '';
  if (!pts.length) { toast('Мәтіннен координата табылмады.', true); return; }
  state.pts = pts; recompute(true, true); fit();
  toast(pts.length + ' нүкте енгізілді' + (bad.length ? ', ' + bad.length + ' жол оқылмады.' : '.'), bad.length > 0);
});

/* ---------- Координата өрістері арқылы нүкте қосу ---------- */
const inLatEl = $('qaInLat'), inLonEl = $('qaInLon');
function readInputs() {
  const a = inLatEl.value.trim(), b = inLonEl.value.trim();
  if (a && !b) {                                    // екеуі бір өріске қойылса («50.41 57.04»)
    const pair = splitPair(a);
    if (pair) return { ...parsePair(pair[0], pair[1]), both: true };
  }
  if (!a || !b) return null;
  return parsePair(a, b);
}
function previewInputs() {
  const a = inLatEl.value.trim(), b = inLonEl.value.trim();
  const r = readInputs();
  const mark = (el, ok) => { el.classList.toggle('is-ok', ok === true); el.classList.toggle('is-bad', ok === false); };
  if (r && r.both && !r.err) {
    $('qaInLatOk').innerHTML = describe(r, 'lat'); $('qaInLonOk').innerHTML = describe(r, 'lon');
    mark(inLatEl, true); mark(inLonEl, null); return;
  }
  const A = a ? parseOne(a) : null, B = b ? parseOne(b) : null;
  $('qaInLatOk').innerHTML = A ? describe(A) : '';
  $('qaInLonOk').innerHTML = B ? describe(B) : '';
  mark(inLatEl, A ? !A.err && Math.abs(A.v) <= 90 : null);
  mark(inLonEl, B ? !B.err && Math.abs(B.v) <= 180 : null);
}
/* «Көрсету»: енгізілген нүктеге картаны бағыттап, уақытша маркер қою (шекараға қосылмайды). */
function showFromInputs() {
  const r = readInputs();
  if (!r) { toast('Ендік пен бойлықты енгізіңіз.', true); (inLatEl.value.trim() ? inLonEl : inLatEl).focus(); return; }
  if (r.err) { toast('Координата дұрыс емес — ' + r.err, true); return; }
  tempLayer.clearLayers();
  const label = fmtCoord(r.lat, 'dd') + ', ' + fmtCoord(r.lon, 'dd') + ' · ' + fmtCoord(r.lat, 'dms') + ' N ' + fmtCoord(r.lon, 'dms') + ' E';
  L.marker([r.lat, r.lon], { keyboard: false, title: label, icon: L.divIcon({ className: '', html: '<div class="qa-tmark"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }) })
    .bindTooltip(esc(label), { permanent: true, direction: 'top', offset: [0, -10], className: 'qa-ttip' })
    .on('click', e => L.DomEvent.stopPropagation(e))
    .addTo(tempLayer);
  map.setView([r.lat, r.lon], Math.max(map.getZoom(), 16));
  $('qaInClear').hidden = false;
  const warn = !inLat(r.lat) || !inLon(r.lon);
  if (r.swapped || warn) toast((r.swapped ? 'Ендік пен бойлық орнын ауыстырдым. ' : '') + (warn ? 'Назар аударыңыз: нүкте Қазақстан аумағынан тыс.' : ''), warn);
}
function clearTemp() { tempLayer.clearLayers(); $('qaInClear').hidden = true; }
$('qaInGo').addEventListener('click', showFromInputs);
$('qaInClear').addEventListener('click', clearTemp);
inLatEl.addEventListener('input', previewInputs);
inLonEl.addEventListener('input', previewInputs);
function addFromInputs() {
  const r = readInputs();
  if (!r) { toast('Ендік пен бойлықты енгізіңіз.', true); (inLatEl.value.trim() ? inLonEl : inLatEl).focus(); return; }
  if (r.err) { toast('Координата дұрыс емес — ' + r.err, true); return; }
  const posSel = $('qaInPos'), pos = posSel.value === '' ? state.pts.length : Math.min(+posSel.value, state.pts.length);
  state.pts.splice(pos, 0, { lat: r.lat, lon: r.lon });
  clearTemp();
  recompute(true, true);
  if (state.pts.length === 1) map.setView([r.lat, r.lon], 17); else fit();
  inLatEl.value = ''; inLonEl.value = ''; previewInputs(); inLatEl.focus();
  const warn = !inLat(r.lat) || !inLon(r.lon);
  toast((pos + 1) + '-нүкте қосылды' + (r.swapped ? ' (ендік пен бойлық орнын ауыстырдым)' : '') + (warn ? '. Назар аударыңыз: нүкте Қазақстан аумағынан тыс.' : '.'), warn);
}
$('qaInAdd').addEventListener('click', addFromInputs);
for (const el of [inLatEl, inLonEl]) el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addFromInputs(); } });
function renderPosOptions() {
  const sel = $('qaInPos'), cur = sel.value;
  sel.innerHTML = '<option value="">соңына</option>' + state.pts.map((_, i) => '<option value="' + i + '">' + (i + 1) + '-нүктенің алдына</option>').join('');
  sel.value = [...sel.options].some(o => o.value === cur) ? cur : '';
}
const fmtSel = $('qaFmt');
fmtSel.value = coordFmt;
fmtSel.addEventListener('change', () => {
  coordFmt = fmtSel.value;
  try { localStorage.setItem(FMT_KEY, coordFmt); } catch (e) { /* елемейміз */ }
  renderTable();
});
$('qaGeoOpen').addEventListener('click', () => $('qaGeoFile').click());
$('qaGeoFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const pts = importGeojson(JSON.parse(await f.text()));
    state.pts = pts; state.custom = null; recompute(true, true); fit();
    toast(pts.length + ' нүкте файлдан алынды.');
  } catch (err) { toast('GeoJSON оқылмады: ' + err.message, true); }
});

$('qaSample').addEventListener('click', async () => {
  if (state.pts.length && !(await ask('Ағымдағы нүктелер мен деректер үлгімен ауыстырылады. Жалғастырасыз ба?', { ok: 'Ауыстыру' }))) return;
  state.loadedId = null; state.loadedName = '';
  F.name.value = 'Үлгі қорымы'; genTouched = false; syncGen();
  F.period.value = 'қола дәуірі'; F.oblast.value = 'Ақтөбе облысы';
  const opt = [...F.district.options].find(o => o.dataset.key === 'qargaly'); if (opt) F.district.value = opt.value;
  F.place.value = 'Егінді жылғасының жоғарғы оң жақ жағалауында (үлгі мәтін)';
  F.desc.value = 'Бейіт үш қорғаннан тұрады. Қорғандардың диаметрі 6–10 метр, биіктігі 0,2–0,3 метр (үлгі мәтін).';
  F.type.value = 'archeo'; applyRule(true);
  cleanSig = null; clearPreview();
  const c = { lat: 50.4123, lon: 57.0412 };
  state.pts = [[0.00062, -0.00035], [0.00068, -0.00012], [0.00030, 0.00095], [-0.00055, 0.00010], [-0.00060, -0.00020], [-0.00020, -0.00050]]
    .map(([a, b]) => ({ lat: c.lat + a, lon: c.lon + b }));
  state.custom = null;
  recompute(true, true); fit(); renderSaved();
});

function busy(t) { $('qaBusy').textContent = t || ''; for (const id of ['qaGeo', 'qaDocx', 'qaPng']) $(id).disabled = !!t || !(R && !R.error); }
$('qaGeo').addEventListener('click', () => {
  if (!R || R.error) return;
  download(JSON.stringify(geojson(), null, 2), 'application/geo+json', fileBase() + '.geojson');
});
$('qaPng').addEventListener('click', async () => {
  if (!R || R.error) return;
  busy('Сызба жасалып жатыр…');
  try { const im = await renderScheme(); download(im.blob, 'image/png', fileBase() + '_syzba.png'); }
  catch (e) { toast(e.message, true); }
  finally { busy(''); }
});
$('qaDocx').addEventListener('click', async () => {
  if (!R || R.error) return;
  busy('Құжат жасалып жатыр (карта суреті жүктелуде)…');
  try { download(await buildDocx(), '', fileBase() + '.docx'); toast('DOCX дайын.'); }
  catch (e) { toast('Құжат жасалмады: ' + e.message, true); }
  finally { busy(''); }
});

/* ======================= Барлығын тазалау ======================= */
// Беттің бастапқы (HTML-дегі) мәндері — сақталған жоба жүктелмей тұрып алынады
const DEFAULTS = Object.fromEntries(FIELD_KEYS.map(k => [k, F[k].value]));
function resetAll() {
  for (const k of FIELD_KEYS) F[k].value = DEFAULTS[k];
  genTouched = false;
  state.pts = []; state.custom = null;
  state.loadedId = null; state.loadedName = '';
  for (const id of ['qaPasteText', 'qaInLat', 'qaInLon']) $(id).value = '';
  $('qaPasteErr').textContent = '';
  $('qaInLatOk').innerHTML = ''; $('qaInLonOk').innerHTML = '';
  $('qaCoordTable').checked = false;
  $('qaGeoMode').value = 'ring';
  fmtSel.value = 'dd'; coordFmt = 'dd';
  setMode('none');                                // құралды пайдаланушы өзі таңдайды
  clearRuler();
  const paste = document.querySelector('.qa-paste'); if (paste) paste.open = false;
  try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(FMT_KEY); } catch (e) { /* елемейміз */ }
  applyRule(true);
  recompute(true, true);
  try { localStorage.removeItem(STORE_KEY); } catch (e) { /* recompute қайта сақтайды — бос жобаны да өшіреміз */ }
  clearTemp(); clearPreview();
  cleanSig = null; paintDirty();
  renderSaved();
  map.setView([48.6, 58.2], 6);
}
$('qaReset').addEventListener('click', async () => {
  if (!(await ask('Барлық нүктелер, атаулар мен енгізілген деректер өшіріліп, құрал бастапқы күйіне қайтарылады. Бұл әрекетті болдырмау мүмкін емес. Жалғастырасыз ба?', { ok: 'Тазалау', danger: true }))) return;
  resetAll();
  toast('Құрал тазартылды.');
});

/* ======================= Сақталған аймақтар ======================= */
// Сақтау: mura://app/api?v=1&op=list|save|delete — main/store.js (компьютердегі JSON файл).
async function api(op, data = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.append(k, v);
  let r;
  try { r = await fetch((globalThis.QA_API || 'mura://app/api?v=1') + '&op=' + op, { method: 'POST', body: fd }); }
  catch (e) { throw new Error('Сақтау қызметіне қосылу мүмкін болмады.'); }
  let j = null;
  try { j = await r.json(); } catch (e) { /* төменде */ }
  if (!j) throw new Error('Сақтау қызметінің жауабы оқылмады (' + r.status + ').');
  if (!j.ok) throw new Error(j.error || 'Белгісіз қате.');
  return j;
}

let saved = [];
let savedLoaded = false;
const selected = new Set();
const COMB_KEY = 'qa-combine';
const fmtDate = s => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('kk-KZ', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('kk-KZ', { hour: '2-digit', minute: '2-digit' }); };

function combStart() { const v = parseInt($('qaStart').value, 10); return v > 0 ? v : NaN; }

/* ---------- Тізім: іздеу және сұрыптау ---------- */
const TYPE_SHORT = { archeo: 'археологиялық ескерткіш', arch: 'сәулет ескерткіші', art: 'монументалды өнер', sacred: 'киелі объект', ensemble: 'ансамбль, кешен', custom: 'қолмен' };
const SORT_KEY = 'qa-saved-sort';
const savedQ = $('qaSavedQ'), savedSort = $('qaSavedSort');
try { const v = localStorage.getItem(SORT_KEY); if (v && [...savedSort.options].some(o => o.value === v)) savedSort.value = v; } catch (e) { /* елемейміз */ }
const lc = s => String(s ?? '').toLocaleLowerCase('kk');
/** Көрсетілетін жазбалар: іздеу сүзгісі + таңдалған сұрыптау («Аудан, атауы» — біріктірілген құжаттағы рет). */
function viewRecords() {
  const q = lc(savedQ.value.trim());
  const list = q ? saved.filter(r => { const f = r.fields || {}; return [r.name, r.district, f.place, f.desc, f.period].some(v => lc(v).includes(q)); }) : saved;
  if (savedSort.value === 'date') return list.slice().sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  if (savedSort.value === 'name') return list.slice().sort((a, b) => collator.compare(String(a.name || ''), String(b.name || '')));
  return sortRecords(list);
}
savedQ.addEventListener('input', renderSaved);
savedSort.addEventListener('change', () => { try { localStorage.setItem(SORT_KEY, savedSort.value); } catch (e) { /* елемейміз */ } renderSaved(); });

function renderSaved() {
  const box = $('qaSaved');
  for (const id of [...selected]) if (!saved.some(r => r.id === id)) selected.delete(id);
  $('qaSavedCount').textContent = saved.length;
  const visible = savedLoaded ? viewRecords() : [];
  if (!savedLoaded) box.innerHTML = '<div class="qa-empty">Жүктелуде…</div>';
  else if (!saved.length) box.innerHTML = '<div class="qa-empty">Сақталған аймақ жоқ. Шекараны белгілеп, «Сақтау» батырмасын басыңыз.</div>';
  else if (!visible.length) box.innerHTML = '<div class="qa-empty">«' + esc(savedQ.value.trim()) + '» бойынша ештеңе табылмады.</div>';
  else {
    const start = combStart();
    const order = sortRecords(saved.filter(r => selected.has(r.id))).map(r => r.id);
    box.innerHTML = visible.map(r => {
      const f = r.fields || {}, id = esc(r.id), nm = esc(r.name);
      const k = order.indexOf(r.id);
      const ap = k >= 0 && start > 0 ? (start + 2 * k) + '–' + (start + 2 * k + 1) + '-қосымша' : '';
      const cur = r.id === state.loadedId, prev = r.id === previewId;
      const meta = [r.district || 'аудан көрсетілмеген', (r.pts || []).length + ' нүкте', fmtDate(r.updated_at) + (r.updated_by ? ', ' + r.updated_by : '')].filter(Boolean).join(' · ');
      const zone = 'Аймақтар: ' + ['d1', 'd2', 'd3'].map(x => comma(String(f[x] ?? '—'))).join(' / ') + ' м' + (TYPE_SHORT[f.type] ? ' · ' + TYPE_SHORT[f.type] : '') + (f.period ? ' · ' + f.period : '');
      const desc = String(f.place || f.desc || '').trim();
      const Lg = r.custom ? checkLegal(r.pts, r.custom, f) : null, bad = Lg && !Lg.ok, acc = bad && !!r.custom.accepted;
      const legal = !r.custom ? '' : '<div class="qa-sc-legal' + (bad && !acc ? ' is-bad' : '') + '">' +
        (bad ? (acc ? 'Заңнамаға сәйкес емес — импортталған күйінде қалдырылған' : '⚠ Аймақтар заңнамаға сәйкес емес') : 'Аймақтар импортталған полигондардан') +
        (bad ? '<small>' + legalLines(Lg).filter((x, i) => Lg.items[i].status !== 'ok').map(esc).join('; ') + '</small>' : '') +
        '<span>' + (bad && !acc ? '<button type="button" class="lnk" data-legal-keep="' + id + '">Қалдыру</button>' : '') +
        '<button type="button" class="lnk" data-legal-recalc="' + id + '" title="Импортталған полигондарды алып тастап, аймақтарды ескерткіш аумағынан заң бойынша есептеу">Қайта есептеу</button></span></div>';
      return '<article class="qa-sc' + (cur ? ' is-current' : '') + (prev ? ' is-preview' : '') + '">' +
        '<input type="checkbox" data-sel="' + id + '"' + (selected.has(r.id) ? ' checked' : '') + ' aria-label="' + nm + ' — экспортқа таңдау">' +
        '<div class="qa-sc-main">' +
        '<button type="button" class="qa-sc-title" data-show="' + id + '" title="Картадан көрсету">' + nm + '</button>' +
        (cur ? '<span class="qa-badge qa-cur">ашық</span>' : '') + (ap ? '<span class="qa-badge qa-ap">' + ap + '</span>' : '') +
        '<div class="qa-sc-meta">' + esc(meta) + '</div>' +
        '<div class="qa-sc-meta">' + esc(zone) + '</div>' +
        (desc ? '<p class="qa-sc-desc">' + esc(desc) + '</p>' : '') + legal +
        '<div class="qa-sc-act">' +
        '<button type="button" class="lnk" data-show="' + id + '">Картадан көрсету</button>' +
        '<button type="button" class="lnk" data-open="' + id + '"' + (cur ? ' disabled title="Бұл жазба қазір ашық"' : '') + '>' + (cur ? 'Ашық' : 'Ашу / өңдеу') + '</button>' +
        '<button type="button" class="lnk" data-geo="' + id + '" title="Осы аймақты GeoJSON ретінде жүктеу">GeoJSON</button>' +
        '<button type="button" class="lnk lnk--danger" data-delrec="' + id + '">Өшіру</button>' +
        '</div></div></article>';
    }).join('');
  }
  const n = saved.filter(r => selected.has(r.id)).length;
  const vSel = visible.filter(r => selected.has(r.id)).length;
  $('qaSelAll').checked = visible.length > 0 && vSel === visible.length;
  $('qaSelAll').indeterminate = vSel > 0 && vSel < visible.length;
  $('qaSelAll').disabled = !visible.length;
  $('qaSelInfo').textContent = n ? 'Таңдалды: ' + n + ' / ' + saved.length : (saved.length ? 'Экспорт үшін белгілеңіз' : '');
  const start = combStart();
  // Бастапқы нөмір тақ болуы керек (тақ — мәтін беті, жұп — сызба беті). Қате өрістің астында тұрақты көрінеді.
  const startErr = !(start > 0) ? 'Бастапқы қосымша нөмірін енгізіңіз.'
    : start % 2 === 0 ? start + ' — жұп сан. Мәтін беті тақ нөмірде тұруы керек: ' + (start - 1 > 0 ? (start - 1) + ' немесе ' : '') + (start + 1) + ' қойыңыз.' : '';
  $('qaStartErr').textContent = startErr;
  $('qaStartErr').hidden = !startErr;
  $('qaStart').classList.toggle('is-bad', !!startErr);
  $('qaCombine').disabled = !n || !!startErr;
  $('qaCombine').textContent = 'DOCX біріктіру' + (n ? ' (' + n + ')' : '');
  $('qaCombine').title = !n ? 'Алдымен тізімнен аймақтарды белгілеңіз' : startErr || 'Таңдалғандарды бір DOCX құжатқа біріктіру';
  $('qaCombGeo').disabled = !n;
  $('qaCombGeo').textContent = 'GeoJSON + QML' + (n ? ' (' + n + ')' : '');
  $('qaCombInfo').textContent = !n ? '' : startErr ? 'Бастапқы қосымша нөмірін түзетіңіз (баптаулар).' : 'DOCX: ' + start + '–' + (start + 2 * n - 1) + '-қосымшалар';
  paintLoaded();
}
function paintLoaded() {
  const on = !!state.loadedId, nm = state.loadedName || F.name.value;
  $('qaLoaded').innerHTML = on ? 'Ашық жазба: <strong>' + esc(nm) + '</strong>' : 'Жаңа жазба';
  const t = on ? 'Өзгерістерді сақтау: «' + nm + '»' : 'Жаңа аймақ ретінде сақтау';
  $('qaSave').dataset.tip = t;
  $('qaSave').setAttribute('aria-label', t);
  $('qaSaveNew').hidden = !on;
}

async function refreshSaved() {
  try { const j = await api('list'); saved = j.items || []; savedLoaded = true; }
  catch (e) { savedLoaded = true; saved = []; renderSaved(); $('qaSaved').innerHTML = '<div class="qa-empty qa-bad">' + esc(e.message) + '</div>'; return; }
  const rec = state.loadedId ? saved.find(r => r.id === state.loadedId) : null;
  if (state.loadedId && !rec) { state.loadedId = null; state.loadedName = ''; cleanSig = null; save(); }
  if (rec && cleanSig === null) cleanSig = sigOf(rec.fields || {}, rec.pts, rec.custom);   // браузердегі жоба серверлік нұсқадан өзгеше ме
  paintDirty();
  renderSaved();
}

async function saveRecord(asNew) {
  if (!R || R.error) { toast('Сақтау үшін ескерткіш шекарасын (кемінде 4 нүкте) дұрыс белгілеңіз.', true); return; }
  if (!F.name.value.trim()) {
    toast('Ескерткіш атауын енгізіңіз («Мәліметтер»).', true);
    if (globalThis.QAUI) globalThis.QAUI.openPanel('info');
    F.name.focus(); return;
  }
  const id = asNew ? '' : (state.loadedId || '');
  const sb = $('qaSave'), btns = [sb, $('qaSaveNew')];
  btns.forEach(b => { b.disabled = true; });
  sb.classList.add('is-busy'); sb.setAttribute('aria-busy', 'true');
  try {
    const j = await api('save', { data: JSON.stringify({ id, fields: fieldValues(), pts: state.pts, custom: state.custom }) });
    saved = j.items || saved; savedLoaded = true;
    state.loadedId = j.id; state.loadedName = F.name.value.trim();
    save(); markClean(); renderSaved();
    toast(id ? 'Өзгерістер сақталды.' : 'Аймақ сақталды.');
  } catch (e) { toast('Сақталмады: ' + e.message, true); }
  finally { btns.forEach(b => { b.disabled = false; }); sb.classList.remove('is-busy'); sb.removeAttribute('aria-busy'); }
}
$('qaSave').addEventListener('click', () => saveRecord(false));
$('qaSaveNew').addEventListener('click', () => saveRecord(true));

/* ---------- Сақталған аймақты картадан көрсету (ағымдағы жұмысты ауыстырмай) ---------- */
let previewId = null;
function clearPreview() { previewLayer.clearLayers(); previewId = null; $('qaPreviewChip').hidden = true; }
function closePanelOnMobile() { const U = globalThis.QAUI; if (U && U.isMobile()) U.closePanel(); }
function showRecord(rec) {
  closePanelOnMobile();
  if (rec.id === state.loadedId) { clearPreview(); fit(); renderSaved(); return; }
  previewLayer.clearLayers();
  const pts = (rec.pts || []).map(p => ({ lat: +p.lat, lon: +p.lon })).filter(p => isFinite(p.lat) && isFinite(p.lon));
  if (!pts.length) { toast('Бұл жазбада нүкте жоқ.', true); return; }
  const Rk = recordZones(rec), ok = Rk && !Rk.error;
  if (ok) for (let i = 3; i >= 1; i--) L.polygon(Rk.num[i].map(p => [p.lat, p.lon]), { color: ZONES[i].color, weight: 3, dashArray: '8 6', fill: false, interactive: false }).addTo(previewLayer);
  L.polygon(pts.map(p => [p.lat, p.lon]), { color: ZONES[0].color, weight: 3, dashArray: '8 6', fillOpacity: 0.15, interactive: false }).addTo(previewLayer);
  previewId = rec.id;
  $('qaPreviewName').textContent = 'Алдын ала көрініс: ' + rec.name;
  $('qaPreviewChip').hidden = false;
  fitTo(ok ? Rk.num[3] : pts);
  renderSaved();
  if (!ok) toast('Аймақтар есептелмеді — тек ескерткіш шекарасы көрсетілді.', true);
}
/** Жазбаны редакторға ашу: сақталмаған өзгерістер болса — сұрап алу. */
async function requestOpen(rec) {
  if (state.loadedId !== rec.id && isDirty() && !(await ask('Ағымдағы сақталмаған өзгерістер «' + rec.name + '» жазбасымен ауыстырылады. Жалғастырасыз ба?', { ok: 'Ашу' }))) return;
  openRecord(rec);
}
$('qaPreviewClose').addEventListener('click', () => { clearPreview(); renderSaved(); });
$('qaPreviewOpen').addEventListener('click', () => { const rec = saved.find(r => r.id === previewId); if (rec) requestOpen(rec); });

function openRecord(rec) {
  const f = rec.fields || {};
  for (const k of FIELD_KEYS) if (typeof f[k] === 'string') F[k].value = f[k];
  genTouched = !!f.gen && f.gen !== genitive(f.name || '');
  if (!f.gen) syncGen();
  state.pts = (rec.pts || []).map(p => ({ lat: +p.lat, lon: +p.lon }));
  state.custom = rec.custom && Array.isArray(rec.custom.rings) ? rec.custom : null;
  state.loadedId = rec.id; state.loadedName = rec.name;
  $('qaHeightWrap').hidden = !['arch', 'art', 'sacred'].includes(F.type.value);
  $('qaRuleText').textContent = ruleDistance().text;
  clearPreview();
  cleanSig = curSig();
  closePanelOnMobile();
  recompute(true, true); fit(); renderSaved();
  const Lg = state.custom ? checkLegal(state.pts, state.custom, fieldValues()) : null;
  if (Lg && !Lg.ok && !state.custom.accepted) toast('«' + rec.name + '» ашылды. ⚠ Импортталған аймақтар заңнамаға сәйкес емес — «Мәліметтер» панелінде: қалдыру не қайта есептеу.', true);
  else toast('«' + rec.name + '» ашылды.');
}
$('qaSaved').addEventListener('click', async e => {
  const findRec = attr => { const b = e.target.closest('[' + attr + ']'); return b ? saved.find(r => r.id === b.getAttribute(attr)) : undefined; };
  let rec;
  if ((rec = findRec('data-show'))) { showRecord(rec); return; }
  if ((rec = findRec('data-open'))) { requestOpen(rec); return; }
  if ((rec = findRec('data-legal-keep')) || (rec = findRec('data-legal-recalc'))) { legalAction(rec, !!e.target.closest('[data-legal-keep]')); return; }
  if ((rec = findRec('data-geo'))) {
    const Rk = recordZones(rec);
    if (!Rk || Rk.error) { toast('«' + rec.name + '» жазбасынан аймақ есептелмеді.', true); return; }
    download(JSON.stringify(geojson(Rk, infoFrom(rec.fields || {}), rec.id), null, 2), 'application/geo+json', fileBaseOf(rec.name) + '.geojson');
    return;
  }
  if ((rec = findRec('data-delrec'))) {
    if (!(await ask('«' + rec.name + '» сақталған аймағы серверден өшіріледі. Бұл әрекетті болдырмау мүмкін емес. Жалғастырасыз ба?', { ok: 'Өшіру', danger: true }))) return;
    try {
      const j = await api('delete', { id: rec.id });
      saved = j.items || []; selected.delete(rec.id);
      if (state.loadedId === rec.id) { state.loadedId = null; state.loadedName = ''; cleanSig = null; save(); paintDirty(); }
      if (previewId === rec.id) clearPreview();
      renderSaved(); toast('«' + rec.name + '» өшірілді.');
    } catch (err) { toast('Өшірілмеді: ' + err.message, true); }
  }
});
$('qaSaved').addEventListener('change', e => {
  const c = e.target.closest('[data-sel]'); if (!c) return;
  if (c.checked) selected.add(c.dataset.sel); else selected.delete(c.dataset.sel);
  renderSaved();
});
$('qaSelAll').addEventListener('change', e => {
  const vis = viewRecords();                         // іздеу сүзгісі бар болса — тек көрінетіндері
  for (const r of vis) { if (e.target.checked) selected.add(r.id); else selected.delete(r.id); }
  renderSaved();
});

/** Сақталған жазбаның импортталған аймақтары: «Қалдыру» (ескерту енді шықпайды) не «Қайта есептеу» (заң бойынша). */
async function legalAction(rec, keep) {
  const f = { ...(rec.fields || {}) };
  let custom = null;
  if (keep) custom = { ...rec.custom, accepted: true };
  else {
    const d = legalDistance(f);
    if (d) { f.d1 = String(d); f.d2 = String(d); f.d3 = String(d); }
    if (!(await ask('«' + rec.name + '»: импортталған аймақ полигондары алынып, аймақтар ескерткіш аумағынан ' + (d ? d + ' метрден' : 'жазбадағы қашықтықтармен') + ' қайта есептеледі. Жалғастырасыз ба?', { ok: 'Қайта есептеу' }))) return;
  }
  try {
    const j = await api('save', { data: JSON.stringify({ id: rec.id, fields: f, pts: rec.pts, custom }) });
    saved = j.items || saved;
    const nrec = saved.find(r => r.id === rec.id);
    if (state.loadedId === rec.id && nrec && !isDirty()) openRecord(nrec); else renderSaved();
    if (previewId === rec.id && nrec) showRecord(nrec);
    toast(keep ? '«' + rec.name + '»: импортталған аймақтар қалдырылды.' : '«' + rec.name + '»: аймақтар қайта есептелді.');
  } catch (err) { toast('Сақталмады: ' + err.message, true); }
}

/* ---------- Мәліметтер панелі: «Қолдану» ---------- */
$('qaInfoApply').addEventListener('click', () => {
  $('qaRuleText').textContent = ruleDistance().text;
  recompute(true, true);
  if (globalThis.QAUI) globalThis.QAUI.closePanel();
  fit();
  toast(R && !R.error ? 'Мәліметтер қолданылды, аймақтар қайта есептелді.' : 'Мәліметтер қолданылды.' + (state.pts.length < MIN_POINTS ? ' Шекараға кемінде ' + MIN_POINTS + ' нүкте қойыңыз.' : ''), !!(R && R.error));
});

// Біріктіру баптаулары (бастапқы нөмір, қаулы деректемесі, сызба фоны) осы браузерде есте қалады
function loadComb() {
  let o = null;
  try { o = JSON.parse(localStorage.getItem(COMB_KEY) || 'null'); } catch (e) { /* елемейміз */ }
  $('qaStart').value = o && o.start > 0 ? o.start : 1;
  $('qaDecree').value = o && typeof o.decree === 'string' && o.decree.trim() ? o.decree : DECREE_DEFAULT;
  $('qaCombBase').value = o && o.base === 'osm' ? 'osm' : 'sat';
  $('qaCombCoords').checked = !!(o && o.coords);
}
function saveComb() {
  try { localStorage.setItem(COMB_KEY, JSON.stringify({ start: combStart() || 1, decree: $('qaDecree').value, base: $('qaCombBase').value, coords: $('qaCombCoords').checked })); } catch (e) { /* елемейміз */ }
}
for (const id of ['qaStart', 'qaDecree', 'qaCombBase', 'qaCombCoords']) $(id).addEventListener('change', () => { saveComb(); renderSaved(); });
$('qaStart').addEventListener('input', renderSaved);
$('qaDecreeReset').addEventListener('click', () => { $('qaDecree').value = DECREE_DEFAULT; saveComb(); });

$('qaCombine').addEventListener('click', async () => {
  const recs = saved.filter(r => selected.has(r.id));
  if (!recs.length) return;
  const start = combStart();
  if (!(start > 0)) { toast('Бастапқы қосымша нөмірін енгізіңіз.', true); $('qaStart').focus(); return; }
  if (start % 2 === 0) { toast('Бастапқы нөмір тақ болуы керек: тақ нөмір — мәтін беті, жұп нөмір — сызба беті.', true); $('qaStart').focus(); return; }
  const btn = $('qaCombine'), info = $('qaCombInfo');
  btn.disabled = true;
  try {
    const res = await buildCombined(recs, {
      start, decree: $('qaDecree').value, sat: $('qaCombBase').value === 'sat', coordTable: $('qaCombCoords').checked,
    }, (i, n, name) => { info.textContent = 'Жасалып жатыр: ' + i + ' / ' + n + ' — ' + name + '…'; });
    download(res.blob, '', 'Qorgau_aimaqtary_' + start + '-' + res.last + '.docx');
    info.textContent = start + '–' + res.last + '-қосымшалар дайын (' + res.count + ' ескерткіш). Келесі бос нөмір: ' + (res.last + 1) + '.';
    toast('Біріктірілген DOCX дайын' + (res.skipped.length ? '. Есептелмей қалғандар: ' + res.skipped.join(', ') : '.'), res.skipped.length > 0);
  } catch (e) { toast('Құжат жасалмады: ' + e.message, true); info.textContent = ''; }
  finally { btn.disabled = false; }
});

$('qaCombGeo').addEventListener('click', async () => {
  const recs = saved.filter(r => selected.has(r.id));
  if (!recs.length) return;
  const btn = $('qaCombGeo');
  btn.disabled = true;
  try {
    const res = await buildGeoBundle(recs);
    download(res.blob, 'application/zip', 'Qorgau_aimaqtary_QGIS.zip');
    toast('GeoJSON + QML дайын (' + res.count + ' ескерткіш)' + (res.skipped.length ? '. Есептелмей қалғандар: ' + res.skipped.join(', ') : '.'), res.skipped.length > 0);
  } catch (e) { toast('Жасалмады: ' + e.message, true); }
  finally { btn.disabled = false; }
});

/* ======================= Бастау ======================= */
const had = load();
applyRule(!had);
paintSchemeBase();
recompute(true, true);
if (state.pts.length) fit();
loadComb();
paintLoaded();
refreshSaved();

// Тест/жөндеу үшін
globalThis.__qa = { rectangle, computeZones, checkLegal, legalLines, legalDistance, refreshSaved, genitive, state, get R() { return R; }, buildDocx, renderScheme, geojson, docText, qmlStyle, buildGeoBundle };
