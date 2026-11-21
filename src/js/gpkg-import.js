/* Mura GIS: бөтен GeoPackage (.gpkg) файлынан ашық жобаға импорт.
   1. Қабаттар: әр қабатқа мақсат таңдалады (ескерткіштер, ескерткіш аумағы, дайын аймақ полигондары, маршруттар…).
      Атрибуттар кестесі біздің өрістерге автоматты сәйкестендіріледі (атауы, облыс, аудан… — қазақша, орысша,
      ағылшынша атаулары бойынша). Толық сәйкес келмесе — «Сәйкестендіру» батырмасы: әр өріске бастапқы бағанды таңдау.
   2. Тексеру: импортталған қорғау / реттеу / ландшафт аймақтарының полигондары ескерткіш аумағымен (ішіндегі
      ескерткіш шекарасы) байланыстырылып, ҚР МСМ № 86 бұйрығының 7–9-тармақтарына сәйкестігі тексеріледі. Сәйкес келмесе —
      ескерту; әр ескерткіш үшін: «Қалдыру» (полигондар сол күйінде сақталады) не «Қайта есептеу» (аймақтар ескерткіш
      аумағынан заң бойынша есептеледі).
   3. Импорт: ескерткіштер, маршруттар, импортталған нүктелер — өз қоймаларына; аймақтар — жаңа жазба не бар жазбаға.
   Файлды оқу және координаттарды WGS 84-ке түрлендіру — негізгі процесте (main/gpkg-read.js). */
const $ = id => document.getElementById(id);
const M = globalThis.mura || {};
const QA = globalThis.__qa;
const REG = globalThis.MuraRegions;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = n => Number(n).toLocaleString('ru-RU');
const tx = (kk, ru) => (globalThis.MuraI18n && globalThis.MuraI18n.ru ? ru : kk);

/* ======================= Мақсаттар мен өрістер ======================= */
const TARGETS = {
  // Мәтіндік өрістер екі тілде: name (қазақша) және name_ru (орысша) т.б.; міндетті — атаудың біреуі (қазақша не орысша)
  marks: { label: tx('Ескерткіштер (белгі)', 'Памятники (метки)'), geom: ['Point', 'Polygon'], fields: [
    ['name', tx('Атауы (қазақша)', 'Наименование (по-казахски)'), true], ['name_ru', tx('Атауы (орысша)', 'Наименование (по-русски)')],
    ['period', tx('Мерзімі (қазақша)', 'Датировка (по-казахски)')], ['period_ru', tx('Мерзімі (орысша)', 'Датировка (по-русски)')],
    ['oblast', tx('Облыс', 'Область')], ['district', tx('Аудан / қала', 'Район / город')],
    ['place', tx('Орналасқан жері (қазақша)', 'Местонахождение (по-казахски)')], ['place_ru', tx('Орналасқан жері (орысша)', 'Местонахождение (по-русски)')],
    ['type', tx('Түрі (Заңның 5-бабы)', 'Вид (статья 5 Закона)')], ['category', tx('Санаты', 'Категория')], ['status', tx('Мәртебесі', 'Статус')],
    ['note', tx('Ескертпе (қазақша)', 'Примечание (по-казахски)')], ['note_ru', tx('Ескертпе (орысша)', 'Примечание (по-русски)')]] },
  zones: { label: tx('Ескерткіш аумағы → қорғау аймағы жазбасы', 'Территория памятника → запись охранной зоны'), geom: ['Polygon'], fields: [
    ['name', tx('Атауы (қазақша)', 'Наименование (по-казахски)'), true], ['name_ru', tx('Атауы (орысша)', 'Наименование (по-русски)')],
    ['gen', tx('Атауы (ілік септік)', 'Наименование (каз., ілік септік)')], ['gen_ru', tx('Атауы (орысша, родительный падеж)', 'Наименование (родительный падеж)')],
    ['period', tx('Мерзімі (қазақша)', 'Датировка (по-казахски)')], ['period_ru', tx('Мерзімі (орысша)', 'Датировка (по-русски)')],
    ['oblast', tx('Облыс', 'Область')], ['district', tx('Аудан / қала', 'Район / город')],
    ['place', tx('Орналасқан жері (қазақша)', 'Местонахождение (по-казахски)')], ['place_ru', tx('Орналасқан жері (орысша)', 'Местонахождение (по-русски)')],
    ['desc', tx('Сипаттамасы (қазақша)', 'Описание (по-казахски)')], ['desc_ru', tx('Сипаттамасы (орысша)', 'Описание (по-русски)')],
    ['type', tx('Ескерткіш түрі (7-тармақ)', 'Вид памятника (пункт 7)')], ['height', tx('Биіктігі, м', 'Высота, м')]] },
  z1: { label: tx('Қорғау аймағы (дайын полигон)', 'Охранная зона (готовый полигон)'), geom: ['Polygon'], fields: [], zone: 0 },
  z2: { label: tx('Құрылыс салуды реттеу аймағы (дайын полигон)', 'Зона регулирования застройки (готовый полигон)'), geom: ['Polygon'], fields: [], zone: 1 },
  z3: { label: tx('Қорғалатын табиғи ландшафт аймағы (дайын полигон)', 'Зона охраняемого природного ландшафта (готовый полигон)'), geom: ['Polygon'], fields: [], zone: 2 },
  routes: { label: tx('Маршруттар', 'Маршруты'), geom: ['LineString'], fields: [
    ['name', tx('Атауы', 'Название')], ['a_name', tx('Басы (А)', 'Начало (А)')], ['b_name', tx('Соңы (Б)', 'Конец (Б)')], ['vehicle', tx('Көлік', 'Транспорт')], ['season', tx('Маусым', 'Сезон')], ['checked', tx('Тексерілген күні', 'Дата проверки')], ['note', tx('Ескертпе', 'Примечание')]] },
  // Өзге нысандар (елді мекен, қыстау, құдық…): атауы міндетті емес, түрі — таныс мәнге келтіріледі (normKind)
  places: { label: tx('Өзге нысандар (елді мекен, қыстау, құдық…)', 'Прочие объекты (населённые пункты, зимовки, колодцы…)'), geom: ['Point', 'Polygon'], fields: [
    ['name', tx('Атауы (қазақша)', 'Название (по-казахски)')], ['name_ru', tx('Атауы (орысша)', 'Название (по-русски)')], ['kind', tx('Түрі', 'Вид')]] },
  imports: { label: tx('Импортталған нүктелер (кейін сәйкестендіріледі)', 'Импортированные точки (сопоставляются позже)'), geom: ['Point'], fields: [['name', tx('Атауы', 'Наименование')], ['desc', tx('Сипаттамасы', 'Описание')]] },
  skip: { label: tx('Импорттамау', 'Не импортировать'), geom: ['Point', 'LineString', 'Polygon'], fields: [] },
};
// Бағандардың атаулары бойынша автоматты сәйкестендіру (кіші әріппен, бос орын / _ / - алынып тасталады)
const SYN = {
  name: ['name', 'атауы', 'атау', 'аты', 'namekk', 'namekz', 'title', 'label', 'objname', 'monument', 'ескерткіш', 'nameobj'],
  name_ru: ['nameru', 'название', 'наименование', 'наимен', 'naim', 'nazv', 'nazvanie', 'объект', 'памятник', 'атауыорысша'],
  gen: ['gen', 'genitive', 'іліксепті'],
  gen_ru: ['genru', 'родпадеж', 'родительный'],
  period: ['period', 'мерзімі', 'мерзім', 'кезеңі', 'дәуірі', 'epoch', 'date', 'dating', 'age'],
  period_ru: ['periodru', 'датировка', 'период', 'эпоха', 'время'],
  oblast: ['oblast', 'облыс', 'облысы', 'область', 'обл', 'region', 'regionname'],
  district: ['district', 'аудан', 'ауданы', 'район', 'raion', 'rayon', 'audan', 'город', 'қала'],
  place: ['place', 'орналасқанжері', 'орналасуы', 'орны', 'address', 'location', 'locality'],
  place_ru: ['placeru', 'местоположение', 'местонахождение', 'адрес', 'место'],
  desc: ['desc', 'description', 'сипаттамасы', 'сипаттама', 'descr'],
  desc_ru: ['descru', 'descriptionru', 'описание', 'opisanie'],
  note: ['note', 'notes', 'ескертпе', 'comment', 'comments', 'remark'],
  note_ru: ['noteru', 'примечание', 'прим'],
  type: ['type', 'түрі', 'тип', 'вид', 'kind', 'типпамятника', 'видпамятника', 'монтип'],
  category: ['category', 'санаты', 'категория', 'значение', 'маңызы', 'cat'],
  status: ['status', 'мәртебесі', 'статус'],
  height: ['height', 'биіктігі', 'высота', 'h', 'heightm'],
  a_name: ['aname', 'from', 'start', 'басы', 'начало', 'откуда'],
  b_name: ['bname', 'to', 'end', 'соңы', 'конец', 'куда'],
  vehicle: ['vehicle', 'көлік', 'транспорт', 'transport'],
  season: ['season', 'маусым', 'сезон'],
  checked: ['checked', 'тексерілген', 'проверено', 'датапроверки'],
};
const norm = s => String(s || '').toLocaleLowerCase('ru').replace(/[\s_\-.:]+/g, '');
const MURA_COL = { desc: { zones: 'description', imports: 'description' }, desc_ru: { zones: 'description_ru' } };
/** Міндетті өріс толтырылған ба: атау — қазақша не орысша. */
const hasReq = (m, k) => !!(m[k] || (k === 'name' && m.name_ru));

