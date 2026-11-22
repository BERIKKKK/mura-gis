/* Mura GIS: «Маршруттар» қызметі — маршрут сызу, тізім, жол табу (маршруттар желісі бойынша), импорт/экспорт.
   • Маршрут — сынық сызық: басы мен соңының атауы (мыс. «Ақтөбе қаласы» → «Қабантау-V»), көлік (жеңіл / жол талғамайтын /
     жаяу), маусым (жыл бойы / тек құрғақта), тексерілген күні, ескертпе. Сақтау — data/routes.json (main/routes.js).
   • Сызу: картаны басып нүкте қою; нүкте ескерткішке, басқа маршруттың ұшына не сызығына жақын болса — соған жабысады
     (маршруттар осылай бір желіге жалғанады). Enter / екі рет басу — аяқтау, Backspace — болдырмау, Esc — бас тарту.
   • Жол табу: сақталған маршруттардан желі құрылады (routes/graph.js) — маршрут 1 (Ақтөбе → 1-ескерткіш) мен
     маршрут 2 (1-ескерткіш → 2-ескерткіш) болса, «Ақтөбе → 2-ескерткіш» екеуін тізбектеп береді.
   Интерфейс бөліктері — routes/routes-dom.js, қызметтер жолағы — js/services.js. */
import { buildNetwork, findPath, lineLength, nearestOnLine, VEHICLES, SEASONS, vehicleOf, seasonOf } from './graph.js';
import { parseTrackFile, toGpx, toGeojson } from './tracks.js';
import { compareNames } from '../marks/sort.js';

const $ = id => document.getElementById(id);
const L = globalThis.L;
const map = globalThis.MuraMarks && globalThis.MuraMarks.map;
const API = 'mura://app/routes?v=1';
const app = $('qaApp'), mapEl = $('qaMap'), panelEl = $('rtPanel');
const IC = globalThis.MuraRoutesIcon || {};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* жеке режим */ } },
};
const marks = () => (globalThis.__marks && globalThis.__marks.items) || [];
/** Өзге нысандар (marks/places.js) — маршрут құрудың басы/соңы бола алады (желіде түйін емес — қарапайым нүкте). */
const places = () => (globalThis.__places && globalThis.__places.items) || [];
const placeTitle = p => (globalThis.__places ? globalThis.__places.titleOf(p) : p.name || p.name_ru || '');
const tx = (kk, ru) => (globalThis.MuraI18n && globalThis.MuraI18n.ru ? ru : kk);
const km = m => (m / 1000).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' км';
const fmtTime = s => { const m = Math.max(1, Math.round(s / 60)); return m < 60 ? m + ' мин' : Math.floor(m / 60) + tx(' сағ', ' ч') + (m % 60 ? ' ' + (m % 60) + ' мин' : ''); };
const today = () => new Date().toISOString().slice(0, 10);
const cmpKk = (a, b) => compareNames(a, b);

function toast(msg, err) {
  const t = $('qaToast');
  if (!t) return;
  t.textContent = msg; t.classList.toggle('is-err', !!err); t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, err ? 5000 : 2800);
}
const ask = (msg, o) => (globalThis.QAUI && globalThis.QAUI.confirm ? globalThis.QAUI.confirm(msg, o) : Promise.resolve(confirm(msg)));
function download(text, type, name) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const fileSafe = s => String(s || 'маршрут').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 80);

/* ======================= Сақтау (main/routes.js) ======================= */
let items = [];
async function api(op, data) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data || {})) fd.append(k, v);
  const r = await fetch(API + '&op=' + op, { method: 'POST', body: fd });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || tx('Сақтау қатесі', 'Ошибка сохранения'));
  if (Array.isArray(j.items)) { items = j.items; net = null; render(); }
  return j;
}

/* ======================= Карта қабаттары ======================= */
const layer = L.featureGroup();
const nodesLayer = L.layerGroup();
const draftLayer = L.layerGroup().addTo(map);
const resultLayer = L.featureGroup().addTo(map);
const lines = new Map();      // id → L.polyline (тек картада көрсетілгендері)
/* Маршрут картада тек пайдаланушы көрсеткенде салынады: «Картадан көрсету» (әр маршрутқа, есте сақталады)
   не «Барлығын көрсету» белгісі. Әдепкіде — ешқайсысы көрінбейді. */
