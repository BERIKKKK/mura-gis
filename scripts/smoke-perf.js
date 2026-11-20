/* Өнімділік тесті: 10 000 белгі және 10 000 импортталған нүкте — жүктелу, масштабтау, панель, іздеу уақыты.
   Іске қосу: npx electron scripts/smoke-perf.js [N]   (деректер уақытша .gpkg жобасында) */
const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const N = Number(process.argv.find(a => /^\d+$/.test(a))) || 10000;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mura-perf-'));
app.setPath('userData', tmp);
// Жоба — уақытша .gpkg (бастапқы терезесіз бірден ашылады); деректер бет жүктелген соң API арқылы толтырылады
process.env.MURA_PROJECT = path.join(tmp, 'perf.gpkg');
const R = ['I', 'II', 'ІІІ', 'ІҮ', 'V', 'VI', 'Х', 'ХІ'];
const TY = ['archeo', 'arch', 'ensemble', 'sacred', 'art'], CA = ['intl', 'rep', 'local', ''], ST = ['state', 'prelim', 'archreg', 'excluded'];
const rnd = (i, k) => ((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
const hex = i => i.toString(16).padStart(16, '0');
const MARKS = JSON.stringify(Array.from({ length: N }, (_, i) => ({
  id: hex(i + 1), name: 'Қабантау-' + R[i % 8] + ' қорғаны ' + (i % 997), period: 'ерте темір дәуірі', oblast: 'Ақтөбе облысы', district: 'Аудан ' + (i % 13),
  place: 'Ауылдан ' + (i % 40) + ' км', type: TY[i % 5], category: CA[i % 4], status: ST[i % 4], note: '',
  lat: 46 + rnd(i, 1) * 5, lon: 54 + rnd(i, 2) * 8, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
})));
const IMPORTS = JSON.stringify(Array.from({ length: N }, (_, i) => ({
  id: hex(1e9 + i), name: 'WP' + i, desc: '', file: 'big.kml', folder: '', lat: 46 + rnd(i, 3) * 5, lon: 54 + rnd(i, 4) * 8, imported_at: '2026-01-01T00:00:00Z',
})));

const errors = [];
let t0 = 0;
app.on('browser-window-created', (_e, win) => {
  win.webContents.on('console-message', ev => { if (ev.level === 'error' || ev.level === 3) errors.push(ev.message); });
  if (errors.started) return;
  errors.started = true;
  t0 = Date.now();
  win.webContents.once('did-finish-load', () => setTimeout(() => run(win).catch(e => { console.error('FAIL', e); app.exit(1); }), 3500));
});

async function run(win) {
  const js = s => win.webContents.executeJavaScript(s, true);
  const r = await js(`(async () => {
    const out = {}, wait = t => new Promise(r => setTimeout(r, t)), frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    while (!window.__marks) await wait(20);
    const t = performance.now();
    await __marks.api('import', { data: ${JSON.stringify(MARKS)} });
    await __marks.api('iadd', { data: ${JSON.stringify(IMPORTS)} });
    while (!(window.__marks && __marks.items.length >= ${N} && __marks.imports.length >= ${N})) await wait(20);
    await frame();
    out.loadMs = Math.round(performance.now() - t);
    const M = __marks, map = MuraMarks.map;
    const dom = () => document.querySelectorAll('.mk-pin').length + ' pins / ' + document.querySelectorAll('.mk-imp:not(.mk-imp--inline)').length + ' imp / ' + document.querySelectorAll('.leaflet-overlay-pane canvas').length + ' canvas';
    out.zoom6 = dom();
    const step = async (ll, z) => { const s = performance.now(); map.setView(ll, z, { animate: false }); await frame(); return Math.round(performance.now() - s) + ' ms'; };
    out.toZoom12 = await step([48.5, 58], 12) + ' → ' + dom();
    out.toZoom9 = await step([48.5, 58], 9) + ' → ' + dom();
    out.pan = await step([47.5, 56], 9) + ' → ' + dom();
    out.toZoom12again = await step([48.5, 58], 12) + ' → ' + dom();
    out.toZoom12b = await step([48.6, 58.1], 12) + ' → ' + dom();
    out.toZoom6 = await step([48.6, 58.2], 6) + ' → ' + dom();
    let s = performance.now(); M.openPanel(); await frame(); out.openPanel = Math.round(performance.now() - s) + ' ms, cards ' + document.querySelectorAll('#mkList .mk-card').length;
    const q = document.getElementById('mkQ');
    s = performance.now(); for (const ch of 'Қабантау-V') { q.value += ch; q.dispatchEvent(new Event('input')); } await wait(250); await frame();
    out.search = Math.round(performance.now() - s) + ' ms (incl. debounce), info ' + document.getElementById('mkInfo').textContent;
    q.value = ''; q.dispatchEvent(new Event('input')); await wait(250);
    s = performance.now(); const m = M.items[5]; await M.api('save', { data: JSON.stringify({ ...m, name: m.name + ' (өзг.)' }) }); await frame();
    out.saveOne = Math.round(performance.now() - s) + ' ms';
    const pts = Array.from({ length: 5000 }, (_, i) => ({ name: 'N' + i, desc: '', file: 'new.gpx', folder: '', lat: 49 + i / 1e4, lon: 57 + i / 1e4 }));
    s = performance.now(); const ir = await M.api('iadd', { data: JSON.stringify(pts) }); await frame();
    out.import5000 = Math.round(performance.now() - s) + ' ms, added ' + ir.added;
    return out;
  })()`);
  r.firstWindowToReadyMs = Date.now() - t0;
  console.log(JSON.stringify(r, null, 1));
  const real = errors.filter(e => !/tile|Failed to load resource/i.test(e));
  if (errors.length) console.log('Консоль қателері:\n  ' + errors.join('\n  '));
  app.exit(real.length ? 1 : 0);
}

require('../main/main.js');
