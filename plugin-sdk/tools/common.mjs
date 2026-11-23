/* SDK құралдарының ортақ бөлігі: плагин қалтасын оқу (архивке кіретін файлдар). */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const M = require('../lib/manifest.cjs');
export const Z = require('../lib/zip.cjs');

const SKIP = new Set(['node_modules', 'dist', 'out', '.git']);
/** Плагин қалтасындағы файлдар: [[архивтегі жол, Buffer]…] (нүктелі файлдар, node_modules, dist, out, *.muraplug кірмейді). */
export function collect(dir) {
  const out = [];
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith('.') || SKIP.has(e.name) || e.name.endsWith('.muraplug')) continue;
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isSymbolicLink()) throw new Error('Символдық сілтеме рұқсат етілмейді: ' + r);
      if (e.isDirectory()) walk(path.join(d, e.name), r);
      else out.push([r, fs.readFileSync(path.join(d, e.name))]);
    }
  };
  walk(dir, '');
  return out;
}
export const loc = (v, l = 'kk') => M.localize(v, l);
