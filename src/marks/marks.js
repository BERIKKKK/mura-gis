/* Mura GIS: «Белгі қою» — ескерткіштерді картада нүктемен белгілеу (қорғау аймағынан бөлек негізгі функция).
   Қорғау аймағымен үйлесімі:
     • бір карта, бірақ бөлек қабат және бөлек сақтау орны (data/marks.json — main/marks.js);
     • режимдер бірін-бірі өшіреді: «Белгі қою» қосылса — шекара нүктесін қою мен сызғыш өшеді, және керісінше;
     • шекара нүктесін қою не сызғыш режимінде белгілер басуды өткізіп жібереді (шекараны белгінің үстінен де қоюға болады);
     • белгілер панелі мен «Мәліметтер» / «Сақталған аймақтар» / «Нүктелер» панельдері бірін-бірі жабады.
   Интерфейс бөліктері — marks/marks-dom.js, экспорт — marks/export.js, сұрыптау — marks/sort.js. */
import { parseOne, genitive } from '../qorgau/app.js';
import { sortMarks, arabizeRoman, compareText } from './sort.js';
import { TYPES, CATEGORIES, STATUSES, SYMBOL_FILE, typeOf, categoryOf, statusOf, geojson, fromGeojson, docxBlob, pdfHtml, defaultTitle, sections, coordLines, nameCell } from './export.js';

const $ = id => document.getElementById(id);
const L = globalThis.L;
const MM = globalThis.MuraMarks || {};
const map = MM.map;
const API = 'mura://app/marks?v=1';
const app = $('qaApp'), mapEl = $('qaMap'), panelEl = $('mkPanel'), modeBtn = $('mkMode'), listBtn = $('mkListBtn');
const ic = MM.icon || (() => '');
const REG = globalThis.MuraRegions;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* жеке режим */ } },
};

let items = [];               // барлық белгілер (сақталғандары)
let marking = false;          // «Белгі қою» режимі
let dragging = false;

function toast(msg, err) {
  const t = $('qaToast');
  if (!t) return;
  t.textContent = msg; t.classList.toggle('is-err', !!err); t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, err ? 5000 : 2600);
}
const ask = (msg, o) => (globalThis.QAUI && globalThis.QAUI.confirm ? globalThis.QAUI.confirm(msg, o) : Promise.resolve(confirm(msg)));

/* ======================= Сақтау (main/marks.js) ======================= */
async function api(op, data) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data || {})) fd.append(k, v);
  const r = await fetch(API + '&op=' + op, { method: 'POST', body: fd });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'Сақтау қатесі');
  if (Array.isArray(j.items)) { items = j.items; render(); }
  return j;
}
async function saveMark(m) {
  const j = await api('save', { data: JSON.stringify(m) });
  return items.find(x => x.id === j.id);
}

/* ======================= Карта қабаты ======================= */
const layer = L.layerGroup();
const markers = new Map();    // id → L.marker
/* Шартты белгілер: түрі — symbols/*.svg (QGIS параметрлі SVG), түсі — санатына қарай (6-бап).
   QGIS-тің param(fill) / param(outline) мәндері санат түсімен ауыстырылады, қалған param(…) — әдепкі мәнімен. */