const SHOWN_KEY = 'rt-shown';
let shown = new Set();
try { shown = new Set(JSON.parse(store.get(SHOWN_KEY) || '[]').filter(x => typeof x === 'string')); } catch (e) { /* бүлінген мән */ }
// Маршрут сызу кезінде бар маршруттардың бәрі уақытша көрінеді (жалғастыру, жабыстыру үшін)
const isShown = r => $('rtShow').checked || drawing || shown.has(r.id);
function setShown(id, on) {
  if (on) shown.add(id); else shown.delete(id);
  store.set(SHOWN_KEY, JSON.stringify([...shown]));
  drawLines();
  renderList();
}
function lineStyle(r, hi) {
  const v = vehicleOf(r.vehicle);
  return { color: v.color, weight: hi ? 6 : 4, opacity: hi ? 1 : 0.85, dashArray: r.season === 'dry' ? '9 7' : null, lineCap: 'round', lineJoin: 'round', className: 'rt-line' };
}
function drawLines() {
  layer.clearLayers(); lines.clear();
  for (const r of items) {
    if (!isShown(r)) continue;
    const pl = L.polyline(r.pts, lineStyle(r));
    pl.bindTooltip('<b>' + esc(r.name) + '</b><small>' + km(lineLength(r.pts)) + ' · ' + esc(vehicleOf(r.vehicle).short) + (r.season === 'dry' ? tx(' · тек құрғақта', ' · только в сухую погоду') : '') + '</small>',
      { sticky: true, className: 'mk-tip rt-tip', direction: 'top', offset: [0, -6] });
    pl.on('mouseover', () => pl.setStyle({ weight: 6 }));
    pl.on('mouseout', () => pl.setStyle({ weight: 4 }));
    pl.on('click', ev => { if (busyMode()) return; L.DomEvent.stop(ev); openDialog(r); });
    pl.on('contextmenu', ev => { L.DomEvent.stop(ev); routeMenu(r, ev.originalEvent); });
    pl.addTo(layer);
    lines.set(r.id, pl);
  }
  drawNodes();
}
function paintVisibility() {
  if (!map.hasLayer(layer)) layer.addTo(map);
  drawLines();
  renderList();
  paintNodesVisibility();
}
/* Желі тораптары (қалауынша): маршруттардың ұштары, қиылыстары, ескерткіштер */
// Желі маршруттар не ескерткіштер өзгергенде қайта құрылады (ескерткіштердің кілті — id мен координатасы)
let net = null, netKey = '';
function network() {
  const ms = marks();
  const key = items.length + '|' + ms.map(m => m.id + m.lat + m.lon).join(',');
  if (!net || key !== netKey) { net = buildNetwork(items, ms); netKey = key; }
  return net;
}
function drawNodes() {
  nodesLayer.clearLayers();
  if (!$('rtNodes').checked) return;
  for (const n of network().nodes) {
    const c = L.circleMarker([n.lat, n.lon], { radius: n.markId ? 7 : 5, color: '#221d16', weight: 2, fillColor: n.markId ? '#ffd36b' : '#fff', fillOpacity: 1, interactive: true, className: 'rt-node' });
    c.bindTooltip(esc(n.name || tx('Торап', 'Узел')) + '<small>' + network().adj[n.id].length + tx(' жол', ' дорог') + '</small>', { direction: 'top', className: 'mk-tip rt-tip' });
    c.addTo(nodesLayer);
  }
}
function paintNodesVisibility() {
  const on = $('rtNodes').checked;
  if (on) { drawNodes(); if (!map.hasLayer(nodesLayer)) nodesLayer.addTo(map); }
  else if (map.hasLayer(nodesLayer)) map.removeLayer(nodesLayer);
}
$('rtShow').addEventListener('change', paintVisibility);
$('rtNodes').addEventListener('change', () => { store.set('rt-nodes', $('rtNodes').checked ? '1' : '0'); paintNodesVisibility(); });
$('rtNodes').checked = store.get('rt-nodes') === '1';
// «Барлығын көрсету» — әдепкіде өшік (бұрынғы «rt-show» кілті әдейі оқылмайды: ескі нұсқада ол әдепкіде қосулы еді)
$('rtShow').checked = store.get('rt-all') === '1';
$('rtShow').addEventListener('change', () => store.set('rt-all', $('rtShow').checked ? '1' : '0'));

/* Басқа режим қосулы ма (шекара нүктесі, белгі қою, сызғыш, маршрут сызу, картадан таңдау) — сызық басуды өткізеді */
const pressed = id => { const b = $(id); return !!b && b.getAttribute('aria-pressed') === 'true'; };
const busyMode = () => drawing || picking || pressed('qaAddMode') || pressed('mkMode') || pressed('qaRuler');

/* ======================= Сызу режимі ======================= */
let drawing = false, picking = null;
const draft = { pts: [], snaps: [] };          // snaps[i] — нүкте неге жабысты: { mark } | { name } | null
let rubber = null, draftLine = null;
const hud = document.createElement('div');
hud.className = 'qa-hud rt-hud'; hud.hidden = true;
$('qaStage').appendChild(hud);

function setDrawing(on) {
  if (on) {
    setPicking(null);
    for (const id of ['qaAddMode', 'mkMode', 'qaRuler']) if (pressed(id)) $(id).click();
  } else clearDraft();
  drawing = on;
  drawLines();
  $('rtDraw').setAttribute('aria-pressed', on ? 'true' : 'false');
  $('rtDraw').dataset.tip = on ? 'Маршрут сызу: қосулы — картаны басыңыз (Esc — өшіру)' : 'Маршрут сызу: картаны басып жолдың нүктелерін қойыңыз';
  mapEl.classList.toggle('is-routing', on);
  paintDraft();
}
$('rtDraw').addEventListener('click', () => setDrawing(!drawing));
// Басқа қызметтің режимі қосылса — сызу өшеді
const modeObs = new MutationObserver(() => { if ((drawing || picking) && (pressed('qaAddMode') || pressed('mkMode') || pressed('qaRuler'))) { setDrawing(false); setPicking(null); } });
for (const id of ['qaAddMode', 'mkMode', 'qaRuler']) if ($(id)) modeObs.observe($(id), { attributes: true, attributeFilter: ['aria-pressed'] });

