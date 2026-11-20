/* Орысша интерфейс пен екі тілдегі деректер тесті.
   Бағдарламаны MURA_LANG=ru режимінде уақытша жобамен іске қосып:
     • панельдерді, диалогтарды, бастапқы терезені, «Баптаулар → Тіл / Язык» ашып, аударылмай қалған қазақша мәтінді жинайды
       (ә, ғ, қ, ң, ө, ұ, ү, һ, і әріптері бар көрінетін мәтін не атрибут; «ҚАЗ» өрістері мен деректер есепке алынбайды);
     • ескерткіш белгісін және қорғау аймағын екі тілде сақтап, құжаттарды интерфейстен тәуелсіз қазақша да, орысша да шығарады;
     • GeoPackage-те орысша бағандар (name_ru т.б.) барын тексереді; скриншоттар сақтайды.
   Іске қосу: npm run smoke:ru [скриншот.png] */
const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

process.env.MURA_LANG = 'ru';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mura-ru-'));
app.setPath('userData', path.join(tmp, 'user'));
const gpkg = path.join(tmp, 'ru-test.gpkg');
process.env.MURA_PROJECT = gpkg;
process.env.MURA_OBLAST = 'Ақтөбе облысы';
const shot = process.argv.find(a => a.endsWith('.png')) || path.join(tmp, 'ru.png');
const errors = [];

app.on('browser-window-created', (_e, win) => {
  win.webContents.on('console-message', ev => { if (ev.level === 'error' || ev.level === 3) errors.push(ev.message); });
  win.webContents.once('did-finish-load', () => setTimeout(() => run(win).catch(e => { console.error('FAIL', e); app.exit(1); }), 3500));
});

