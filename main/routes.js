/* Маршруттар — ашық жобаның (.gpkg) routes қабаты (белгілер мен қорғау аймақтарынан бөлек).
   Клиент (src/routes/routes.js): POST mura://app/routes?op=list|save|delete|import
     save   — FormData data = бір маршрут (JSON), id болса — жаңартылады;
     delete — FormData id;
     import — FormData data = маршруттар тізімі (JSON; GPX/KML/GeoJSON импорты), id бірдей болса жаңасы қалады.
   Жауап: { ok, items, id, added, updated, skipped, error }. */
const os = require('node:os');
const crypto = require('node:crypto');
const { tx } = require('./lang');

const LIMITS = { name: 200, a_name: 120, b_name: 120, note: 3000 };
const VEHICLES = ['car', '4x4', 'foot'];
const SEASONS = ['all', 'dry'];
const MAX_PTS = 20000;

class RoutesStore {
  /** table — жобаның routes қабаты ({ load(), write(items) }). */
  constructor(table) {
    this.t = table;
  }

  load() {
    return this.t.load().filter(x => x && typeof x === 'object' && x.id);
  }

  write(items) {
    this.t.write(items);
  }

  list() { return this.load(); }

  /** Бір маршрутты тексеріп, қалыпқа келтіру (қате болса — Error). */
  static clean(d) {
    if (!d || typeof d !== 'object') throw new Error(tx('Дерек оқылмады.', 'Не удалось прочитать данные.'));
    const pts = (Array.isArray(d.pts) ? d.pts : []).map(p => [Number(p && p[0]), Number(p && p[1])])
      .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180)
      .map(p => [Math.round(p[0] * 1e7) / 1e7, Math.round(p[1] * 1e7) / 1e7]);
    if (pts.length < 2) throw new Error(tx('Маршрутта кемінде 2 нүкте болуы керек.', 'В маршруте должно быть не менее 2 точек.'));
    if (pts.length > MAX_PTS) throw new Error(tx('Маршруттың нүктесі тым көп (' + MAX_PTS + '-нан аспауы керек).', 'Слишком много точек в маршруте (не более ' + MAX_PTS + ').'));
    const f = {};
    for (const [k, max] of Object.entries(LIMITS)) f[k] = [...String(d[k] ?? '').trim()].slice(0, max).join('');
    if (!f.name) f.name = [f.a_name, f.b_name].filter(Boolean).join(' — ') || tx('Атаусыз маршрут', 'Маршрут без названия');
    const vehicle = VEHICLES.includes(d.vehicle) ? d.vehicle : '4x4';
    const season = SEASONS.includes(d.season) ? d.season : 'all';
    const checked = /^\d{4}-\d{2}-\d{2}$/.test(String(d.checked || '')) ? String(d.checked) : '';
    return { ...f, vehicle, season, checked, pts };
  }

  save(raw) {
    let d;
    try { d = JSON.parse(String(raw || '')); } catch (e) { d = null; }
    const f = RoutesStore.clean(d);
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
    if (i < 0) throw new Error(tx('Маршрут табылмады.', 'Маршрут не найден.'));
    items.splice(i, 1);
    this.write(items);
  }

  /** Тізімді қосу: id бірдей болса — жаңасы қалады, id жоғы — жаңа маршрут. */
  importMany(raw) {
    let list;
    try { list = JSON.parse(String(raw || '')); } catch (e) { list = null; }
    if (!Array.isArray(list)) throw new Error(tx('Маршруттар тізімі оқылмады.', 'Не удалось прочитать список маршрутов.'));
    if (list.length > 5000) throw new Error(tx('Бір файлда маршрут тым көп (5000-нан аспауы керек).', 'Слишком много маршрутов в одном файле (не более 5000).'));
    const items = this.load();
    const now = new Date().toISOString();
    let added = 0, updated = 0, skipped = 0;
    for (const r of list) {
      let f;
      try { f = RoutesStore.clean(r); } catch (e) { skipped++; continue; }
      const id = /^[0-9a-f]{16}$/.test(String(r.id || '')) ? String(r.id) : '';
      const i = id ? items.findIndex(x => x.id === id) : -1;
      const rec = { id: id || crypto.randomBytes(8).toString('hex'), ...f,
        created_at: r.created_at || now, created_by: r.created_by || '', updated_at: r.updated_at || now, updated_by: r.updated_by || '' };
      if (i < 0) { items.push(rec); added++; }
      else if (String(rec.updated_at) > String(items[i].updated_at || '')) { items[i] = rec; updated++; }
      else skipped++;
    }
    this.write(items);
    return { added, updated, skipped };
  }

  async handle(request) {
    const url = new URL(request.url);
    const op = url.searchParams.get('op') || '';
    const out = o => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    try {
      if (request.method !== 'POST') return out({ ok: false, error: tx('POST керек.', 'Нужен POST.') });
      const fd = await request.formData();
      if (op === 'list') return out({ ok: true, items: this.list() });
      if (op === 'save') { const id = this.save(fd.get('data')); return out({ ok: true, id, items: this.list() }); }
      if (op === 'delete') { this.remove(fd.get('id')); return out({ ok: true, items: this.list() }); }
      if (op === 'import') { const r = this.importMany(fd.get('data')); return out({ ok: true, ...r, items: this.list() }); }
      return out({ ok: false, error: tx('Белгісіз әрекет.', 'Неизвестное действие.') });
    } catch (e) {
      return out({ ok: false, error: e.message || String(e) });
    }
  }
}

module.exports = { RoutesStore };