/** Басылған нүктені жабыстыру: ескерткіш (16 px), маршрут ұшы не нүктесі (11 px), маршрут сызығы (8 px). */
function snapAt(latlng) {
  const P = map.latLngToContainerPoint(latlng);
  const px = ll => map.latLngToContainerPoint(ll).distanceTo(P);
  const b = map.getBounds().pad(0.1);
  let best = null;
  const take = (d, lim, pt, info) => { if (d <= lim && (!best || d / lim < best.k)) best = { k: d / lim, pt, info }; };
  for (const m of marks()) { if (b.contains([m.lat, m.lon])) take(px([m.lat, m.lon]), 16, [m.lat, m.lon], { mark: m }); }
  for (const r of items) {
    const n = r.pts.length;
    r.pts.forEach((p, i) => { if (b.contains(p)) take(px(p), 11, p, i === 0 ? { name: r.a_name } : i === n - 1 ? { name: r.b_name } : null); });
  }
  if (!best) {
    for (const r of items) {
      const nl = nearestOnLine([latlng.lat, latlng.lng], r.pts);
      if (nl && b.contains(nl.point)) take(px(nl.point), 8, nl.point, null);
    }
  }
  // Сызылып жатқан маршруттың бірінші нүктесі (тұйық маршрут)
  if (draft.pts.length > 2) take(px(draft.pts[0]), 11, draft.pts[0], draft.snaps[0]);
  return best ? { pt: best.pt, info: best.info } : { pt: [latlng.lat, latlng.lng], info: null };
}
function paintDraft() {
  draftLayer.clearLayers(); rubber = null; draftLine = null;
  const n = draft.pts.length;
  $('rtUndo').disabled = !n;
  $('rtFinish').disabled = n < 2;
  if (drawing) {
    draftLine = L.polyline(draft.pts, { color: '#e8178a', weight: 4, opacity: 0.95, dashArray: null, interactive: false }).addTo(draftLayer);
    draft.pts.forEach((p, i) => L.circleMarker(p, { radius: i === 0 || i === n - 1 ? 6 : 4, color: '#fff', weight: 2, fillColor: draft.snaps[i] ? '#1f7a35' : '#e8178a', fillOpacity: 1, interactive: false }).addTo(draftLayer));
    if (n) rubber = L.polyline([draft.pts[n - 1], draft.pts[n - 1]], { color: '#e8178a', weight: 2, dashArray: '5 6', interactive: false }).addTo(draftLayer);
  }
  hud.hidden = !drawing;
  if (drawing) {
    const len = n > 1 ? lineLength(draft.pts) : 0;
    hud.innerHTML = '<div><b>' + (n ? km(len) : 'Маршрут сызу') + '</b><small>' +
      (n ? n + tx(' нүкте · Enter — аяқтау · Backspace — болдырмау · Esc — бас тарту', ' точек · Enter — завершить · Backspace — отменить · Esc — прервать') : tx('Картаны басып бастапқы нүктені қойыңыз. Ескерткішке не басқа маршрутқа жақын басса — соған жабысады.', 'Щёлкните по карте, чтобы поставить начальную точку. Щелчок рядом с памятником или другим маршрутом привязывается к нему.')) + '</small></div>';
  }
}
function clearDraft() { draft.pts = []; draft.snaps = []; paintDraft(); }
function undoPoint() { if (!draft.pts.length) return; draft.pts.pop(); draft.snaps.pop(); paintDraft(); }
$('rtUndo').addEventListener('click', undoPoint);
$('rtFinish').addEventListener('click', finishDraft);
map.on('click', e => {
  if (picking) { pickAt(e.latlng); return; }
  if (!drawing) return;
  const s = snapAt(e.latlng);
  const last = draft.pts[draft.pts.length - 1];
  if (last && map.latLngToContainerPoint(last).distanceTo(map.latLngToContainerPoint(s.pt)) < 4) return;   // екі рет басу — бір нүкте
  draft.pts.push(s.pt); draft.snaps.push(s.info);
  paintDraft();
});
map.on('dblclick', () => { if (drawing && draft.pts.length >= 2) finishDraft(); });
map.on('mousemove', e => { if (rubber && draft.pts.length) rubber.setLatLngs([draft.pts[draft.pts.length - 1], e.latlng]); });
document.addEventListener('keydown', e => {
  if (!drawing || dlg || e.defaultPrevented) return;
  const t = e.target;
  if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  if (e.key === 'Enter' && draft.pts.length >= 2) { e.preventDefault(); finishDraft(); }
  else if (e.key === 'Backspace' || (e.key === 'z' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); undoPoint(); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (draft.pts.length) clearDraft(); else setDrawing(false); }
}, true);

function endName(info) { return info ? (info.mark ? info.mark.name : info.name || '') : ''; }
function finishDraft() {
  if (draft.pts.length < 2) return;
  const pts = draft.pts.slice();
  openDialog({ pts, a_name: endName(draft.snaps[0]), b_name: endName(draft.snaps[draft.snaps.length - 1]), checked: today() }, {
    onSaved: () => clearDraft(),
  });
}

