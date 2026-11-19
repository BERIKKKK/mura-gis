/* Ескерткіш белгілерін экспорттау: GeoJSON, DOCX кестесі, PDF үшін HTML.
   Кесте үлгісі — облыс әкімдігі қаулысына қосымша «… тарих және мәдениет ескерткіштерінің мемлекеттік тізімі»
   (мыс. Түркістан облысы әкімдігінің 2020 ж. 17 қыркүйектегі № 188 қаулысы, НҚА тізілімінде № 5804):
     № р/с | Ескерткіштің атауы | Ескерткіштің түрі | Ескерткіштің географиялық координаттары | Ескерткіштің орналасқан жері
   бағандар нөмірі (1…5), аудандар — бүкіл ені бойынша тақырып жолы, нөмірлеу — құжат бойынша үздіксіз.
   Қаулының өз мәтіні қосылмайды — тек кесте. */
import { sortMarks } from './sort.js';

/* ---------- Анықтамалықтар («Тарихи-мәдени мұра объектілерін қорғау және пайдалану туралы» ҚР Заңы, 2019 ж. № 288-VI) ---------- */
/** 5-бап, 1-тармақ: тарих және мәдениет ескерткіштерінің түрлері. short — кестедегі жазылуы. */
export const TYPES = [
  { v: 'archeo', label: 'Археология ескерткіштері', short: 'археология' },
  { v: 'arch', label: 'Қала құрылысы және сәулет ескерткіштері', short: 'қала құрылысы және сәулет' },
  { v: 'ensemble', label: 'Ансамбльдер мен кешендер', short: 'ансамбльдер мен кешендер' },
  { v: 'sacred', label: 'Киелі объектілер', short: 'киелі объектілер' },
  { v: 'art', label: 'Монументтік өнер құрылыстары', short: 'монументтік өнер' },
];
/** 6-бап: тарих және мәдениет ескерткіштерінің санаттары. */
export const CATEGORIES = [
  { v: 'local', label: 'Жергілікті маңызы бар', adj: 'жергілікті маңызы бар' },
  { v: 'rep', label: 'Республикалық маңызы бар', adj: 'республикалық маңызы бар' },
  { v: 'intl', label: 'Халықаралық маңызы бар', adj: 'халықаралық маңызы бар' },
  { v: '', label: 'Анықталмаған', adj: '' },
];
/** 3, 4, 5-баптар: объектінің құқықтық мәртебесі. */
export const STATUSES = [
  { v: 'state', label: 'Тарих және мәдениет ескерткіші (Мемлекеттік тізімге енгізілген)', short: 'Мемлекеттік тізімде' },
  { v: 'prelim', label: 'Алдын ала есепке алу тізіміне енгізілген объект', short: 'Алдын ала есепке алу тізімінде' },
  { v: 'archreg', label: 'Археологиялық жұмыстар барысында анықталған объект (тізілімде)', short: 'Археологиялық жұмыстар тізілімінде' },
  { v: 'excluded', label: 'Мәртебесінен айырылған (Мемлекеттік тізімнен алып тасталған)', short: 'Тізімнен алып тасталған' },
];
const byV = (list, v) => list.find(x => x.v === v) || null;
export const typeOf = v => byV(TYPES, v) || TYPES[0];
export const categoryOf = v => byV(CATEGORIES, v) || CATEGORIES[3];
export const statusOf = v => byV(STATUSES, v) || STATUSES[0];

/* ---------- Пішімдеу ---------- */
const comma = s => String(s).replace('.', ',');
/** 50.412345 → 50°24′44,44″ */
export function dms(v) {
  const a = Math.abs(v);
  let d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf), s = Number(((mf - m) * 60).toFixed(2));
  if (s >= 60) { s = 0; m++; }
  if (m >= 60) { m = 0; d++; }
  return d + '°' + String(m).padStart(2, '0') + '′' + comma(s.toFixed(2).padStart(5, '0')) + '″';
}
export const coordLines = m => [dms(m.lat) + (m.lat < 0 ? ' S' : ' N'), dms(m.lon) + (m.lon < 0 ? ' W' : ' E')];
/** Кестедегі атау: «Сүткент қалашығы, І–ХV ғасырлар» (үлгідегідей мерзімі атаудан кейін). */
export const nameCell = m => String(m.name || '').trim() + (String(m.period || '').trim() ? ', ' + String(m.period).trim() : '');
export const NO_DISTRICT = 'Ауданы көрсетілмеген';

/** Сұрыпталған, аудан бойынша топталған жолдар: [{ district, items: [{ n, m }] }]. */
export function groups(marks) {
  const out = [];
  let n = 0;
  for (const m of sortMarks(marks)) {
    const d = String(m.district || '').trim() || NO_DISTRICT;
    let g = out[out.length - 1];
    if (!g || g.district !== d) { g = { district: d, items: [] }; out.push(g); }
    g.items.push({ n: ++n, m });
  }
  return out;
}