const SYM = {};
await Promise.all(Object.entries(SYMBOL_FILE).map(async ([t, f]) => {
  try { SYM[t] = (await (await fetch(new URL('symbols/' + f + '.svg', import.meta.url))).text()).replace(/<!--[\s\S]*?-->/g, '').trim(); }
  catch (e) { SYM[t] = ''; }
}));
const symCache = new Map();
/** Белгінің SVG-і: w — ені (px), биіктігі 64×80 пропорциясымен. */
function symbolSvg(type, category, w = 30) {
  const k = type + '|' + category + '|' + w;
  if (symCache.has(k)) return symCache.get(k);
  const st = categoryOf(category);
  let svg = SYM[type] || SYM.archeo || '';
  svg = svg.replace(/param\(fill\)\s*#[0-9a-f]{3,8}/gi, st.fill).replace(/param\(outline\)\s*#[0-9a-f]{3,8}/gi, st.outline).replace(/param\([\w-]+\)\s*/g, '')
    .replace(/<svg\b[^>]*>/, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 80" width="' + w + '" height="' + Math.round(w * 1.25) + '" aria-hidden="true">');
  symCache.set(k, svg);
  return svg;
}
function pinIcon(m) {
  const w = 30, h = Math.round(w * 1.25);
  return L.divIcon({
    className: 'mk-pin' + (m.status === 'excluded' ? ' is-excl' : ''), iconSize: [w, h], iconAnchor: [w / 2, h - 1], tooltipAnchor: [0, -h + 4],
    html: symbolSvg(m.type, m.category, w),
  });
}
function drawMarkers() {
  layer.clearLayers();
  markers.clear();
  const labels = $('mkLabels').checked;
  for (const m of items) {
    const mk = L.marker([m.lat, m.lon], { icon: pinIcon(m), draggable: marking, keyboard: true, title: '', riseOnHover: true, autoPan: true });
    mk.bindTooltip(esc(m.name), { direction: 'top', permanent: labels, className: 'mk-tip' + (labels ? ' is-perm' : '') });
    mk.on('click', () => { if (!dragging) openDialog(m); });
    mk.on('dragstart', () => { dragging = true; });
    mk.on('dragend', async () => {
      setTimeout(() => { dragging = false; }, 50);
      const p = mk.getLatLng();
      try { await saveMark({ ...m, lat: p.lat, lon: p.lng }); toast('«' + m.name + '» жылжытылды: ' + coordLines({ lat: p.lat, lon: p.lng }).join(', ')); }
      catch (e) { toast(e.message, true); drawMarkers(); }
    });
    mk.addTo(layer);
    markers.set(m.id, mk);
  }
}
function paintLayerVisibility() {
  const on = $('mkShow').checked;
  if (on && !map.hasLayer(layer)) layer.addTo(map);
  if (!on && map.hasLayer(layer)) map.removeLayer(layer);
}

/* ======================= Режим: «Белгі қою» ======================= */
const addBtn = $('qaAddMode'), rulerBtn = $('qaRuler');
const pressed = b => b && b.getAttribute('aria-pressed') === 'true';
function setMarking(on) {
  if (on) {
    // Қорғау аймағының режимдерін өшіреміз (app.js өз батырмасы арқылы — оның күйі дұрыс жаңарады)
    if (pressed(addBtn)) addBtn.click();
    if (pressed(rulerBtn)) rulerBtn.click();
    if (!$('mkShow').checked) { $('mkShow').checked = true; paintLayerVisibility(); }
  }
  marking = on;
  modeBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  modeBtn.dataset.tip = on ? 'Белгі қою: қосулы — картаны басыңыз (Esc — өшіру)' : 'Белгі қою: картаны басып ескерткішті белгілеңіз';
  mapEl.classList.toggle('is-marking', on);
  for (const mk of markers.values()) { if (mk.dragging) (on ? mk.dragging.enable() : mk.dragging.disable()); }
}
modeBtn.addEventListener('click', () => setMarking(!marking));
// Шекара нүктесін қою не сызғыш қосылса — белгі қою өшеді
const modeObs = new MutationObserver(() => { if (marking && (pressed(addBtn) || pressed(rulerBtn))) setMarking(false); });
for (const b of [addBtn, rulerBtn]) if (b) modeObs.observe(b, { attributes: true, attributeFilter: ['aria-pressed'] });

map.on('click', e => {
  if (!marking || dragging) return;
  openDialog({ lat: e.latlng.lat, lon: e.latlng.lng });
});

/* ======================= Белгі терезесі (атауы, орналасқан жері, түрі, санаты, мәртебесі) ======================= */
const districtOpts = () => [...($('qaDistrict')?.options || [])].map(o => o.value).filter(Boolean);
const optionsHtml = (list, val) => list.map(x => '<option value="' + esc(x.v) + '"' + (x.v === val ? ' selected' : '') + '>' + esc(x.label) + '</option>').join('');
const lastKey = 'mk-last-v1';            // соңғы таңдалған облыс/аудан/түр/санат/мәртебе — келесі белгіге әдепкі
function lastDefaults() { try { return JSON.parse(store.get(lastKey) || '{}') || {}; } catch (e) { return {}; } }

let dlg = null;
function closeDialog() {
  if (!dlg) return;
  dlg.back.remove();
  document.removeEventListener('keydown', dlg.onKey, true);
  if (dlg.prev && dlg.prev.focus && document.contains(dlg.prev)) dlg.prev.focus({ preventScroll: true });
  if (dlg.temp) map.removeLayer(dlg.temp);
  dlg = null;
}
function parseLatLon(latS, lonS) {
  // Бір өріске жұп қойылса («50.41, 57.04» не «50°24′ N 57°02′ E») — екіге бөлеміз
  if (String(latS).trim() && !String(lonS).trim()) {
    const parts = String(latS).split(/\s*[;\t]\s*|,\s+|\s{2,}|(?<=[NnСс″"'])\s+(?=\d)/).filter(Boolean);
    if (parts.length === 2) { latS = parts[0]; lonS = parts[1]; }
  }
  const a = parseOne(latS), b = parseOne(lonS);
  if (a.err) return { err: 'Ендік: ' + a.err };
  if (b.err) return { err: 'Бойлық: ' + b.err };
  if (Math.abs(a.v) > 90) return { err: 'Ендік ±90° аралығында болуы керек' };
  if (Math.abs(b.v) > 180) return { err: 'Бойлық ±180° аралығында болуы керек' };
  return { lat: a.v, lon: b.v };
}

function openDialog(m, o = {}) {
  closeDialog();
  globalThis.QAUI?.closePop?.();
  const isNew = !m.id;
  const def = lastDefaults();
  const v = {
    name: '', period: '', place: '', note: '',
    oblast: REG ? REG.remembered() : (def.oblast || 'Ақтөбе облысы'),
    type: def.type || 'archeo', category: def.category ?? 'local', status: def.status || 'state',
    ...m,
  };
  // Аудан әдепкісі — соңғы таңдалған (сол облыстікі болса ғана)
  if (v.district == null) v.district = def.oblast === v.oblast ? def.district || '' : '';
  const dists = districtOpts();
  if (v.district && !dists.includes(v.district)) dists.push(v.district);
  const back = document.createElement('div');
  back.className = 'qa-dlg-back mk-dlg-back';
  back.innerHTML =
    '<form class="qa-dlg qa-glass mk-dlg" role="dialog" aria-modal="true" aria-labelledby="mkDlgT" novalidate>' +
      '<h3 id="mkDlgT"><span class="mk-sym" id="mkSym"></span>' + (isNew ? 'Жаңа ескерткіш белгісі' : 'Ескерткіш белгісі') + '</h3>' +
      '<div class="qa-f"><label for="mkName">Атауы <span class="mk-req">*</span></label><input type="text" id="mkName" name="name" maxlength="200" required placeholder="Мысалы: Қабантау-V қорғаны" value="' + esc(v.name) + '">' +
        '<p class="qa-hint mk-key" id="mkKey" hidden></p></div>' +
      '<div class="qa-f"><label for="mkPeriod">Мерзімі (дәуірі)</label><input type="text" id="mkPeriod" name="period" maxlength="120" placeholder="б.з.б. VII–IV ғасырлар" value="' + esc(v.period) + '"></div>' +
      '<div class="qa-row2">' +
        '<div class="qa-f"><label for="mkOblast">Облыс / республикалық қала</label>' + (REG
          ? '<select id="mkOblast" name="oblast">' + REG.regionOptions(v.oblast) + '</select>'
          : '<input type="text" id="mkOblast" name="oblast" maxlength="80" value="' + esc(v.oblast) + '">') + '</div>' +
        '<div class="qa-f"><label for="mkDistrict">Аудан / қала</label><select id="mkDistrict" name="district">' + (REG ? REG.unitOptions(v.oblast, v.district) : '<option value="">—</option>' +
          dists.map(d => '<option' + (d === v.district ? ' selected' : '') + '>' + esc(d) + '</option>').join('')) + '</select></div>' +
      '</div>' +
      '<div class="qa-f"><label for="mkPlace">Орналасқан жері</label><textarea id="mkPlace" name="place" maxlength="1500" rows="2" placeholder="Қос Естек ауылынан 15,8 шақырым батыста, Егінді жылғасының оң жағалауында">' + esc(v.place) + '</textarea></div>' +
      '<div class="qa-f"><label for="mkType">Түрі <small class="mk-law">(Заңның 5-бабы)</small></label><select id="mkType" name="type">' + optionsHtml(TYPES, v.type) + '</select></div>' +
      '<div class="qa-row2">' +
        '<div class="qa-f"><label for="mkCat">Санаты <small class="mk-law">(6-бап)</small></label><select id="mkCat" name="category">' + optionsHtml(CATEGORIES, v.category) + '</select></div>' +
        '<div class="qa-f"><label for="mkStatus">Мәртебесі <small class="mk-law">(3–5-баптар)</small></label><select id="mkStatus" name="status">' + optionsHtml(STATUSES, v.status) + '</select></div>' +
      '</div>' +
      '<div class="qa-row2 mk-coords">' +
        '<div class="qa-f"><label for="mkLat">Ендік (N)</label><input type="text" id="mkLat" name="lat" autocomplete="off" spellcheck="false" value="' + esc(o.latText ?? (v.lat != null ? (+v.lat).toFixed(7) : '')) + '"></div>' +
        '<div class="qa-f"><label for="mkLon">Бойлық (E)</label><input type="text" id="mkLon" name="lon" autocomplete="off" spellcheck="false" value="' + esc(o.lonText ?? (v.lon != null ? (+v.lon).toFixed(7) : '')) + '"></div>' +
      '</div>' +
      '<p class="qa-hint mk-coordok" id="mkCoordOk"></p>' +
      '<div class="qa-f"><label for="mkNote">Ескертпе</label><textarea id="mkNote" name="note" maxlength="3000" rows="2">' + esc(v.note) + '</textarea></div>' +
      '<p class="mk-err" id="mkErr" role="alert" hidden></p>' +
      '<div class="qa-dlg-btns">' +
        (isNew ? '' : '<button type="button" class="lnk lnk--danger mk-del" id="mkDel">Өшіру</button><button type="button" class="lnk" id="mkGo">Картадан көрсету</button>') +
        '<span class="mk-sp"></span>' +
        '<button type="button" class="btn btn--ghost btn--sm" id="mkCancel">Бас тарту</button>' +
        '<button type="submit" class="btn btn--primary btn--sm">' + (isNew ? 'Белгіні сақтау' : 'Сақтау') + '</button>' +
      '</div>' +
    '</form>';
  const form = back.querySelector('form');
  const F = form.elements;
  const err = back.querySelector('#mkErr');
  const showErr = t => { err.textContent = t || ''; err.hidden = !t; };

  // Жаңа белгінің орны картада уақытша көрсетіледі
  const temp = isNew && v.lat != null ? L.marker([v.lat, v.lon], { icon: pinIcon(v), interactive: false, opacity: 0.75 }).addTo(map) : null;

  function paintKey() {
    const k = arabizeRoman(F.name.value.trim());
    const el = back.querySelector('#mkKey');
    el.hidden = !F.name.value.trim() || k === F.name.value.trim();
    el.textContent = 'Сұрыптауда: «' + k + '»';
  }
  function paintCoord() {
    const r = parseLatLon(F.lat.value, F.lon.value);
    const el = back.querySelector('#mkCoordOk');
    if (r.err) { el.textContent = F.lat.value.trim() || F.lon.value.trim() ? r.err : 'Координатаны енгізіңіз (кез келген пішімде: 50.412345, 50°24′44,4″, 50 24 44.4)'; el.classList.toggle('qa-bad', !!(F.lat.value.trim() || F.lon.value.trim())); return r; }
    el.classList.remove('qa-bad');
    el.textContent = '= ' + coordLines(r).join(', ') + ' (WGS 84)';
    if (temp) { temp.setLatLng([r.lat, r.lon]); temp.setIcon(pinIcon({ type: F.type.value, category: F.category.value, status: F.status.value })); }
    return r;
  }
  F.name.addEventListener('input', paintKey);
  if (REG) F.oblast.addEventListener('change', () => { F.district.innerHTML = REG.unitOptions(F.oblast.value, ''); });
  F.lat.addEventListener('input', paintCoord);
  F.lon.addEventListener('input', paintCoord);
  const paintSym = () => { back.querySelector('#mkSym').innerHTML = symbolSvg(F.type.value, F.category.value, 26); };
  F.type.addEventListener('change', () => { paintCoord(); paintSym(); });
  F.status.addEventListener('change', () => { paintCoord(); paintSym(); });
  F.category.addEventListener('change', () => { paintCoord(); paintSym(); });
  paintSym();
  paintKey(); paintCoord();

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = F.name.value.trim();
    if (!name) { showErr('Ескерткіш атауын енгізіңіз.'); F.name.focus(); return; }
    const c = paintCoord();
    if (c.err) { showErr(c.err); F.lat.focus(); return; }
    const rec = {
      id: m.id || '', name, period: F.period.value.trim(), oblast: F.oblast.value.trim(), district: F.district.value,
      place: F.place.value.trim(), type: F.type.value, category: F.category.value, status: F.status.value, note: F.note.value.trim(),
      lat: c.lat, lon: c.lon,
    };
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const saved = await saveMark(rec);
      store.set(lastKey, JSON.stringify({ oblast: rec.oblast, district: rec.district, type: rec.type, category: rec.category, status: rec.status }));
      if (REG) REG.remember(rec.oblast);          // соңғы облыс — келесі белгіге де, жаңа қорғау аймағына да әдепкі
      closeDialog();
      toast(isNew ? 'Белгі сақталды: «' + name + '».' : 'Белгі жаңартылды: «' + name + '».');
      if (saved && !map.getBounds().contains([saved.lat, saved.lon])) map.panTo([saved.lat, saved.lon]);
    } catch (ex) { showErr(ex.message); btn.disabled = false; }
  });
  back.querySelector('#mkCancel').addEventListener('click', closeDialog);
  back.querySelector('#mkDel')?.addEventListener('click', () => removeMark(m));
  back.querySelector('#mkGo')?.addEventListener('click', () => { closeDialog(); flyTo(m); });
  back.addEventListener('mousedown', e => { if (e.target === back) back.dataset.down = '1'; });
  back.addEventListener('click', e => { if (e.target === back && back.dataset.down) closeDialog(); delete back.dataset.down; });
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDialog(); } };
  document.addEventListener('keydown', onKey, true);
  dlg = { back, onKey, temp, prev: document.activeElement };
  app.appendChild(back);
  (isNew ? F.name : form.querySelector('[type=submit]')).focus();
}