/** Қабат бағандарын мақсат өрістеріне автоматты сәйкестендіру. */
function autoMap(layer, target, isMura) {
  const map = {};
  const used = new Set();
  for (const [k] of TARGETS[target].fields) {
    const exact = isMura ? (MURA_COL[k] && MURA_COL[k][target]) || k : null;
    let col = exact && layer.columns.includes(exact) ? exact : null;
    if (!col) col = layer.columns.find(c => !used.has(c) && (SYN[k] || [k]).includes(norm(c)));
    if (!col) col = layer.columns.find(c => !used.has(c) && (SYN[k] || [k]).some(s => s.length > 3 && norm(c).startsWith(s)));
    if (col) { map[k] = col; used.add(col); }
  }
  return map;
}
/** Сәйкестендіру күйі: міндетті өріс жоқ → 'need'; бағандардың бәрі өріске сәйкес келсе → 'ok'; әйтпесе → 'partial'. */
function mapState(L) {
  const t = TARGETS[L.target];
  if (!t.fields.length || L.target === 'skip') return 'none';
  if (t.fields.some(([k, , req]) => req && !hasReq(L.map, k))) return 'need';
  const mapped = new Set(Object.values(L.map));
  return L.columns.every(c => mapped.has(c) || /^(fid|id|uid|ogc_fid|objectid|created_|updated_|imported_at|file|folder|props)/i.test(c)) ? 'ok' : 'partial';
}
/** Қабаттың атауы мен геометриясы бойынша мақсатты болжау. */
function guessTarget(L, isMura) {
  const n = norm(L.table + ' ' + L.title);
  if (isMura && TARGETS[L.table] && TARGETS[L.table].geom.includes(L.geom)) return L.table;
  if (L.geom === 'LineString') return /маршрут|route|track|жол|дорог|трек/.test(n) ? 'routes' : 'routes';
  if (L.geom === 'Point') return 'marks';
  if (L.geom === 'Polygon') {
    if (/ландшафт|landscape/.test(n)) return 'z3';
    if (/реттеу|регулир|regulat|застрой|құрылыс/.test(n)) return 'z2';
    if (/қорғау|охран|protect|buffer|буфер|аймақ|зона|zone/.test(n)) return 'z1';
    return 'zones';
  }
  return 'skip';
}

