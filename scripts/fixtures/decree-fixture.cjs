/* Тест құжаттары: бір қаулының қазақша DOCX және орысша PDF нұсқасы (ескерткіштер тізімі, 2 жол, 1 аудан).
   PDF — Type0 қаріп + ToUnicode, FlateDecode, кесте координатпен (adilet.zan.kz PDF-тері сияқты), сөз тасымалы бар.
   «Атау сәйкестендіргіш» плагинінің бірлік тесті (scripts/test-plugins.mjs) және Electron түтін тесті (smoke-plugins.js) үшін. */
'use strict';
const zlib = require('node:zlib');
const Z = require('../../plugin-sdk/lib/zip.cjs');

const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const wp = s => '<w:p><w:r><w:t xml:space="preserve">' + xmlEsc(s) + '</w:t></w:r></w:p>';
const wc = (paras, span) => '<w:tc><w:tcPr>' + (span ? '<w:gridSpan w:val="' + span + '"/>' : '') + '</w:tcPr>' + [].concat(paras).map(wp).join('') + '</w:tc>';
const wr = cells => '<w:tr>' + cells.join('') + '</w:tr>';

function makeDocx() {
  const body = wp('Ақтөбе облысының жергілікті маңызы бар тарих және мәдениет ескерткіштерінің мемлекеттік тізімін бекіту туралы') +
    wp('Ақтөбе облысы әкімдігінің 2020 жылғы 18 тамыздағы № 306 қаулысы. Ақтөбе облысының Әділет департаментінде 2020 жылғы 20 тамызда № 7334 болып тіркелді') +
    '<w:tbl>' + wr([wc('№'), wc('Ескерткіштің атауы'), wc('Ескерткіштің түрі'), wc('Орналасқан жері')]) + wr([wc('1'), wc('2'), wc('3'), wc('4')]) +
    wr([wc('Тест ауданы', 4)]) +
    wr([wc('1.'), wc(['Тест-ІІІ қорғаны', 'Қола дәуірі']), wc('археология'), wc('Қос-Естек ауылынан солтүстікке қарай 5 шақырым')]) +
    wr([wc('2.'), wc('Айтпайка бейіті Ерте темір дәуірі'), wc('археология'), wc('Қос-Естек ауылынан оңтүстік батысқа қарай 3 шақырым')]) + '</w:tbl>';
  const doc = '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body + '</w:body></w:document>';
  return Z.writeZip([['[Content_Types].xml', Buffer.from('<Types/>')], ['word/document.xml', Buffer.from(doc)]]);
}

function makePdf() {
  const hex = s => '<' + [...s].map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('') + '>';
  const lines = [];
  const T = (x, y, s, sz = 10) => lines.push('BT /F1 ' + sz + ' Tf 1 0 0 1 ' + x + ' ' + y + ' Tm ' + hex(s) + ' Tj ET');
  T(60, 800, 'Постановление акимата Актюбинской области от 18 августа 2020 года № 306.');
  T(60, 786, 'Зарегистрировано Департаментом юстиции Актюбинской области 20 августа 2020 года № 7334');
  T(60, 770, 'Об утверждении Государственного списка памятников истории и культуры', 12);
  T(60, 755, 'местного значения Актюбинской области', 12);
  T(60, 700, '№'); T(140, 700, 'Наименование памятника'); T(310, 700, 'Вид памятника'); T(420, 700, 'Место нахождения');
  T(62, 685, '1'); T(198, 685, '2'); T(338, 685, '3'); T(468, 685, '4');
  T(240, 670, 'Тестовый район');
  T(60, 655, '1.'); T(130, 655, 'Курган Тест-ІІІ'); T(140, 643, 'Эпоха бронзы'); T(300, 655, 'археология'); T(400, 655, 'в 5 километрах к северу от се-'); T(430, 643, 'ла Кос-Истек');
  T(60, 625, '2.'); T(120, 625, 'Могильник Айтпайка'); T(130, 613, 'Эпоха раннего железа'); T(300, 625, 'археология'); T(400, 625, 'в 3 километрах к юго западу от села Кос-Истек');
  T(60, 595, 'археология'); T(250, 595, '2'); T(60, 583, 'всего'); T(250, 583, '2');
  const content = zlib.deflateSync(Buffer.from(lines.join('\n'), 'latin1'));
  const cmap = Buffer.from('/CIDInit /ProcSet findresource begin 12 dict begin begincmap 1 begincodespacerange <0000> <FFFF> endcodespacerange ' +
    '1 beginbfrange <0020> <04FF> <0020> endbfrange 1 beginbfchar <2116> <2116> endbfchar endcmap end end');
  const objs = ['<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>',
    '<</Type/Font/Subtype/Type0/BaseFont/Test/Encoding/Identity-H/ToUnicode 6 0 R>>', [content, '/Filter/FlateDecode'], [cmap, '']];
  const parts = [Buffer.from('%PDF-1.4\n')], off = [];
  let pos = parts[0].length;
  objs.forEach((o, i) => {
    off.push(pos);
    const b = Array.isArray(o)
      ? Buffer.concat([Buffer.from((i + 1) + ' 0 obj\n<</Length ' + o[0].length + o[1] + '>>\nstream\n'), o[0], Buffer.from('\nendstream\nendobj\n')])
      : Buffer.from((i + 1) + ' 0 obj\n' + o + '\nendobj\n');
    parts.push(b); pos += b.length;
  });
  const xref = 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') +
    'trailer\n<</Size ' + (objs.length + 1) + '/Root 1 0 R>>\nstartxref\n' + pos + '\n%%EOF';
  parts.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(parts);
}

module.exports = { makeDocx, makePdf };
