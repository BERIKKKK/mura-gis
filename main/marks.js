/* Ескерткіш белгілері (картадағы нүктелер) — компьютердегі JSON файл: data/marks.json.
   Қорғау аймақтарынан (store.js → qorgau.json) бөлек сақталады — екі функция бір-біріне тимейді.
   Клиент (src/marks/marks.js): POST mura://app/marks?op=list|save|delete|import
     save   — FormData data = бір белгі (JSON), id болса — жаңартылады;
     delete — FormData id;
     import — FormData data = белгілер тізімі (JSON), id бірдей болса жаңасы қалады.
   Жауап: { ok, items, id, added, updated, error }. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const LIMITS = { name: 200, period: 120, oblast: 80, district: 80, place: 1500, type: 20, category: 20, status: 20, note: 3000 };
const TYPES = ['archeo', 'arch', 'ensemble', 'sacred', 'art'];
const CATEGORIES = ['', 'intl', 'rep', 'local'];
const STATUSES = ['state', 'prelim', 'archreg', 'excluded'];

class MarksStore {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'marks.json');
    fs.mkdirSync(dir, { recursive: true });
  }

  load() {
    try {
      const j = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return Array.isArray(j) ? j.filter(x => x && typeof x === 'object' && x.id) : [];
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw new Error('Белгілер файлы оқылмады: ' + this.file + ' (' + e.message + ')');
    }
  }

  write(items) {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(items, null, 1));
    if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.file + '.bak');
    fs.renameSync(tmp, this.file);
  }

  list() {
    return this.load();
  }

  /** Бір белгіні тексеріп, қалыпқа келтіру (қате болса — Error). */
  static clean(d) {
    if (!d || typeof d !== 'object') throw new Error('Дерек оқылмады.');
    const lat = Number(d.lat), lon = Number(d.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('Белгінің координатасы дұрыс емес.');
    const f = {};
    for (const [k, max] of Object.entries(LIMITS)) f[k] = [...String(d[k] ?? '').trim()].slice(0, max).join('');
    if (!f.name) throw new Error('Ескерткіш атауын енгізіңіз.');
    if (!TYPES.includes(f.type)) f.type = 'archeo';
    if (!CATEGORIES.includes(f.category)) f.category = '';
    if (!STATUSES.includes(f.status)) f.status = 'state';
    return { ...f, lat: Math.round(lat * 1e8) / 1e8, lon: Math.round(lon * 1e8) / 1e8 };
  }

  save(raw) {
    let d;
    try { d = JSON.parse(String(raw || '')); } catch (e) { d = null; }
    const f = MarksStore.clean(d);
    const items = this.load();
    const now = new Date().toISOString();
    const user = (() => { try { return os.userInfo().username; } catch (e) { return ''; } })();
    let id = String(d.id || '');
    const i = id ? items.findIndex(x => x.id === id) : -1;
    const old = i >= 0 ? items[i] : null;
    if (!old) id = crypto.randomBytes(8).toString('hex');
    const rec = { id, ...f, created_at: old?.created_at || now, created_by: old?.created_by || user, updated_at: now, updated_by: user };
    if (old) items[i] = rec; else items.push(rec);
    this.write(items);
    return id;
  }

  remove(id) {
    const items = this.load();
    const i = items.findIndex(x => x.id === String(id || ''));
    if (i < 0) throw new Error('Белгі табылмады.');
    items.splice(i, 1);
    this.write(items);
  }

  /** Тізімді қосу (GeoJSON-нан не басқа компьютерден): id бірдей болса — жаңасы қалады, id жоғы — жаңа белгі. */
  importMany(raw) {
    let list;
    try { list = JSON.parse(String(raw || '')); } catch (e) { list = null; }
    if (!Array.isArray(list)) throw new Error('Белгілер тізімі оқылмады.');
    const items = this.load();
    const now = new Date().toISOString();
    let added = 0, updated = 0, skipped = 0;
    for (const r of list) {
      let f;
      try { f = MarksStore.clean(r); } catch (e) { skipped++; continue; }
      const id = /^[0-9a-f]{16}$/.test(String(r.id || '')) ? String(r.id) : '';
      const i = id ? items.findIndex(x => x.id === id) : -1;
      const rec = { id: id || crypto.randomBytes(8).toString('hex'), ...f,
        created_at: r.created_at || now, created_by: r.created_by || '', updated_at: r.updated_at || now, updated_by: r.updated_by || '' };
      if (i < 0) { items.push(rec); added++; }
      else if (String(rec.updated_at) > String(items[i].updated_at || '')) { items[i] = rec; updated++; }
    }
    this.write(items);
    return { added, updated, skipped };
  }

  async handle(request) {
    const url = new URL(request.url);
    const op = url.searchParams.get('op') || '';
    const out = o => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    try {
      if (request.method !== 'POST') return out({ ok: false, error: 'POST керек.' });
      const fd = await request.formData();
      if (op === 'list') return out({ ok: true, items: this.list() });
      if (op === 'save') { const id = this.save(fd.get('data')); return out({ ok: true, id, items: this.list() }); }
      if (op === 'delete') { this.remove(fd.get('id')); return out({ ok: true, items: this.list() }); }
      if (op === 'import') { const r = this.importMany(fd.get('data')); return out({ ok: true, ...r, items: this.list() }); }
      return out({ ok: false, error: 'Белгісіз әрекет.' });
    } catch (e) {
      return out({ ok: false, error: e.message || String(e) });
    }
  }
}

module.exports = { MarksStore };
