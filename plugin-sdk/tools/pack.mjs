#!/usr/bin/env node
/* .muraplug жинақтаушы: node tools/pack.mjs <плагин қалтасы> [шығыс файл не қалта/]
   Манифестті тексереді, қалтаны ZIP-ке жинайды, нәтижені Mura GIS-тің өз оқу тексерісінен өткізеді, SHA-256 шығарады. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { M, Z, collect, loc } from './common.mjs';

const [dir, outArg] = process.argv.slice(2);
if (!dir) { console.error('Қолдану: node pack.mjs <плагин қалтасы> [шығыс.muraplug]'); process.exit(2); }
try {
  const files = collect(dir);
  const names = new Set(files.map(f => f[0]));
  const mf = files.find(f => f[0] === 'manifest.json');
  if (!mf) throw new Error('manifest.json жоқ.');
  const v = M.validateManifest(JSON.parse(mf[1].toString('utf8').replace(/^﻿/, '')), { files: names });
  for (const w of v.warnings) console.log('! ' + w);
  if (!v.ok) throw new Error(v.errors.join('\n  '));
  const buf = Z.writeZip(files);
  Z.readPlugin(buf);                               // Mura GIS-тің тексерісінен өте ме
  const fileName = v.manifest.id + '-' + v.manifest.version + '.muraplug';
  // шығыс: файл не қалта («dist-plugins/» не бар қалта — ішіне <id>-<нұсқа>.muraplug)
  const out = !outArg ? path.join(dir, 'dist', fileName)
    : (/[\\/]$/.test(outArg) || (fs.existsSync(outArg) && fs.statSync(outArg).isDirectory())) ? path.join(outArg, fileName) : outArg;
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, buf);
  console.log('✓ ' + out + ' — «' + loc(v.manifest.name) + '» ' + v.manifest.version + ', ' + files.length + ' файл, ' + Math.ceil(buf.length / 1024) + ' КБ');
  console.log('  SHA-256: ' + crypto.createHash('sha256').update(buf).digest('hex'));
} catch (e) { console.error('✗ ' + e.message); process.exit(1); }