/* ======================= Мәндерді қалыпқа келтіру ======================= */
const has = (v, re) => re.test(String(v || '').toLocaleLowerCase('ru'));
function normType(v, zone) {
  const s = String(v || '').trim();
  if (['archeo', 'arch', 'ensemble', 'sacred', 'art'].includes(s) || (zone && s === 'custom')) return s;
  if (has(s, /археол|archaeo|archeo/)) return 'archeo';
  if (has(s, /ансамбл|кешен|комплекс|ensemble/)) return 'ensemble';
  if (has(s, /киелі|сакрал|культ|sacred|мешіт|мечет|кесене|мавзол|ғибадат/)) return 'sacred';
  if (has(s, /монумент|өнер|искусств|ескерткіш-мүсін|скульпт|art/)) return 'art';
  if (has(s, /сәулет|архитект|қала құрылыс|градостро|arch/)) return 'arch';
  return '';
}
function normCat(v) {
  const s = String(v || '').trim();
  if (['intl', 'rep', 'local'].includes(s)) return s;
  if (has(s, /халықаралық|междунар|intern/)) return 'intl';
  if (has(s, /республика/)) return 'rep';
  if (has(s, /жергілікті|местн|local|облыс/)) return 'local';
  return '';
}
/** Өзге нысанның түрі: код (settlement…) не атауы (қыстау, колодец…); танылмаса — «Басқа». */
function normKind(v) {
  const s = String(v || '').trim();
  if (['settlement', 'qystau', 'zhailau', 'kuzeu', 'kokteu', 'turaq', 'well', 'spring', 'other'].includes(s)) return s;
  if (has(s, /қыстау|зимов/)) return 'qystau';
  if (has(s, /жайлау|летов|летн/)) return 'zhailau';
  if (has(s, /күзеу|осен/)) return 'kuzeu';
  if (has(s, /көктеу|весен/)) return 'kokteu';
  if (has(s, /құдық|колод|well/)) return 'well';
  if (has(s, /бұлақ|родник|spring|источ/)) return 'spring';
  if (has(s, /тұрақ|стоян/)) return 'turaq';
  if (has(s, /елді|ауыл|село|посел|аул|город|қала|settle|village/)) return 'settlement';
  return 'other';
}
function normStatus(v) {
  const s = String(v || '').trim();
  if (['state', 'prelim', 'archreg', 'excluded'].includes(s)) return s;
  if (has(s, /алдын ала|предвар|prelim/)) return 'prelim';
  if (has(s, /есеп|учет|учёт|archreg|регистр/)) return 'archreg';
  if (has(s, /алынған|шығарыл|исключ|excluded/)) return 'excluded';
  return 'state';
}
const normVehicle = v => (['car', '4x4', 'foot'].includes(v) ? v : has(v, /жеңіл|легков|car|авто/) ? 'car' : has(v, /жаяу|пеш|foot|walk/) ? 'foot' : '4x4');
const normSeason = v => (['all', 'dry'].includes(v) ? v : has(v, /құрғақ|сух|dry|жаз|лет/) ? 'dry' : 'all');
function normDate(v) {
  const s = String(v || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(s);
  return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : '';
}
const str = v => (v == null ? '' : String(v).trim());

/* ======================= Геометрия ======================= */
const ringOf = g => { const r = g.map(p => ({ lat: p[1], lon: p[0] })); const a = r[0], z = r[r.length - 1]; if (r.length > 1 && a.lat === z.lat && a.lon === z.lon) r.pop(); return r; };
function localProj(pts) {
  const lat0 = pts.reduce((s, p) => s + p.lat, 0) / pts.length, lon0 = pts.reduce((s, p) => s + p.lon, 0) / pts.length;
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110574;
  return p => [(p.lon - lon0) * kx, (p.lat - lat0) * ky];
}
/** Дуглас–Пекер (жабық сызық): нүкте саны max-тан аспағанша төзімділікті өсіреміз. */
function simplifyRing(r, max) {
  if (r.length <= max) return r;
  const P = localProj(r), X = r.map(P);
  const dp = (tol) => {
    const keep = new Uint8Array(r.length); keep[0] = 1; keep[r.length - 1] = 1;
    const st = [[0, r.length - 1]];
    while (st.length) {
      const [a, b] = st.pop();
      let best = -1, bd = tol;
      for (let i = a + 1; i < b; i++) {
        const dx = X[b][0] - X[a][0], dy = X[b][1] - X[a][1], l = Math.hypot(dx, dy) || 1;
        const d = Math.abs(dy * X[i][0] - dx * X[i][1] + X[b][0] * X[a][1] - X[b][1] * X[a][0]) / l;
        if (d > bd) { bd = d; best = i; }
      }
      if (best > 0) { keep[best] = 1; st.push([a, best], [best, b]); }
    }
    return r.filter((_, i) => keep[i]);
  };
  let tol = 0.05, out = r;
  while (out.length > max && tol < 1e4) { out = dp(tol); tol *= 1.6; }
  return out;
}
/** Ескерткіш шекарасы: 4–500 нүкте (Mura GIS талабы). */
function monumentPts(g) {
  let r = simplifyRing(ringOf(g), 500);
  if (r.length === 3) {                                // үшбұрыш: ең ұзын қабырғаның ортасына нүкте
    const P = localProj(r), X = r.map(P);
    let k = 0, best = -1;
    for (let i = 0; i < 3; i++) { const d = Math.hypot(X[(i + 1) % 3][0] - X[i][0], X[(i + 1) % 3][1] - X[i][1]); if (d > best) { best = d; k = i; } }
    const a = r[k], b = r[(k + 1) % 3];
    r.splice(k + 1, 0, { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 });
  }
  return r;
}
const centroid = r => { const n = r.length; return { lat: r.reduce((s, p) => s + p.lat, 0) / n, lon: r.reduce((s, p) => s + p.lon, 0) / n }; };
function inRing(p, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a.lat > p.lat) !== (b.lat > p.lat) && p.lon < (b.lon - a.lon) * (p.lat - a.lat) / (b.lat - a.lat) + a.lon) c = !c;
  }
  return c;
}
const ringAreaDeg = r => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a.lon * b.lat - b.lon * a.lat; } return Math.abs(s / 2); };

