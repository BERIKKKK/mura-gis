/* Мерзім (дәуір) өрісінің екі тілдегі мәнін синхрондау — Android нұсқасындағы Periods.kt ережесімен бірдей.
   Жазылған мәтін танылса, екінші тілдің мәні септігімен дұрыс құрылады; танылмаса — ештеңе өзгермейді.

     Жыл / аралық:  «1967» → «1967 жыл» / «1967 год»;  «1941–1945» → «1941–1945 жж.» / «1941–1945 гг.»
     Дәуірлер:      «Тас дәуірі» ↔ «Каменный век», «Қола дәуірі» ↔ «Эпоха бронзы»,
                    «Ерте темір дәуірі» ↔ «Эпоха раннего железа», «Орта ғасыр дәуірі» ↔ «Эпоха средневековья» т.б.
     Ғасырлар:      «XX ғасыр» ↔ «XX век»;  «XVII–XIX ғасырлар» ↔ «XVII–XIX века»;  «XIX ғ.» ↔ «XIX в.»
                    «XX ғасырдың басы / ортасы / соңы» ↔ «начало / середина / конец XX века»
                    «XIX ғасырдың бірінші / екінші жартысы» ↔ «первая / вторая половина XIX века»
                    «б.з.б. VII–IV ғасырлар» ↔ «VII–IV века до н. э.»
     Бірнеше бөлік: үтірмен («Ерте темір дәуірі, б.з.б. V ғасыр») не аралық сызықпен
                    («XIX ғасырдың соңы – XX ғасырдың басы») — әр бөлігі танылса ғана.
   Рим цифрлары латын әрпімен де, кириллицаның ұқсас әріптерімен де танылады (sort.js → romanToken);
   цифр жазылған күйінде қалады. Таза функциялар DOM-сыз (Node-та тексеріледі), bindPeriodSync — форма үшін. */
import { romanToken } from './sort.js';

const YEAR = /^\s*(\d{1,4})\s*(ж\.?|жыл|г\.?|год)?\s*$/iu;
const YEAR_RANGE = /^\s*(\d{1,4})\s*[-–—]\s*(\d{1,4})\s*(жж\.?|жылдар|гг\.?|годы)?\s*$/iu;

/** Жыл/аралық болса — [kk, ru], әйтпесе null. */
export function normalizeYear(text) {
  let m = YEAR.exec(text);
  if (m) return [m[1] + ' жыл', m[1] + ' год'];
  m = YEAR_RANGE.exec(text);
  if (m) { const r = m[1] + '–' + m[2]; return [r + ' жж.', r + ' гг.']; }
  return null;
}

/* ---------------- Дәуірлер: [қазақша нұсқалары, орысша нұсқалары] (бірінші — шығыс түрі) ---------------- */
const EPOCHS = [
  [['тас дәуірі'], ['каменный век', 'эпоха камня']],
  [['ерте тас дәуірі'], ['ранний каменный век']],
  [['палеолит дәуірі', 'палеолит'], ['эпоха палеолита', 'палеолит']],
  [['мезолит дәуірі', 'мезолит'], ['эпоха мезолита', 'мезолит']],
  [['неолит дәуірі', 'неолит'], ['эпоха неолита', 'неолит']],
  [['энеолит дәуірі', 'энеолит'], ['эпоха энеолита', 'энеолит']],
  [['қола дәуірі'], ['эпоха бронзы', 'бронзовый век']],
  [['ерте қола дәуірі'], ['эпоха ранней бронзы']],
  [['орта қола дәуірі'], ['эпоха средней бронзы']],
  [['кейінгі қола дәуірі', 'соңғы қола дәуірі'], ['эпоха поздней бронзы']],
  [['ерте темір дәуірі'], ['эпоха раннего железа', 'ранний железный век']],
  [['темір дәуірі'], ['железный век', 'эпоха железа']],
  [['орта ғасыр дәуірі', 'орта ғасырлар дәуірі', 'орта ғасырлар', 'орта ғасыр'], ['эпоха средневековья', 'средневековье', 'средние века']],
  [['ерте орта ғасырлар', 'ерте орта ғасыр дәуірі'], ['раннее средневековье']],
  [['дамыған орта ғасырлар'], ['развитое средневековье']],
  [['кейінгі орта ғасырлар', 'кейінгі орта ғасыр дәуірі'], ['позднее средневековье']],
  [['жаңа заман'], ['новое время']],
  [['қазіргі заман'], ['новейшее время']],
];

