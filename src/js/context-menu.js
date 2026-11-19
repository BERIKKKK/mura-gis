/* Mura GIS: тінтуірдің оң жақ батырмасы — картадағы мәзір.
   Картаны оң жақ батырмамен басқанда: координатаны көшіру (ондық градус / ° ′ ″), алмасу буферіндегі координатаны қою
   (картадан көрсету), осы жерге белгі қою, осы жерге шекара нүктесін қосу, белгіленген мәтінді көшіру.
   Белгіні оң жақ батырмамен басқанда: оның координатасын көшіру, өңдеу, қорғау аймағын бастау.
   Екеуінде де: осы нүктені Google Maps-та ашу — қалыпты карта не спутник (жүйенің браузерінде).
   Мәтін өрістеріндегі мәзірді (Қию / Көшіру / Қою / Барлығын белгілеу) негізгі процесс көрсетеді (main/main.js).
   Шекара нүктесін оң жақ батырмамен басу бұрынғыдай — нүктені өшіреді; сызғыш режимінде — өлшеуден бас тарту. */
import { parseOne } from '../qorgau/app.js';
import { dms } from '../marks/export.js';

const $ = id => document.getElementById(id);
const map = globalThis.MuraMarks && globalThis.MuraMarks.map;
const app = $('qaApp'), mapEl = $('qaMap');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const IC = {
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  paste: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.5h6V4"/><path d="M12 9v7M9 13l3 3 3-3"/>',
  flag: '<path d="M6 21V4"/><path d="M6 4.5h11l-2.2 3.8L17 12H6"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><path d="M12 7.5v5M9.5 10h5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  zone: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M8 10l4-2 4 2v4l-4 2-4-2z"/>',
  gmap: '<path d="M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  gsat: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5s1.2-6.1 3.8-8.5z"/>',
};
const icon = p => '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';

function toast(msg, err) {
  const t = $('qaToast');
  if (!t) return;
  t.textContent = msg; t.classList.toggle('is-err', !!err); t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, err ? 5000 : 2400);
}
async function clipWrite(text) {
  try { if (globalThis.mura && globalThis.mura.clipWrite) await globalThis.mura.clipWrite(text); else await navigator.clipboard.writeText(text); return true; }
  catch (e) { toast('Көшірілмеді: ' + e.message, true); return false; }
}
async function clipRead() {
  try { return globalThis.mura && globalThis.mura.clipRead ? await globalThis.mura.clipRead() : await navigator.clipboard.readText(); }
  catch (e) { return ''; }
}

