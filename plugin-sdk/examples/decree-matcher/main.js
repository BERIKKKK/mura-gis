/* Атау сәйкестендіргіш — Mura GIS үлгі плагині (Plugin API 1, Mura GIS 2.4.4+).
   1) «⋯ → Қаулылар (атау сәйкестендіру)…»: ескерткіштер тізімін бекіткен қаулының қазақша және орысша файлдары
      (DOCX не мәтіні бар PDF, кемінде 2 файл) таңдалады → lib/files.js оқиды, lib/decree.js кестені талдайды (тіл, қаулының
      нөмірі мен күні, аудандар, атау / мерзім / түр / орны) → екі тіл нөмір бойынша жұптасады → тексеру терезесі →
      тізім плагиннің жадында (mura.storage) сақталады. Файлдың өзі сақталмайды; тізімді кез келген уақытта өшіруге болады.
   2) mark.suggest / zone.suggest: белгі терезесі не қорғау аймағының мәліметтер терезесі ашылғанда, атауы жазылғанда
      lib/match.js тізімнен ұқсас ескерткіштерді табады (атау, аудан, «ауылдан N км» бойынша шамамен орны; аймақта —
      шекараның ортасы) — бағдарлама оларды «Плагин ұсынысы» тізімінде көрсетеді; ұсыныс жоқ болса — кеңес (hint).
   Плагин оқшауланған ортада жұмыс істейді: тек globalThis.mura API-і және өз файлдары. */
'use strict';

const LANG = { cur: mura.app.lang };
const t = (k, v) => mura.i18n.t(k, v, LANG.cur);
const loadScript = src => new Promise((res, rej) => {
  const s = document.createElement('script');
  s.src = src; s.onload = res; s.onerror = () => rej(new Error('Плагин файлы жүктелмеді: ' + src));
  document.head.appendChild(s);
});
const ready = Promise.all(['lib/files.js', 'lib/decree.js', 'lib/match.js'].map(loadScript)).then(() => mura.i18n.ready());

/* ======================= Сақтау (mura.storage) =======================
   index — [{ id, title_kk, title_ru, number, date, regNumber, regDate, edition, category, oblast, rows, districts, files, loadedAt }]
   d:<id> — { id, meta, rows: [[n, аудан_kk, аудан_ru, атау_kk, атау_ru, мерзім_kk, мерзім_ru, түр, орны_kk, орны_ru, lat, lon]] } */
const COLS = ['n', 'district_kk', 'district_ru', 'name_kk', 'name_ru', 'period_kk', 'period_ru', 'type', 'place_kk', 'place_ru', 'lat', 'lon'];
const pack = r => COLS.map(k => (r[k] == null ? '' : r[k]));
const unpack = a => { const r = {}; COLS.forEach((k, i) => { r[k] = a[i] === '' ? (k === 'lat' || k === 'lon' ? null : '') : a[i]; }); return r; };
const cache = new Map();                               // id → { id, meta, prepared }
async function index() { const v = await mura.storage.get('index'); return Array.isArray(v) ? v : []; }
async function decrees() {
  const list = await index();
  const out = [];
  for (const d of list) {
    if (!cache.has(d.id)) {
      const v = await mura.storage.get('d:' + d.id);
      if (!v || !Array.isArray(v.rows)) continue;
      cache.set(d.id, { id: d.id, meta: v.meta || {}, prepared: DMMatch.prepare({ rows: v.rows.map(unpack) }) });
    }
    out.push(cache.get(d.id));
  }
  return out;
}

const fmtDate = s => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : s || '');
const titleOf = (d, l) => (l === 'ru' ? d.title_ru || d.title_kk : d.title_kk || d.title_ru) || ('№ ' + (d.number || '?'));
const shortOf = d => t('decree', { no: d.number || '?', date: fmtDate(d.date) || '—' }) + (d.regNumber ? ' (' + t('decreeReg', { reg: d.regNumber }) + ')' : '');
const idOf = m => String(m.regNumber ? 'r' + m.regNumber : 'n' + (m.number || 'x') + '_' + (m.date || '')).replace(/[^\w.-]/g, '_').slice(0, 60);