/* ======================= Маршрут терезесі ======================= */
let dlg = null;
const lastKey = 'rt-last-v1';
const lastDefaults = () => { try { return JSON.parse(store.get(lastKey) || '{}') || {}; } catch (e) { return {}; } };
const opts = (list, val) => list.map(x => '<option value="' + esc(x.v) + '"' + (x.v === val ? ' selected' : '') + '>' + esc(x.label) + '</option>').join('');
function closeDialog() {
  if (!dlg) return;
  dlg.back.remove();
  document.removeEventListener('keydown', dlg.onKey, true);
  if (dlg.hi) dlg.hi.remove();
  if (dlg.prev && dlg.prev.focus && document.contains(dlg.prev)) dlg.prev.focus({ preventScroll: true });
  dlg = null;
}
function openDialog(r, o = {}) {
  closeDialog();
  globalThis.QAUI?.closePop?.();
  const isNew = !r.id;
  const def = lastDefaults();
  const v = { name: '', a_name: '', b_name: '', vehicle: def.vehicle || '4x4', season: 'all', checked: '', note: '', ...r };
  const autoName = () => [F.a.value.trim(), F.b.value.trim()].filter(Boolean).join(' — ');
  const back = document.createElement('div');
  back.className = 'qa-dlg-back mk-dlg-back';
  back.innerHTML =
    '<form class="qa-dlg qa-glass mk-dlg rt-dlg" role="dialog" aria-modal="true" aria-labelledby="rtDlgT" novalidate>' +
      '<h3 id="rtDlgT">' + (isNew ? 'Жаңа маршрут' : 'Маршрут') + '<span class="rt-len">' + km(lineLength(v.pts)) + ' · ' + v.pts.length + tx(' нүкте', ' точек') + '</span></h3>' +
      '<div class="qa-row2">' +
        '<div class="qa-f"><label for="rtA">Бастапқы нүкте (А)</label><input type="text" id="rtA" name="a" maxlength="120" placeholder="Мысалы: Ақтөбе қаласы" value="' + esc(v.a_name) + '"></div>' +
        '<div class="qa-f"><label for="rtB">Соңғы нүкте (Б)</label><input type="text" id="rtB" name="b" maxlength="120" placeholder="Мысалы: Қабантау-V қорғаны" value="' + esc(v.b_name) + '"></div>' +
      '</div>' +
      '<div class="qa-f"><label for="rtName">Атауы</label><input type="text" id="rtName" name="name" maxlength="200" value="' + esc(v.name) + '">' +
        '<p class="qa-hint">Бос қалса — «А — Б» болып өзі жазылады. Ескерткішке жабысқан ұштың атауы сол ескерткіштен алынады.</p></div>' +
      '<div class="qa-row2">' +
        '<div class="qa-f"><label for="rtVehD">Көлік</label><select id="rtVehD" name="vehicle">' + opts(VEHICLES, v.vehicle) + '</select></div>' +
        '<div class="qa-f"><label for="rtSeason">Маусым</label><select id="rtSeason" name="season">' + opts(SEASONS, v.season) + '</select></div>' +
      '</div>' +
      '<div class="qa-f"><label for="rtChecked">Соңғы рет тексерілген күні</label><input type="date" id="rtChecked" name="checked" value="' + esc(v.checked) + '"></div>' +
      '<div class="qa-f"><label for="rtNote">Ескертпе</label><textarea id="rtNote" name="note" maxlength="3000" rows="2" placeholder="Жол жағдайы, өткелдер, қақпалар, бағдар…">' + esc(v.note) + '</textarea></div>' +
      '<p class="mk-err" id="rtErr" role="alert" hidden></p>' +
      '<div class="qa-dlg-btns">' +
        (isNew ? '' : '<button type="button" class="lnk lnk--danger" id="rtDel">Өшіру</button><button type="button" class="lnk" id="rtGoD">Картадан көрсету</button><button type="button" class="lnk" id="rtRev" title="Басы мен соңын ауыстыру">Бағытын ауыстыру</button>') +
        '<span class="mk-sp"></span>' +
        '<button type="button" class="btn btn--ghost btn--sm" id="rtCancel">Бас тарту</button>' +
        '<button type="submit" class="btn btn--primary btn--sm">' + (isNew ? 'Маршрутты сақтау' : 'Сақтау') + '</button>' +
      '</div>' +
    '</form>';
  const form = back.querySelector('form');
  const F = { a: form.querySelector('#rtA'), b: form.querySelector('#rtB'), name: form.querySelector('#rtName'), veh: form.querySelector('#rtVehD'),
    season: form.querySelector('#rtSeason'), checked: form.querySelector('#rtChecked'), note: form.querySelector('#rtNote') };
  let nameTouched = !!v.name && v.name !== [v.a_name, v.b_name].filter(Boolean).join(' — ');
  const paintName = () => { if (!nameTouched) F.name.value = autoName(); };
  F.name.addEventListener('input', () => { nameTouched = !!F.name.value.trim(); });
  F.a.addEventListener('input', paintName); F.b.addEventListener('input', paintName);
  paintName();
  let pts = v.pts.slice();
  const err = form.querySelector('#rtErr');
  const hi = L.polyline(pts, { color: '#e8178a', weight: 7, opacity: 0.55, interactive: false }).addTo(map);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const rec = { id: r.id || '', name: F.name.value.trim() || autoName(), a_name: F.a.value.trim(), b_name: F.b.value.trim(), vehicle: F.veh.value,
      season: F.season.value, checked: F.checked.value, note: F.note.value.trim(), pts };
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const j = await api('save', { data: JSON.stringify(rec) });
      if (j.id && !shown.has(j.id)) setShown(j.id, true);
      store.set(lastKey, JSON.stringify({ vehicle: rec.vehicle }));
      closeDialog();
      toast((isNew ? tx('Маршрут сақталды: «', 'Маршрут сохранён: «') : tx('Маршрут жаңартылды: «', 'Маршрут обновлён: «')) + (rec.name || tx('Атаусыз маршрут', 'Маршрут без названия')) + '» · ' + km(lineLength(pts)) + '.');
      if (o.onSaved) o.onSaved();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; }
  });
  form.querySelector('#rtCancel').addEventListener('click', closeDialog);
  form.querySelector('#rtDel')?.addEventListener('click', () => removeRoute(r));
  form.querySelector('#rtGoD')?.addEventListener('click', () => { closeDialog(); flyTo(r); });
  form.querySelector('#rtRev')?.addEventListener('click', () => {
    pts = pts.slice().reverse();
    const a = F.a.value; F.a.value = F.b.value; F.b.value = a; paintName();
    hi.setLatLngs(pts);
    toast(tx('Бағыты ауыстырылды — «Сақтау» басыңыз.', 'Направление изменено — нажмите «Сохранить».'));
  });
  back.addEventListener('mousedown', e => { if (e.target === back) back.dataset.down = '1'; });
  back.addEventListener('click', e => { if (e.target === back && back.dataset.down) closeDialog(); delete back.dataset.down; });
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDialog(); } };
  document.addEventListener('keydown', onKey, true);
  dlg = { back, onKey, hi, prev: document.activeElement };
  app.appendChild(back);
  (isNew ? (F.a.value ? F.b.value ? F.veh : F.b : F.a) : form.querySelector('[type=submit]')).focus();
}
async function removeRoute(r) {
  if (!(await ask(tx('«' + r.name + '» маршрутын өшіру керек пе? Бұл әрекетті қайтару мүмкін емес.', 'Удалить маршрут «' + r.name + '»? Это действие нельзя отменить.'), { ok: tx('Өшіру', 'Удалить'), danger: true }))) return;
  try { await api('delete', { id: r.id }); if (shown.has(r.id)) setShown(r.id, false); closeDialog(); toast(tx('Маршрут өшірілді: «', 'Маршрут удалён: «') + r.name + '».'); }
  catch (e) { toast(e.message, true); }
}
function flyTo(r) {
  if (!isShown(r)) setShown(r.id, true);
  map.flyToBounds(L.latLngBounds(r.pts).pad(0.15), { maxZoom: 16, duration: 0.6, paddingTopLeft: globalThis.QAUI?.pad?.().tl, paddingBottomRight: globalThis.QAUI?.pad?.().br });
  const pl = lines.get(r.id);
  if (pl) { pl.setStyle({ weight: 8 }); setTimeout(() => pl.setStyle({ weight: 4 }), 1600); }
}
function routeMenu(r, oe) {
  globalThis.MuraCtx?.openMenu(oe.clientX, oe.clientY, esc(r.name), [
    { label: 'Өңдеу', icon: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>', run: () => openDialog(r) },
    { label: 'Картадан көрсету', icon: IC.pick || '', run: () => flyTo(r) },
    { label: 'GPX ретінде сақтау', icon: IC.imp || '', run: () => exportGpx([r], r.name) },
    'sep',
    { label: 'Өшіру', icon: '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', run: () => removeRoute(r) },
  ]);
}

/* ======================= Панель: Маршруттар | Жол табу ======================= */
let open = false, tab = 'list';
const cssNum = k => parseFloat(getComputedStyle(app).getPropertyValue(k)) || 0;
function applyRight() {
  if (!open) return;
  const g = cssNum('--qa-gap') || 10;
  app.style.setProperty('--qa-right', (globalThis.QAUI?.isMobile?.() ? g : panelEl.offsetWidth + 2 * g) + 'px');
}
function paintButtons() {
  $('rtListBtn').setAttribute('aria-expanded', open && tab === 'list' ? 'true' : 'false');
  $('rtFindBtn').setAttribute('aria-expanded', open && tab === 'find' ? 'true' : 'false');
}
function openPanel(t = tab) {
  globalThis.QAUI?.closePanel?.();
  globalThis.QAUI?.closePop?.();
  globalThis.__marks?.closePanel?.();
  panelEl.hidden = false; open = true;
  setTab(t);
  applyRight();
}
function closePanel() {
  if (!open) return;
  panelEl.hidden = true; open = false;
  setPicking(null);
  paintButtons();
  globalThis.QAUI?.measure?.();
}
function setTab(t) {
  tab = t === 'find' ? 'find' : 'list';
  $('rtTabList').hidden = tab !== 'list';
  $('rtTabFind').hidden = tab !== 'find';
  $('rtTabListB').setAttribute('aria-selected', tab === 'list' ? 'true' : 'false');
  $('rtTabFindB').setAttribute('aria-selected', tab === 'find' ? 'true' : 'false');
  $('rtGeo').hidden = tab !== 'list';
  if (tab !== 'find') setPicking(null);
  paintButtons();
  if (tab === 'find') fillEnds(); else renderList();
  paintFooter();
}
const toggle = t => (open && tab === t ? closePanel() : openPanel(t));
$('rtListBtn').addEventListener('click', () => toggle('list'));
$('rtFindBtn').addEventListener('click', () => toggle('find'));
panelEl.addEventListener('click', e => {
  if (e.target.closest('[data-rtclose]')) { closePanel(); return; }
  const b = e.target.closest('[data-rttab]');
  if (b) setTab(b.dataset.rttab);
});
app.addEventListener('qa:panel', e => { if (e.detail && e.detail.name) closePanel(); });
const mkPanel = $('mkPanel');
if (mkPanel) new MutationObserver(() => { if (!mkPanel.hidden) closePanel(); }).observe(mkPanel, { attributes: true, attributeFilter: ['hidden'] });
new ResizeObserver(() => requestAnimationFrame(applyRight)).observe($('qaStage'));
new ResizeObserver(() => requestAnimationFrame(applyRight)).observe(panelEl);
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || e.defaultPrevented || dlg || drawing) return;
  if (picking) { setPicking(null); return; }
  if (document.querySelector('.qa-pop:not([hidden]), .mura-ctx')) return;
  if (open) closePanel();
});