/* ======================= Терезе ======================= */
let dlg = null, src = null, plan = null;
function close() { if (dlg) { dlg.remove(); dlg = null; } src = null; plan = null; }
function frame(title, body, foot) {
  if (!dlg) {
    dlg = document.createElement('div');
    dlg.className = 'mura-dlg-back gi-back';
    document.body.appendChild(dlg);
    dlg.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); if (dlg.querySelector('.gi-map')) closeMap(); else close(); } });
  }
  dlg.innerHTML = '<div class="mura-dlg gi-dlg" role="dialog" aria-modal="true" aria-labelledby="giT">' +
    '<div class="gi-head"><h3 id="giT">' + title + '</h3><button type="button" class="mura-start-x" data-gi-x aria-label="' + tx('Жабу', 'Закрыть') + '" title="' + tx('Жабу (Esc)', 'Закрыть (Esc)') + '"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button></div>' +
    '<div class="gi-body">' + body + '</div><div class="gi-foot">' + foot + '</div></div>';
  dlg.querySelector('[data-gi-x]').addEventListener('click', close);
}
const toast = (t, err) => {
  const el = $('qaToast');
  if (!el) return;
  el.textContent = t; el.hidden = false; el.classList.toggle('is-err', !!err);
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, err ? 7000 : 4000);
};

/** Импортты бастау: file берілмесе — файл таңдау терезесі. */
async function start(file) {
  if (!M.gpkgInspect) return;
  if (!(M.project && M.project.current)) { toast(tx('Алдымен жобаны ашыңыз не жаңа жоба құрыңыз.', 'Сначала откройте проект или создайте новый.'), true); return; }
  frame(tx('GeoPackage импорты', 'Импорт GeoPackage'), '<p class="gi-busy">' + tx('Файл оқылуда…', 'Чтение файла…') + '</p>', '');
  let r;
  try { r = await M.gpkgInspect(file || ''); } catch (e) { r = { ok: false, error: e.message }; }
  if (!r.ok || r.canceled) { close(); if (!r.ok) toast(tx('Файл оқылмады: ', 'Не удалось прочитать файл: ') + r.error, true); return; }
  src = r.data;
  src.layers.forEach(L => {
    L.target = L.error || !L.geom ? 'skip' : guessTarget(L, src.isMura);
    L.map = autoMap(L, L.target, src.isMura);
  });
  renderLayers();
}

/* ---------- 1-қадам: қабаттар ---------- */
function targetOptions(L) {
  return Object.entries(TARGETS).filter(([, t]) => t.geom.includes(L.geom)).map(([k, t]) =>
    '<option value="' + k + '"' + (k === L.target ? ' selected' : '') + '>' + esc(t.label + (k === 'marks' && L.geom === 'Polygon' ? tx(' — полигонның ортасы', ' — центр полигона') : '')) + '</option>').join('');
}
const GEOM_KK = { Point: tx('нүкте', 'точка'), LineString: tx('сызық', 'линия'), Polygon: tx('полигон', 'полигон') };
function renderLayers() {
  const rows = src.layers.map((L, i) => {
    const st = L.error ? 'err' : mapState(L);
    const chip = L.error ? '<span class="gi-chip is-err">' + esc(L.error) + '</span>'
      : st === 'need' ? '<span class="gi-chip is-warn">' + tx('Атрибуттар сәйкес келмейді', 'Атрибуты не сопоставлены') + '</span>'
      : st === 'partial' ? '<span class="gi-chip is-part">' + tx('Ішінара сәйкес', 'Сопоставлены частично') + '</span>'
      : st === 'ok' ? '<span class="gi-chip is-ok">' + tx('Атрибуттар сәйкес', 'Атрибуты сопоставлены') + '</span>'
      : L.target === 'skip' ? '' : '<span class="gi-chip">' + tx('Ескерткіш аумағымен кеңістікте байланыстырылады', 'Связывается с территорией памятника по положению') + '</span>';
    const btn = L.error || st === 'none' ? '' : '<button type="button" class="btn btn--sm ' + (st === 'need' ? 'btn--primary' : 'btn--ghost') + '" data-map="' + i + '">' + tx('Сәйкестендіру', 'Сопоставить') + '</button>';
    const notes = [L.truncated ? tx('алғашқы ' + nf(L.features.length) + ' нысаны ғана', 'только первые ' + nf(L.features.length) + ' объектов') : '', L.multi ? tx(L.multi + ' көп бөлікті нысанның ең үлкен бөлігі алынады', 'у ' + L.multi + ' составных объектов берётся наибольшая часть') : '', L.holes ? tx(L.holes + ' полигонның ішкі тесіктері ескерілмейді', 'внутренние отверстия ' + L.holes + ' полигонов не учитываются') : ''].filter(Boolean).join(' · ');
    return '<tr' + (L.error ? ' class="is-dis"' : '') + '>' +
      '<td><b>' + esc(L.title) + '</b>' + (L.title !== L.table ? ' <small>(' + esc(L.table) + ')</small>' : '') +
        '<div class="gi-sub">' + esc((GEOM_KK[L.geom] || L.declared || '—') + ' · ' + nf(L.features.length) + tx(' нысан', ' объектов') + (L.srs ? ' · ' + L.srs : '')) + '</div>' +
        (notes ? '<div class="gi-sub gi-note">' + esc(notes) + '</div>' : '') + '</td>' +
      '<td>' + (L.error ? '' : '<select data-tgt="' + i + '" aria-label="' + esc(L.title) + tx(': не ретінде импорттау', ': импортировать как') + '">' + targetOptions(L) + '</select>') + '</td>' +
      '<td class="gi-st">' + chip + btn + '</td></tr>';
  }).join('');
  const blocked = src.layers.filter(L => !L.error && L.target !== 'skip' && mapState(L) === 'need');
  const any = src.layers.some(L => !L.error && L.target !== 'skip');
  frame(tx('GeoPackage импорты: ', 'Импорт GeoPackage: ') + esc(src.name),
    (src.isMura ? '<p class="mura-hint">' + tx('Бұл — басқа Mura GIS жобасы: қабаттары өздігінен сәйкестендірілді.', 'Это другой проект Mura GIS: слои сопоставлены автоматически.') + '</p>' :
      '<p class="mura-hint">' + tx('Әр қабат не ретінде импортталатынын таңдаңыз. Атрибуттар кестесі жобаның өрістеріне сәйкес келмесе, «Сәйкестендіру» арқылы әр өріске бағанды көрсетіңіз. Дайын қорғау аймақтарының полигондары ескерткіш аумағымен байланыстырылып, заңнамаға сәйкестігі тексеріледі.',
        'Выберите, как импортировать каждый слой. Если таблица атрибутов не совпадает с полями проекта, укажите столбец для каждого поля через «Сопоставить». Готовые полигоны охранных зон связываются с территорией памятника и проверяются на соответствие законодательству.') + '</p>') +
    '<table class="gi-tbl"><thead><tr><th>' + tx('Қабат', 'Слой') + '</th><th>' + tx('Импорттау', 'Импорт') + '</th><th>' + tx('Атрибуттар', 'Атрибуты') + '</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    (blocked.length ? '<p class="mura-err">' + esc(blocked.map(L => L.title).join(', ')) + tx(': міндетті өріс (атауы) таңдалмаған — «Сәйкестендіру» басыңыз.', ': не выбрано обязательное поле (наименование) — нажмите «Сопоставить».') + '</p>' : ''),
    '<span class="gi-sp"></span><button type="button" class="btn btn--ghost btn--sm" data-gi-x2>' + tx('Бас тарту', 'Отмена') + '</button>' +
    '<button type="button" class="btn btn--primary btn--sm" id="giNext"' + (blocked.length || !any ? ' disabled' : '') + '>' + tx('Жалғастыру', 'Продолжить') + '</button>');
  dlg.querySelector('[data-gi-x2]').addEventListener('click', close);
  dlg.querySelectorAll('[data-tgt]').forEach(s => s.addEventListener('change', () => {
    const L = src.layers[+s.dataset.tgt];
    L.target = s.value; L.map = autoMap(L, L.target, src.isMura);
    renderLayers();
  }));
  dlg.querySelectorAll('[data-map]').forEach(b => b.addEventListener('click', () => openMap(+b.dataset.map)));
  $('giNext').addEventListener('click', buildPlan);
}