/* ======================= Панель ======================= */
let panel = null;
async function paint(msg) {
  const list = await index();
  const body = [{ type: 'text', text: t('intro') }];
  if (list.length) {
    body.push({ type: 'table', columns: [t('col.no'), t('col.title'), t('col.rows'), t('col.districts'), t('col.edition'), t('col.loaded')],
      rows: list.map(d => [shortOf(d), titleOf(d, LANG.cur), String(d.rows), String(d.districts), d.edition || '—', fmtDate(String(d.loadedAt || '').slice(0, 10))]) });
    body.push({ type: 'field', key: 'pick', kind: 'select', label: t('pick'), value: list[0].id, options: list.map(d => ({ value: d.id, title: shortOf(d) })) });
  } else body.push({ type: 'text', tone: 'muted', text: t('empty') });
  if (msg) body.push({ type: 'text', tone: msg.tone || 'info', text: msg.text });
  if (msg && msg.lines && msg.lines.length) body.push({ type: 'list', items: msg.lines });
  body.push({ type: 'text', tone: 'muted', text: t('privacy') });
  const buttons = [{ id: 'load', title: t('load'), primary: true }];
  if (list.length) buttons.push({ id: 'del', title: t('del') });
  if (list.length > 1) buttons.push({ id: 'delAll', title: t('delAll') });
  buttons.push({ id: 'close', title: t('close') });
  const spec = { title: t('title'), body, buttons };
  if (panel) { try { await panel.update(spec); return; } catch (e) { panel = null; } }
  panel = await mura.ui.panel.open(spec);
  panel.onClose(() => { panel = null; });
  panel.onAction(a => onAction(a).catch(e => paint({ tone: 'error', text: e.message, lines: e.lines })));
}
let busy = false;
async function onAction(a) {
  if (busy) return;
  busy = true;
  try {
    if (a.button === 'close') { if (panel) await panel.close(); panel = null; return; }
    if (a.button === 'load') { const r = await loadFlow(); if (r) await paint(r); return; }
    const list = await index();
    if (a.button === 'del') {
      const d = list.find(x => x.id === (a.values && a.values.pick)) || list[0];
      if (!d || !(await mura.ui.confirm(t('confirmDel', { title: shortOf(d) })))) return;
      await mura.storage.remove('d:' + d.id);
      await mura.storage.set('index', list.filter(x => x.id !== d.id));
      cache.delete(d.id);
      await paint({ tone: 'ok', text: t('deleted', { title: shortOf(d) }) });
    }
    if (a.button === 'delAll') {
      if (!list.length || !(await mura.ui.confirm(t('confirmDelAll', { n: list.length })))) return;
      for (const d of list) await mura.storage.remove('d:' + d.id);
      await mura.storage.set('index', []);
      cache.clear();
      await paint({ tone: 'ok', text: t('deletedAll') });
    }
  } finally { busy = false; }
}