/* ---------- Координаталар: пішімдеу және мәтіннен оқу ---------- */
const fmtDec = p => p.lat.toFixed(7) + ', ' + p.lon.toFixed(7);
const fmtDms = p => dms(p.lat) + (p.lat < 0 ? ' S' : ' N') + ', ' + dms(p.lon) + (p.lon < 0 ? ' W' : ' E');
/** Алмасу буферіндегі мәтіннен координата жұбын табу: «50.41, 57.04», «50°24′44″ N 57°02′28″ E», Excel-ден (Tab) т.б. */
function parsePair(text) {
  const s = String(text || '').trim().replace(/\s+/g, ' ');
  if (!s || s.length > 200) return null;
  const tries = [
    s.split(/\s*[;\t\n|]\s*/),
    s.split(/,\s+/),
    s.split(/\s*,\s*(?=[-+]?\d)/),
    s.split(/(?<=[NnSsСсЮю″"'′])\s*,?\s*(?=[EeWwВвШш]?\s*[-+]?\d)/),
    s.split(' '),
  ];
  for (const parts of tries) {
    const p = parts.map(x => x.trim()).filter(Boolean);
    if (p.length !== 2) continue;
    const a = parseOne(p[0]), b = parseOne(p[1]);
    if (a.err || b.err || Math.abs(a.v) > 90 || Math.abs(b.v) > 180) continue;
    return { lat: a.v, lon: b.v };
  }
  return null;
}

/* ---------- Мәзір ---------- */
let menu = null;
function closeMenu() { if (menu) { menu.remove(); menu = null; } }
/** items: [{ label, icon, run, disabled, hint }] не 'sep'; head — мәзірдің тақырыбы. */
function openMenu(x, y, head, items) {
  closeMenu();
  menu = document.createElement('div');
  menu.className = 'mura-ctx';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = (head ? '<div class="mura-ctx-head">' + head + '</div>' : '') + items.map((it, i) => it === 'sep' ? '<div class="mura-ctx-sep"></div>'
    : '<button type="button" role="menuitem" data-i="' + i + '"' + (it.disabled ? ' disabled' : '') + '>' + icon(it.icon || '') + '<span>' + esc(it.label) +
      (it.hint ? '<small>' + esc(it.hint) + '</small>' : '') + '</span></button>').join('');
  app.appendChild(menu);
  const r = app.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = Math.max(4, Math.min(x - r.left, r.width - w - 4)) + 'px';
  menu.style.top = Math.max(4, Math.min(y - r.top, r.height - h - 4)) + 'px';
  menu.addEventListener('click', e => {
    const b = e.target.closest('button[data-i]');
    if (!b || b.disabled) return;
    const it = items[+b.dataset.i];
    closeMenu();
    it.run();
  });
  menu.querySelector('button:not([disabled])')?.focus({ preventScroll: true });
  return menu;
}
document.addEventListener('pointerdown', e => { if (menu && !menu.contains(e.target)) closeMenu(); }, true);
document.addEventListener('keydown', e => {
  if (!menu) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const bs = [...menu.querySelectorAll('button:not([disabled])')], i = bs.indexOf(document.activeElement);
    bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length]?.focus();
  }
}, true);
addEventListener('blur', closeMenu);
addEventListener('resize', closeMenu);
if (map) map.on('movestart zoomstart', closeMenu);

const copyItems = p => [
  { label: 'Координатаны көшіру', hint: fmtDec(p), icon: IC.copy, run: async () => { if (await clipWrite(fmtDec(p))) toast('Көшірілді: ' + fmtDec(p)); } },
  { label: 'Координатаны көшіру (° ′ ″)', hint: fmtDms(p), icon: IC.copy, run: async () => { if (await clipWrite(fmtDms(p))) toast('Көшірілді: ' + fmtDms(p)); } },
];
/* Google Maps: осы нүкте белгімен, картаның қазіргі масштабымен; «!3m1!1e3» — спутник түрі. Сілтеме жүйенің браузерінде ашылады (main.js). */
function gmapsUrl(p, sat) {
  const ll = p.lat.toFixed(7) + ',' + p.lon.toFixed(7);
  const z = Math.max(3, Math.min(21, Math.round(map ? map.getZoom() : 17)));
  return 'https://www.google.com/maps/place/' + ll + '/@' + ll + ',' + z + 'z' + (sat ? '/data=!3m1!1e3' : '');
}
const gmapsItems = p => [
  { label: 'Google Maps-та ашу', hint: 'қалыпты карта', icon: IC.gmap, run: () => window.open(gmapsUrl(p, false)) },
  { label: 'Google Maps-та ашу (спутник)', hint: 'спутник түсірілімі', icon: IC.gsat, run: () => window.open(gmapsUrl(p, true)) },
];
/** Алмасу буферіндегі координатаны картадан көрсету: төменгі координата панеліне қойып, «Көрсету». */
function showPasted(p) {
  const lat = $('qaInLat'), lon = $('qaInLon');
  if (!lat || !lon) return;
  if ($('qaCoordBar').hidden) $('qaCoordShow')?.click();
  lat.value = p.lat.toFixed(7); lon.value = p.lon.toFixed(7);
  for (const el of [lat, lon]) el.dispatchEvent(new Event('input', { bubbles: true }));
  $('qaInGo')?.click();
}

/* ---------- Карта ---------- */
if (map) map.on('contextmenu', async e => {
  if (mapEl.classList.contains('is-ruler')) return;                // сызғыш: оң жақ батырма — өлшеуден бас тарту (app.js)
  const p = { lat: e.latlng.lat, lon: e.latlng.lng };
  const oe = e.originalEvent;
  const sel = String(getSelection() || '').trim();
  const pasteItem = { label: 'Қою: координатаны картадан көрсету', icon: IC.paste, disabled: true, hint: 'алмасу буферінде координата жоқ', run: () => {} };
  const items = [
    ...copyItems(p),
    pasteItem,
    'sep',
    { label: 'Осы жерге белгі қою', icon: IC.flag, run: () => globalThis.__marks?.openDialog({ lat: p.lat, lon: p.lon }) },
    { label: 'Осы жерге шекара нүктесін қосу', icon: IC.pin, run: () => addBoundaryPoint(p) },
    'sep',
    ...gmapsItems(p),
  ];
  if (sel) items.push('sep', { label: 'Көшіру', hint: sel.length > 40 ? sel.slice(0, 40) + '…' : sel, icon: IC.copy, run: () => clipWrite(sel) });
  const m = openMenu(oe.clientX, oe.clientY, esc(fmtDec(p)), items);
  // Алмасу буферін тексеру (асинхронды): координата болса — «Қою» белсенді
  const c = parsePair(await clipRead());
  if (menu !== m || !c) return;
  pasteItem.disabled = false; pasteItem.hint = fmtDec(c); pasteItem.run = () => showPasted(c);
  const b = m.querySelector('[data-i="2"]');
  if (b) { b.disabled = false; b.querySelector('small').textContent = fmtDec(c); }
});
function addBoundaryPoint(p) {
  const lat = $('qaInLat'), lon = $('qaInLon'), add = $('qaInAdd');
  if (!lat || !lon || !add) return;
  lat.value = p.lat.toFixed(7); lon.value = p.lon.toFixed(7);
  for (const el of [lat, lon]) el.dispatchEvent(new Event('input', { bubbles: true }));
  add.click();
}

/* ---------- Белгі (marks/marks.js шақырады) ---------- */
function forMark(m, ev) {
  const oe = ev && (ev.originalEvent || ev);
  if (oe && oe.preventDefault) oe.preventDefault();
  openMenu(oe.clientX, oe.clientY, esc(m.name), [
    ...copyItems(m),
    { label: 'Атауы мен координатасын көшіру', icon: IC.copy, run: () => clipWrite(m.name + '\t' + m.lat.toFixed(7) + '\t' + m.lon.toFixed(7)) },
    'sep',
    { label: 'Өңдеу', icon: IC.edit, run: () => globalThis.__marks?.openDialog(m) },
    { label: 'Қорғау аймағын белгілеу', icon: IC.zone, run: () => globalThis.MuraZone?.startFromMark(m) },
    'sep',
    ...gmapsItems(m),
  ]);
}

globalThis.MuraCtx = { forMark, parsePair, openMenu, closeMenu };
