/* «Жоспар» — ескерткіштің құрамындағы нысандар мен жоспар баптаулары (ашық жобаның plan_objects және plans қабаттары).
   Ескерткіштің өзі (атауы, негізгі координатасы) — marks қабатында; мұнда тек оның id-і (mark_id) сақталады.
   Нысан: { id (16 hex, тұрақты), mark_id, num (ескерткіш ішінде бірегей), kind, name/name_ru, note/note_ru, lat, lon (тірек нүктесі),
     shape ('' — тек нүкте | circle | ellipse | free), height, diam, ax_a, ax_b, ax_az, pts [[lat, lon]…] (еркін контур),
     dim [i, j] (еркін контурдың өлшем сызығы — төбелердің нөмірі), dim_az (шеңбердің диаметр сызығының бағыты),
     lbl [dx, dy] (жалпы жоспардағы белгінің ығысуы, мм), dimlbl [dx, dy] (жеке жоспардағы өлшем жазуының ығысуы, мм) }.
   Биіктік пен өлшемдер метрмен; бос (null) — «өлшенбеген», 0 — енгізілген нөл.
   Жоспар: { id, mark_id, lang, scale_general, scale_detail (0 — автоматты), ptr (елді мекен: { lat, lon, place_id }), ptr_name/ptr_name_ru,
     ptr_name_man, ptr_from ('' — ескерткіштің негізгі координатасы, не нысанның id-і), ptr_o_lat/ptr_o_lon (бастапқы нүкте),
     ptr_az/ptr_dist (есептелген), ptr_az_man/ptr_dist_man (қолмен түзетілгені, null — автоматты) }.
   Клиент (src/plan/plan.js): POST mura://app/plans?op=list|save|delete|plan
     save — FormData data = бір нысан (JSON), id болса — жаңартылады; delete — FormData id; plan — FormData data = жоспар баптаулары.
   Жауап: { ok, objects, plans, id, error, field } (field — қате өрістің атауы). */
const os = require('node:os');
const crypto = require('node:crypto');
const { tx } = require('./lang');
const { plane } = require('./plan-geom');

const ID = /^[0-9a-f]{16}$/;
const KINDS = ['kurgan', 'other'];
const SHAPES = ['', 'circle', 'ellipse', 'free'];
const LIMITS = { name: 200, name_ru: 200, note: 3000, note_ru: 3000 };
const MAX_PTS = 2000;
const user = () => { try { return os.userInfo().username; } catch (e) { return ''; } };
const cut = (v, n) => [...String(v ?? '').trim()].slice(0, n).join('');
const num = v => (v === null || v === undefined || String(v).trim() === '' ? null : Number(String(v).replace(',', '.')));
const r8 = v => Math.round(v * 1e8) / 1e8;
const r3 = v => Math.round(v * 1000) / 1000;
const normAz = v => ((v % 360) + 360) % 360;
const pair = (v, lim = 300) => (Array.isArray(v) && v.length === 2 && v.every(x => Number.isFinite(+x)) ? v.map(x => Math.max(-lim, Math.min(lim, Math.round(+x * 10) / 10))) : null);

/** Өріс қатесі: клиент сол өрісті көрсетеді, қалған енгізілгені сақталады. */
function fieldError(field, kk, ru) {
  const e = new Error(tx(kk, ru));
  e.field = field;
  return e;
}

