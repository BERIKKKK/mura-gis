/* Mura GIS: бағдарлама баптаулары — userData/settings.json (тілмен бір файл: main/lang.js).
   autosave — жобаның өзгерістерін файлға бірден жазу (әдепкі: иә). MURA_AUTOSAVE=0|1 — тесттер үшін. */
const fs = require('node:fs');
const path = require('node:path');

let file = null;
const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch (e) { return {}; } };

function init(dir) { file = path.join(dir, 'settings.json'); }

function get(key, def) {
  if (key === 'autosave' && /^[01]$/.test(process.env.MURA_AUTOSAVE || '')) return process.env.MURA_AUTOSAVE === '1';
  const v = file ? read()[key] : undefined;
  return v === undefined ? def : v;
}

function set(key, value) {
  if (!file) return;
  const s = read();
  s[key] = value;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(s, null, 1));
  fs.renameSync(tmp, file);
}

module.exports = { init, get, set };