/* ---------------- Ғасырлар ---------------- */
const PARTS = [
  { kk: 'басы', ru: 'начало', ruIn: ['начало', 'в начале', 'начале'] },
  { kk: 'ортасы', ru: 'середина', ruIn: ['середина', 'в середине', 'середине'] },
  { kk: 'соңы', ru: 'конец', ruIn: ['конец', 'в конце', 'конце'] },
  { kk: 'бірінші жартысы', ru: 'первая половина', ruIn: ['первая половина', 'в первой половине', 'первой половине'] },
  { kk: 'екінші жартысы', ru: 'вторая половина', ruIn: ['вторая половина', 'во второй половине', 'второй половине'] },
];

const R = '([^\\s\\d\\-–—.,;]+)';       // рим цифры (кейін romanToken арқылы тексеріледі)
const D = '\\s*[-–—]\\s*';
const KK_BC = /^(б\.?\s*з\.?\s*б\.?|біздің заманымызға дейін(гі)?)\s+/u;
const KK_CENT = new RegExp('^' + R + '(?:' + D + R + ')?\\s*(ғасырлардың|ғасырдың|ғасырлар|ғасыр|ғғ\\.?|ғ\\.?)(?:\\s+(басы|ортасы|соңы|бірінші жартысы|екінші жартысы))?$', 'u');
const RU_BC = /\s+(до\s*н\.?\s*э\.?|до нашей эры)$/u;
const RU_CENT = new RegExp('^(?:(' + PARTS.flatMap(p => p.ruIn).join('|') + ')\\s+)?' + R + '(?:' + D + R + ')?\\s*(века|веков|век|вв\\.?|в\\.?)$', 'u');

const roman = s => !!s && romanToken(s.toUpperCase()) != null;

function parseKkCentury(src) {
  let s = src;
  const bcm = KK_BC.exec(s);
  if (bcm) s = s.slice(bcm[0].length);
  const m = KK_CENT.exec(s);
  if (!m) return null;
  const a = m[1], b = m[2] || null;
  if (!roman(a) || (b != null && !roman(b))) return null;
  const part = m[4] ? PARTS.find(p => p.kk === m[4]) : null;
  return { from: a, to: b, part, abbr: !m[3].startsWith('ғас'), bc: !!bcm };
}

function parseRuCentury(src) {
  let s = src;
  const bcm = RU_BC.exec(s);
  if (bcm) s = s.slice(0, bcm.index);
  const m = RU_CENT.exec(s);
  if (!m) return null;
  const part = m[1] ? PARTS.find(p => p.ruIn.includes(m[1])) : null;
  const a = m[2], b = m[3] || null;
  if (!roman(a) || (b != null && !roman(b))) return null;
  return { from: a, to: b, part, abbr: !m[4].startsWith('век'), bc: !!bcm };
}

const span = c => (c.to == null ? c.from : c.from + '–' + c.to);

function centuryKk(c) {
  const pl = c.to != null;
  const noun = c.abbr ? (pl ? 'ғғ.' : 'ғ.') : c.part ? (pl ? 'ғасырлардың' : 'ғасырдың') : (pl ? 'ғасырлар' : 'ғасыр');
  return (c.bc ? 'б.з.б. ' : '') + span(c) + ' ' + noun + (c.part ? ' ' + c.part.kk : '');
}

function centuryRu(c) {
  const pl = c.to != null;
  const noun = c.abbr ? (pl ? 'вв.' : 'в.') : c.part ? (pl ? 'веков' : 'века') : (pl ? 'века' : 'век');
  return (c.part ? c.part.ru + ' ' : '') + span(c) + ' ' + noun + (c.bc ? ' до н. э.' : '');
}

/* ---------------- Бір бөлікті аудару ---------------- */
const lowerOf = s => s.trim().replace(/\s+/g, ' ').toLowerCase().replace(/ё/g, 'е');
/** Мәтін кіші әріпке келтіріледі, бірақ рим цифры болуы мүмкін сөздер (бас әріппен жазылған) өзгермейді. */
const lowerKeepRoman = s => s.replace(/[\p{L}Ⅰ-ⅿ]+/gu, w => (romanToken(w) != null ? w : w.toLowerCase()));