/* ---------- Тізім ---------- */
$('rtFVeh').insertAdjacentHTML('beforeend', VEHICLES.map(x => '<option value="' + x.v + '">' + esc(x.label) + '</option>').join(''));
$('rtLegend').innerHTML = VEHICLES.map(x => '<span><i style="background:' + x.color + '"></i>' + esc(x.label) + '</span>').join('') + '<span><i class="rt-dash"></i>' + tx('Тек құрғақ маусымда', 'Только в сухой сезон') + '</span>';
for (const id of ['rtQ', 'rtFVeh']) $(id).addEventListener(id === 'rtQ' ? 'input' : 'change', () => renderList());
function filtered() {
  const q = $('rtQ').value.trim().toLocaleLowerCase('kk'), fv = $('rtFVeh').value;
  return items.filter(r => (!fv || r.vehicle === fv) && (!q || [r.name, r.a_name, r.b_name, r.note].join(' ').toLocaleLowerCase('kk').includes(q)))
    .sort((a, b) => cmpKk(a.name, b.name));
}
function checkedNote(r) {
  if (!r.checked) return '<span class="rt-warn">' + tx('тексерілмеген', 'не проверен') + '</span>';
  const years = (Date.now() - new Date(r.checked).getTime()) / (365.25 * 864e5);
  const lbl = tx('тексерілген: ', 'проверен: ');
  return years > 3 ? '<span class="rt-warn">' + lbl + esc(r.checked) + '</span>' : lbl + esc(r.checked);
}
function render() {
  $('rtCount').textContent = items.length;
  $('rtTabN').textContent = items.length;
  drawLines();
  if (open && tab === 'list') renderList();
  if (open && tab === 'find') fillEnds();
  paintFooter();
}
function renderList() {
  if (!open || tab !== 'list') return;
  const list = filtered();
  $('rtInfo').textContent = (list.length === items.length ? items.length : list.length + ' / ' + items.length) + tx(' маршрут', ' маршр.');
  const box = $('rtList');
  if (!items.length) { box.innerHTML = '<div class="qa-empty">Әзірге маршрут жоқ. «Маршрут сызу» батырмасын басып, картадан жолды сызыңыз не GPX/KML тректерін импорттаңыз.</div>'; paintFooter(); return; }
  if (!list.length) { box.innerHTML = '<div class="qa-empty">Сүзгіге сай маршрут табылмады.</div>'; paintFooter(); return; }
  box.innerHTML = list.map(r => {
    const v = vehicleOf(r.vehicle);
    return '<div class="qa-sc rt-card" data-id="' + esc(r.id) + '"><span class="rt-sw' + (r.season === 'dry' ? ' is-dry' : '') + '" style="--c:' + v.color + '"></span>' +
      '<div class="qa-sc-main"><button type="button" class="qa-sc-title" data-act="go" title="Картадан көрсету">' + esc(r.name) + '</button>' +
      (r.a_name || r.b_name ? '<div class="qa-sc-meta">' + esc(r.a_name || '?') + ' → ' + esc(r.b_name || '?') + '</div>' : '') +
      '<div class="qa-sc-meta"><b>' + km(lineLength(r.pts)) + '</b> · ' + esc(v.short) + (r.season === 'dry' ? tx(' · тек құрғақта', ' · только в сухую погоду') : '') + ' · ' + checkedNote(r) + '</div>' +
      (r.note ? '<p class="qa-sc-desc">' + esc(r.note) + '</p>' : '') +
      '<div class="qa-sc-act"><button type="button" class="lnk" data-act="edit">Өңдеу</button><button type="button" class="lnk" data-act="go">Картадан көрсету</button>' +
      (shown.has(r.id) ? '<button type="button" class="lnk" data-act="hide">Картадан жасыру</button>' : '') +
      '<button type="button" class="lnk" data-act="gpx">GPX</button><button type="button" class="lnk lnk--danger" data-act="del">Өшіру</button></div></div></div>';
  }).join('');
  paintFooter();
}
$('rtList').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'), card = e.target.closest('[data-id]');
  if (!b || !card) return;
  const r = items.find(x => x.id === card.dataset.id);
  if (!r) return;
  if (b.dataset.act === 'go') flyTo(r);
  else if (b.dataset.act === 'edit') openDialog(r);
  else if (b.dataset.act === 'gpx') exportGpx([r], r.name);
  else if (b.dataset.act === 'hide') setShown(r.id, false);
  else if (b.dataset.act === 'del') removeRoute(r);
});
$('rtList').addEventListener('mouseover', e => {
  const card = e.target.closest('[data-id]');
  for (const [id, pl] of lines) pl.setStyle({ weight: card && id === card.dataset.id ? 7 : 4 });
});
$('rtList').addEventListener('mouseleave', () => { for (const pl of lines.values()) pl.setStyle({ weight: 4 }); });

