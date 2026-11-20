/* Ескерткіш белгілері (картадағы нүктелер) — ашық жобаның (.gpkg) marks қабаты.
   Қорғау аймақтарынан (zones қабаты) бөлек сақталады — екі функция бір-біріне тимейді.
   Клиент (src/marks/marks.js): POST mura://app/marks?op=list|save|delete|import
     save   — FormData data = бір белгі (JSON), id болса — жаңартылады;
     delete — FormData id;
     import — FormData data = белгілер тізімі (JSON), id бірдей болса жаңасы қалады;
     ilist / iadd / idel — импортталған нүктелер (KML, KMZ, GPX). Олар белгі емес — «Сәйкестендіру»
       арқылы белгі ретінде сақталғанда ғана тізімнен алынады (idel); жобаның imports қабаты. iadd: data = [{ name, desc, lat, lon, file, folder }],
       idel: id = 'all' не id-лер үтір арқылы.
   Жауап: { ok, items, imports, id, added, updated, error }. */
const os = require('node:os');
const crypto = require('node:crypto');

const LIMITS = { name: 200, period: 120, oblast: 80, district: 80, place: 1500, type: 20, category: 20, status: 20, note: 3000 };
const TYPES = ['archeo', 'arch', 'ensemble', 'sacred', 'art'];
const CATEGORIES = ['', 'intl', 'rep', 'local'];
const STATUSES = ['state', 'prelim', 'archreg', 'excluded'];

class MarksStore {
  /** marks, imports — жобаның қабаттары ({ load(), write(items) }). */
  constructor(marks, imports) {
    this.t = marks;
    this.it = imports;
  }

  load() {
    return this.t.load().filter(x => x && typeof x === 'object' && x.id);
  }

  write(items) {
    this.t.write(items);
  }

  list() {
    return this.load();
  }

  /* ---------- Импортталған нүктелер ---------- */
  loadImports() {
    return this.it.load().filter(x => x && typeof x === 'object' && x.id);
  }
  writeImports(items) {
    this.it.write(items);
  }
  addImports(raw) {
    let list;
    try { list = JSON.parse(String(raw || '')); } catch (e) { list = null; }
    if (!Array.isArray(list)) throw new Error('Нүктелер тізімі оқылмады.');
    if (list.length > 20000) throw new Error('Бір файлда нүкте тым көп (20 000-нан аспауы керек).');
    const items = this.loadImports();
    const now = new Date().toISOString();
    const cut = (v, n) => [...String(v ?? '').trim()].slice(0, n).join('');
    let added = 0, skipped = 0;
    for (const r of list) {
      const lat = Number(r && r.lat), lon = Number(r && r.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { skipped++; continue; }
      const key = (x) => x.lat.toFixed(7) + ',' + x.lon.toFixed(7) + '|' + x.name;
      const rec = { id: crypto.randomBytes(8).toString('hex'), name: cut(r.name, 200), desc: cut(r.desc, 3000), file: cut(r.file, 200), folder: cut(r.folder, 200),
        lat: Math.round(lat * 1e8) / 1e8, lon: Math.round(lon * 1e8) / 1e8, imported_at: now };
      if (items.some(x => key(x) === key(rec))) { skipped++; continue; }   // сол нүкте қайта импортталмайды
      items.push(rec); added++;
    }
    this.writeImports(items);
    return { added, skipped };
  }
  removeImports(ids) {
    const all = String(ids || '') === 'all';
    const set = new Set(String(ids || '').split(',').filter(Boolean));
    this.writeImports(all ? [] : this.loadImports().filter(x => !set.has(x.id)));
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
      if (op === 'list') return out({ ok: true, items: this.list(), imports: this.loadImports() });
      if (op === 'ilist') return out({ ok: true, imports: this.loadImports() });
      if (op === 'iadd') { const r = this.addImports(fd.get('data')); return out({ ok: true, ...r, imports: this.loadImports() }); }
      if (op === 'idel') { this.removeImports(fd.get('id')); return out({ ok: true, imports: this.loadImports() }); }
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