/* ---------- Сәйкестендіру терезесі ---------- */
function openMap(i) {
  const L = src.layers[i], t = TARGETS[L.target];
  const sample = c => { const v = L.features.slice(0, 40).map(f => f.p[c]).filter(x => x != null && String(x).trim() !== ''); return v.length ? String(v[0]).slice(0, 60) : ''; };
  const opts = sel => '<option value="">' + tx('— жоқ —', '— нет —') + '</option>' + L.columns.map(c => '<option value="' + esc(c) + '"' + (c === sel ? ' selected' : '') + '>' + esc(c) + (sample(c) ? '  («' + esc(sample(c)) + '»)' : '') + '</option>').join('');
  const used = new Set(Object.values(L.map));
  const free = L.columns.filter(c => !used.has(c));
  const box = document.createElement('div');
  box.className = 'gi-map';
  box.innerHTML = '<form class="gi-map-in" novalidate><h4>' + tx('Сәйкестендіру: ', 'Сопоставление: ') + esc(L.title) + ' → ' + esc(t.label) + '</h4>' +
    '<p class="mura-hint">' + tx('Әр өріске файлдағы бағанды таңдаңыз (жақшада — бірінші мәні). Облыс пен аудан бос болса — жобаның облысы мен ауданы қойылады; түрі, санаты, мәртебесі мәтіннен танылады (мыс. «Археология» → археологиялық ескерткіш). Атауы, мерзімі, жері, сипаттамасы — қазақша және орысша бөлек бағандардан.',
      'Выберите столбец файла для каждого поля (в скобках — первое значение). Если область и район пусты — подставляются область и район проекта; вид, категория, статус распознаются по тексту (напр. «Археология» → памятник археологии). Наименование, датировка, местонахождение, описание — из отдельных казахских и русских столбцов.') + '</p>' +
    '<table class="gi-mtbl"><tbody>' + t.fields.map(([k, lbl, req]) =>
      '<tr><th><label for="giF_' + k + '">' + esc(lbl) + (req ? ' <span class="mk-req">*</span>' : '') + '</label></th><td><select id="giF_' + k + '" name="' + k + '">' + opts(L.map[k]) + '</select></td></tr>').join('') +
    '</tbody></table>' +
    (free.length ? '<p class="mura-hint">' + tx('Пайдаланылмайтын бағандар: ', 'Неиспользуемые столбцы: ') + esc(free.join(', ')) + '</p>' : '') +
    '<p class="mura-err" id="giMapErr" hidden></p>' +
    '<div class="mura-dlg-btns"><button type="button" class="btn btn--ghost btn--sm" data-cancel>' + tx('Бас тарту', 'Отмена') + '</button><button type="submit" class="btn btn--primary btn--sm">' + tx('Қолдану', 'Применить') + '</button></div></form>';
  dlg.querySelector('.gi-dlg').appendChild(box);
  const f = box.querySelector('form');
  box.querySelector('[data-cancel]').addEventListener('click', closeMap);
  f.addEventListener('submit', e => {
    e.preventDefault();
    const m = {};
    for (const [k] of t.fields) if (f.elements[k].value) m[k] = f.elements[k].value;
    const miss = t.fields.filter(([k, , req]) => req && !hasReq(m, k));
    if (miss.length) { const er = $('giMapErr'); er.textContent = tx('Атауы (қазақша не орысша) — міндетті өріс.', 'Наименование (по-казахски или по-русски) — обязательное поле.'); er.hidden = false; return; }
    L.map = m;
    closeMap();
    renderLayers();
  });
  setTimeout(() => f.elements[t.fields[0][0]].focus(), 20);
}
function closeMap() { const b = dlg && dlg.querySelector('.gi-map'); if (b) b.remove(); }

