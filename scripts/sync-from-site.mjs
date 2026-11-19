#!/usr/bin/env node
/* Сайттағы «Қорғау аймағы» құралын Mura GIS-ке көшіру (синхрондау).
 *
 * Құралдың бастапқы коды сайттың репозиторийінде қалады (admin/views/tool-qorgau.php,
 * admin/assets/qorgau/*.js, admin/assets/maptool.css …) — сайттағы құрал өз орнында жұмыс істей береді.
 * Бұл скрипт сол файлдарды src/ ішіне көшіреді және PHP бетті статикалық src/index.html-ге айналдырады:
 *   • PHP иконкалары (<?= $ic('…') ?>) → дайын SVG;
 *   • аудандар тізімі data/refs.php-дан алынады;
 *   • «Сайттағы ескерткіштен толтыру» тізімі алынып тасталады (ол сайттың дерекқорына тәуелді);
 *   • Leaflet пен fflate жергілікті (офлайн) файлдардан жүктеледі;
 *   • сақтау API-і mura://app/api мекенжайына бағытталады (main/store.js өңдейді);
 *   • карта қабаттары сайттан алынбайды: бағдарламаның өз модулі src/js/basemaps.js (тек сыртқы сервистер)
 *     қолданылады — сайттың топокартасына (aktobenasledie.kz тайлдары) бағдарлама жүгінбейді.
 *
 * Қолдану:  npm run sync            (сайт қалтасы — site.config.json → siteDir)
 *           SITE_DIR=… npm run sync (басқа қалта)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const SITE = path.resolve(ROOT, process.env.SITE_DIR || CFG.siteDir);
const SRC = path.join(ROOT, 'src');

const read = p => fs.readFileSync(path.join(SITE, p), 'utf8');
const write = (p, s) => { const f = path.join(SRC, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); console.log('  ✓', p); };
const copy = (from, to) => { const f = path.join(SRC, to); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.copyFileSync(from, f); console.log('  ✓', to); };
const fail = m => { console.error('✗ ' + m); process.exit(1); };

if (!fs.existsSync(path.join(SITE, 'admin/views/tool-qorgau.php'))) fail('Сайт қалтасы табылмады: ' + SITE);
console.log('Сайт: ' + SITE);

/* ---------- 1. Құралдың JS және CSS файлдары (өзгеріссіз) ---------- */
write('qorgau/app.js', read('admin/assets/qorgau/app.js'));
write('qorgau/ui.js', read('admin/assets/qorgau/ui.js'));
write('css/maptool.css', read('admin/assets/maptool.css'));
write('css/admin.css', read('admin/assets/admin.css'));
copy(path.join(SITE, 'admin/assets/koordinat/vendor/fflate.js'), 'vendor/fflate.js');
copy(path.join(SITE, 'admin/assets/koordinat/vendor/LICENSE-fflate'), 'vendor/LICENSE-fflate');

/* ---------- 2. Leaflet (жергілікті) ---------- */
{
  const ld = path.join(ROOT, 'node_modules/leaflet/dist');
  if (!fs.existsSync(ld)) fail('node_modules/leaflet жоқ — алдымен npm install орындаңыз');
  for (const f of ['leaflet.js', 'leaflet.css']) copy(path.join(ld, f), 'vendor/leaflet/' + f);
  for (const f of fs.readdirSync(path.join(ld, 'images'))) copy(path.join(ld, 'images', f), 'vendor/leaflet/images/' + f);
  copy(path.join(ROOT, 'node_modules/leaflet/LICENSE'), 'vendor/leaflet/LICENSE');
}

