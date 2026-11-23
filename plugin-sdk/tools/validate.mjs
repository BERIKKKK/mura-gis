#!/usr/bin/env node
/* Манифест валидаторы: node tools/validate.mjs <плагин қалтасы | файл.muraplug> [--app 2.2.0]
   Mura GIS орнату кезінде жасайтын тексерістің дәл өзі (бірдей lib/manifest.cjs және lib/zip.cjs). */
import fs from 'node:fs';
import path from 'node:path';
import { M, Z, collect, loc } from './common.mjs';

const args = process.argv.slice(2);
const target = args.find(a => !a.startsWith('--'));
const app = (args[args.indexOf('--app') + 1] && args.includes('--app')) ? args[args.indexOf('--app') + 1] : null;
if (!target) { console.error('Қолдану: node validate.mjs <плагин қалтасы | файл.muraplug> [--app 2.2.0]'); process.exit(2); }

let files;
try {
  if (fs.statSync(target).isDirectory()) {
    files = new Map(collect(target));
    // архивке айналғанда да оқылатынына көз жеткіземіз
    Z.readPlugin(Z.writeZip([...files]));
  } else files = Z.readPlugin(fs.readFileSync(target)).files;
} catch (e) { console.error('✗ ' + e.message); process.exit(1); }

if (!files.has('manifest.json')) { console.error('✗ manifest.json жоқ (қалтаның/архивтің түбінде болуы керек).'); process.exit(1); }
let raw;
try { raw = JSON.parse(files.get('manifest.json').toString('utf8').replace(/^﻿/, '')); } catch (e) { console.error('✗ manifest.json — дұрыс JSON емес: ' + e.message); process.exit(1); }
const v = M.validateManifest(raw, { files: new Set(files.keys()) });
for (const w of v.warnings) console.log('! ' + w);
for (const e of v.errors) console.log('✗ ' + e);
if (!v.ok) process.exit(1);
const m = v.manifest;
if (files.has('permissions.json')) {
  try { JSON.parse(files.get('permissions.json').toString('utf8')); } catch (e) { console.log('! permissions.json оқылмайды'); }
}
console.log('✓ ' + m.id + ' ' + m.version + ' — «' + loc(m.name) + '», Plugin API ' + m.apiVersion + ', Mura GIS ≥ ' + m.minAppVersion + ', ' + m.platforms.join('/'));
console.log('  Рұқсаттар: ' + (m.permissions.join(', ') || 'жоқ'));
for (const [p, list] of Object.entries(m.contributes)) console.log('  ' + p + ': ' + list.map(c => c.command + ' «' + loc(c.title) + '»').join(', '));
if (app) {
  const c = M.compatibility(m, { appVersion: app, platform: 'desktop' });
  console.log(c.ok ? '✓ Mura GIS ' + app + ' (desktop) нұсқасымен үйлесімді' : '✗ ' + c.reason);
  if (!c.ok) process.exit(1);
}