/* ---------- 2-қадам: жазбаларды құру, аймақтарды байланыстыру және тексеру ---------- */
async function buildPlan() {
  const P = M.project.current, defOb = (REG && REG.project.oblast) || '', defDi = (REG && REG.project.district) || '';
  const val = (L, f, k) => (L.map[k] ? str(f.p[L.map[k]]) : '');
  plan = { marks: [], places: [], routes: [], imports: [], monuments: [], zonePolys: [], unlinked: 0, noType: 0, src: src.name };
  for (const L of src.layers) {
    if (L.error || L.target === 'skip') continue;
    const tag = src.name + ' / ' + L.title;
    for (const f of L.features) {
      if (L.target === 'marks') {
        const c = L.geom === 'Polygon' ? centroid(ringOf(f.g)) : { lat: f.g[1], lon: f.g[0] };
        const name = val(L, f, 'name'), name_ru = val(L, f, 'name_ru');
        if (!name && !name_ru) continue;
        plan.marks.push({ name, name_ru, period_ru: val(L, f, 'period_ru'), place_ru: val(L, f, 'place_ru'), note_ru: val(L, f, 'note_ru'), period: val(L, f, 'period'), oblast: val(L, f, 'oblast') || defOb, district: val(L, f, 'district') || (val(L, f, 'oblast') ? '' : defDi),
          place: val(L, f, 'place'), type: normType(val(L, f, 'type')) || 'archeo', category: normCat(val(L, f, 'category')), status: normStatus(val(L, f, 'status')),
          note: val(L, f, 'note'), lat: c.lat, lon: c.lon });
      } else if (L.target === 'places') {
        const c = L.geom === 'Polygon' ? centroid(ringOf(f.g)) : { lat: f.g[1], lon: f.g[0] };
        plan.places.push({ name: val(L, f, 'name'), name_ru: val(L, f, 'name_ru'), kind: normKind(val(L, f, 'kind')), lat: c.lat, lon: c.lon,
          id: src.isMura ? str(f.p.uid || f.p.id || '') : '', updated_at: src.isMura ? str(f.p.updated_at || '') : '' });
      } else if (L.target === 'imports') {
        plan.imports.push({ name: val(L, f, 'name') || tx('Нүкте', 'Точка'), desc: val(L, f, 'desc'), lat: f.g[1], lon: f.g[0], file: src.name, folder: L.title });
      } else if (L.target === 'routes') {
        plan.routes.push({ name: val(L, f, 'name'), a_name: val(L, f, 'a_name'), b_name: val(L, f, 'b_name'), vehicle: normVehicle(val(L, f, 'vehicle')),
          season: normSeason(val(L, f, 'season')), checked: normDate(val(L, f, 'checked')), note: val(L, f, 'note'), pts: f.g.map(p => [p[1], p[0]]) });
      } else if (L.target === 'zones') {
        const name = val(L, f, 'name'), name_ru = val(L, f, 'name_ru');
        if (!name && !name_ru) continue;
        const rawType = val(L, f, 'type'), type = normType(rawType, true);
        if (!type) plan.noType++;
        const fields = { name, name_ru, gen: val(L, f, 'gen'), gen_ru: val(L, f, 'gen_ru'), period_ru: val(L, f, 'period_ru'), place_ru: val(L, f, 'place_ru'), desc_ru: val(L, f, 'desc_ru'), period: val(L, f, 'period'), oblast: val(L, f, 'oblast') || defOb,
          district: val(L, f, 'district') || (val(L, f, 'oblast') ? '' : defDi), place: val(L, f, 'place'), desc: val(L, f, 'desc'),
          type: type || 'archeo', height: val(L, f, 'height').replace(',', '.') };
        const pts = monumentPts(f.g);
        if (pts.length < 4) continue;
        const rings = f.custom && Array.isArray(f.custom.rings) ? f.custom.rings.slice(0, 3) : [null, null, null];
        plan.monuments.push({ fields, pts, rings, source: tag, isNew: true, choice: 'keep' });
      } else if (TARGETS[L.target].zone != null) {
        const r = ringOf(f.g);
        if (r.length >= 3) plan.zonePolys.push({ zone: TARGETS[L.target].zone, ring: r, area: ringAreaDeg(r), source: tag });
      }
    }
  }
  // Ашық жобадағы бар аймақтар — импортталған аймақ полигондары соларға да байлануы мүмкін
  if (plan.zonePolys.length) {
    try {
      const fd = new FormData();
      const j = await (await fetch(globalThis.QA_API + '&op=list', { method: 'POST', body: fd })).json();
      for (const rec of j.items || []) {
        plan.monuments.push({ id: rec.id, rec, fields: { ...(rec.fields || {}) }, pts: rec.pts || [], rings: rec.custom && rec.custom.rings ? rec.custom.rings.slice() : [null, null, null],
          source: tx('жобада бар', 'уже в проекте'), isNew: false, choice: 'keep', existing: true });
      }
    } catch (e) { /* бар жазбаларсыз да болады */ }
  }
  // Әр полигонды ішіндегі ескерткіш аумағымен байланыстыру (ескерткіштің әр аймағына — ең кіші қамтитын полигон)
  for (const z of plan.zonePolys) {
    let linked = false;
    for (const m of plan.monuments) {
      if (!m.pts.length || !inRing(centroid(m.pts), z.ring)) continue;
      const cur = m.cand && m.cand[z.zone];
      m.cand = m.cand || [];
      if (!cur || z.area < cur.area) m.cand[z.zone] = z;
      linked = true;
    }
    if (!linked) plan.unlinked++;
  }
  for (const m of plan.monuments) {
    if (m.cand) { m.cand.forEach((z, k) => { if (z) m.rings[k] = z.ring; }); m.touched = true; m.zsrc = [...new Set(m.cand.filter(Boolean).map(z => z.source))].join(', '); }
    m.legal = m.rings.some(Boolean) ? QA.checkLegal(m.pts, { rings: m.rings }, m.fields) : null;
    m.choice = 'keep';                                  // әдепкі — файлдағыдай; сәйкес келмесе пайдаланушы өзі таңдайды
  }
  // Бар жазбалардың тек жаңа полигон алғандары ғана өзгереді
  plan.monuments = plan.monuments.filter(m => m.isNew || m.touched);
  renderCheck();
}