async function removeMark(m) {
  if (!(await ask('«' + m.name + '» белгісін өшіру керек пе? Бұл әрекетті қайтару мүмкін емес.', { ok: 'Өшіру', danger: true }))) return;
  try { await api('delete', { id: m.id }); closeDialog(); toast('Белгі өшірілді: «' + m.name + '».'); }
  catch (e) { toast(e.message, true); }
}
function flyTo(m) {
  if (!$('mkShow').checked) { $('mkShow').checked = true; paintLayerVisibility(); }
  map.flyTo([m.lat, m.lon], Math.max(map.getZoom(), 15), { duration: 0.6 });
  const mk = markers.get(m.id);
  if (mk) setTimeout(() => mk.openTooltip(), 650);
}

/* Координата панелі: «Белгі» — енгізілген координатадан жаңа белгі */
$('mkFromCoord')?.addEventListener('click', () => {
  const latS = $('qaInLat').value, lonS = $('qaInLon').value;
  const r = parseLatLon(latS, lonS);
  if (r.err) { openDialog({}, { latText: latS, lonText: lonS }); return; }
  openDialog({ lat: r.lat, lon: r.lon });
  map.panTo([r.lat, r.lon]);
});

/* ======================= Белгілер панелі ======================= */
let open = false;
const cssNum = k => parseFloat(getComputedStyle(app).getPropertyValue(k)) || 0;
function applyRight() {
  if (!open) return;
  const mobile = globalThis.QAUI?.isMobile?.();
  const g = cssNum('--qa-gap') || 10;
  app.style.setProperty('--qa-right', (mobile ? g : panelEl.offsetWidth + 2 * g) + 'px');
}
function openPanel() {
  globalThis.QAUI?.closePanel?.();          // қорғау аймағының панельдері жабылады
  globalThis.QAUI?.closePop?.();
  panelEl.hidden = false; open = true;
  listBtn.setAttribute('aria-expanded', 'true');
  applyRight();
  render();
}
function closePanel() {
  if (!open) return;
  panelEl.hidden = true; open = false;
  listBtn.setAttribute('aria-expanded', 'false');
  globalThis.QAUI?.measure?.();
}
listBtn.addEventListener('click', () => (open ? closePanel() : openPanel()));
panelEl.addEventListener('click', e => { if (e.target.closest('[data-mkclose]')) closePanel(); });
app.addEventListener('qa:panel', e => { if (e.detail && e.detail.name) closePanel(); });
new ResizeObserver(() => requestAnimationFrame(applyRight)).observe($('qaStage'));
new ResizeObserver(() => requestAnimationFrame(applyRight)).observe(panelEl);
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || e.defaultPrevented || dlg) return;
  if (document.querySelector('.qa-pop:not([hidden])')) return;
  if (open) { closePanel(); listBtn.focus(); return; }
  if (marking) setMarking(false);
});

