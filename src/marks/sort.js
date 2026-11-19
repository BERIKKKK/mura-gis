/* Ескерткіш белгілерін сұрыптау: аудан, содан кейін атау — атаудағы рим цифрлары санға айналдырылады.
   Мысалы «Қабантау-V қорғаны» → «Қабантау-5 қорғаны», сондықтан ол «Қабантау-IV қорғанынан» кейін түседі.
   Рим цифрлары латын әрпімен де, кириллицаның ұқсас әріптерімен де танылады:
     І (U+0406) → I,  Ү (U+04AE) және Ѵ → V,  Х → X,  С → C,  М → M,  У → V (тек I/V/X-пен бірге, мыс. «ІУ»),
     Ⅰ…Ⅿ (U+2160…) — дайын рим цифры таңбалары.
   Мысалы: ІҮ, IV, ІV, Ⅳ → 4;  Ү, V → 5;  ХІХ → 19.
   Рим цифры бас әріппен жазылады және кемінде бір I / V / X таңбасы болады — «Су», «С», «М.» т.б. сөз ретінде қалады.
   Таза модуль (DOM-сыз) — Node-та да тексеруге болады. */

// «Күшті» таңбалар (I, V, X және олардың кириллдегі баламалары)
const STRONG = { I: 'I', 'І': 'I', 'Ӏ': 'I', V: 'V', 'Ү': 'V', 'Ѵ': 'V', X: 'X', 'Х': 'X' };
// «Әлсіз» таңбалар — өздері жеке сөз не бас әріп болуы мүмкін, сондықтан тек күшті таңбамен бірге есептеледі
// (мыс. «ХС» → 90, «ХL» → 40, «ІУ» → 4)
const WEAK = { L: 'L', C: 'C', D: 'D', M: 'M', 'С': 'C', 'М': 'M', 'У': 'V' };
// Юникодтағы дайын рим цифрлары: Ⅰ Ⅱ … Ⅻ Ⅼ Ⅽ Ⅾ Ⅿ (және кіші әріптері)
const UNI = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'L', 'C', 'D', 'M'];
function uniRoman(ch) {
  const c = ch.codePointAt(0);
  if (c >= 0x2160 && c <= 0x216F) return UNI[c - 0x2160];
  if (c >= 0x2170 && c <= 0x217F) return UNI[c - 0x2170];
  return null;
}

const VALID = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
const VAL = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
function romanValue(r) {
  let n = 0;
  for (let k = 0; k < r.length; k++) {
    const v = VAL[r[k]], nx = VAL[r[k + 1]] || 0;
    n += v < nx ? -v : v;
  }
  return n;
}

/**
 * Бір сөз (әріптер тізбегі) рим цифры болса — оның мәні, әйтпесе null.
 * afterDash — сөздің алдында «-», «–», «—» тұр (мыс. «Қабантау-V»).
 * beforeDot — сөзден кейін нүкте (мыс. «Х. Досмұхамедұлы» — аты-жөннің бас әрпі, рим цифры емес).
 */
export function romanToken(word, afterDash = false, beforeDot = false) {
  if (!word) return null;
  let latin = '', strong = false;
  for (const ch of word) {
    const u = uniRoman(ch);
    if (u) { latin += u; strong = true; continue; }
    if (ch !== ch.toUpperCase()) return null;       // кіші әріп — қарапайым сөз («Су», «Mix»)
    if (STRONG[ch]) { latin += STRONG[ch]; strong = true; continue; }
    if (WEAK[ch]) { latin += WEAK[ch]; continue; }
    return null;                                     // рим цифрына жатпайтын әріп бар
  }
  if (!strong) return null;                          // «С», «М», «СМ» т.б. — сөз не бас әріп
  if (!afterDash && beforeDot && [...word].length === 1) return null;   // «І.», «Х.» — аты-жөннің бас әрпі
  if (!VALID.test(latin)) return null;
  const n = romanValue(latin);
  return n > 0 && n < 4000 ? n : null;
}

const WORD_RE = /[\p{L}Ⅰ-ⅿ]+/gu;
const DASHES = '-‐‑‒–—―';

/** Атаудағы рим цифрларын араб цифрларына айналдыру: «Қабантау-ІҮ қорғаны» → «Қабантау-4 қорғаны». */
export function arabizeRoman(s) {
  const str = String(s ?? '');
  return str.replace(WORD_RE, (w, off) => {
    const prev = str[off - 1] || '', next = str[off + w.length] || '';
    if (/[\p{N}]/u.test(prev) || /[\p{N}]/u.test(next)) return w;   // «12ХI» сияқты аралас жазу — өзгертпейміз
    const n = romanToken(w, prev !== '' && DASHES.includes(prev), next === '.');
    return n == null ? w : String(n);
  });
}

/** Атау бойынша сұрыптау кілті: рим цифрлары → сан, сызықшалар → бос орын, тырнақшалар алынады. */
export function nameKey(s) {
  return arabizeRoman(s).replace(/[‐‑‒–—―-]+/g, ' ').replace(/[«»"“”„'’]/g, '').replace(/\s+/g, ' ').trim();
}

/* Қазақ әліпбиі бойынша салыстыру. Electron-ның ICU-ында «kk» ережесі жоқ (ru/root ережесінде І, Ү т.б. басқа орында),
   сондықтан ретті өзіміз береміз: А Ә Б В Г Ғ Д Е Ё Ж З И Й К Қ Л М Н Ң О Ө П Р С Т У Ұ Ү Ф Х Һ Ц Ч Ш Щ Ъ Ы І Ь Э Ю Я.
   Сандар — мәнімен (2 < 10), бос орын мен тыныс белгілері — әріптерден бұрын, латын әріптері — кириллден кейін. */
const KK = 'аәбвгғдеёжзийкқлмнңоөпрстуұүфхһцчшщъыіьэюя';
const RANK = new Map([...KK].map((c, i) => [c, i]));
const tokens = s => String(s ?? '').toLocaleLowerCase('kk').normalize('NFC').match(/\d+|[\s\S]/gu) || [];
function rank(ch) {
  if (RANK.has(ch)) return 1000 + RANK.get(ch);
  if (/\s/.test(ch)) return 0;
  if (/[\p{P}\p{S}]/u.test(ch)) return 10 + (ch.codePointAt(0) % 900);
  return 2000 + ch.codePointAt(0);                  // латын және басқа әріптер
}
function kkCompare(a, b) {
  const A = tokens(a), B = tokens(b);
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    const x = A[i], y = B[i];
    if (x === y) continue;
    const dx = /^\d/.test(x), dy = /^\d/.test(y);
    if (dx && dy) { const d = Number(x) - Number(y); if (d) return d; if (x.length !== y.length) return x.length - y.length; continue; }
    if (dx !== dy) return dx ? -1 : 1;               // сан — әріптен бұрын
    return rank(x) - rank(y);
  }
  return A.length - B.length;
}
export const compareText = (a, b) => kkCompare(a, b);
export const compareNames = (a, b) => kkCompare(nameKey(a), nameKey(b)) || (String(a ?? '') < String(b ?? '') ? -1 : String(a ?? '') > String(b ?? '') ? 1 : 0);

/** Құжаттағы рет: аудан (ауданы жоқтар соңында), содан кейін атау (рим цифрлары ескеріледі). */
export function sortMarks(list) {
  return list.slice().sort((a, b) => {
    const da = String(a.district || '').trim(), db = String(b.district || '').trim();
    if (!da !== !db) return da ? -1 : 1;
    return compareText(da, db) || compareNames(a.name, b.name) || compareText(a.period, b.period);
  });
}
