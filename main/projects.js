/* Жобаларды басқару: ашық жоба, соңғы жобалар тізімі, ескі нұсқаның деректерін жобаға көшіру.
   Соңғы жобалар — userData/data/recent.json (тек жолдар мен қысқа мәліметтер; деректердің өзі — .gpkg файлдарда).
   Ескі нұсқалар (1.2.x) деректерді userData/data/*.json файлдарында сақтаған: жаңа жоба құрғанда оларды
   жобаға көшіруге болады (файлдар өшірілмейді). */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Project } = require('./gpkg');

const MAX_RECENT = 12;
const LEGACY = { zones: 'qorgau.json', marks: 'marks.json', routes: 'routes.json', imports: 'imports.json' };

class Projects {
  constructor(dataDir) {
    this.dir = dataDir;
    this.recentFile = path.join(dataDir, 'recent.json');
    fs.mkdirSync(dataDir, { recursive: true });
    this.current = null;            // Project
  }

  /* ---------- Соңғы жобалар ---------- */
  recent() {
    let j = [];
    try { j = JSON.parse(fs.readFileSync(this.recentFile, 'utf8')); } catch (e) { j = []; }
    if (!Array.isArray(j)) j = [];
    return j.filter(x => x && typeof x.path === 'string')
      .map(x => ({ path: x.path, name: String(x.name || ''), oblast: String(x.oblast || ''), district: String(x.district || ''),
        opened_at: String(x.opened_at || ''), exists: fs.existsSync(x.path) }));
  }
  writeRecent(list) {
    const tmp = this.recentFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(list.slice(0, MAX_RECENT).map(({ exists, ...x }) => x), null, 1));
    fs.renameSync(tmp, this.recentFile);
  }
  touchRecent(p) {
    const m = p.meta();
    const rec = { path: p.file, name: m.name || path.basename(p.file, '.gpkg'), oblast: m.oblast || '', district: m.district || '', opened_at: new Date().toISOString() };
    this.writeRecent([rec, ...this.recent().filter(x => !samePath(x.path, p.file))]);
  }
  forget(file) {
    this.writeRecent(this.recent().filter(x => !samePath(x.path, String(file || ''))));
  }

  /* ---------- Ашу / құру / жабу ---------- */
  open(file) {
    const p = Project.open(file);
    this.backup(p.file);
    this.setCurrent(p);
    return p;
  }
  create(file, meta, { importLegacy = false } = {}) {
    const p = Project.create(file, meta);
    try { if (importLegacy) this.importLegacy(p); } catch (e) { p.close(); throw e; }
    this.setCurrent(p);
    return p;
  }
  setCurrent(p) {
    if (this.current && this.current !== p) this.current.close();
    this.current = p;
    this.touchRecent(p);
  }
  close() {
    if (this.current) this.current.close();
    this.current = null;
  }
  updateMeta(o) {
    if (!this.current) throw new Error('Жоба ашылмаған.');
    this.current.setMeta(o);
    this.touchRecent(this.current);
  }

  /** Беттің бастапқы суреті: ашық жоба (не null) және соңғы жобалар. */
  info() {
    const p = this.current;
    let cur = null;
    if (p) {
      const m = p.meta();
      cur = { path: p.file, file: path.basename(p.file), dir: path.dirname(p.file), key: keyOf(p.file),
        name: m.name || path.basename(p.file, '.gpkg'), oblast: m.oblast || '', district: m.district || '', created_at: m.created_at || '', counts: p.counts(), dirty: p.dirty() };
    }
    return { current: cur, recent: this.recent(), legacy: this.legacyCounts() };
  }

  /** Ашылған жобаның көшірмесі (userData/data/backups/): файл бүлінсе, соңғы ашылған күйі қалады. */
  backup(file) {
    try {
      const dir = path.join(this.dir, 'backups');
      fs.mkdirSync(dir, { recursive: true });
      const base = path.basename(file, path.extname(file)).replace(/[^\p{L}\p{N}_.-]+/gu, '_').slice(0, 60);
      fs.copyFileSync(file, path.join(dir, base + '-' + keyOf(file) + '.gpkg'));
    } catch (e) { /* көшірме — міндетті емес */ }
  }

  /* ---------- Ескі нұсқаның деректері ---------- */
  readLegacy() {
    const out = {};
    for (const [t, f] of Object.entries(LEGACY)) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8'));
        out[t] = Array.isArray(j) ? j.filter(x => x && typeof x === 'object' && x.id) : [];
      } catch (e) { out[t] = []; }
    }
    return out;
  }
  legacyCounts() {
    const l = this.readLegacy();
    const n = Object.values(l).reduce((s, a) => s + a.length, 0);
    return n ? Object.fromEntries(Object.entries(l).map(([k, a]) => [k, a.length])) : null;
  }
  importLegacy(p) {
    const l = this.readLegacy();
    for (const [t, items] of Object.entries(l)) if (items.length) p.write(t, items);
  }
}

const samePath = (a, b) => (process.platform === 'linux' ? a === b : a.toLowerCase() === b.toLowerCase());
const keyOf = f => crypto.createHash('sha1').update(process.platform === 'linux' ? f : f.toLowerCase()).digest('hex').slice(0, 10);

module.exports = { Projects };