// Сүзгілер
const fillSel = (id, list) => { $(id).insertAdjacentHTML('beforeend', list.map(x => '<option value="' + esc(x.v) + '">' + esc(x.label) + '</option>').join('')); };
fillSel('mkFType', TYPES);
fillSel('mkFStatus', STATUSES);
fillSel('mkFCat', CATEGORIES.slice().sort((a, b) => a.order - b.order).map(c => ({ v: c.v || '—', label: c.label })));
for (const id of ['mkQ', 'mkFCat', 'mkFOblast', 'mkFDistrict', 'mkFType', 'mkFStatus']) $(id).addEventListener(id === 'mkQ' ? 'input' : 'change', () => render());
$('mkShow').addEventListener('change', paintLayerVisibility);
$('mkLabels').addEventListener('change', () => { store.set('mk-labels', $('mkLabels').checked ? '1' : '0'); drawMarkers(); });
$('mkLabels').checked = store.get('mk-labels') === '1';

function filtered() {
  const fo = $('mkFOblast').value, fc = $('mkFCat').value;
  const q = $('mkQ').value.trim().toLocaleLowerCase('kk'), fd = $('mkFDistrict').value, ft = $('mkFType').value, fs = $('mkFStatus').value;
  return sortMarks(items.filter(m => {
    if (fc && (m.category || '—') !== fc) return false;
    if (fo && (m.oblast || '') !== fo) return false;
    if (fd && (fd === '—' ? m.district : m.district !== fd)) return false;
    if (ft && m.type !== ft) return false;
    if (fs && m.status !== fs) return false;
    if (q && !(m.name + ' ' + (m.period || '') + ' ' + (m.place || '') + ' ' + (m.district || '') + ' ' + arabizeRoman(m.name)).toLocaleLowerCase('kk').includes(q)) return false;
    return true;
  }));
}

