/* Сақталған қорғау аймақтары — компьютердегі JSON файл (сайттағы data/admin/qorgau.json.php баламасы).
   Құралдың клиенттік коды (src/qorgau/app.js) сайттағыдай POST сұранысын жібереді:
     mura://app/api?v=1&op=list|save|delete  (FormData: data / id)
   Жауап пішімі сайттағы admin/modules/tools.php-пен бірдей: { ok, items, id, error }. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'qorgau.json');
    fs.mkdirSync(dir, { recursive: true });
  }

  load() {
    try {
      const j = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return Array.isArray(j) ? j.filter(x => x && typeof x === 'object') : [];
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw new Error('Деректер файлы оқылмады: ' + this.file + ' (' + e.message + ')');
    }
  }

  write(items) {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(items, null, 1));
    if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.file + '.bak');
    fs.renameSync(tmp, this.file);
  }

  list() {
    return this.load().sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  }

  /** Сайттағы tools.php-пен бірдей тексеріс. */
  save(raw) {
    let d;
    try { d = JSON.parse(String(raw || '')); } catch (e) { d = null; }
    if (!d || typeof d !== 'object') throw new Error('Дерек оқылмады.');
    const pts = [];
    for (const p of Array.isArray(d.pts) ? d.pts : []) {
      const lat = Number(p && p.lat), lon = Number(p && p.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('Нүкте координатасы дұрыс емес.');
      pts.push({ lat: Math.round(lat * 1e8) / 1e8, lon: Math.round(lon * 1e8) / 1e8 });
    }
    if (pts.length < 4 || pts.length > 500) throw new Error('Кемінде 4 нүкте керек.');
    const limits = { name: 200, gen: 220, period: 120, oblast: 80, district: 80, place: 1500, desc: 6000, type: 20, height: 12, d1: 12, d2: 12, d3: 12 };
    const fields = {};
    const src = d.fields && typeof d.fields === 'object' ? d.fields : {};
    for (const [k, max] of Object.entries(limits)) fields[k] = [...String(src[k] ?? '').trim()].slice(0, max).join('');
    if (!fields.name) throw new Error('Ескерткіш атауын енгізіңіз.');
    for (const k of ['d1', 'd2', 'd3']) if (!(parseFloat(fields[k].replace(',', '.')) > 0)) throw new Error('Аймақ қашықтықтарын енгізіңіз.');

    const items = this.load();
    const now = new Date().toISOString();
    const user = (() => { try { return os.userInfo().username; } catch (e) { return ''; } })();
    let id = String(d.id || '');
    const i = id ? items.findIndex(x => x.id === id) : -1;
    const old = i >= 0 ? items[i] : null;
    if (!old) id = crypto.randomBytes(8).toString('hex');
    const rec = {
      id, name: fields.name, district: fields.district, fields, pts,
      created_at: old?.created_at || now, created_by: old?.created_by || user,
      updated_at: now, updated_by: user,
    };
    if (old) items[i] = rec; else items.push(rec);
    this.write(items);
    return id;
  }

  remove(id) {
    const items = this.load();
    const i = items.findIndex(x => x.id === String(id || ''));
    if (i < 0) throw new Error('Жазба табылмады.');
    items.splice(i, 1);
    this.write(items);
  }

  /** Басқа файлдан (сайттан не басқа компьютерден) жазбаларды қосу; id бірдей болса — жаңасы қалады. */
  importFrom(file) {
    let j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (j && !Array.isArray(j) && Array.isArray(j.items)) j = j.items;
    if (!Array.isArray(j)) throw new Error('Файлда сақталған аймақтар тізімі жоқ.');
    const items = this.load();
    let added = 0, updated = 0;
    for (const r of j) {
      if (!r || typeof r !== 'object' || !r.id || !Array.isArray(r.pts)) continue;
      const i = items.findIndex(x => x.id === r.id);
      if (i < 0) { items.push(r); added++; }
      else if (String(r.updated_at || '') > String(items[i].updated_at || '')) { items[i] = r; updated++; }
    }
    this.write(items);
    return { added, updated };
  }

  exportTo(file) {
    fs.writeFileSync(file, JSON.stringify(this.load(), null, 1));
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
      return out({ ok: false, error: 'Белгісіз әрекет.' });
    } catch (e) {
      return out({ ok: false, error: e.message || String(e) });
    }
  }
}

module.exports = { Store };