async function run(win) {
  const js = s => win.webContents.executeJavaScript(s, true);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const SCAN = `(() => {
    const KK = /[ӘәҒғҚқҢңӨөҰұҮүҺһІі]/, out = new Set();
    const skip = el => el.closest && (el.closest('[lang="kk"]') || el.closest('.mura-langsw') || el.closest('.mura-bi-tag') || el.closest('.mk-dhead,.qa-sc-title,.qa-sc-meta,.qa-sc-desc,.leaflet-marker-pane,.leaflet-tooltip-pane'));
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const p = n.parentNode;
      if (!p || ['SCRIPT', 'STYLE', 'TEXTAREA', 'OPTION'].includes(p.nodeName) || skip(p) || !p.offsetParent && p.nodeName !== 'TITLE') continue;
      if (KK.test(n.nodeValue)) out.add(n.nodeValue.trim().slice(0, 160));
    }
    for (const el of document.querySelectorAll('[title],[placeholder],[aria-label],[data-tip],optgroup[label]')) {
      if (skip(el) || el.getAttribute('lang') === 'kk') continue;
      for (const a of ['title', 'placeholder', 'aria-label', 'data-tip', 'label']) { const v = el.getAttribute(a); if (v && KK.test(v)) out.add('@' + a + ': ' + v.slice(0, 160)); }
    }
    return [...out];
  })()`;
  const found = new Set();
  const scan = async () => (await js(SCAN)).forEach(s => found.add(s));

  // Бастапқы терезе және баптаулар
  win.webContents.send('mura:ui', 'start'); await wait(700); await scan();
  fs.writeFileSync(shot.replace(/\.png$/, '-start.png'), (await win.webContents.capturePage()).toPNG());
  await js(`document.getElementById('muraStartX') && document.getElementById('muraStartX').click()`); await wait(300);
  win.webContents.send('mura:ui', 'settings'); await wait(600); await scan();
  await js(`document.querySelector('[data-tab="lang"]').click()`); await wait(300); await scan();
  fs.writeFileSync(shot.replace(/\.png$/, '-settings.png'), (await win.webContents.capturePage()).toPNG());
  await js(`document.querySelector('[data-tab="toolbar"]').click()`); await wait(300); await scan();
  await js(`document.querySelector('.mura-set [data-x]').click()`); await wait(300);

  const r = await js(`(async () => {
    const out = { lang: window.mura && window.mura.lang, htmlLang: document.documentElement.lang };
    // Қорғау аймағы: үлгі + екі тілдегі мәліметтер
    document.getElementById('qaSample').click();
    await new Promise(r => setTimeout(r, 1500));
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
    set('qaName', 'Қабантау-V қорғаны'); set('qaNameRu', 'Курган Кабантау-V');
    set('qaPeriod', 'ерте темір дәуірі'); set('qaPeriodRu', 'эпоха раннего железа');
    set('qaPlace', 'Қарабұтақ ауылынан 9 шақырым солтүстікте'); set('qaPlaceRu', 'в 9 километрах к северу от села Карабутак');
    out.genKk = document.getElementById('qaNameGen').value; out.genRu = document.getElementById('qaNameGenRu').value;
    const qa = __qa;
    const kk = qa.docText(qa.R, { ...qa.docText().I, lang: 'kk' }) && null;
    MuraI18n.setDocLang('kk'); const Tk = qa.docText(); MuraI18n.setDocLang('ru'); const Tr = qa.docText();
    out.zoneKk = Tk.title; out.zoneKk1 = Tk.body[0]; out.zoneRu = Tr.title; out.zoneRu1 = Tr.body[0];
    MuraI18n.setDocLang('kk'); out.docxKk = (await qa.buildDocx()).size; MuraI18n.setDocLang('ru'); out.docxRu = (await qa.buildDocx()).size;
    // Сақтау (екі тілдегі өрістерімен)
    document.getElementById('qaSave').click();
    await new Promise(r => setTimeout(r, 1500));
    const l = await (await fetch(QA_API + '&op=list', { method: 'POST', body: new FormData() })).json();
    const rec = (l.items || []).find(x => x.fields && x.fields.name_ru === 'Курган Кабантау-V');
    out.zoneSaved = rec ? [rec.fields.name, rec.fields.name_ru, rec.fields.gen_ru, rec.fields.place_ru].join(' | ') : 'НЕ СОХРАНЕНО ' + JSON.stringify(l).slice(0, 200);
    // Ескерткіш белгісі екі тілде; тізім экспорты екі тілде
    const M = __marks;
    await M.api('save', { data: JSON.stringify({ name: 'Сүткент қалашығы', name_ru: 'Городище Сюткент', period: 'І–ХV ғасырлар', period_ru: 'I–ХV века',
      place: 'Сүткент ауылынан 2 шақырым батыста', place_ru: 'в 2 километрах к западу от села Сюткент', oblast: 'Түркістан облысы', district: 'Шардара ауданы',
      type: 'archeo', category: 'local', status: 'state', lat: 41.93, lon: 68.07 }) });
    await M.api('save', { data: JSON.stringify({ name: '', name_ru: 'Курган Акбулаксай', oblast: 'Ақтөбе облысы', district: 'Қарғалы ауданы', type: 'archeo', category: 'local', status: 'state', lat: 50.1, lon: 57.2 }) });
    const all = M.items;
    const secRu = M.exportSections(all, 'ru'), secKk = M.exportSections(all, 'kk');
    out.marksRu = secRu.map(s => s.title + ' :: ' + s.marks.map(m => m.name + ', ' + (m.period || '') + ' / ' + (m.place || '')).join(' ; '));
    out.marksKk = secKk.map(s => s.title + ' :: ' + s.marks.map(m => m.name + ', ' + (m.period || '') + ' / ' + (m.place || '')).join(' ; '));
    out.marksDocxRu = (await M.buildDocx(all, 'ru')).size; out.marksDocxKk = (await M.buildDocx(all, 'kk')).size;
    const m = await import('./marks/export.js');
    const h = m.pdfHtml(secKk, secKk[0].title, 'kk');
    out.pdfKkHead = (h.match(/<th>[^<]*(<br>[^<]*)?<\\/th>/g) || []).slice(0, 2).join('');
    const h2 = m.pdfHtml(secRu, secRu[0].title, 'ru');
    out.pdfRuHead = (h2.match(/<th>[^<]*(<br>[^<]*)?<\\/th>/g) || []).slice(0, 2).join('');
    out.pdfRuGroups = [...h2.matchAll(/<tr class="g"><td colspan="5">([^<]*)/g)].map(x => x[1]).join(' | ');
    out.pdfKkGroups = [...h.matchAll(/<tr class="g"><td colspan="5">([^<]*)/g)].map(x => x[1]).join(' | ');
    return out;
  })()`);
  await scan();
  for (const id of ['qaOpenInfo', 'qaOpenSaved', 'qaPtsBtn']) { await js(`document.getElementById('${id}') && document.getElementById('${id}').click()`); await wait(700); await scan(); }
  fs.writeFileSync(shot.replace(/\.png$/, '-zone.png'), (await win.webContents.capturePage()).toPNG());
  await js(`document.querySelectorAll('[data-close]').forEach(b => b.offsetParent && b.click())`);
  await js(`MuraSvc.set('marks')`); await wait(500); await scan();
  await js(`document.getElementById('mkListBtn').click()`); await wait(800); await scan();
  await js(`__marks.openDialog(__marks.items[0])`); await wait(800); await scan();
  fs.writeFileSync(shot.replace(/\.png$/, '-mark.png'), (await win.webContents.capturePage()).toPNG());
  await js(`document.getElementById('mkCancel') && document.getElementById('mkCancel').click()`); await wait(300);
  await js(`MuraSvc.set('routes')`); await wait(500); await scan();
  await js(`document.getElementById('rtListBtn').click()`); await wait(600); await scan();
  await js(`document.getElementById('rtFindBtn').click()`); await wait(600); await scan();
  await js(`MuraSvc.set('zone')`); await wait(500);
  await js(`document.querySelector('.bm-trigger') && document.querySelector('.bm-trigger').click()`); await wait(600); await scan();
  await js(`document.body.click()`);
  await js(`document.getElementById('qaOpenInfo').click()`); await wait(800);
  fs.writeFileSync(shot, (await win.webContents.capturePage()).toPNG());

  // GeoPackage: орысша бағандар
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(gpkg, { readOnly: true });
    const cols = t => db.prepare('PRAGMA table_info("' + t + '")').all().map(c => c.name);
    r.gpkgMarks = cols('marks').filter(c => /_ru$/.test(c)).join(','); r.gpkgZones = cols('zones').filter(c => /_ru$/.test(c)).join(',');
    r.gpkgRow = JSON.stringify(db.prepare('SELECT name, name_ru, period_ru FROM marks').all());
    db.close();
  } catch (e) { r.gpkg = 'read error: ' + e.message; }

  r.untranslated = [...found].filter(s => !/^(область|области) (Жетісу|Ұлытау)$/.test(s) && s !== 'Тіл / Язык' && !s.startsWith('Список памятников (DOCX'));   // ресми орысша атаулар (қазақ әріптерімен)
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  console.log('SCREENSHOT', shot);
  app.exit(r.untranslated.length || errors.length ? 2 : 0);
}

require(path.join(__dirname, '..', 'main', 'main.js'));