let titleAuto = true;
function paintTitle(list) {
  const secs = sections(list.length ? list : items, '', genitive);
  const multi = secs.length > 1;
  $('mkTitle').disabled = multi;
  $('mkTitleMulti').hidden = !multi;
  $('mkTitleMulti').textContent = multi ? 'Санаттар бойынша ' + secs.length + ' бөлек кесте, әрқайсысы жаңа беттен: ' + secs.map(x => '«' + x.title + '» (' + x.marks.length + ')').join('; ') + '.' : '';
  if (multi) { $('mkTitle').value = ''; $('mkTitle').placeholder = 'Атаулары санат бойынша өзі құрастырылады'; return; }
  $('mkTitle').placeholder = '';
  if (titleAuto || !$('mkTitle').value) $('mkTitle').value = (secs[0] ? secs[0].title : '').replace(/^./, c => c.toUpperCase());
}
$('mkTitle').addEventListener('input', () => { titleAuto = false; });
$('mkTitleAuto').addEventListener('click', () => { titleAuto = true; paintTitle(filtered()); });

function render() {
  $('mkCount').textContent = items.length;
  drawMarkers();
  // Облыс сүзгісі (бірден көп облыс болса ғана көрінеді) және аудан сүзгісі — бар белгілердің мәндері
  const os = $('mkFOblast'), oc = os.value;
  const obs = [...new Set(items.map(m => m.oblast).filter(Boolean))].sort(compareText);
  os.innerHTML = '<option value="">Барлық облыс</option>' + obs.map(o => '<option' + (o === oc ? ' selected' : '') + '>' + esc(o) + '</option>').join('');
  if (![...os.options].some(o => o.value === oc)) os.value = '';
  os.hidden = obs.length < 2 && !os.value;
  $('mkFilters').classList.toggle('has-ob', !os.hidden);
  const sel = $('mkFDistrict'), cur = sel.value, inOb = items.filter(m => !os.value || m.oblast === os.value);
  const ds = [...new Set(inOb.map(m => m.district).filter(Boolean))].sort(compareText);
  const hasNone = inOb.some(m => !m.district);
  sel.innerHTML = '<option value="">Барлық аудан</option>' + ds.map(d => '<option' + (d === cur ? ' selected' : '') + '>' + esc(d) + '</option>').join('') +
    (hasNone ? '<option value="—"' + (cur === '—' ? ' selected' : '') + '>Ауданы көрсетілмеген</option>' : '');
  if (![...sel.options].some(o => o.value === cur)) sel.value = '';
  if (!open) return;
  const list = filtered();
  $('mkInfo').textContent = list.length === items.length ? items.length + ' белгі' : list.length + ' / ' + items.length + ' белгі';
  for (const id of ['mkGeo', 'mkDocx', 'mkPdf']) $(id).disabled = !list.length;
  paintTitle(list);
  const box = $('mkList');
  if (!items.length) { box.innerHTML = '<div class="qa-empty">Әзірге белгі жоқ. Құралдар жолағындағы «Белгі қою» батырмасын басып, картадан ескерткіштің орнын белгілеңіз.</div>'; return; }
  if (!list.length) { box.innerHTML = '<div class="qa-empty">Сүзгіге сай белгі табылмады.</div>'; return; }
  let html = '', lastD = null;
  const multiOb = new Set(list.map(m => m.oblast || '')).size > 1;
  let lastC = null;
  const multiC = new Set(list.map(m => categoryOf(m.category).v)).size > 1;
  for (const m of list) {
    const c = categoryOf(m.category);
    if (multiC && c.v !== lastC) { html += '<div class="mk-chead"><i style="background:' + c.fill + ';border-color:' + c.outline + '"></i>' + esc(c.label) + '</div>'; lastC = c.v; lastD = null; }
    const d = (multiOb && m.oblast ? m.oblast + ' · ' : '') + (m.district || (multiOb ? 'ауданы көрсетілмеген' : 'Ауданы көрсетілмеген'));
    if (d !== lastD) { html += '<div class="mk-dhead">' + esc(d) + '</div>'; lastD = d; }
    html += '<div class="qa-sc mk-card" data-id="' + esc(m.id) + '">' +
      '<span class="mk-sym' + (m.status === 'excluded' ? ' is-excl' : '') + '" title="' + esc(categoryOf(m.category).label) + '">' + symbolSvg(m.type, m.category, 22) + '</span>' +
      '<div class="qa-sc-main"><button type="button" class="qa-sc-title" data-act="go" title="Картадан көрсету">' + esc(nameCell(m)) + '</button>' +
      '<div class="qa-sc-meta">' + esc(typeOf(m.type).label) + (categoryOf(m.category).adj ? ' · ' + esc(categoryOf(m.category).adj) : '') +
        ' · <span class="mk-st mk-st--' + esc(m.status) + '">' + esc(statusOf(m.status).short) + '</span></div>' +
      (m.place ? '<p class="qa-sc-desc">' + esc(m.place) + '</p>' : '') +
      '<div class="qa-sc-meta mk-cc">' + esc(coordLines(m).join(', ')) + '</div>' +
      '<div class="qa-sc-act"><button type="button" class="lnk" data-act="edit">Өңдеу</button><button type="button" class="lnk" data-act="go">Картадан көрсету</button>' +
      '<button type="button" class="lnk lnk--danger" data-act="del">Өшіру</button></div></div></div>';
  }
  box.innerHTML = html;
}
$('mkList').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'), card = e.target.closest('[data-id]');
  if (!b || !card) return;
  const m = items.find(x => x.id === card.dataset.id);
  if (!m) return;
  if (b.dataset.act === 'go') flyTo(m);
  else if (b.dataset.act === 'edit') openDialog(m);
  else if (b.dataset.act === 'del') removeMark(m);
});

