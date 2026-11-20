/* Mura GIS: интерфейс тілі (kk — қазақша, ru — орысша).
   Тілді анықтау реті:
     1) MURA_LANG орта айнымалысы (тесттер үшін);
     2) пайдаланушы «Баптаулар» терезесінде таңдаған тіл — userData/settings.json;
     3) орнатқышта таңдалған тіл — орнатқыш resources/install-lang.txt файлына жазады (build/installer.nsh);
     4) жүйенің тілі (ru → орысша), әйтпесе — қазақша.
   Бет тілді preload арқылы алады (window.mura.lang), ауыстыру — mura:set-lang (беттің өзі қайта жүктеледі). */
const fs = require('node:fs');
const path = require('node:path');

const LANGS = ['kk', 'ru'];
let file = null;
let lang = 'kk';
let source = 'default';

function readSettings() {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch (e) { return {}; }
}

/** dir — userData; installFile — орнатқыш жазған файл; locale — app.getLocale(). */
function init(dir, { installFile, locale } = {}) {
  file = path.join(dir, 'settings.json');
  const s = readSettings();
  let inst = '';
  try { if (installFile) inst = fs.readFileSync(installFile, 'utf8').trim(); } catch (e) { /* орнатқышсыз (portable, әзірлеу) */ }
  if (LANGS.includes(process.env.MURA_LANG)) { lang = process.env.MURA_LANG; source = 'env'; }
  else if (LANGS.includes(s.lang)) { lang = s.lang; source = 'settings'; }
  else if (LANGS.includes(inst)) {
    lang = inst; source = 'installer';
    // Орнатқышта таңдалған тіл баптауларға бір рет жазылады: кейінгі жаңартулар оны өзгертпейді
    try { set(inst); source = 'installer'; } catch (e) { /* жазу мүмкін болмаса — келесі іске қосуда қайталанады */ }
  }
  else if (/^ru\b/i.test(String(locale || ''))) { lang = 'ru'; source = 'system'; }
  else { lang = 'kk'; source = 'default'; }
  return lang;
}

function set(v) {
  if (!LANGS.includes(v)) return lang;
  lang = v; source = 'settings';
  if (file) {
    const s = readSettings();
    s.lang = v;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(s, null, 1));
  }
  return lang;
}

const get = () => lang;
const from = () => source;
/** Ағымдағы тілге сай мәтін: tx('қазақша', 'по-русски'). */
const tx = (kk, ru) => (lang === 'ru' ? ru : kk);

module.exports = { init, get, set, from, tx, LANGS };