/* ======================= Жүктеу ======================= */
const langName = l => t(l === 'ru' ? 'ru' : 'kk');
async function loadFlow() {
  const files = await mura.files.open({ multiple: true, title: t('pickTitle'), filters: [{ name: 'DOCX, PDF', extensions: ['docx', 'pdf'] }] });
  if (!files || !files.length) return null;
  if (files.length < 2) return { tone: 'error', text: t('needTwo') };
  const done = [], errors = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (panel) await panel.update({ title: t('title'), body: [{ type: 'text', tone: 'muted', text: t('reading', { name: f.name, i: i + 1, n: files.length }) }], buttons: [] }).catch(() => {});
    try {
      const doc = await DMFiles.read(f.name, f.data);
      const a = DMDecree.analyze(doc);
      if (!a.lang) { errors.push(t('langUnknown', { file: f.name })); continue; }
      done.push({ file: f.name, kind: doc.kind, ...a });
    } catch (e) { errors.push(f.name + ': ' + e.message); }
  }
  // Бір қаулының файлдары: тіркеу нөмірі (не нөмір + күні) бойынша
  const groups = new Map();
  for (const x of done) { const k = idOf(x.meta); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
  const ready2 = [];
  for (const [id, g] of groups) {
    const kk = g.filter(x => x.lang === 'kk'), ru = g.filter(x => x.lang === 'ru');
    const m0 = (kk[0] || ru[0]).meta;
    const nm = m0.number ? '№ ' + m0.number : g[0].file;
    if (kk.length > 1 || ru.length > 1) { errors.push(t('dupLang', { title: nm, lang: langName(kk.length > 1 ? 'kk' : 'ru'), files: (kk.length > 1 ? kk : ru).map(x => x.file).join(', ') })); continue; }
    if (!kk.length || !ru.length) { errors.push(t('noPair', { title: nm, lang: langName(kk.length ? 'ru' : 'kk') })); continue; }
    ready2.push(merge(id, kk[0], ru[0]));
  }
  if (!ready2.length) return { tone: 'error', text: errors.length ? t('readFail') + ':' : t('nothingLoaded'), lines: errors };
  return confirmSave(ready2, errors);
}
/** Екі тілді нөмір бойынша біріктіру. */
function merge(id, kk, ru) {
  const byN = new Map(ru.rows.map(r => [r.n, r]));
  const used = new Set();
  const rows = [];
  for (const k of kk.rows) {
    const r = byN.get(k.n) || {};
    if (byN.has(k.n)) used.add(k.n);
    rows.push({ n: k.n, district_kk: k.district, district_ru: r.district || '', name_kk: k.name, name_ru: r.name || '', period_kk: k.period, period_ru: r.period || '',
      type: k.type || r.type || '', place_kk: k.place, place_ru: r.place || '', lat: k.lat != null ? k.lat : r.lat, lon: k.lon != null ? k.lon : r.lon });
  }
  for (const r of ru.rows) if (!used.has(r.n)) rows.push({ n: r.n, district_kk: '', district_ru: r.district, name_kk: '', name_ru: r.name, period_kk: '', period_ru: r.period, type: r.type, place_kk: '', place_ru: r.place, lat: r.lat, lon: r.lon });
  rows.sort((a, b) => a.n - b.n);
  const meta = { ...ru.meta, ...kk.meta, title_kk: kk.meta.title, title_ru: ru.meta.title, oblast: kk.meta.oblast || '', category: kk.meta.category || ru.meta.category };
  const warn = [...kk.warnings.map(w => langName('kk') + ': ' + w), ...ru.warnings.map(w => langName('ru') + ': ' + w)];
  if (kk.rows.length !== ru.rows.length) warn.push(t('pairWarn', { title: '№ ' + (meta.number || '?'), kk: kk.rows.length, ru: ru.rows.length }));
  const districts = new Set(rows.map(r => r.district_kk || r.district_ru).filter(Boolean)).size;
  return { id, meta, rows, warn, districts, expected: kk.expected || ru.expected || 0, files: [{ name: kk.file, lang: 'kk', kind: kk.kind }, { name: ru.file, lang: 'ru', kind: ru.kind }] };
}
async function confirmSave(list, errors) {
  const existing = new Set((await index()).map(d => d.id));
  const body = [{ type: 'text', text: t('check.intro') },
    { type: 'table', columns: [t('check.cols.decree'), t('check.cols.lang'), t('check.cols.file'), t('check.cols.rows'), t('check.cols.districts')],
      rows: list.flatMap(d => d.files.map(f => [shortOf(d.meta), langName(f.lang), f.name + ' (' + f.kind.toUpperCase() + ')', String(d.rows.length), String(d.districts)])) }];
  for (const d of list) {
    body.push({ type: 'field', key: 'exp_' + d.id, kind: 'number', label: t('expected', { title: shortOf(d.meta) }), value: d.expected || '', description: d.expected ? t('expectedDoc', { n: d.expected }) : '' });
    if (existing.has(d.id)) body.push({ type: 'text', tone: 'warn', text: t('replace', { title: shortOf(d.meta) }) });
  }
  const warns = [...errors, ...list.flatMap(d => d.warn)];
  if (warns.length) { body.push({ type: 'text', tone: 'warn', text: t('warnings') }); body.push({ type: 'list', items: warns }); }
  const r = await mura.ui.dialog({ title: t('check.title'), width: 'wide', body, buttons: [{ id: 'cancel', title: t('cancel') }, { id: 'save', title: t('save'), primary: true }] });
  if (!r || r.button !== 'save') return null;
  // Санды тексеру
  const bad = [];
  for (const d of list) {
    const exp = Math.round(+String((r.values || {})['exp_' + d.id] ?? '').replace(',', '.'));
    if (exp > 0 && exp !== d.rows.length) bad.push(t('countMismatch', { title: shortOf(d.meta), exp, got: d.rows.length }));
  }
  if (bad.length) {
    const r2 = await mura.ui.dialog({ title: t('check.title'), body: [{ type: 'list', items: bad }, { type: 'text', tone: 'muted', text: t('countHint') }],
      buttons: [{ id: 'cancel', title: t('cancel') }, { id: 'save', title: t('saveAnyway'), primary: true }] });
    if (!r2 || r2.button !== 'save') return null;
  }
  let idx = await index();
  const now = new Date().toISOString();
  for (const d of list) {
    const rec = { id: d.id, meta: d.meta, rows: d.rows.map(pack) };
    if (JSON.stringify(rec).length + JSON.stringify(idx).length > 4.5 * 1024 * 1024) return { tone: 'error', text: t('tooBig') };
    try { await mura.storage.set('d:' + d.id, rec); } catch (e) { return { tone: 'error', text: t('tooBig') + ' (' + e.message + ')' }; }
    cache.delete(d.id);
    const m = d.meta;
    idx = idx.filter(x => x.id !== d.id).concat([{ id: d.id, title_kk: m.title_kk || '', title_ru: m.title_ru || '', number: m.number || '', date: m.date || '', regNumber: m.regNumber || '',
      regDate: m.regDate || '', edition: m.edition || '', category: m.category || '', oblast: m.oblast || '', rows: d.rows.length, districts: d.districts, files: d.files, loadedAt: now }]);
    await mura.storage.set('index', idx);
  }
  return { tone: 'ok', text: t('saved', { list: list.map(d => shortOf(d.meta) + ' — ' + d.rows.length).join('; ') }), lines: errors };
}