/** Тұйық сынық сызықтың өзімен қиылысуы (жазықтықтағы нүктелер [[x, y]…]). */
function selfIntersects(p) {
  const n = p.length;
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const hit = (a, b, c, d) => {
    const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;     // көрші қабырғалар
      if (hit(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** Нысанды тексеріп, қалыпқа келтіру (қате болса — өріс қатесі). */
function cleanObject(d) {
  if (!d || typeof d !== 'object') throw new Error(tx('Дерек оқылмады.', 'Не удалось прочитать данные.'));
  const mark_id = String(d.mark_id || '');
  if (!ID.test(mark_id)) throw fieldError('mark_id', 'Ескерткіш таңдалмаған.', 'Памятник не выбран.');
  const n = cut(d.num, 12);
  if (!n) throw fieldError('num', 'Нысанның нөмірін енгізіңіз.', 'Введите номер объекта.');
  const lat = num(d.lat), lon = num(d.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw fieldError('lat', 'Тірек нүктесінің координатасы дұрыс емес.', 'Неверная координата опорной точки.');
  const shape = SHAPES.includes(String(d.shape || '')) ? String(d.shape || '') : '';
  const f = { mark_id, num: n, kind: KINDS.includes(String(d.kind)) ? String(d.kind) : 'kurgan', shape, lat: r8(lat), lon: r8(lon) };
  for (const [k, max] of Object.entries(LIMITS)) f[k] = cut(d[k], max);

  const height = num(d.height);
  if (height !== null && (!Number.isFinite(height) || height < 0)) throw fieldError('height', 'Биіктік теріс болмауы керек.', 'Высота не может быть отрицательной.');
  if (height !== null && height > 500) throw fieldError('height', 'Биіктік тым үлкен (500 м-ден аспауы керек).', 'Слишком большая высота (не более 500 м).');
  f.height = height === null ? null : r3(height);

  const pos = (k, kk, ru, req) => {
    const v = num(d[k]);
    if (v === null) { if (req) throw fieldError(k, kk, ru); return null; }
    if (!Number.isFinite(v) || v <= 0) throw fieldError(k, kk, ru);
    if (v > 100000) throw fieldError(k, 'Өлшем тым үлкен.', 'Слишком большой размер.');
    return r3(v);
  };
  f.diam = pos('diam', 'Диаметр нөлден үлкен болуы керек.', 'Диаметр должен быть больше нуля.', shape === 'circle');
  f.ax_a = shape === 'ellipse' ? pos('ax_a', 'Үлкен осьтің ұзындығы нөлден үлкен болуы керек.', 'Длина большой оси должна быть больше нуля.', true) : null;
  f.ax_b = shape === 'ellipse' ? pos('ax_b', 'Кіші осьтің ұзындығы нөлден үлкен болуы керек.', 'Длина малой оси должна быть больше нуля.', true) : null;
  if (shape === 'ellipse' && f.ax_b > f.ax_a) throw fieldError('ax_b', 'Кіші ось үлкен осьтен ұзын болмауы керек.', 'Малая ось не может быть длиннее большой.');
  const az = num(d.ax_az);
  if (shape === 'ellipse' && az !== null && !Number.isFinite(az)) throw fieldError('ax_az', 'Азимут дұрыс емес.', 'Неверный азимут.');
  f.ax_az = shape === 'ellipse' ? r3(normAz(az || 0)) : null;

  f.pts = null; f.dim = null;
  if (shape === 'free') {
    const raw = Array.isArray(d.pts) ? d.pts : [];
    if (raw.length > MAX_PTS) throw fieldError('pts', 'Контурдың төбесі тым көп.', 'Слишком много вершин контура.');
    const pts = raw.map(p => [num(p && p[0]), num(p && p[1])]).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180).map(p => [r8(p[0]), r8(p[1])]);
    // Тұйықтау нүктесі (бірінші нүктенің қайталануы) және қатар тұрған бірдей нүктелер алынады
    const uniq = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
    if (uniq.length > 1 && uniq[0][0] === uniq[uniq.length - 1][0] && uniq[0][1] === uniq[uniq.length - 1][1]) uniq.pop();
    if (new Set(uniq.map(p => p.join(','))).size < 3) throw fieldError('pts', 'Еркін контурда кемінде үш бөлек төбе болуы керек.', 'В свободном контуре должно быть не менее трёх различных вершин.');
    const P = plane(uniq[0][0], uniq[0][1]);
    if (selfIntersects(uniq.map(p => P.fwd(p[0], p[1])))) throw fieldError('pts', 'Контур өзімен қиылысады.', 'Контур самопересекается.');
    f.pts = uniq;
    const dm = Array.isArray(d.dim) ? d.dim.map(x => Math.trunc(+x)) : null;
    if (dm && dm.length === 2 && dm.every(x => x >= 0 && x < uniq.length) && dm[0] !== dm[1]) f.dim = dm;
  }
  const da = num(d.dim_az);
  f.dim_az = shape === 'circle' && Number.isFinite(da) ? r3(normAz(da)) : null;
  f.lbl = pair(d.lbl);
  f.dimlbl = pair(d.dimlbl);
  return f;
}

/** Жоспар баптауларын тексеру. */
function cleanPlan(d) {
  if (!d || typeof d !== 'object') throw new Error(tx('Дерек оқылмады.', 'Не удалось прочитать данные.'));
  const mark_id = String(d.mark_id || '');
  if (!ID.test(mark_id)) throw fieldError('mark_id', 'Ескерткіш таңдалмаған.', 'Памятник не выбран.');
  const scale = v => { const s = Math.round(num(v) || 0); return s >= 10 && s <= 100000 ? s : 0; };
  const f = { mark_id, lang: d.lang === 'ru' ? 'ru' : 'kk', scale_general: scale(d.scale_general), scale_detail: scale(d.scale_detail) };
  const ptr = d.ptr && typeof d.ptr === 'object' ? d.ptr : null;
  const plat = ptr ? num(ptr.lat) : null, plon = ptr ? num(ptr.lon) : null;
  if (ptr && (!Number.isFinite(plat) || !Number.isFinite(plon) || Math.abs(plat) > 90 || Math.abs(plon) > 180)) throw fieldError('ptr', 'Елді мекеннің координатасы дұрыс емес.', 'Неверная координата населённого пункта.');
  f.ptr = ptr ? { lat: r8(plat), lon: r8(plon), place_id: ID.test(String(ptr.place_id || '')) ? String(ptr.place_id) : '' } : null;
  f.ptr_name = ptr ? cut(d.ptr_name, 200) : '';
  f.ptr_name_ru = ptr ? cut(d.ptr_name_ru, 200) : '';
  f.ptr_name_man = !!(ptr && d.ptr_name_man);
  f.ptr_from = ptr && ID.test(String(d.ptr_from || '')) ? String(d.ptr_from) : '';
  const fin = v => { const x = num(v); return Number.isFinite(x) ? x : null; };
  f.ptr_o_lat = ptr ? fin(d.ptr_o_lat) : null;
  f.ptr_o_lon = ptr ? fin(d.ptr_o_lon) : null;
  f.ptr_az = ptr && fin(d.ptr_az) !== null ? r8(normAz(fin(d.ptr_az))) : null;
  f.ptr_dist = ptr && fin(d.ptr_dist) !== null && fin(d.ptr_dist) >= 0 ? fin(d.ptr_dist) : null;
  const azm = ptr ? num(d.ptr_az_man) : null;
  if (azm !== null && !Number.isFinite(azm)) throw fieldError('ptr_az_man', 'Азимут дұрыс емес.', 'Неверный азимут.');
  f.ptr_az_man = azm === null ? null : r3(normAz(azm));
  const dm = ptr ? num(d.ptr_dist_man) : null;
  if (dm !== null && (!Number.isFinite(dm) || dm < 0)) throw fieldError('ptr_dist_man', 'Қашықтық теріс болмауы керек.', 'Расстояние не может быть отрицательным.');
  f.ptr_dist_man = dm === null ? null : dm;
  return f;
}

class PlansStore {
  /** objects — plan_objects қабаты, plans — plans қабаты ({ load(), write(items) }). */
  constructor(objects, plans) { this.o = objects; this.p = plans; }

  objects() { return this.o.load().filter(x => x && typeof x === 'object' && x.id); }
  plans() { return this.p.load().filter(x => x && typeof x === 'object' && x.id); }

  save(raw) {
    let d;
    try { d = JSON.parse(String(raw || '')); } catch (e) { d = null; }
    const f = cleanObject(d);
    const items = this.objects();
    let id = String(d.id || '');
    const i = id ? items.findIndex(x => x.id === id) : -1;
    const old = i >= 0 ? items[i] : null;
    if (!old) id = crypto.randomBytes(8).toString('hex');
    const key = s => String(s).toLocaleLowerCase('kk');
    if (items.some(x => x.id !== id && x.mark_id === f.mark_id && key(x.num) === key(f.num)))
      throw fieldError('num', '№' + f.num + ' нысан бұл ескерткіште бар.', 'Объект №' + f.num + ' уже есть в этом памятнике.');
    const now = new Date().toISOString(), u = user();
    const rec = { id, ...f, created_at: old?.created_at || now, created_by: old?.created_by || u, updated_at: now, updated_by: u };
    if (old) items[i] = rec; else items.push(rec);
    this.o.write(items);
    return id;
  }

  remove(id) {
    const items = this.objects();
    const x = items.find(o => o.id === String(id || ''));
    if (!x) throw new Error(tx('Нысан табылмады.', 'Объект не найден.'));
    this.o.write(items.filter(o => o !== x));
    // Бағыттауыш осы нысаннан басталса — ескерткіштің негізгі координатасына қайтады
    const plans = this.plans();
    const p = plans.find(q => q.ptr_from === x.id);
    if (p) { p.ptr_from = ''; this.p.write(plans); }
  }

  savePlan(raw) {
    let d;
    try { d = JSON.parse(String(raw || '')); } catch (e) { d = null; }
    const f = cleanPlan(d);
    const items = this.plans();
    const i = items.findIndex(x => x.mark_id === f.mark_id);
    const old = i >= 0 ? items[i] : null;
    const now = new Date().toISOString(), u = user();
    const rec = { id: old?.id || crypto.randomBytes(8).toString('hex'), ...f,
      created_at: old?.created_at || now, created_by: old?.created_by || u, updated_at: now, updated_by: u };
    if (old) items[i] = rec; else items.push(rec);
    this.p.write(items);
    return rec.id;
  }

  async handle(request) {
    const op = new URL(request.url).searchParams.get('op') || '';
    const out = o => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    const all = () => ({ objects: this.objects(), plans: this.plans() });
    try {
      if (request.method !== 'POST') return out({ ok: false, error: tx('POST керек.', 'Нужен POST.') });
      const fd = await request.formData();
      if (op === 'list') return out({ ok: true, ...all() });
      if (op === 'save') { const id = this.save(fd.get('data')); return out({ ok: true, id, ...all() }); }
      if (op === 'delete') { this.remove(fd.get('id')); return out({ ok: true, ...all() }); }
      if (op === 'plan') { const id = this.savePlan(fd.get('data')); return out({ ok: true, id, ...all() }); }
      return out({ ok: false, error: tx('Белгісіз әрекет.', 'Неизвестное действие.') });
    } catch (e) {
      return out({ ok: false, error: e.message || String(e), field: e.field || '' });
    }
  }
}

module.exports = { PlansStore, cleanObject, cleanPlan, selfIntersects, KINDS };
