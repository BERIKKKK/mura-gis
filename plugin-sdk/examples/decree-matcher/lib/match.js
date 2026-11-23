/* Атау сәйкестендіргіш: белгінің атауын (қазақша / орысша) қаулыдағы тізіммен салыстыру.
   Атау қалыпқа келтіріледі: рим цифры → сан (ІІІ, III, ІҮ → 3, 4), қазақ әріптері → жақын орыс әрпі (Қарабұтақ ≈ Карабутак),
   тырнақша, сызықша, бас әріп еленбейді, жалпы сөздер (бейіті, қорғаны, могильник, курган…) салыстыруға кірмейді.
   Сан бөлек тексеріледі: «Қарабұтақ-ІІІ» мен «Қарабұтақ-IV» сәйкес емес.
   Орны: «Қос-Естек ауылынан оңтүстік батысқа қарай 12 шақырым 700 метр» → ауыл «Өзге нысандарда» болса, ескерткіштің
   шамамен орны есептеледі және белгіге дейінгі қашықтық ұсыныстың ретіне әсер етеді. */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m; else root.DMMatch = m;
})(globalThis, function () {
  'use strict';

  /* ---------- Рим цифры ---------- */
  const STRONG = { I: 'I', 'І': 'I', 'Ӏ': 'I', V: 'V', Y: 'V', 'Ү': 'V', 'Ѵ': 'V', X: 'X', 'Х': 'X' };
  const WEAK = { L: 'L', C: 'C', M: 'M', 'С': 'C', 'М': 'M', 'У': 'V' };
  const VALID = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
  const VAL = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  function roman(w) {
    if (!w || w.length > 8) return null;
    let lat = '', strong = false;
    for (const ch of w) {
      if (STRONG[ch]) { lat += STRONG[ch]; strong = true; }
      else if (WEAK[ch]) lat += WEAK[ch];
      else return null;
    }
    if (!strong || !VALID.test(lat)) return null;
    let n = 0;
    for (let i = 0; i < lat.length; i++) { const a = VAL[lat[i]], b = VAL[lat[i + 1]] || 0; n += a < b ? -a : a; }
    return n > 0 ? String(n) : null;
  }

  /* ---------- Қалыпқа келтіру ---------- */
  const FOLD = { 'ә': 'а', 'ғ': 'г', 'қ': 'к', 'ң': 'н', 'ө': 'о', 'ұ': 'у', 'ү': 'у', 'һ': 'х', 'і': 'и', 'ё': 'е', 'э': 'е', 'ъ': '', 'ь': '',
    a: 'а', e: 'е', o: 'о', p: 'р', c: 'с', x: 'х', y: 'у', k: 'к' };
  const fold = s => String(s || '').toLowerCase().replace(/[әғқңөұүһіёэъьaeopcxyk]/g, ch => FOLD[ch]);
  /** Атау → сөздер (рим цифры санға айналған, қалыпқа келтірілген). */
  function words(s) {
    const raw = String(s || '').replace(/[«»"“”„'’`]/g, ' ').replace(/[()[\],.;:!?/\\]/g, ' ').split(/[\s‐‑‒–—―-]+/).filter(Boolean);
    const out = [];
    for (const w of raw) {
      const r = /^[A-ZА-ЯӘҒҚҢӨҰҮҺІӀ]+$/.test(w) ? roman(w) : null;
      out.push(r || fold(w));
    }
    return out.filter(Boolean);
  }
  // Жалпы сөздер (түрі): салыстыруға кірмейді, бірақ ұқсас түр болса аздап көмектеседі
  const STOP = new Set(('могильник могильники могильника курган курганы курганов курганный курганная каменный каменные каменная земляной земляные некрополь некрополя ' +
    'мавзолей мавзолея мавзолеи поселение поселения стоянка стоянки городище городища памятник памятника памятники бюст обелиск комплекс комплекса мемориальный ' +
    'мемориал группа здание дом могила могилы с усами усами ' +
    'бейіті бейіттері бейіт қорғаны қорғандары қорған қорымы қорым кесенесі кесене қонысы қоныс тұрағы тұрақ қалашығы қалашық ескерткіші ескерткіш ' +
    'мүсіні мүсін кешені кешен тобы белгісі белгі ғимараты үйі мұртты тас жер').split(' ').map(fold));

  function key(s) {
    const w = words(s);
    const core = [], nums = [], kind = [];
    for (const t of w) {
      if (/^\d+$/.test(t)) nums.push(t);
      else if (STOP.has(t)) kind.push(t);
      else if (t.length > 1) core.push(t);
    }
    return { core, nums, kind, all: w.filter(t => t.length > 1 || /^\d+$/.test(t)).join(' ') };
  }

  const bigrams = s => { const a = []; for (let i = 0; i < s.length - 1; i++) a.push(s.slice(i, i + 2)); return a; };
  function dice(a, b) {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    const A = bigrams(a), B = bigrams(b), m = new Map();
    for (const x of A) m.set(x, (m.get(x) || 0) + 1);
    let n = 0;
    for (const x of B) { const c = m.get(x); if (c) { n++; m.set(x, c - 1); } }
    return (2 * n) / (A.length + B.length);
  }
  function tokScore(t, u) {
    if (t === u) return 1;
    if (t.length >= 3 && u.startsWith(t)) return 0.9;                 // жазылып жатқан сөз
    const d = dice(t, u);
    return d >= 0.7 ? d : 0;
  }
  /** Сұраныс атауы (q) мен тізімдегі атау (r) ұқсастығы, 0…1. */
  function sim(q, r) {
    // Атау тек жалпы сөздерден тұрса («Жер қорған») — толық сәйкестік қана
    if (!q.core.length && !q.nums.length) return q.all && q.all === r.all ? 0.95 : 0;
    let m = 0;
    for (const t of q.core) { let b = 0; for (const u of r.core) b = Math.max(b, tokScore(t, u)); m += b; }
    const cq = q.core.length ? m / q.core.length : 0, cr = r.core.length ? m / r.core.length : 0;
    let s = q.core.length ? 0.65 * cq + 0.35 * cr : 0;
    if (q.nums.length || r.nums.length) {
      const same = q.nums.join(',') === r.nums.join(',');
      if (q.nums.length && r.nums.length) s *= same ? 1 : 0.25;
      else if (r.nums.length) s *= 0.85;                                  // нөмірі әлі жазылмаған
      else s *= 0.5;                                                      // сұраныста нөмір бар, тізімде жоқ
    }
    if (q.kind.length && r.kind.some(k => q.kind.includes(k))) s += 0.03;
    if (q.all && q.all === r.all) s += 0.1;                               // атауы толық бірдей (түрі де)
    return Math.min(1, s);
  }

  /* ---------- Орны: «N км … ауылынан» ---------- */
  const AZ = { 'север': 0, 'восток': 90, 'юг': 180, 'запад': 270, 'солтүстік': 0, 'шығыс': 90, 'оңтүстік': 180, 'батыс': 270 };
  const mid = (a, b) => { const r = Math.PI / 180; const x = Math.cos(a * r) + Math.cos(b * r), y = Math.sin(a * r) + Math.sin(b * r); return ((Math.atan2(y, x) / r) + 360) % 360; };
  function azimuth(phrase) {
    const seq = (String(phrase || '').toLowerCase().match(/север|восток|юг|запад|солтүстік|шығыс|оңтүстік|батыс/g) || []).map(w => AZ[w]);
    if (!seq.length) return null;
    if (seq.length === 1) return seq[0];
    if (seq.length === 2) return mid(seq[0], seq[1]);
    return mid(seq[0], mid(seq[1], seq[2]));
  }
  const NUMV = s => +String(s).replace(',', '.');
  /** Орналасқан жері → { village, az, dist (м) } не null. */
  function parsePlace(text, lang) {
    const s = String(text || '').replace(/\s+/g, ' ');
    let village = '', dir = '', dist = 0, m;
    if (lang === 'kk') {
      m = /([А-ЯӘҒҚҢӨҰҮҺІ][^,;()]*?)\s+(ауылынан|кентінен|қаласынан|стансасынан|станциясынан|метеостанциясынан|разъезінен|елді мекенінен|қыстағынан)/.exec(s);
      if (m) village = m[1];
      const d = /(ауылынан|кентінен|қаласынан|стансасынан|станциясынан|метеостанциясынан|разъезінен|елді мекенінен|қыстағынан)\s+([а-яәғқңөұүһі\s-]+?)\s+қарай/.exec(s);
      if (d) dir = d[2];
      const k = /(\d+(?:[.,]\d+)?)\s*(?:шақырым|км)(?:\s+(\d+)\s*метр)?/.exec(s), mm = /(\d+)\s*метр/.exec(s);
      dist = k ? NUMV(k[1]) * 1000 + (k[2] ? +k[2] : 0) : mm ? +mm[1] : 0;
    } else {
      m = /от\s+(?:села|поселка|посёлка|аула|города|станции|ж\.?\s*д\.?\s*станции|метеостанции|разъезда|зимовки|г\.|с\.|п\.)\s+([А-ЯЁA-Z][^,;()]*?)(?=[,;(]|\s+(?:в|на|у|по|слева|справа)\s|$)/.exec(s);
      if (m) village = m[1];
      const d = /к\s+([а-яё\s-]+?)\s+от\s/.exec(s);
      if (d) dir = d[1];
      const k = /(\d+(?:[.,]\d+)?)\s*(?:километр\S*|км)(?:\s+(\d+)\s*метр\S*)?/.exec(s), mm = /(\d+)\s*метр\S*/.exec(s);
      dist = k ? NUMV(k[1]) * 1000 + (k[2] ? +k[2] : 0) : mm ? +mm[1] : 0;
    }
    village = village.replace(/\s+(село|селосы|ауылы|поселок|кенті)$/i, '').trim();
    if (!village) return null;
    const az = azimuth(dir);
    return { village, az, dist: az == null ? 0 : dist };
  }
  function dest(lat, lon, az, d) {
    const r = Math.PI / 180;
    return { lat: lat + (d * Math.cos(az * r)) / 111320, lon: lon + (d * Math.sin(az * r)) / (111320 * Math.cos(lat * r)) };
  }
  function distM(a, b) {
    const r = Math.PI / 180, x = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * r), y = b.lat - a.lat;
    return Math.hypot(x, y) * 111320;
  }

  /* ---------- Дайындау және іздеу ---------- */
  /** Сақталған қаулы → іздеуге дайын жолдар (бір рет есептеледі). */
  function prepare(dec) {
    return (dec.rows || []).map(r => ({
      r,
      kk: key(r.name_kk || ''), ru: key(r.name_ru || ''),
      dk: fold(r.district_kk || ''), dr: fold(r.district_ru || ''),
      pk: parsePlace(r.place_kk, 'kk'), pr: parsePlace(r.place_ru, 'ru'),
    }));
  }
  /** «Өзге нысандар» → іздеу кестесі: қалыпталған атау → [{ lat, lon, name }]. */
  function placeIndex(places) {
    const idx = new Map();
    for (const p of places || []) {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
      for (const n of [p.name, p.name_ru]) {
        const k = words(n).join(' ');
        if (!k) continue;
        if (!idx.has(k)) idx.set(k, []);
        idx.get(k).push(p);
      }
    }
    return idx;
  }
  /** Жолдың шамамен орны (сұраныс нүктесіне ең жақын ауыл бойынша) және қашықтығы. */
  function locate(x, idx, q) {
    if (x.r.lat != null && x.r.lon != null) return { lat: x.r.lat, lon: x.r.lon, exact: true };
    let best = null;
    for (const p of [x.pk, x.pr]) {
      if (!p) continue;
      const list = idx.get(words(p.village).join(' '));
      if (!list) continue;
      for (const v of list) {
        const e = p.dist && p.az != null ? dest(v.lat, v.lon, p.az, p.dist) : { lat: v.lat, lon: v.lon };
        const d = q && q.lat != null ? distM(q, e) : 0;
        if (!best || d < best.d) best = { ...e, d, village: p.village, approx: true };
      }
    }
    return best;
  }

  /**
   * Ұсыныстар. decs: [{ id, meta, prepared }], q: { name, name_ru, district, oblast, lat, lon }, places — индекс (placeIndex).
   * Қайтарады: [{ dec, row, score, nameScore, d (м) | null, approx }] — ұқсастығы бойынша.
   */
  function suggest(decs, q, idx, opts) {
    opts = opts || {};
    const limit = opts.limit || 8;
    const qk = key(q.name), qr = key(q.name_ru);
    const hasName = !!(qk.all || qr.all);
    const qd = fold(q.district);
    const out = [];
    for (const dec of decs) {
      if (dec.meta && dec.meta.oblast && q.oblast && fold(dec.meta.oblast) !== fold(q.oblast)) continue;
      const dset = new Set(dec.prepared.flatMap(x => [x.dk, x.dr]).filter(Boolean));
      for (const x of dec.prepared) {
        let ns = 0;
        if (hasName) {
          ns = Math.max(sim(qk, x.kk), sim(qk, x.ru), sim(qr, x.ru), sim(qr, x.kk));
          if (ns < 0.45) continue;
        }
        let ds = 0;
        if (qd) ds = qd === x.dk || qd === x.dr ? 0.08 : dset.has(qd) ? -0.25 : 0;
        let loc = null;
        if (q.lat != null && q.lon != null) loc = locate(x, idx, q);
        const ls = loc ? 1 / (1 + Math.pow(loc.d / 3000, 2)) : 0;
        if (!hasName && (!loc || loc.d > (opts.radius || 10000))) continue;
        const score = hasName ? ns + 0.15 * ls + ds : 0.6 * ls + ds;
        out.push({ dec, row: x.r, score, nameScore: ns, d: loc ? loc.d : null, approx: !!(loc && loc.approx), village: loc && loc.village || '' });
      }
    }
    out.sort((a, b) => b.score - a.score || a.row.n - b.row.n);
    return out.slice(0, limit);
  }

  return { fold, words, key, sim, roman, parsePlace, azimuth, dest, distM, prepare, placeIndex, locate, suggest };
});