/* ======================= Экспорт ======================= */
function download(data, type, name) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function loadFflate() {
  if (globalThis.fflate) return Promise.resolve(globalThis.fflate);
  return new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = globalThis.QA_FFLATE || 'vendor/fflate.js';
    sc.onload = () => (globalThis.fflate ? res(globalThis.fflate) : rej(new Error('fflate жүктелмеді')));
    sc.onerror = () => rej(new Error('fflate жүктелмеді'));
    document.head.appendChild(sc);
  });
}
const exportTitle = () => $('mkTitle').value.trim() || defaultTitle(filtered(), genitive);
/** Экспорт бөлімдері: санат бойынша бөлек кестелер (бір санат болса — панельдегі атаумен). */
const exportSections = (list = filtered()) => sections(list, $('mkTitle').disabled ? '' : $('mkTitle').value.trim(), genitive);
const docTitle = secs => secs.length === 1 ? secs[0].title : 'Тарих және мәдениет ескерткіштерінің тізімі';
const fileName = ext => 'eskertkishter_tizimi_' + new Date().toISOString().slice(0, 10) + '.' + ext;
async function busy(label, fn) {
  const el = $('mkBusy');
  el.textContent = label;
  try { await fn(); el.textContent = ''; }
  catch (e) { el.textContent = ''; toast(e.message || String(e), true); }
}
async function buildDocx(list = filtered()) { const secs = exportSections(list); return docxBlob(secs, docTitle(secs), await loadFflate()); }
async function buildPdf(list = filtered()) {
  const secs = exportSections(list);
  if (!globalThis.mura || !globalThis.mura.pdf) throw new Error('PDF тек Mura GIS бағдарламасында жасалады.');
  const bytes = await globalThis.mura.pdf(pdfHtml(secs, docTitle(secs)));
  return new Blob([bytes], { type: 'application/pdf' });
}
$('mkGeo').addEventListener('click', () => {
  const list = filtered();
  download(JSON.stringify(geojson(list, exportTitle()), null, 2), 'application/geo+json', fileName('geojson'));
  toast('GeoJSON: ' + list.length + ' нүкте.');
});
$('mkDocx').addEventListener('click', () => busy('Word құжаты жасалуда…', async () => { download(await buildDocx(), '', fileName('docx')); }));
$('mkPdf').addEventListener('click', () => busy('PDF жасалуда…', async () => { download(await buildPdf(), '', fileName('pdf')); }));

