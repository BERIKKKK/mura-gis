/* Mura GIS: тінтуірдің оң жақ батырмасы — картадағы мәзір.
   Картаны оң жақ батырмамен басқанда: координатаны көшіру (ондық градус / ° ′ ″), алмасу буферіндегі координатаны қою
   (картадан көрсету), осы жерге белгі қою, осы жерге шекара нүктесін қосу, белгіленген мәтінді көшіру.
   Белгіні оң жақ батырмамен басқанда: оның координатасын көшіру, өңдеу, қорғау аймағын бастау.
   Екеуінде де: осы нүктені Google Maps-та ашу — қалыпты карта не спутник (жүйенің браузерінде).
   Мәтін өрістеріндегі мәзірді (Қию / Көшіру / Қою / Барлығын белгілеу) негізгі процесс көрсетеді (main/main.js).
   Шекара нүктесін оң жақ батырмамен басу бұрынғыдай — нүктені өшіреді; сызғыш режимінде — өлшеуден бас тарту. */
import { parseOne } from '../qorgau/app.js';
import { dms } from '../marks/export.js';
const tx = (kk, ru) => (globalThis.MuraI18n && globalThis.MuraI18n.ru ? ru : kk);

const $ = id => document.getElementById(id);
const map = globalThis.MuraMarks && globalThis.MuraMarks.map;
const app = $('qaApp'), mapEl = $('qaMap');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const IC = {
  route: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  paste: '<path d="M11 14h10"/><path d="M16 4h2a2 2 0 0 1 2 2v1.344"/><path d="m17 18 4-4-4-4"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 1.793-1.113"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
  flag: '<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"/>',
  pin: '<path d="M19.914 11.105A7.298 7.298 0 0 0 20 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 1.202 0 32 32 0 0 0 .824-.738"/><circle cx="12" cy="10" r="3"/><path d="M16 18h6"/><path d="M19 15v6"/>',
  edit: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  zone: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>',
  gmap: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
  gsat: '<path d="m13.5 6.5-3.148-3.148a1.205 1.205 0 0 0-1.704 0L6.352 5.648a1.205 1.205 0 0 0 0 1.704L9.5 10.5"/><path d="M16.5 7.5 19 5"/><path d="m17.5 10.5 3.148 3.148a1.205 1.205 0 0 1 0 1.704l-2.296 2.296a1.205 1.205 0 0 1-1.704 0L13.5 14.5"/><path d="M9 21a6 6 0 0 0-6-6"/><path d="M9.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l4.296-4.296a1.205 1.205 0 0 0 0-1.704l-2.296-2.296a1.205 1.205 0 0 0-1.704 0z"/>',
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
  catch (e) { toast(tx('Көшірілмеді: ', 'Не скопировано: ') + e.message, true); return false; }
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
  { label: 'Координатаны көшіру', hint: fmtDec(p), icon: IC.copy, run: async () => { if (await clipWrite(fmtDec(p))) toast(tx('Көшірілді: ', 'Скопировано: ') + fmtDec(p)); } },
  { label: 'Координатаны көшіру (° ′ ″)', hint: fmtDms(p), icon: IC.copy, run: async () => { if (await clipWrite(fmtDms(p))) toast(tx('Көшірілді: ', 'Скопировано: ') + fmtDms(p)); } },
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
  if (mapEl.matches('.is-ruler, .is-compass')) return;            // сызғыш, циркуль: оң жақ батырма — өлшеуден бас тарту (app.js)
  const p = { lat: e.latlng.lat, lon: e.latlng.lng };
  const oe = e.originalEvent;
  const sel = String(getSelection() || '').trim();
  const pasteItem = { label: 'Қою: координатаны картадан көрсету', icon: IC.paste, disabled: true, hint: 'алмасу буферінде координата жоқ', run: () => {} };
  const items = [
    ...copyItems(p),
    pasteItem,
    'sep',
    { label: 'Осы жерге белгі қою', icon: IC.flag, run: () => { globalThis.MuraSvc?.set('marks'); const m = globalThis.__marks; if (m?.newMark) m.newMark({ lat: p.lat, lon: p.lon }); else m?.openDialog({ lat: p.lat, lon: p.lon }); } },
    { label: 'Осы жерге шекара нүктесін қосу', icon: IC.pin, run: () => addBoundaryPoint(p) },
    'sep',
    { label: 'Осы жерден жол табу', hint: 'маршруттар желісі бойынша', icon: IC.route, run: () => globalThis.MuraRoutes?.findFrom(p) },
    { label: 'Осы жерге жол табу', hint: 'маршруттар желісі бойынша', icon: IC.route, run: () => globalThis.MuraRoutes?.findTo(p) },
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
    { label: 'Осы ескерткішке жол табу', hint: 'маршруттар желісі бойынша', icon: IC.route, run: () => globalThis.MuraRoutes?.findTo({ markId: m.id, lat: m.lat, lon: m.lon }) },
    { label: 'Қорғау аймағын белгілеу', icon: IC.zone, run: () => globalThis.MuraZone?.startFromMark(m) },
    { label: tx('Жоспарды ашу', 'Открыть план'), hint: tx('құрамындағы нысандар, контурлар, PDF', 'объекты в составе, контуры, PDF'), icon: globalThis.MuraPlanIcon?.plan || IC.zone, run: () => globalThis.MuraPlan?.openForMark(m) },
    'sep',
    ...gmapsItems(m),
  ]);
}

globalThis.MuraCtx = { forMark, parsePair, openMenu, closeMenu };