/** Тізім атауы: белгілердің облысы мен санатынан (бәрі бірдей болса) құрастырылады. */
export function defaultTitle(marks, genitive) {
  const uniq = k => [...new Set(marks.map(m => String(m[k] || '').trim()))];
  const ob = uniq('oblast'), cat = uniq('category'), st = uniq('status');
  const where = ob.length === 1 && ob[0] ? (genitive ? genitive(ob[0]) : ob[0]) + ' ' : '';
  const adj = cat.length === 1 && categoryOf(cat[0]).adj ? categoryOf(cat[0]).adj + ' ' : '';
  if (st.length === 1 && st[0] === 'prelim') return where + 'тарихи-мәдени мұра объектілерін алдын ала есепке алу тізімі';
  if (st.length === 1 && st[0] === 'state') return where + adj + 'тарих және мәдениет ескерткіштерінің мемлекеттік тізімі';
  return where + adj + 'тарих және мәдениет ескерткіштерінің тізімі';
}
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/* ---------- GeoJSON ---------- */
export function geojson(marks, title) {
  return {
    type: 'FeatureCollection',
    name: title || 'eskertkishter',
    features: sortMarks(marks).map(m => ({
      type: 'Feature',
      id: m.id,
      geometry: { type: 'Point', coordinates: [Number(m.lon.toFixed(8)), Number(m.lat.toFixed(8))] },
      properties: {
        id: m.id, name: m.name, period: m.period || '', oblast: m.oblast || '', district: m.district || '', place: m.place || '',
        type: m.type, type_kk: typeOf(m.type).label,
        category: m.category || '', category_kk: categoryOf(m.category).label,
        status: m.status, status_kk: statusOf(m.status).label,
        note: m.note || '', lat: m.lat, lon: m.lon, lat_dms: coordLines(m)[0], lon_dms: coordLines(m)[1],
        created_at: m.created_at || '', updated_at: m.updated_at || '',
      },
    })),
  };
}

/** GeoJSON (біздің не сырттағы) → белгілер тізімі (Point объектілері ғана). */
export function fromGeojson(o) {
  const feats = o && o.type === 'FeatureCollection' ? o.features : o && o.type === 'Feature' ? [o] : [];
  const out = [];
  for (const f of feats || []) {
    const g = f && f.geometry;
    if (!g || g.type !== 'Point' || !Array.isArray(g.coordinates)) continue;
    const p = f.properties || {};
    const pick = (...ks) => { for (const k of ks) if (p[k] != null && String(p[k]).trim()) return String(p[k]).trim(); return ''; };
    const code = (list, v, kk) => (list.some(x => x.v === v) ? v : (list.find(x => x.label === kk) || {}).v);
    out.push({
      id: pick('id') || (typeof f.id === 'string' ? f.id : ''),
      name: pick('name', 'Name', 'NAME', 'атауы', 'title'),
      period: pick('period', 'мерзімі'), oblast: pick('oblast', 'облыс'), district: pick('district', 'аудан'),
      place: pick('place', 'орналасқан жері', 'description'),
      type: code(TYPES, pick('type'), pick('type_kk')) || 'archeo',
      category: code(CATEGORIES, pick('category'), pick('category_kk')) ?? 'local',
      status: code(STATUSES, pick('status'), pick('status_kk')) || 'state',
      note: pick('note'),
      lat: +g.coordinates[1], lon: +g.coordinates[0],
      created_at: pick('created_at'), updated_at: pick('updated_at'),
    });
  }
  return out;
}