/* ======================= Белгі терезесіне ұсыныс ======================= */
let placeCache = { at: 0, idx: new Map() };
async function placeIdx() {
  if (Date.now() - placeCache.at < 60000) return placeCache.idx;
  let idx = new Map();
  try {
    const [g, a] = await Promise.all([mura.geometry.list('places', { limit: 10000 }), mura.attributes.list('places', { limit: 10000 })]);
    const byId = new Map(a.map(x => [x.id, x.attributes]));
    idx = DMMatch.placeIndex(g.filter(x => x.geometry && x.geometry.type === 'Point').map(x => {
      const at = byId.get(x.id) || {};
      return { name: at.name, name_ru: at.name_ru, lat: x.geometry.coordinates[1], lon: x.geometry.coordinates[0] };
    }));
  } catch (e) { /* рұқсат жоқ не жоба ашылмаған — орынсыз */ }
  placeCache = { at: Date.now(), idx };
  return idx;
}
const fmtDist = d => (d < 1000 ? t('m', { d: Math.round(d / 10) * 10 }) : t('km', { d: (d / 1000).toFixed(d < 10000 ? 1 : 0).replace('.', LANG.cur === 'ru' || LANG.cur === 'kk' ? ',' : '.') }));

mura.commands.register('suggest', async ctx => {
  await ready;
  if (ctx && ctx.lang) LANG.cur = ctx.lang;
  const decs = await decrees();
  if (!decs.length) return { items: [] };
  // mark.suggest — белгі (Point); zone.suggest — қорғау аймағы (Polygon: шекараның ортасы алынады)
  const sel = mura.hasPermission('attributes.read') ? await mura.attributes.selection() : null;
  const a = (sel && sel.attributes) || {};
  let lat = null, lon = null;
  if (mura.hasPermission('geometry.read')) {
    const g = await mura.geometry.selection();
    const geo = g && g.geometry;
    if (geo && geo.type === 'Point') { lon = geo.coordinates[0]; lat = geo.coordinates[1]; }
    else if (geo && geo.type === 'Polygon' && geo.coordinates[0] && geo.coordinates[0].length > 3) {
      const r = geo.coordinates[0].slice(0, -1);
      lon = r.reduce((s, p) => s + p[0], 0) / r.length; lat = r.reduce((s, p) => s + p[1], 0) / r.length;
    }
  }
  const idx = mura.hasPermission('geometry.read') && mura.hasPermission('attributes.read') ? await placeIdx() : new Map();
  const res = DMMatch.suggest(decs, { name: a.name, name_ru: a.name_ru, district: a.district, oblast: a.oblast, lat, lon }, idx, { limit: 6 });
  const ru = LANG.cur === 'ru';
  // Ұсыныс жоқ кездегі кеңес: атауы әлі жазылмаған не тізімде табылмады
  if (!res.length) {
    const list = await index();
    const src = list.map(d => t('decree', { no: d.number || '?', date: fmtDate(d.date) || '—' }) + ' — ' + d.rows).join('; ');
    const typed = String(a.name || a.name_ru || '').trim();
    return { items: [], hint: typed ? t('hint.none', { name: typed, src }) : t('hint.type', { src }) };
  }
  return {
    items: res.map(x => {
      const r = x.row, m = x.dec.meta || {};
      const nm = ru ? r.name_ru || r.name_kk : r.name_kk || r.name_ru;
      const per = ru ? r.period_ru || r.period_kk : r.period_kk || r.period_ru;
      const dist = ru ? r.district_ru || r.district_kk : r.district_kk || r.district_ru;
      const detail = [dist, per, x.d != null && x.d < 50000 ? fmtDist(x.d) + (x.approx && x.village ? ' (' + t('fromVillage', { village: x.village }) + ')' : '') : '',
        x.nameScore && x.nameScore < 0.999 ? t('similar', { p: Math.round(x.nameScore * 100) }) : '', t('decree', { no: m.number || '?', date: fmtDate(m.date) || '—' })].filter(Boolean).join(' · ');
      const fields = { name: r.name_kk, name_ru: r.name_ru, period: r.period_kk, period_ru: r.period_ru, place: r.place_kk, place_ru: r.place_ru };
      if (r.type) fields.type = r.type;
      if (m.category) fields.category = m.category;
      if (r.district_kk) fields.district = r.district_kk;
      if (m.oblast) fields.oblast = m.oblast;
      return { title: '№' + r.n + ' ' + nm, detail, fields };
    }),
  };
});

mura.commands.register('manage', async ctx => {
  await ready;
  if (ctx && ctx.lang) LANG.cur = ctx.lang;
  await paint();
  return true;
});