// GeoJSON-нан қосу (басқа компьютерден, QGIS-тен)
$('mkImport').addEventListener('click', () => $('mkGeoFile').click());
$('mkGeoFile').addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  await busy('Импортталуда…', async () => {
    let o;
    try { o = JSON.parse(await f.text()); } catch (ex) { throw new Error('Файл оқылмады: JSON емес.'); }
    const list = fromGeojson(o).filter(m => m.name && isFinite(m.lat) && isFinite(m.lon));
    if (!list.length) throw new Error('Файлда атауы бар нүкте (Point) табылмады.');
    const r = await api('import', { data: JSON.stringify(list) });
    toast('Қосылды: ' + r.added + ', жаңартылды: ' + r.updated + (r.skipped ? ', қабылданбады: ' + r.skipped : '') + '.');
  });
});

/* Мәртебе түстерінің шартты белгісі (панельде) */
$('mkLegend').innerHTML = CATEGORIES.slice().sort((a, b) => a.order - b.order).map(c => '<span><i style="background:' + c.fill + ';border-color:' + c.outline + '"></i>' + esc(c.label) + '</span>').join('');

/* ======================= Іске қосу ======================= */
paintLayerVisibility();
api('list').catch(e => { toast('Белгілер жүктелмеді: ' + e.message, true); render(); });

globalThis.__marks = { symbolSvg, exportSections, get items() { return items; }, api, filtered, buildDocx, buildPdf, geojson, pdfHtml, setMarking, openDialog, openPanel, closePanel, get marking() { return marking; } };