/* ---------- DOCX ---------- */
const xml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function run(text, o = {}) {
  const pr = (o.b ? '<w:b/><w:bCs/>' : '') + (o.sz ? '<w:sz w:val="' + o.sz + '"/><w:szCs w:val="' + o.sz + '"/>' : '');
  return String(text).split('\n').map((t, i) => (i ? '<w:r><w:br/></w:r>' : '') + '<w:r>' + (pr ? '<w:rPr>' + pr + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + xml(t) + '</w:t></w:r>').join('');
}
const para = (runs, align = 'left', after = 0) => '<w:p><w:pPr><w:spacing w:before="0" w:after="' + after + '" w:line="240" w:lineRule="auto"/><w:jc w:val="' + align + '"/></w:pPr>' + runs + '</w:p>';
const CONTENT_W = 9354;                         // A4: 11906 − сол жақ 1701 − оң жақ 851 (twip)
const COLS = [600, 2450, 1750, 1950, 2604];     // № | атауы | түрі | координаттары | орналасқан жері
const HEAD = ['№\nр/с', 'Ескерткіштің атауы', 'Ескерткіштің түрі', 'Ескерткіштің географиялық координаттары', 'Ескерткіштің орналасқан жері'];

function cell(text, w, o = {}) {
  return '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + (o.span ? '<w:gridSpan w:val="' + o.span + '"/>' : '') +
    (o.shade ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.shade + '"/>' : '') + '</w:tcPr>' +
    para(run(text, { b: o.b, sz: o.sz || 24 }), o.align || 'left') + '</w:tc>';
}
const row = (cells, o = {}) => '<w:tr><w:trPr><w:cantSplit/>' + (o.header ? '<w:tblHeader/>' : '') + '</w:trPr>' + cells.join('') + '</w:tr>';

export function docxBody(marks, title) {
  const G = groups(marks);
  const borders = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(k => '<w:' + k + ' w:val="single" w:sz="4" w:space="0" w:color="000000"/>').join('') + '</w:tblBorders>';
  let rows = row(HEAD.map((h, i) => cell(h, COLS[i], { b: true, align: 'center', sz: 22 })), { header: true }) +
    row(COLS.map((w, i) => cell(String(i + 1), w, { align: 'center', sz: 20 })), { header: true });
  for (const g of G) {
    rows += row([cell(g.district, CONTENT_W, { span: 5, b: true, align: 'center' })]);
    for (const { n, m } of g.items) {
      rows += row([
        cell(String(n), COLS[0], { align: 'center' }),
        cell(nameCell(m), COLS[1]),
        cell(typeOf(m.type).short, COLS[2], { align: 'center' }),
        cell(coordLines(m).join('\n'), COLS[3], { align: 'center' }),
        cell(String(m.place || '').trim(), COLS[4]),
      ]);
    }
  }
  return para(run(cap(title), { b: true }), 'center', 240) +
    '<w:tbl><w:tblPr><w:tblW w:w="' + CONTENT_W + '" w:type="dxa"/>' + borders + '<w:tblLayout w:type="fixed"/>' +
    '<w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
    '<w:tblGrid>' + COLS.map(w => '<w:gridCol w:w="' + w + '"/>').join('') + '</w:tblGrid>' + rows + '</w:tbl>' + para('');
}

export function docxBlob(marks, title, fflate) {
  const H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const doc = H + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>' +
    docxBody(marks, title) +
    '<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="851" w:bottom="1134" w:left="1701" w:header="709" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>';
  const footer = H + '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr>' +
    '<w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
    '<w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>';
  const styles = H + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="28"/><w:szCs w:val="28"/><w:lang w:val="kk-KZ" w:eastAsia="ru-RU" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
    '</w:styles>';
  const ct = H + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';
  const rels = H + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';
  const docRels = H + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>';
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const core = H + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>' + xml(cap(title)) + '</dc:title><dc:language>kk-KZ</dc:language>' +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified></cp:coreProperties>';
  const u = fflate.strToU8;
  const zip = fflate.zipSync({
    '[Content_Types].xml': u(ct), '_rels/.rels': u(rels), 'docProps/core.xml': u(core),
    'word/document.xml': u(doc), 'word/styles.xml': u(styles), 'word/footer1.xml': u(footer), 'word/_rels/document.xml.rels': u(docRels),
  }, { level: 6 });
  return new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/* ---------- PDF үшін HTML (main/main.js → printToPDF) ---------- */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const br = s => esc(s).replace(/\n/g, '<br>');
export function pdfHtml(marks, title) {
  const G = groups(marks);
  const w = COLS.map(c => (c / CONTENT_W * 100).toFixed(2) + '%');
  let body = '';
  for (const g of G) {
    body += '<tr class="g"><td colspan="5">' + esc(g.district) + '</td></tr>';
    for (const { n, m } of g.items) {
      body += '<tr><td class="c">' + n + '</td><td>' + esc(nameCell(m)) + '</td><td class="c">' + esc(typeOf(m.type).short) + '</td>' +
        '<td class="c nw">' + coordLines(m).map(esc).join('<br>') + '</td><td>' + br(String(m.place || '').trim()) + '</td></tr>';
    }
  }
  return '<!doctype html><html lang="kk"><head><meta charset="utf-8"><title>' + esc(cap(title)) + '</title><style>' +
    '@page{size:A4;margin:20mm 15mm 18mm 30mm}' +
    'body{margin:0;font:12pt/1.25 "Times New Roman",Times,serif;color:#000}' +
    'h1{font-size:14pt;font-weight:bold;text-align:center;margin:0 0 12pt}' +
    'table{width:100%;border-collapse:collapse;table-layout:fixed}' +
    'th,td{border:.75pt solid #000;padding:2pt 4pt;vertical-align:top;overflow-wrap:anywhere}' +
    'th{font-weight:bold;font-size:11pt;text-align:center;vertical-align:middle;overflow-wrap:normal}' +
    'thead{display:table-header-group}tr{break-inside:avoid}' +
    '.num th{font-weight:normal;font-size:10pt;padding:0 4pt}' +
    '.g td{font-weight:bold;text-align:center}.c{text-align:center}.nw{white-space:nowrap}' +
    '</style></head><body><h1>' + esc(cap(title)) + '</h1><table><colgroup>' + w.map(x => '<col style="width:' + x + '">').join('') + '</colgroup>' +
    '<thead><tr>' + HEAD.map(h => '<th>' + br(h) + '</th>').join('') + '</tr><tr class="num">' + HEAD.map((_, i) => '<th>' + (i + 1) + '</th>').join('') + '</tr></thead>' +
    '<tbody>' + body + '</tbody></table></body></html>';
}