/* ---------- Экспорт ---------- */
function exportGpx(list, title) {
  download(toGpx(list.map(r => ({ name: r.name, desc: [r.a_name && r.b_name ? r.a_name + ' → ' + r.b_name : '', vehicleOf(r.vehicle).label, r.note].filter(Boolean).join('. '), pts: r.pts })), title),
    'application/gpx+xml', fileSafe(title) + '.gpx');
}
function paintFooter() {
  if (tab === 'list') { $('rtGpx').disabled = !filtered().length; $('rtGeo').disabled = !filtered().length; $('rtGpx').title = 'Тізімдегі маршруттар — GPX (навигаторға, телефонға)'; }
  else { $('rtGpx').disabled = !result; $('rtGpx').title = 'Құрылған маршрут — GPX (навигаторға, телефонға)'; }
}
$('rtGpx').addEventListener('click', () => {
  if (tab === 'find') {
    if (!result) return;
    const title = result.title;
    const pts = [...(result.offStart ? [result.offStart.from] : []), ...result.coords, ...(result.offEnd ? [result.offEnd.to] : [])];
    download(toGpx([{ name: title, desc: km(result.len) + ', ' + result.legs.length + tx(' бөлік', ' участков'), pts }], title), 'application/gpx+xml', fileSafe(title) + '.gpx');
    return;
  }
  const list = filtered();
  exportGpx(list, tx('Mura GIS маршруттары', 'Маршруты Mura GIS'));
  toast('GPX: ' + list.length + tx(' маршрут.', ' маршр.'));
});
$('rtGeo').addEventListener('click', () => {
  const list = filtered();
  download(JSON.stringify(toGeojson(list), null, 1), 'application/geo+json', tx('Маршруттар_', 'Маршруты_') + today() + '.geojson');
  toast('GeoJSON: ' + list.length + tx(' маршрут.', ' маршр.'));
});

/* ---------- Импорт ---------- */
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
for (const id of ['rtImport', 'rtImportBtn']) $(id).addEventListener('click', () => $('rtFile').click());
$('rtFile').addEventListener('change', async e => {
  const files = [...(e.target.files || [])];
  e.target.value = '';
  for (const f of files) {
    $('rtBusy').textContent = tx('Импортталуда: ', 'Импорт: ') + f.name + '…';
    try {
      const list = await parseTrackFile(f, /\.kmz$/i.test(f.name) ? await loadFflate() : null);
      if (!list.length) throw new Error(f.name + tx(': сызық (трек, маршрут) табылмады.', ': линии (треки, маршруты) не найдены.'));
      const recs = list.map(t => ({
        ...t, vehicle: t.vehicle || '4x4', season: t.season || 'all',
        note: t.id ? t.note : [t.note, 'Импорт: ' + f.name].filter(Boolean).join('\n'),
      }));
      const r = await api('import', { data: JSON.stringify(recs) });
      toast(tx(f.name + ': жаңа — ' + r.added + (r.updated ? ', жаңартылған — ' + r.updated : '') + (r.skipped ? ', алынбағаны — ' + r.skipped : '') + '. Көлік түрі белгісіз тректер «жол талғамайтын» деп алынды — қажет болса өңдеңіз.',
        f.name + ': новых — ' + r.added + (r.updated ? ', обновлённых — ' + r.updated : '') + (r.skipped ? ', не взято — ' + r.skipped : '') + '. Треки с неизвестным типом транспорта приняты как «внедорожник» — при необходимости измените.'));
      map.fitBounds(L.latLngBounds(list.flatMap(t => t.pts)).pad(0.1), { maxZoom: 15 });
      if (!open) openPanel('list'); else setTab('list');
    } catch (ex) { toast(ex.message || String(ex), true); }
    $('rtBusy').textContent = '';
  }
});

