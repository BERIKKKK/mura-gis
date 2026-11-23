/* Ұсынылған плагиндер — Mura GIS әзірлеушісі жасаған, бағдарламамен бірге келетін үлгі плагиндер.
   Олар ядроға КІРМЕЙДІ: орнату міндетті емес, кәдімгі плагин сияқты оқшауланған ортада жұмыс істейді, өшіріледі, жойылады.
   Айырмашылығы — көзі: архив бағдарламаның өз жинағынан (plugin-sdk/examples/) жиналады, сондықтан желі керек емес және
   «Mura GIS әзірлеушісі» мәртебесі манифесттегі жазуға емес, осы тізімге сүйенеді (бөтен файл оны иемдене алмайды). */
const fs = require('node:fs');
const path = require('node:path');
const M = require('../../plugin-sdk/lib/manifest.cjs');
const Z = require('../../plugin-sdk/lib/zip.cjs');

const SDK = path.join(__dirname, '..', '..', 'plugin-sdk');
/** Каталог: тек осы тізімдегі қалталар «ұсынылған» болады. */
const ENTRIES = [
  { dir: path.join(SDK, 'examples', 'nipd-exporter'), tags: ['export', 'nipd'] },
  { dir: path.join(SDK, 'examples', 'decree-matcher'), tags: ['marks', 'decree'] },
];
const SKIP = new Set(['node_modules', 'dist', 'out']);

/** Қалтадағы файлдар → .muraplug (ZIP) буфері. Уақыт белгісі тұрақты — бір нұсқаның архиві әрдайым бірдей. */
function pack(dir) {
  const files = [];
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith('.') || SKIP.has(e.name) || e.name.endsWith('.muraplug')) continue;
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r); else files.push([r, fs.readFileSync(path.join(d, e.name))]);
    }
  };
  walk(dir, '');
  return Z.writeZip(files, { date: new Date(2020, 0, 1) });
}

/** Каталогтағы плагиндер: { id, manifest, dir, tags }. Манифесі бүлінген жазба еленбейді. */
function list() {
  const out = [];
  for (const e of ENTRIES) {
    try {
      const v = M.validateManifest(JSON.parse(fs.readFileSync(path.join(e.dir, 'manifest.json'), 'utf8')));
      if (v.ok) out.push({ id: v.manifest.id, manifest: v.manifest, dir: e.dir, tags: e.tags });
    } catch (err) { /* жоқ не бүлінген — көрсетілмейді */ }
  }
  return out;
}
const ids = () => new Set(list().map(x => x.id));

module.exports = { list, ids, pack };
