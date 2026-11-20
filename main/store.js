/* Сақталған қорғау аймақтары — ашық жобаның (.gpkg) zones қабаты (main/gpkg.js).
   Клиенттік код (src/qorgau/app.js) POST сұранысын жібереді:
     mura://app/api?v=1&op=list|save|delete  (FormData: data / id)
   Жауап пішімі: { ok, items, id, error }. */
const os = require('node:os');
const crypto = require('node:crypto');

class Store {
  /** table — { load(), write(items) }: жобаның қабаты (gpkg.js → Project.table('zones')) не noTable. */
  constructor(table) {
    this.t = table;
  }

  load() {
    return this.t.load().filter(x => x && typeof x === 'object');
  }

  write(items) {
    this.t.write(items);
  }

  list() {
    return this.load().sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  }

  /** Жазбаны тексеріп сақтау. */
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

  /** JSON мәтінінен (басқа компьютерден, ескі нұсқадан) жазбаларды қосу; id бірдей болса — жаңасы қалады. */
  importFrom(text) {
    let j = JSON.parse(String(text));
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

  exportJson() {
    return JSON.stringify(this.load(), null, 1);
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