/* ======================= Жол табу ======================= */
$('rtVeh').innerHTML = opts(VEHICLES, store.get('rt-veh') || '4x4');
$('rtVeh').addEventListener('change', () => store.set('rt-veh', $('rtVeh').value));
const picked = { from: null, to: null };          // картадан таңдалған нүкте: { lat, lon }
/** Таңдау тізімі: картадағы нүкте, ескерткіштер, желідегі атаулы пункттер (мыс. «Ақтөбе қаласы»). */
function fillEnds() {
  const nodes = network().nodes.filter(n => n.name && !n.markId);
  const seen = new Set();
  const named = nodes.filter(n => !seen.has(n.name) && seen.add(n.name)).sort((a, b) => cmpKk(a.name, b.name));
  const ms = marks().slice().sort((a, b) => cmpKk(a.name, b.name));
  const pls = places().slice().sort((a, b) => cmpKk(placeTitle(a), placeTitle(b)));
  const onNet = new Set(network().markNode.keys());
  for (const k of ['from', 'to']) {
    const sel = $(k === 'from' ? 'rtFrom' : 'rtTo'), cur = sel.value;
    const p = picked[k];
    sel.innerHTML = '<option value="">— таңдаңыз —</option>' +
      (p ? '<option value="p">📍 ' + tx('Картадағы нүкте: ', 'Точка на карте: ') + p.lat.toFixed(5) + ', ' + p.lon.toFixed(5) + '</option>' : '') +
      (named.length ? '<optgroup label="Желідегі пункттер">' + named.map(n => '<option value="n:' + esc(n.name) + '">' + esc(n.name) + '</option>').join('') + '</optgroup>' : '') +
      (ms.length ? '<optgroup label="Ескерткіштер">' + ms.map(m => '<option value="m:' + esc(m.id) + '">' + esc(m.name) + (onNet.has(m.id) ? '' : tx(' (желіден тыс)', ' (вне сети)')) + '</option>').join('') + '</optgroup>' : '') +
      (pls.length ? '<optgroup label="Өзге нысандар">' + pls.map(p => '<option value="pl:' + esc(p.id) + '">' + esc(placeTitle(p)) + '</option>').join('') + '</optgroup>' : '');
    sel.value = [...sel.options].some(o => o.value === cur) ? cur : '';
  }
}
function endOf(k) {
  const v = $(k === 'from' ? 'rtFrom' : 'rtTo').value;
  if (!v) return null;
  if (v === 'p') return picked[k] ? { lat: picked[k].lat, lon: picked[k].lon, label: tx('Картадағы нүкте', 'Точка на карте') } : null;
  if (v.startsWith('m:')) { const m = marks().find(x => x.id === v.slice(2)); return m ? { markId: m.id, lat: m.lat, lon: m.lon, label: m.name } : null; }
  if (v.startsWith('pl:')) { const p = places().find(x => x.id === v.slice(3)); return p ? { lat: p.lat, lon: p.lon, label: placeTitle(p) } : null; }
  if (v.startsWith('n:')) { const n = network().nodes.find(x => x.name === v.slice(2) && !x.markId); return n ? { node: n.id, lat: n.lat, lon: n.lon, label: n.name } : null; }
  return null;
}
function setPicking(k) {
  picking = k;
  $('rtFromPick').setAttribute('aria-pressed', k === 'from' ? 'true' : 'false');
  $('rtToPick').setAttribute('aria-pressed', k === 'to' ? 'true' : 'false');
  mapEl.classList.toggle('is-picking', !!k);
  if (k) toast(k === 'from' ? tx('Картадан бастапқы нүктені басыңыз (Esc — бас тарту).', 'Щёлкните по карте в начальной точке (Esc — отмена).') : tx('Картадан баратын нүктені басыңыз (Esc — бас тарту).', 'Щёлкните по карте в конечной точке (Esc — отмена).'));
}
function pickAt(latlng) {
  const k = picking;
  if (drawing) setDrawing(false);
  picked[k] = { lat: latlng.lat, lon: latlng.lng };
  setPicking(null);
  fillEnds();
  $(k === 'from' ? 'rtFrom' : 'rtTo').value = 'p';
  if (endOf('from') && endOf('to')) runFind();
}
$('rtFromPick').addEventListener('click', () => { if (drawing) setDrawing(false); for (const id of ['qaAddMode', 'mkMode', 'qaRuler']) if (pressed(id)) $(id).click(); setPicking(picking === 'from' ? null : 'from'); });
$('rtToPick').addEventListener('click', () => { if (drawing) setDrawing(false); for (const id of ['qaAddMode', 'mkMode', 'qaRuler']) if (pressed(id)) $(id).click(); setPicking(picking === 'to' ? null : 'to'); });
$('rtSwap').addEventListener('click', () => {
  const f = $('rtFrom').value, t = $('rtTo').value;
  [picked.from, picked.to] = [picked.to, picked.from];
  fillEnds();
  $('rtFrom').value = t === 'p' ? (picked.from ? 'p' : '') : t;
  $('rtTo').value = f === 'p' ? (picked.to ? 'p' : '') : f;
  if (result) runFind();
});
$('rtGo').addEventListener('click', runFind);
$('rtClear').addEventListener('click', clearResult);
$('rtWet').addEventListener('change', () => { if (result) runFind(); });
$('rtVeh').addEventListener('change', () => { if (result) runFind(); });

