/* Облыстар мен аудандар тізімі негізгі процесте (жоба баптауларын тексеру үшін).
   Тізімнің өзі — бір жерде: src/js/regions.js (бет үшін жазылған скрипт). Оны DOM-сыз оқшау ортада орындаймыз. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let list = null;
function load() {
  if (list) return list;
  const win = {};
  const ctx = { window: win, document: { getElementById: () => null }, localStorage: { getItem: () => null, setItem() {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'regions.js'), 'utf8'), ctx, { timeout: 1000 });
  list = (win.MuraRegions && win.MuraRegions.list || []).map(r => ({ name: r.name, city: !!r.city, units: r.units.map(u => u.v) }));
  return list;
}
const find = name => load().find(r => r.name === String(name || '').trim()) || null;

module.exports = { find, list: load };