function translatePiece(piece, from) {
  const t = lowerOf(piece);
  if (!t) return null;
  const kk = from === 'kk';
  const y = normalizeYear(t);
  if (y) return kk ? y[1] : y[0];
  const e = EPOCHS.find(([k, r]) => (kk ? k : r).includes(t));
  if (e) return kk ? e[1][0] : e[0][0];
  // Ғасыр: рим цифры жазылған күйінде қалуы үшін бастапқы мәтіннен (тек бос орындары қысқартылған) талданады
  const raw = lowerKeepRoman(piece.trim().replace(/\s+/g, ' '));
  const c = kk ? parseKkCentury(raw) : parseRuCentury(raw);
  return c ? (kk ? centuryRu(c) : centuryKk(c)) : null;
}

/** Бастапқы мәтін бас әріптен басталса — аударма да. */
function capitalizeLike(src, out) {
  const first = [...src].find(ch => /\p{L}/u.test(ch));
  if (!first || first === first.toLowerCase() || romanToken(src.match(/^\p{L}*/u)[0]) != null) return out;
  const i = out.search(/\p{L}/u);
  return i < 0 ? out : out.slice(0, i) + out[i].toUpperCase() + out.slice(i + 1);
}

/** Бүкіл мәтінді екінші тілге аудару (from — 'kk' не 'ru'): барлық бөлігі танылса — нәтиже, әйтпесе null. */
export function translatePeriod(text, from) {
  const src = String(text ?? '').trim();
  if (!src) return null;
  const out = [];
  for (const piece of src.split(/\s*[,;]\s*/)) {
    // Аралық сызықпен (бос орынмен) бөлінген бөліктер: «XIX ғасырдың соңы – XX ғасырдың басы»
    const sub = [];
    for (const s of piece.split(/\s+[-–—]\s+/)) {
      const t = translatePiece(s, from);
      if (t == null) return null;
      sub.push(t);
    }
    out.push(sub.join(' – '));
  }
  return capitalizeLike(src, out.join(', '));
}

/**
 * Синхрондау: p = { kk, ru }, edited — қай тілде жазылды. Танылса — екінші тілдің мәні құрылады.
 * Екінші тілде қолмен жазылған, танылмайтын мәтін болса — ол өзгертілмейді (пайдаланушының аудармасы сақталады).
 * Жыл/аралық жазылса, екі тілдің мәні де толық түрге келтіріледі («1967» → «1967 жыл» / «1967 год»).
 */
export function syncPeriod(p, edited) {
  const other = l => (l === 'kk' ? 'ru' : 'kk');
  const lang = String(p[edited] || '').trim() ? edited : other(edited);
  const src = String(p[lang] || '');
  const y = normalizeYear(src);
  if (y) return { kk: y[0], ru: y[1] };
  const tr = translatePeriod(src, lang);
  if (tr == null) return { ...p };
  const target = String(p[other(lang)] || '');
  if (target.trim() && translatePeriod(target, other(lang)) == null) return { ...p };
  return { ...p, [other(lang)]: tr };
}

/**
 * Форманың мерзім өрістерін байланыстыру (kkEl, ruEl — input/textarea). Жазып жатқанда екі тілдегі мәні астында
 * алдын ала көрсетіледі; өрістен шыққанда (не apply() шақырылғанда, мыс. сақтау алдында) екі өріс те толтырылады.
 * Тек пайдаланушы өзі жазғанда іске қосылады — жүктелген не бағдарлама қойған мән өзгертілмейді.
 * Өзгерген өріске «input» оқиғасы жіберіледі (форманың өз өңдеушілері — алдын ала көрініс, авто сақтау — жаңарсын).
 */
export function bindPeriodSync(kkEl, ruEl) {
  if (!kkEl || !ruEl) return { apply() {} };
  let edited = null;
  const box = kkEl.closest('.mura-bi') || kkEl.parentNode;
  const hint = document.createElement('p');
  hint.className = 'qa-hint mura-period-hint';
  hint.hidden = true;
  box.appendChild(hint);
  const cur = () => ({ kk: kkEl.value, ru: ruEl.value });
  const result = () => {
    if (!edited) return null;
    const p = cur(), s = syncPeriod(p, edited);
    return s.kk === p.kk && s.ru === p.ru ? null : s;
  };
  const paint = () => { const s = result(); hint.hidden = !s; hint.textContent = s ? s.kk + ' · ' + s.ru : ''; };
  const apply = () => {
    const s = result();
    if (s) for (const [el, v] of [[kkEl, s.kk], [ruEl, s.ru]]) if (el.value !== v) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
    paint();
  };
  for (const [el, l] of [[kkEl, 'kk'], [ruEl, 'ru']]) {
    el.addEventListener('input', e => { if (!e.isTrusted) return; edited = l; paint(); });
    el.addEventListener('change', apply);
  }
  return { apply };
}