function renderCheck() {
  const withZones = plan.monuments.filter(m => m.legal);
  const bad = withZones.filter(m => !m.legal.ok);
  const newZones = plan.monuments.filter(m => m.isNew).length, upd = plan.monuments.filter(m => !m.isNew).length;
  const sum = [plan.marks.length ? nf(plan.marks.length) + tx(' ескерткіш белгісі', ' меток памятников') : '', newZones ? nf(newZones) + tx(' жаңа қорғау аймағы жазбасы', ' новых записей охранных зон') : '',
    upd ? nf(upd) + tx(' бар жазбаға аймақ полигоны', ' полигонов зон к имеющимся записям') : '', plan.routes.length ? nf(plan.routes.length) + tx(' маршрут', ' маршрутов') : '', plan.imports.length ? nf(plan.imports.length) + tx(' импортталған нүкте', ' импортированных точек') : '',
    plan.places.length ? nf(plan.places.length) + tx(' өзге нысан', ' прочих объектов') : ''].filter(Boolean);
  const rows = withZones.map((m) => {
    const i = plan.monuments.indexOf(m), ok = m.legal.ok;
    const mnm = m.fields.name || m.fields.name_ru || '';
    return '<li class="gi-mon' + (ok ? '' : ' is-bad') + '"><div class="gi-mon-h"><b>' + esc(mnm) + '</b>' +
      '<span class="gi-chip ' + (ok ? 'is-ok">' + tx('Заңнамаға сәйкес', 'Соответствует законодательству') : 'is-warn">' + tx('⚠ Заңнамаға сәйкес емес', '⚠ Не соответствует законодательству')) + '</span>' +
      (m.existing ? '<span class="gi-chip">' + tx('жобада бар', 'уже в проекте') + '</span>' : '') + '</div>' +
      '<div class="gi-sub">' + esc((m.legal.d ? tx('Талап: ', 'Требование: ') + (m.fields.type === 'archeo' ? tx('археологиялық ескерткіш — ', 'памятник археологии — ') : '') + m.legal.d + tx(' м (7-тармақ)', ' м (пункт 7)') : tx('Бұл түрге қашықтық ережесі жоқ', 'Для этого вида нет правила расстояния')) + (m.zsrc ? ' · ' + m.zsrc : '')) + '</div>' +
      '<ul class="gi-lines">' + QA.legalLines(m.legal).map((t, k) => '<li class="' + (m.legal.items[k].status === 'ok' ? '' : 'is-bad') + '">' + esc(t) + '</li>').join('') + '</ul>' +
      (ok ? '' : '<div class="gi-choice" role="radiogroup" aria-label="' + esc(mnm) + '">' +
        '<label class="mura-cb"><input type="radio" name="gc' + i + '" value="keep" data-ch="' + i + '"' + (m.choice === 'keep' ? ' checked' : '') + '><span>' + tx('Қалдыру — полигондар файлдағыдай сақталады (ескерту жазбада көрсетіледі)', 'Оставить — полигоны сохраняются как в файле (предупреждение будет показано в записи)') + '</span></label>' +
        '<label class="mura-cb"><input type="radio" name="gc' + i + '" value="recalc" data-ch="' + i + '"' + (m.choice === 'recalc' ? ' checked' : '') + '><span>' + tx('Қайта есептеу — аймақтар ескерткіш аумағынан заң бойынша (', 'Пересчитать — зоны рассчитываются от территории памятника по закону (') + (m.legal.d || '—') + tx(' м) есептеледі', ' м)') + '</span></label></div>') +
      '</li>';
  }).join('');
  frame(tx('GeoPackage импорты: тексеру', 'Импорт GeoPackage: проверка'),
    '<p>' + tx('Импортталады: ', 'Будет импортировано: ') + (sum.length ? esc(sum.join(', ')) : tx('ештеңе', 'ничего')) + '.</p>' +
    (plan.noType ? '<p class="mura-hint">' + tx(nf(plan.noType) + ' ескерткіш аумағының түрі көрсетілмеген не танылмаған — археологиялық ескерткіш (40 м) деп алынды.', 'У ' + nf(plan.noType) + ' территорий памятников вид не указан или не распознан — приняты как памятник археологии (40 м).') + '</p>' : '') +
    (plan.unlinked ? '<p class="mura-err">' + tx(nf(plan.unlinked) + ' аймақ полигонының ішінде ескерткіш аумағы табылмады — олар импортталмайды. Ескерткіш аумақтарының қабатын да импорттаңыз.', 'Внутри ' + nf(plan.unlinked) + ' полигонов зон не найдена территория памятника — они не импортируются. Импортируйте также слой территорий памятников.') + '</p>' : '') +
    (withZones.length ? '<h4 class="gi-h4">' + tx('Аймақтардың заңнамаға сәйкестігі <small>(ҚР МСМ 14.04.2020 № 86 бұйрығы, 7–9-тармақтар)</small>', 'Соответствие зон законодательству <small>(приказ МКС РК от 14.04.2020 № 86, пункты 7–9)</small>') + '</h4>' +
      (bad.length ? '<div class="gi-warn">⚠ ' + tx(nf(bad.length) + ' ескерткіштің аймақтары қолданыстағы заңнамаға сәйкес емес. Әрқайсысы үшін таңдаңыз: қалдыру не ескерткіш аумағынан қайта есептеу.', 'Зоны ' + nf(bad.length) + ' памятников не соответствуют действующему законодательству. Для каждого выберите: оставить или пересчитать от территории памятника.') +
        '<span><button type="button" class="lnk" data-all="keep">' + tx('Барлығын қалдыру', 'Оставить все') + '</button><button type="button" class="lnk" data-all="recalc">' + tx('Барлығын қайта есептеу', 'Пересчитать все') + '</button></span></div>' : '') +
      '<ul class="gi-mons">' + rows + '</ul>' : ''),
    '<button type="button" class="btn btn--ghost btn--sm" id="giBack">' + tx('← Қабаттар', '← Слои') + '</button><span class="gi-sp"></span>' +
    '<button type="button" class="btn btn--ghost btn--sm" data-gi-x2>' + tx('Бас тарту', 'Отмена') + '</button>' +
    '<button type="button" class="btn btn--primary btn--sm" id="giGo"' + (sum.length ? '' : ' disabled') + '>' + tx('Импорттау', 'Импортировать') + '</button>');
  dlg.querySelector('[data-gi-x2]').addEventListener('click', close);
  $('giBack').addEventListener('click', renderLayers);
  dlg.querySelectorAll('[data-ch]').forEach(r => r.addEventListener('change', () => { plan.monuments[+r.dataset.ch].choice = r.value; }));
  dlg.querySelectorAll('[data-all]').forEach(b => b.addEventListener('click', () => { bad.forEach(m => { m.choice = b.dataset.all; }); renderCheck(); }));
  $('giGo').addEventListener('click', run);
}

