#!/usr/bin/env node
/* Сыртқы кітапханаларды src/vendor/ ішіне жаңарту (бағдарлама толық офлайн жұмыс істеуі үшін олар жергілікті сақталады).
 *   • Leaflet — node_modules/leaflet/dist ішінен (нұсқасы package.json → devDependencies.leaflet).
 *   • fflate (src/vendor/fflate.js) — жеке жаңартылмайды, файл репозиторийде тұр.
 * Қолдану:  npm install && npm run vendor */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LD = path.join(ROOT, 'node_modules/leaflet/dist');
const OUT = path.join(ROOT, 'src/vendor/leaflet');
if (!fs.existsSync(LD)) { console.error('✗ node_modules/leaflet жоқ — алдымен npm install орындаңыз'); process.exit(1); }

const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); console.log('  ✓', path.relative(ROOT, to)); };
for (const f of ['leaflet.js', 'leaflet.css']) copy(path.join(LD, f), path.join(OUT, f));
for (const f of fs.readdirSync(path.join(LD, 'images'))) copy(path.join(LD, 'images', f), path.join(OUT, 'images', f));
copy(path.join(ROOT, 'node_modules/leaflet/LICENSE'), path.join(OUT, 'LICENSE'));
console.log('Дайын.');