/* ---------- 3. PHP бет → src/index.html ---------- */
{
  const php = read('admin/views/tool-qorgau.php');

  // Иконкалар: 'кілт' => '<path …/>',
  const icons = {};
  const iconBlock = php.slice(php.indexOf('$qaIcons = ['), php.indexOf('];', php.indexOf('$qaIcons = [')));
  for (const m of iconBlock.matchAll(/'(\w+)'\s*=>\s*'((?:[^'\\]|\\.)*)',?/g)) icons[m[1]] = m[2].replace(/\\'/g, "'");
  if (Object.keys(icons).length < 10) fail('Иконкалар оқылмады');
  const ic = (k, s = 18) => {
    if (!(k in icons)) fail('Белгісіз иконка: ' + k);
    return '<svg class="qa-ic" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[k] + '</svg>';
  };

  // Аудандар: data/refs.php → 'districts' => [ 'key' => ['kk' => '…', …], … ]
  const refs = read('data/refs.php');
  const dStart = refs.indexOf("'districts' => [");
  const dEnd = refs.indexOf("\n    ],", dStart);
  const districts = [...refs.slice(dStart, dEnd).matchAll(/'(\w+)'\s*=>\s*\[\s*'kk'\s*=>\s*'([^']+)'/g)].map(m => ({ key: m[1], kk: m[2] }));
  if (!districts.length) fail('Аудандар оқылмады (data/refs.php)');
  const escH = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Беттің HTML бөлігі: иконкалар функциясынан кейінгі «?>»-ден бастап, деректер скриптеріне дейін
  const icFn = php.indexOf('$ic = function');
  let html = php.slice(php.indexOf('?>', icFn) + 2, php.indexOf('<script type="application/json" id="mapBasemaps">'));

  html = html
    // «Сайттағы ескерткіштен толтыру» — сайттың дерекқорына тәуелді, бағдарламада жоқ
    .replace(/<\?php if \(\$qaSite\): \?>[\s\S]*?<\?php endif; \?>\s*/, '')
    // «Құралдарға қайту» сілтемесі — бағдарламада қайтатын жер жоқ
    .replace(/<a class="tool-back"[^>]*>[\s\S]*?<\/a>\s*/, '')
    // Аудандар тізімі
    .replace(/<\?php foreach \(\$qaDistricts as \$k => \$label\): \?>[\s\S]*?<\?php endforeach; \?>/,
      districts.map(d => '<option value="' + escH(d.kk) + '" data-key="' + escH(d.key) + '">' + escH(d.kk) + '</option>').join(''))
    // Иконкалар
    .replace(/<\?= \$ic\('(\w+)'(?:,\s*(\d+))?\) \?>/g, (_, k, s) => ic(k, s ? +s : 18))
    // Стильдер: жергілікті файлдар
    .replace(/<link rel="stylesheet" href="https:\/\/unpkg\.com\/leaflet@[\d.]+\/dist\/leaflet\.css">/, '<link rel="stylesheet" href="vendor/leaflet/leaflet.css">')
    .replace(/assets\/maptool\.css\?v=<\?= \(int\)\$mtVer \?>/, 'css/maptool.css');

  const left = html.match(/<\?[\s\S]{0,80}/);
  if (left) fail('index.html ішінде өңделмеген PHP қалды: ' + left[0]);

  const out = `<!doctype html>
<!-- Автоматты жасалған (scripts/sync-from-site.mjs ← сайттың admin/views/tool-qorgau.php). Қолмен өзгертпеңіз. -->
<html lang="kk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' data: blob: https:; font-src 'self' data:; worker-src 'self' blob:">
<title>Mura GIS</title>
<link rel="stylesheet" href="css/admin.css">
<link rel="stylesheet" href="css/desktop.css">
<link rel="stylesheet" href="css/marks.css">
</head>
<body class="mura">
${html.trim()}

<script type="application/json" id="qaSiteData">[]</script>
<script src="vendor/leaflet/leaflet.js"></script>
<script src="js/basemaps.js"></script>
<script>window.QA_FFLATE = 'vendor/fflate.js'; window.QA_API = 'mura://app/api?v=1';</script>
<script src="js/desktop.js"></script>
<script src="js/regions.js"></script>
<script src="marks/marks-dom.js"></script>
<script type="module" src="qorgau/ui.js"></script>
<script type="module" src="qorgau/app.js"></script>
<script type="module" src="marks/marks.js"></script>
<script type="module" src="js/zone-dialog.js"></script>
<script type="module" src="js/context-menu.js"></script>
<script type="module" src="js/desktop-ui.js"></script>
</body>
</html>
`;
  write('index.html', out);
}

/* ---------- 4. Қай нұсқадан алынғаны ---------- */
let rev = '';
try {
  const head = fs.readFileSync(path.join(SITE, '.git/HEAD'), 'utf8').trim();
  rev = head.startsWith('ref: ') ? fs.readFileSync(path.join(SITE, '.git', head.slice(5)), 'utf8').trim() : head;
} catch (e) { /* git жоқ */ }
write('site-version.json', JSON.stringify({ siteCommit: rev.slice(0, 12), syncedAt: new Date().toISOString() }, null, 2) + '\n');
console.log('Дайын.');