let result = null;
function clearResult() {
  result = null;
  resultLayer.clearLayers();
  $('rtResult').innerHTML = '';
  $('rtClear').hidden = true;
  paintFooter();
}
function endIcon(t) { return L.divIcon({ className: 'rt-end', iconSize: [26, 26], iconAnchor: [13, 13], html: '<span>' + t + '</span>' }); }
function runFind() {
  const a = endOf('from'), b = endOf('to');
  if (!a || !b) { $('rtResult').innerHTML = '<p class="rt-err">Қайдан және қайда баратынын таңдаңыз (тізімнен не 📍 картадан).</p>'; return; }
  if (!items.length) { $('rtResult').innerHTML = '<p class="rt-err">Әзірге маршрут жоқ — алдымен маршруттарды сызыңыз не импорттаңыз.</p>'; return; }
  const opt = { vehicle: $('rtVeh').value, wet: $('rtWet').checked };
  const r = findPath(network(), a, b, opt);
  resultLayer.clearLayers();
  if (!r.ok) {
    result = null;
    $('rtResult').innerHTML = '<p class="rt-err">' + esc(r.error) + '</p><p class="qa-hint">' + tx('Маршруттар бір-біріне жалғанбаған болуы мүмкін: «Тораптар» белгісін қосып, желіні тексеріңіз. ' +
      'Маршрут ұштары бір-біріне ' + 150 + ' м-ден жақын болса ғана жалғанады; ескерткішке ' + 300 + ' м-ден жақын өтсе — ескерткіш желіге қосылады.',
      'Возможно, маршруты не соединены между собой: включите «Узлы» и проверьте сеть. ' +
      'Концы маршрутов соединяются, только если они ближе ' + 150 + ' м друг к другу; если маршрут проходит ближе ' + 300 + ' м от памятника, памятник включается в сеть.') + '</p>';
    $('rtClear').hidden = false;
    paintFooter();
    return;
  }
  const N = network().nodes.length;
  const nodeName = id => { if (id === N) return a.label; if (id === N + 1) return b.label; const n = network().nodes[id]; return n ? n.name || tx('торап', 'узел') : ''; };
  result = { ...r, title: a.label + ' — ' + b.label };
  // Картада: ақ жиекті жуан сызық, желіден тыс бөліктер — үзік сызық
  L.polyline(r.coords, { color: '#fff', weight: 11, opacity: 0.9, interactive: false }).addTo(resultLayer);
  L.polyline(r.coords, { color: '#e8178a', weight: 6, opacity: 1, interactive: false }).addTo(resultLayer);
  for (const o of [r.offStart, r.offEnd]) if (o) L.polyline([o.from, o.to], { color: '#6b6354', weight: 3, dashArray: '4 7', interactive: false }).addTo(resultLayer);
  L.marker([a.lat, a.lon], { icon: endIcon('А'), interactive: false, keyboard: false }).addTo(resultLayer);
  L.marker([b.lat, b.lon], { icon: endIcon(tx('Б', 'Б')), interactive: false, keyboard: false }).addTo(resultLayer);
  const p = globalThis.QAUI?.pad?.();
  map.fitBounds(resultLayer.getBounds().pad(0.08), { maxZoom: 15, paddingTopLeft: p?.tl, paddingBottomRight: p?.br });
  const off = (r.offStart?.len || 0) + (r.offEnd?.len || 0);
  const warn = [];
  if (r.offStart && r.offStart.len > 200) warn.push(tx('Бастапқы нүктеден желіге дейін — ', 'От начальной точки до сети — ') + km(r.offStart.len) + tx(' (түзу сызықпен, жол белгісіз).', ' (по прямой, дорога неизвестна).'));
  if (r.offEnd && r.offEnd.len > 200) warn.push(tx('Желіден баратын нүктеге дейін — ', 'От сети до конечной точки — ') + km(r.offEnd.len) + tx(' (түзу сызықпен, жол белгісіз).', ' (по прямой, дорога неизвестна).'));
  $('rtResult').innerHTML =
    '<div class="rt-sum"><b>' + km(r.len) + '</b>' + (off > 200 ? ' + ' + km(off) + tx(' желіден тыс', ' вне сети') : '') + tx(' · шамамен ', ' · примерно ') + fmtTime(r.time) + '<small>' + esc(result.title) + ' · ' + r.legs.length + tx(' бөлік', ' участков') + '</small></div>' +
    warn.map(w => '<p class="rt-warnp">' + esc(w) + '</p>').join('') +
    '<ol class="rt-legs">' + r.legs.map(l => {
      const rt = l.route, v = vehicleOf(rt.vehicle);
      const from = nodeName(l.from), to = nodeName(l.to);
      return '<li><span class="rt-sw' + (rt.season === 'dry' ? ' is-dry' : '') + '" style="--c:' + v.color + '"></span><div><button type="button" class="qa-sc-title" data-rid="' + esc(rt.id) + '">' + esc(rt.name) + '</button>' +
        '<div class="qa-sc-meta">' + esc(from || '…') + ' → ' + esc(to || '…') + '</div>' +
        '<div class="qa-sc-meta"><b>' + km(l.len) + '</b> · ' + esc(v.short) + (rt.season === 'dry' ? tx(' · тек құрғақта', ' · только в сухую погоду') : '') + ' · ' + checkedNote(rt) + '</div></div></li>';
    }).join('') + '</ol>';
  $('rtClear').hidden = false;
  paintFooter();
}
$('rtResult').addEventListener('click', e => {
  const b = e.target.closest('[data-rid]');
  if (!b) return;
  const r = items.find(x => x.id === b.dataset.rid);
  if (r) openDialog(r);
});

/** Сыртқы шақырулар: оң жақ мәзір («Осы жерден / жерге жол табу», «Осы ескерткішке жол табу»). */
function findWith(k, end) {
  globalThis.MuraSvc?.set?.('routes');
  if (!open || tab !== 'find') openPanel('find');
  if (end.markId) { fillEnds(); $(k === 'from' ? 'rtFrom' : 'rtTo').value = 'm:' + end.markId; }
  else if (end.placeId) { fillEnds(); $(k === 'from' ? 'rtFrom' : 'rtTo').value = 'pl:' + end.placeId; }
  else { picked[k] = { lat: end.lat, lon: end.lon }; fillEnds(); $(k === 'from' ? 'rtFrom' : 'rtTo').value = 'p'; }
  if (endOf('from') && endOf('to')) runFind();
  else toast(k === 'from' ? tx('Енді «Қайда» нүктесін таңдаңыз.', 'Теперь выберите пункт «Куда».') : tx('Енді «Қайдан» нүктесін таңдаңыз.', 'Теперь выберите пункт «Откуда».'));
}

/* ======================= Іске қосу ======================= */
paintVisibility();
api('list').catch(e => { toast(tx('Маршруттар жүктелмеді: ', 'Маршруты не загружены: ') + e.message, true); render(); });

globalThis.MuraRoutes = {
  openPanel, closePanel, setDrawing, findPath: findWith,
  findFrom: p => findWith('from', p), findTo: p => findWith('to', p),
  get drawing() { return drawing; }, get items() { return items; }, api, network: () => network(),
  stop() { if (drawing) setDrawing(false); setPicking(null); },
};