/* ---------- 3-қадам: импорт ---------- */
async function post(url, data) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.append(k, v);
  const j = await (await fetch(url, { method: 'POST', body: fd })).json();
  if (!j.ok) throw new Error(j.error || tx('Сақталмады', 'Не сохранено'));
  return j;
}
function zoneRecord(m) {
  const f = { ...m.fields };
  const d = String(QA.legalDistance(f) || 40);
  const has = k => parseFloat(String(f[k] || '').replace(',', '.')) > 0;
  // Қайта есептеу не қашықтықтар жоқ болса — заң бойынша (түрі мен биіктігіне қарай)
  if (m.choice === 'recalc' || !has('d1') || !has('d2') || !has('d3')) { f.d1 = d; f.d2 = d; f.d3 = d; }
  const custom = !m.legal || m.choice === 'recalc' ? null : { rings: m.rings, source: m.zsrc || m.source, accepted: !m.legal.ok };
  return { id: m.id || '', fields: f, pts: m.pts, custom };
}
async function run() {
  const go = $('giGo');
  go.disabled = true; go.textContent = tx('Импортталуда…', 'Импорт…');
  const out = [], errs = [];
  const step = async (label, fn) => { try { const r = await fn(); if (r) out.push(r); } catch (e) { errs.push(label + ': ' + e.message); } };
  if (plan.marks.length) await step(tx('Ескерткіштер', 'Памятники'), async () => { const j = await globalThis.__marks.api('import', { data: JSON.stringify(plan.marks) }); return nf(j.added) + tx(' ескерткіш', ' памятников') + (j.skipped ? tx(' (' + j.skipped + ' өткізілді)', ' (пропущено: ' + j.skipped + ')') : ''); });
  if (plan.imports.length) await step(tx('Нүктелер', 'Точки'), async () => { const j = await globalThis.__marks.api('iadd', { data: JSON.stringify(plan.imports) }); return nf(j.added) + tx(' импортталған нүкте', ' импортированных точек'); });
  if (plan.places.length) await step(tx('Өзге нысандар', 'Прочие объекты'), async () => { const j = await globalThis.__places.api('import', { data: JSON.stringify(plan.places) }); return nf(j.added) + tx(' өзге нысан', ' прочих объектов') + (j.updated ? tx(', жаңартылды ', ', обновлено ') + nf(j.updated) : ''); });
  if (plan.routes.length) await step(tx('Маршруттар', 'Маршруты'), async () => { const j = await globalThis.MuraRoutes.api('import', { data: JSON.stringify(plan.routes) }); return nf(j.added) + tx(' маршрут', ' маршрутов'); });
  const news = plan.monuments.filter(m => m.isNew).map(zoneRecord);
  if (news.length) await step(tx('Қорғау аймақтары', 'Охранные зоны'), async () => {
    const j = await post(globalThis.QA_API + '&op=add', { data: JSON.stringify(news) });
    if (j.errors && j.errors.length) errs.push(...j.errors.slice(0, 5));
    return nf(j.added) + tx(' қорғау аймағы жазбасы', ' записей охранных зон');
  });
  let upd = 0;
  for (const m of plan.monuments.filter(x => !x.isNew)) await step(m.fields.name || m.fields.name_ru, async () => { await post(globalThis.QA_API + '&op=save', { data: JSON.stringify(zoneRecord(m)) }); upd++; });
  if (upd) out.push(nf(upd) + tx(' бар жазбаның аймақтары', ' имеющихся записей (зоны)'));
  if (QA && QA.refreshSaved) await QA.refreshSaved();
  const kept = plan.monuments.filter(m => m.legal && !m.legal.ok && m.choice === 'keep').length;
  frame(tx('GeoPackage импорты: дайын', 'Импорт GeoPackage: готово'),
    '<p>' + (out.length ? tx('Импортталды: ', 'Импортировано: ') + esc(out.join(', ')) + '.' : tx('Ештеңе импортталмады.', 'Ничего не импортировано.')) + '</p>' +
    (kept ? '<p class="mura-hint">' + tx(nf(kept) + ' ескерткіштің заңнамаға сәйкес емес аймақтары қалдырылды: «Қорғау аймақтары» тізімінде белгіленген, кейін сол жерден қайта есептеуге болады.', 'Несоответствующие законодательству зоны ' + nf(kept) + ' памятников оставлены: они отмечены в списке «Охранные зоны», позже их можно пересчитать оттуда.') + '</p>' : '') +
    (errs.length ? '<p class="mura-err">' + errs.map(esc).join('<br>') + '</p>' : ''),
    '<span class="gi-sp"></span><button type="button" class="btn btn--primary btn--sm" data-gi-x2>' + tx('Жабу', 'Закрыть') + '</button>');
  dlg.querySelector('[data-gi-x2]').addEventListener('click', close);
  toast(out.length ? tx('GeoPackage импортталды: ', 'GeoPackage импортирован: ') + out.join(', ') : tx('Импорт сәтсіз аяқталды', 'Импорт не удался'), !out.length);
}

if (M.onUi) M.onUi(cmd => {
  if (cmd === 'import-gpkg') start('');
  else if (cmd.startsWith('import-gpkg\n')) start(cmd.slice(12));
});
globalThis.MuraGpkgImport = { start, autoMap, guessTarget, normType, mapState, monumentPts };
