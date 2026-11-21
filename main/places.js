/* Өзге нысандар (елді мекен, қыстау, жайлау, тұрақ, құдық т.б.) — ашық жобаның (.gpkg) places қабаты.
   Ескерткіш белгілерінен бөлек сақталады: ескерткіштер тізіміне, құжаттарына және қорғау аймағына әсер етпейді.
   Жазба: { id (16 hex), kind, name (қазақша), name_ru, lat, lon, created_at/by, updated_at/by } — Android-тағы
   Place моделімен бірдей (android/core: PlaceKind кодтары).
   Клиент (src/marks/places.js): POST mura://app/places?op=list|save|delete|import
     save   — FormData data = бір нысан (JSON), id болса — жаңартылады;
     delete — FormData id (бірнешеуі — үтір арқылы);
     import — FormData data = тізім (JSON), id бірдей болса — updated_at жаңасы қалады.
   Жауап: { ok, items, id, added, updated, skipped, removed, error }. */
const os = require('node:os');
const crypto = require('node:crypto');
const { tx } = require('./lang');

/** Түрлер — кодтар Android-пен ортақ; жаңа түр тек соңына қосылады, бар код өзгертілмейді. */
const KINDS = ['settlement', 'qystau', 'zhailau', 'kuzeu', 'kokteu', 'turaq', 'well', 'spring', 'other'];
const LIMITS = { name: 200, name_ru: 200 };
const user = () => { try { return os.userInfo().username; } catch (e) { return ''; } };
const ID = /^[0-9a-f]{16}$/;

class PlacesStore {
  /** t — жобаның places қабаты ({ load(), write(items) }). */
  constructor(t) { this.t = t; }

  list() { return this.t.load().filter(x => x && typeof x === 'object' && x.id); }

  /** Бір нысанды тексеріп, қалыпқа келтіру: тек координата міндетті (атауы бос болса — түрі көрсетіледі). */
  static clean(d) {
    if (!d || typeof d !== 'object') throw new Error(tx('Дерек оқылмады.', 'Не удалось прочитать данные.'));
    const lat = Number(d.lat), lon = Number(d.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error(tx('Нысанның координатасы дұрыс емес.', 'Неверная координата объекта.'));
    const f = {};
    for (const [k, max] of Object.entries(LIMITS)) f[k] = [...String(d[k] ?? '').trim()].slice(0, max).join('');
    f.kind = KINDS.includes(String(d.kind)) ? String(d.kind) : 'other';
    return { ...f, lat: Math.round(lat * 1e8) / 1e8, lon: Math.round(lon * 1e8) / 1e8 };
  }

  save(raw) {
    let d;
    try { d = JSON.parse(String(raw || '')); } catch (e) { d = null; }
    const f = PlacesStore.clean(d);
    const items = this.list();
    const now = new Date().toISOString(), u = user();
    let id = String(d.id || '');
    const i = id ? items.findIndex(x => x.id === id) : -1;
    const old = i >= 0 ? items[i] : null;
    if (!old) id = crypto.randomBytes(8).toString('hex');
    const rec = { id, ...f, created_at: old?.created_at || now, created_by: old?.created_by || u, updated_at: now, updated_by: u };
    if (old) items[i] = rec; else items.push(rec);
    this.t.write(items);
    return id;
  }

  remove(id) {
    const ids = new Set(String(id || '').split(',').map(s => s.trim()).filter(Boolean));
    const items = this.list();
    const left = items.filter(x => !ids.has(x.id));
    if (left.length === items.length) throw new Error(tx('Нысан табылмады.', 'Объект не найден.'));
    this.t.write(left);
    return items.length - left.length;
  }

  /** Тізімді қосу (GeoJSON, Android, басқа жоба): id бірдей болса — updated_at жаңасы қалады, id жоғы — жаңа нысан.
      Бос орысша атау бар орысша атауды өшірмейді (жұмыс үстелі экспортында name_ru бос болуы мүмкін). */
  importMany(raw) {
    let list;
    try { list = JSON.parse(String(raw || '')); } catch (e) { list = null; }
    if (!Array.isArray(list)) throw new Error(tx('Нысандар тізімі оқылмады.', 'Не удалось прочитать список объектов.'));
    const items = this.list();
    const index = new Map(items.map((x, i) => [x.id, i]));
    const now = new Date().toISOString();
    let added = 0, updated = 0, skipped = 0;
    for (const r of list) {
      let f;
      try { f = PlacesStore.clean(r); } catch (e) { skipped++; continue; }
      const id = ID.test(String(r.id || '')) ? String(r.id) : '';
      const i = id && index.has(id) ? index.get(id) : -1;
      const rec = { id: id || crypto.randomBytes(8).toString('hex'), ...f,
        created_at: r.created_at || now, created_by: r.created_by || '', updated_at: r.updated_at || now, updated_by: r.updated_by || '' };
      if (i < 0) { index.set(rec.id, items.length); items.push(rec); added++; continue; }
      if (String(rec.updated_at) <= String(items[i].updated_at || '')) { skipped++; continue; }
      if (!rec.name_ru) rec.name_ru = items[i].name_ru || '';
      if (!rec.name) rec.name = items[i].name || '';
      rec.created_at = items[i].created_at || rec.created_at; rec.created_by = items[i].created_by || rec.created_by;
      items[i] = rec; updated++;
    }
    if (added || updated) this.t.write(items);
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
      if (op === 'delete') { const removed = this.remove(fd.get('id')); return out({ ok: true, removed, items: this.list() }); }
      if (op === 'import') { const r = this.importMany(fd.get('data')); return out({ ok: true, ...r, items: this.list() }); }
      return out({ ok: false, error: tx('Белгісіз әрекет.', 'Неизвестное действие.') });
    } catch (e) {
      return out({ ok: false, error: e.message || String(e) });
    }
  }
}

module.exports = { PlacesStore, KINDS };
