/* Атау сәйкестендіргіш: қаулы мәтінін талдау — тілі, қаулының мәліметтері (нөмірі, күні, тіркеу нөмірі, редакциясы),
   ескерткіштер тізімінің кестесі (№, атауы, мерзімі, түрі, орналасқан жері, болса — координаттары), аудан жолдары.
   Кіріс — files.js нәтижесі (DOCX: кестелер; PDF: беттердегі мәтін бөліктері — кесте координаттан қалпына келтіріледі).
   Нәтиже: { lang, meta, rows: [{ n, district, name, period, typeRaw, type, place, lat?, lon? }], expected, warnings }. */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m; else root.DMDecree = m;
})(globalThis, function () {
  'use strict';

  const sp = s => String(s || '').replace(/\s+/g, ' ').trim();
  /** Тасымалданған жолдарды біріктіру: «мо-» + «нументального» → «монументального», «Бала-» + «Талдык» → «Бала-Талдык». */
  function joinLines(lines) {
    let out = '';
    for (const raw of lines) {
      const l = sp(raw);
      if (!l) continue;
      if (!out) { out = l; continue; }
      if (/[-‐]$/.test(out) && /^[a-zа-яёәғқңөұүһі]/.test(l)) out = out.slice(0, -1) + l;
      else if (/[-‐–]$/.test(out) && !/\s[-–]$/.test(out)) out += l;
      else out += ' ' + l;
    }
    return sp(out);
  }

  /* ---------- Тіл ---------- */
  function detectLang(text) {
    const s = String(text || '');
    const kz = (s.match(/[әғқңөұүһіӘҒҚҢӨҰҮҺІ]/g) || []).length;
    const cyr = (s.match(/[а-яё]/gi) || []).length;
    if (!cyr) return '';
    // Орысша мәтінде «І» (рим цифры) жиі кездеседі — сондықтан тек «і»-ден басқа әріптер де ескеріледі
    const kz2 = (s.match(/[әғқңөұүһӘҒҚҢӨҰҮҺ]/g) || []).length;
    return kz2 / cyr > 0.004 || kz / cyr > 0.03 ? 'kk' : 'ru';
  }

  /* ---------- Мерзім (дәуір) ---------- */
  const PERIOD_WORDS = new Set(('эпоха эпохи эпох бронзы бронзового бронзовый железа железного раннего ранней ранние позднего поздней средневековья средневековье ' +
    'неолита энеолита мезолита палеолита неолит энеолит мезолит палеолит век века веков вв в начало начала середина середины конец конца половина половины ' +
    'и до нашей эры н.э н э тысячелетие тысячелетия тысячилетия тыс год года годы гг г первая вторая ' +
    'дәуір дәуірі дәуірлері дәуірінің дәуірлерінің ерте кейінгі қола темір орта ортағасыр ортағасырлар ғасыр ғасырлар ғасырдың ғасырлардың ғ ғғ басы ортасы соңы аяғы ' +
    'жартысы бірінші екінші және мен пен бен б.з.б б.з.д б.з біздің заманымызға заманымыздың дейін дейінгі жыл жылдар жылы жж мыңжылдық мыңжылдықтың мыңжылдықтар').split(' '));
  const ROMAN = /^[ivxlcіхⅰ-ⅿ]+([-–—][ivxlcіх]+)?$/i;
  const NUMY = /^\d{1,4}([-–—]\d{1,4})?$/;
  function isPeriod(s) {
    s = sp(s);
    if (!s || s.length > 120) return false;
    const toks = s.toLowerCase().replace(/[()«»"“”,;:]/g, ' ').split(/\s+/).filter(Boolean);
    let anchor = false;
    for (let t of toks) {
      t = t.replace(/\.$/, '');
      if (/^[-–—]$/.test(t)) continue;
      if (ROMAN.test(t) || NUMY.test(t)) { anchor = true; continue; }
      // «ХІХ-ХХ», «неолита-бронзы», «Мезолит-неолит» — сызықшамен біріккен сөздер
      const parts = t.split(/[-–—]/).filter(Boolean);
      if (parts.length > 1 && parts.every(x => ROMAN.test(x) || NUMY.test(x) || PERIOD_WORDS.has(x))) { anchor = true; continue; }
      // тірек сөз — сын есім емес, дәуірдің өзі («эпоха», «век», «ғасыр», «неолит»…): «бронзы» жалғыз тұрса мерзім емес
      if (PERIOD_WORDS.has(t)) { if (/^(эпох|век|вв$|тысяч|тыс$|год|гг$|неолит|энеолит|мезолит|палеолит|средневеков|дәуір|ғасыр|ғғ$|жыл|жж$|мыңжыл|ортағасыр)/.test(t)) anchor = true; continue; }
      return false;
    }
    return anchor;
  }
  /** Атау ұяшығы → { name, period }. lines — DOCX-те абзацтар, PDF-те көрінетін жолдар. */
  function splitNamePeriod(lines) {
    lines = lines.map(sp).filter(Boolean);
    if (lines.length > 1) {
      for (let k = Math.min(3, lines.length - 1); k >= 1; k--) {
        const tail = joinLines(lines.slice(-k));
        if (isPeriod(tail)) return { name: joinLines(lines.slice(0, -k)), period: tail };
      }
    }
    const full = joinLines(lines);
    const w = full.split(' ');
    for (let i = 1; i < w.length; i++) {
      const rest = w.slice(i).join(' ');
      // жақшадағы жыл («… Г. Жубановой (2007 год)») — атаудың бөлігі
      const bal = s => (s.match(/\(/g) || []).length === (s.match(/\)/g) || []).length;
      if (isPeriod(rest) && !/^(и|до|және)$/i.test(w[i]) && !/^\(/.test(rest) && bal(rest)) return { name: w.slice(0, i).join(' '), period: rest };
    }
    return { name: full, period: '' };
  }

  /* ---------- Түр ---------- */
  function typeCode(s) {
    s = String(s || '').toLowerCase();
    if (/археолог/.test(s)) return 'archeo';
    if (/ансамбл|кешен|комплекс/.test(s)) return 'ensemble';
    if (/сакрал|киелі/.test(s)) return 'sacred';
    if (/монумент/.test(s)) return 'art';
    if (/градострои|архитект|қала құрылыс|сәулет/.test(s)) return 'arch';
    return '';
  }

  /* ---------- Координат (кестеде болса) ---------- */
  function parseCoord(s) {
    s = String(s || '').replace(/,(?=\d)/g, '.');
    const dms = [...s.matchAll(/(\d{1,3})\s*°\s*(\d{1,2})\s*['′’]\s*(\d{1,2}(?:\.\d+)?)?\s*(?:["″”]|'')?\s*([NSEWСЮВЗ])?/gi)].map(m => +m[1] + +m[2] / 60 + (+m[3] || 0) / 3600);
    if (dms.length >= 2) return { lat: dms[0], lon: dms[1] };
    const dec = [...s.matchAll(/(\d{2,3}\.\d{3,})/g)].map(m => +m[1]);
    if (dec.length >= 2) return { lat: dec[0], lon: dec[1] };
    return null;
  }

  /* ---------- Қаулының мәліметтері ---------- */
  const MON = { 'января': 1, 'февраля': 2, 'марта': 3, 'апреля': 4, 'мая': 5, 'июня': 6, 'июля': 7, 'августа': 8, 'сентября': 9, 'октября': 10, 'ноября': 11, 'декабря': 12,
    'қаңтар': 1, 'ақпан': 2, 'наурыз': 3, 'сәуір': 4, 'мамыр': 5, 'маусым': 6, 'шілде': 7, 'тамыз': 8, 'қыркүйек': 9, 'қазан': 10, 'қараша': 11, 'желтоқсан': 12 };
  const monOf = w => { w = String(w || '').toLowerCase(); for (const k of Object.keys(MON)) if (w.startsWith(k)) return MON[k]; return 0; };
  const iso = (y, m, d) => (y && m && d ? y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0') : '');
  function meta(lines, lang) {
    const text = lines.slice(0, 80).join(' ').replace(/\s+/g, ' ');
    const out = { title: '', number: '', date: '', regNumber: '', regDate: '', oblast: '', edition: '', category: '' };
    let m;
    if ((m = /(?:Постановление|Решение|Приказ)\s+[^.]{3,160}?\s+от\s+(\d{1,2})\s+([а-я]+)\s+(\d{4})\s+года\s+№\s*([\w/-]+)/i.exec(text))) {
      out.date = iso(+m[3], monOf(m[2]), +m[1]); out.number = m[4];
    } else if ((m = /(\d{4})\s+жылғы\s+(\d{1,2})\s+([а-яәғқңөұүһі]+?)(?:дағы|дегі|тағы|тегі)\s+№\s*([\w/-]+)\s+(?:қаулысы|шешімі|бұйрығы)/i.exec(text))) {
      out.date = iso(+m[1], monOf(m[3]), +m[2]); out.number = m[4];
    }
    // Облыс — қазақша мәтіннен («Ақтөбе облысы әкімдігінің …»), белгінің «облыс» өрісімен салыстыру үшін
    if ((m = /([А-ЯӘҒҚҢӨҰҮҺІ][а-яәғқңөұүһі-]+)\s+облысы(?:\s+әкімдігінің|ның|\s+мәслихатының)/.exec(text))) out.oblast = m[1] + ' облысы';
    if ((m = /Зарегистрирован\S*\s+[^.]{0,120}?\s(\d{1,2})\s+([а-я]+)\s+(\d{4})\s+года\s+№\s*([\d-]+)/i.exec(text))) { out.regDate = iso(+m[3], monOf(m[2]), +m[1]); out.regNumber = m[4]; }
    else if ((m = /(\d{4})\s+жылғы\s+(\d{1,2})\s+([а-яәғқңөұүһі]+?)(?:да|де|та|те)\s+№\s*([\d-]+)\s+болып\s+тіркел/i.exec(text))) { out.regDate = iso(+m[1], monOf(m[3]), +m[2]); out.regNumber = m[4]; }
    else if ((m = /(?:НҚА|НПА)[^№]{0,60}№\s*([\d-]+)/.exec(text))) out.regNumber = m[1];
    const t = lines.find(l => /^(Об утверждении|О внесении|Об установлении)\s/i.test(l) || /(бекіту|енгізу|белгілеу) туралы$/i.test(l));
    if (t) {
      const i = lines.indexOf(t);
      let s = t;
      for (let k = 1; k <= 3 && !/туралы$/.test(s) && lines[i + k] && /^[а-яәғқңөұүһі]/.test(lines[i + k]); k++) s += ' ' + lines[i + k];
      out.title = sp(s);
    }
    if ((m = /(?:в редакции|жаңа редакцияда)[^.]{0,160}?(\d{2}\.\d{2}\.\d{4})\s+№\s*([\w/-]+)/i.exec(lines.join(' ')))) out.edition = m[1] + ' № ' + m[2];
    const tt = (out.title + ' ' + text).toLowerCase();
    out.category = /местного значения|жергілікті маңызы бар/.test(tt) ? 'local' : /республиканского значения|республикалық маңызы бар/.test(tt) ? 'rep' : /международного значения|халықаралық маңызы бар/.test(tt) ? 'intl' : '';
    return out;
  }

  /* ---------- Кестедегі бағандардың рөлі ---------- */
  function roleOf(h) {
    h = String(h || '').toLowerCase();
    if (/^№|р\/с|п\/п|п\/н/.test(h.trim())) return 'num';
    if (/координат/.test(h)) return 'coord';
    if (/наименован|атауы/.test(h)) return 'name';
    if (/вид|түрі|тип/.test(h)) return 'type';
    if (/мест|орналас|мекен|адрес/.test(h)) return 'place';
    if (/датир|мерзім|дата|кезең/.test(h)) return 'period';
    if (/категор|санат/.test(h)) return 'category';
    return '';
  }
  const DISTRICT_RE = /^(город|г\.)\s|\s(район|районы|ауданы|қаласы|қ\.)$|^[^0-9]{2,40}\s(район|ауданы)$/i;
  const NUM_RE = /^(\d{1,4})\s*\.?$/;
  const TOTAL_RE = /^(всего|итого|барлығы|жиыны|барлиғы)\b/i;

  /** Жалпы кесте пішімі: rows = [{ kind: 'section', text } | { kind: 'row', cells: [lines[]] }], roles. */
  function interpret(table, roles, lang) {
    const out = [], warnings = [];
    let district = '', seq = 0;
    const col = r => roles.indexOf(r);
    const iNum = col('num'), iName = col('name'), iType = col('type'), iPlace = col('place'), iCoord = col('coord'), iPer = col('period'), iCat = col('category');
    for (const r of table) {
      if (r.kind === 'section') { district = sp(r.text); continue; }
      const cell = i => (i >= 0 && r.cells[i] ? r.cells[i] : []);
      const numTxt = joinLines(cell(iNum));
      const nm = NUM_RE.exec(numTxt);
      const n = nm ? +nm[1] : ++seq;
      if (nm) seq = n;
      const np = iPer >= 0 ? { name: joinLines(cell(iName)), period: joinLines(cell(iPer)) } : splitNamePeriod(cell(iName));
      if (!np.name) continue;
      const typeRaw = joinLines(cell(iType));
      const rec = { n, district, name: np.name, period: np.period, typeRaw, type: typeCode(typeRaw), place: joinLines(cell(iPlace)) };
      if (iCat >= 0) rec.categoryRaw = joinLines(cell(iCat));
      if (iCoord >= 0) { const c = parseCoord(joinLines(cell(iCoord))); if (c) { rec.lat = +c.lat.toFixed(7); rec.lon = +c.lon.toFixed(7); } }
      out.push(rec);
    }
    return { rows: out, warnings };
  }

  /* ---------- DOCX ---------- */
  function fromDocx(doc) {
    let best = null, bestN = 0;
    for (const t of doc.tables) {
      const n = t.filter(r => r.length >= 2 && NUM_RE.test(sp((r[0].paras || []).join(' ')))).length;
      const hasHead = t.slice(0, 6).some(r => r.some(c => /наименован|атауы/i.test(c.paras.join(' '))));
      const score = n + (hasHead ? 1000 : 0);
      if (score > bestN) { bestN = score; best = t; }
    }
    if (!best) return null;
    let hi = best.findIndex(r => r.some(c => /наименован|атауы/i.test(c.paras.join(' '))));
    const width = Math.max(...best.map(r => r.reduce((s, c) => s + (c.span || 1), 0)));
    const roles = new Array(width).fill('');
    if (hi >= 0) {
      let k = 0;
      for (const c of best[hi]) { const r = roleOf(c.paras.join(' ')); for (let j = 0; j < (c.span || 1); j++) roles[k + j] = j ? '' : r; k += c.span || 1; }
    }
    if (!roles.includes('name')) { const def = ['num', 'name', 'type', 'place', 'coord']; for (let i = 0; i < width; i++) roles[i] = roles[i] || def[i] || ''; }
    const table = [];
    for (const [i, r] of best.entries()) {
      if (i <= hi) continue;
      const txt = r.map(c => c.paras.join(' ')).join(' ');
      if (r.every(c => /^\d{1,2}$/.test(sp(c.paras.join(' '))))) continue;      // «1 2 3 4» — бағандар нөмірі
      if (r.length === 1 || (r[0].span || 1) >= width - 1) { if (sp(txt)) table.push({ kind: 'section', text: sp(txt) }); continue; }
      if (TOTAL_RE.test(sp(txt))) break;
      const cells = [];
      for (const c of r) { cells.push(c.paras); for (let j = 1; j < (c.span || 1); j++) cells.push([]); }
      table.push({ kind: 'row', cells });
    }
    // Қорытынды кесте («барлығы / всего N»)
    let expected = 0;
    for (const t of doc.tables) for (const r of t) { const a = r.map(c => sp(c.paras.join(' '))); if (a.length >= 2 && TOTAL_RE.test(a[0]) && /^\d+$/.test(a[a.length - 1])) expected = +a[a.length - 1]; }
    return { roles, table, expected, textLines: doc.paras };
  }

  /* ---------- PDF: кестені координаттан қалпына келтіру ---------- */
  const widthOf = it => Math.max(it.size * 0.3, it.s.length * it.size * 0.47);
  function pdfLines(pages) {
    // Әр бетте қайталанатын жолдар (сайттың баннері, күн, QR туралы жазу) алынады
    const cnt = new Map();
    pages.forEach(p => { const seen = new Set(); p.forEach(it => { const k = Math.round(it.y) + '|' + sp(it.s); if (!seen.has(k)) { seen.add(k); cnt.set(k, (cnt.get(k) || 0) + 1); } }); });
    const lim = Math.max(2, Math.ceil(pages.length * 0.5));
    const items = [];
    pages.forEach((p, pi) => p.forEach(it => { if (!sp(it.s)) return; if (pages.length > 1 && cnt.get(Math.round(it.y) + '|' + sp(it.s)) >= lim) return; items.push({ ...it, s: it.s, page: pi, gy: pi * 10000 + it.y }); }));
    items.sort((a, b) => a.gy - b.gy || a.x - b.x);
    // Бір орынға екі рет салынған мәтін (қалың қаріпті имитациялау т.б.) — біреуі қалады
    for (let i = items.length - 1; i > 0; i--) {
      for (let j = i - 1; j >= 0 && items[i].gy - items[j].gy < 0.6; j--) if (items[j].s === items[i].s && Math.abs(items[j].x - items[i].x) < 0.6) { items.splice(i, 1); break; }
    }
    // Жолдарға топтау (биіктігі жақын бөліктер; жоғары/төмен жылжыған кіші әріптер де)
    const lines = [];
    for (const it of items) {
      const L = lines[lines.length - 1];
      if (L && it.page === L.page && Math.abs(it.y - L.y) <= Math.max(2.2, Math.min(it.size, L.size) * 0.45)) { L.items.push(it); if (it.size > L.size) { L.size = it.size; L.y = it.y; } }
      else lines.push({ page: it.page, y: it.y, gy: it.gy, size: it.size, items: [it] });
    }
    // Жоғарғы/төменгі индекс («68а»-дағы кіші «а») — көршілес жолға қосылады
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      if (L.items.length > 2) continue;
      const small = N => N && N !== L && N.page === L.page && L.items.every(it => it.size < N.size * 0.86) && Math.abs(N.y - L.y) < N.size * 0.7;
      const N = small(lines[i + 1]) ? lines[i + 1] : small(lines[i - 1]) ? lines[i - 1] : null;
      if (N) { N.items.push(...L.items); lines.splice(i, 1); i--; }
    }
    for (const L of lines) { L.items.sort((a, b) => a.x - b.x); L.text = sp(L.items.map(i => i.s).join(' ')); }
    return lines;
  }
  function lineText(items) {
    let s = '';
    let prev = null;
    for (const it of items.slice().sort((a, b) => a.x - b.x)) {
      const t = it.s;
      if (prev && it.size < prev.size * 0.85 && /\d$/.test(s)) s += t.trim();       // «68» + кіші «а» → «68а»
      else s += (s && !/\s$/.test(s) && !/^\s/.test(t) ? ' ' : '') + t;
      prev = it;
    }
    return sp(s);
  }
  function fromPdf(doc) {
    const lines = pdfLines(doc.pages);
    const hIdx = lines.findIndex((L, i) => L.items.some(it => /^№/.test(sp(it.s))) &&
      lines.slice(i, i + 4).some(M => M.page === L.page && M.y - L.y < 40 && /наименован|атауы/i.test(M.text)));
    if (hIdx < 0) return { roles: [], table: [], expected: 0, textLines: lines.map(l => l.text) };
    // Тақырып жолдары (бірнеше жолға бөлінуі мүмкін) және бағандар нөмірі «1 2 3 4»
    const H = lines[hIdx];
    const isNumRow = L => L.items.length >= 3 && L.items.every(it => /^\d{1,2}$/.test(sp(it.s)));
    const head = [];
    let after = hIdx;
    // тақырып — бағандар нөмірі, аудан атауы не бірінші жол басталғанға дейін
    while (after < lines.length && lines[after].page === H.page && lines[after].y - H.y < 40) {
      const L = lines[after];
      if (after > hIdx && (isNumRow(L) || DISTRICT_RE.test(L.text) || NUM_RE.test(sp(L.items[0].s)))) break;
      head.push(L); after++;
    }
    let centers = null;
    const nums = lines[after];
    if (nums && nums.items.length >= 3 && nums.items.every(it => /^\d{1,2}$/.test(sp(it.s)))) { centers = nums.items.map(it => it.x + widthOf(it) / 2); after++; }
    const headItems = head.flatMap(L => L.items);
    if (!centers) {
      // тақырыптағы бөліктерді x бойынша топтау
      const segs = headItems.map(it => [it.x, it.x + widthOf(it)]).sort((a, b) => a[0] - b[0]);
      const groups = [];
      for (const s of segs) { const g = groups[groups.length - 1]; if (g && s[0] <= g[1] + 4) g[1] = Math.max(g[1], s[1]); else groups.push(s.slice()); }
      centers = groups.map(g => (g[0] + g[1]) / 2);
    }
    centers.sort((a, b) => a - b);
    const bounds = centers.slice(0, -1).map((c, i) => (c + centers[i + 1]) / 2);
    const colOf = it => { const c = it.x + widthOf(it) / 2; let k = 0; while (k < bounds.length && c > bounds[k]) k++; return k; };
    const roles = centers.map((_, k) => roleOf(lineText(headItems.filter(it => colOf(it) === k))));
    if (!roles.includes('name')) { const def = ['num', 'name', 'type', 'place', 'coord']; roles.forEach((r, i) => { roles[i] = r || def[i] || ''; }); }
    const left = Math.min(...headItems.map(it => it.x)), right = Math.max(...headItems.map(it => it.x + widthOf(it)));
    const mid = (left + right) / 2;
    const table = [];
    let cur = null, expected = 0;
    const flush = () => { if (cur) { table.push({ kind: 'row', cells: cur.map(col => { const ls = []; for (const L of col) ls.push(lineText(L)); return ls; }) }); cur = null; } };
    for (let i = after; i < lines.length; i++) {
      const L = lines[i];
      const t = L.text;
      if (L.items.some(it => /^№/.test(sp(it.s))) && /наименован|атауы/i.test(lines.slice(i, i + 3).map(x => x.text).join(' '))) { i += 2; continue; }   // тақырып қайталанған
      if (L.items.length >= 3 && L.items.every(it => /^\d{1,2}$/.test(sp(it.s)))) continue;
      const byCol = {};
      for (const it of L.items) (byCol[colOf(it)] = byCol[colOf(it)] || []).push(it);
      const c0 = byCol[0] ? lineText(byCol[0]) : '';
      if (c0 && NUM_RE.test(c0)) { flush(); cur = centers.map(() => []); }
      else if (c0 && !cur) continue;
      else if (c0) {                                   // нөмір бағанында сан емес — тізім аяқталды (қорытынды кесте)
        flush();
        for (let j = i; j < Math.min(lines.length, i + 30); j++) { const a = lines[j].text; const m = /^(всего|итого|барлығы|жиыны)\D*(\d+)$/i.exec(a); if (m) expected = +m[2]; }
        break;
      }
      if (L.items.length <= 2 && DISTRICT_RE.test(t) && Math.abs((L.items[0].x + widthOf(L.items[0]) / 2) - mid) < (right - left) * 0.18) { flush(); table.push({ kind: 'section', text: t }); continue; }
      if (!cur) continue;
      for (const k of Object.keys(byCol)) cur[k].push(byCol[k]);
    }
    flush();
    // Бет ауысқанда бір жол екі бөлікке бөлінуі мүмкін — нөмірсіз жалғас бөлік алдыңғыға қосылған (cur арқылы)
    return { roles, table, expected, textLines: lines.map(l => l.text) };
  }

  /** files.js нәтижесін толық талдау. */
  function analyze(doc) {
    const src = doc.kind === 'pdf' ? fromPdf(doc) : fromDocx(doc);
    if (!src || !src.table.length) throw new Error('Құжатта ескерткіштер тізімінің кестесі табылмады («№ | Атауы | …» тақырыбы бар кесте керек).');
    const { rows, warnings } = interpret(src.table, src.roles);
    const allText = src.textLines.join(' ') + ' ' + rows.slice(0, 200).map(r => r.name + ' ' + r.place + ' ' + r.typeRaw).join(' ');
    const lang = detectLang(allText);
    const m = meta(src.textLines, lang);
    const nums = rows.map(r => r.n);
    const gaps = [];
    for (let i = 1; i < nums.length; i++) if (nums[i] !== nums[i - 1] + 1) gaps.push(nums[i - 1] + '→' + nums[i]);
    if (gaps.length) warnings.push('Нөмірлеуде үзіліс не қайталану бар: ' + gaps.slice(0, 8).join(', ') + (gaps.length > 8 ? '…' : ''));
    if (src.expected && src.expected !== rows.length) warnings.push('Құжаттағы қорытынды бойынша ' + src.expected + ' ескерткіш, ал оқылғаны ' + rows.length + '.');
    const districts = [...new Set(rows.map(r => r.district).filter(Boolean))];
    return { lang, meta: m, rows, districts, expected: src.expected || 0, roles: src.roles, warnings };
  }

  return { analyze, detectLang, isPeriod, splitNamePeriod, joinLines, typeCode, parseCoord, meta };
});
