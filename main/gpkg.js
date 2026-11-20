/* Mura GIS жобасы — бір GeoPackage (.gpkg) файлы (OGC GeoPackage 1.4, SQLite).
   Файлды QGIS, ArcGIS, GDAL т.б. тікелей ашады: әр қабат — WGS 84 (EPSG:4326) кеңістіктік кестесі.
     marks    — ескерткіш белгілері (POINT);
     zones    — қорғау аймақтарының шекаралары (POLYGON);
     routes   — маршруттар (LINESTRING);
     imports  — KML/KMZ/GPX-тен импортталған, әлі белгіге айналмаған нүктелер (POINT);
     mura_project — жоба баптаулары (кілт → мән: атауы, облыс, аудан…), кеңістіктік емес кесте.
   Әр жазбаның толық мәліметі props (JSON) бағанында сақталады, ал негізгі атрибуттар мен геометрия — бөлек
   бағандарда: QGIS-те өзгертілсе, бағдарлама келесі оқығанда сол мәндерді алады.
   SQLite — Electron-ның ішіндегі node:sqlite (бөлек тәуелділік жоқ). */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const APP_ID = 0x47504B47;            // 'GPKG'
const GPKG_VERSION = 10400;           // 1.4.0
const SRS = 4326;
const FORMAT = 'mura-gis-project/1';

/* ======================= GeoPackage геометриясы (GPB заголовогы + WKB) ======================= */
const WKB = { Point: 1, LineString: 2, Polygon: 3 };

/** Геометрия → GeoPackage binary. coords: Point — [lon, lat]; LineString — [[lon, lat]…]; Polygon — [[[lon, lat]…]]. */
function encodeGeom(type, coords) {
  const flat = type === 'Point' ? [coords] : type === 'LineString' ? coords : coords.flat();
  const env = type === 'Point' ? null : bbox(flat);
  const wkbLen = 5 + (type === 'Point' ? 16 : type === 'LineString' ? 4 + 16 * coords.length : 4 + coords.reduce((s, r) => s + 4 + 16 * r.length, 0));
  const headLen = 8 + (env ? 32 : 0);
  const b = Buffer.alloc(headLen + wkbLen);
  b.write('GP', 0, 'ascii');
  b.writeUInt8(0, 2);                                  // нұсқа
  b.writeUInt8((env ? 1 : 0) << 1 | 1, 3);             // қамту түрі [minx, maxx, miny, maxy], little endian
  b.writeInt32LE(SRS, 4);
  let o = 8;
  if (env) for (const v of [env[0], env[2], env[1], env[3]]) { b.writeDoubleLE(v, o); o += 8; }
  b.writeUInt8(1, o); b.writeUInt32LE(WKB[type], o + 1); o += 5;
  const pt = p => { b.writeDoubleLE(p[0], o); b.writeDoubleLE(p[1], o + 8); o += 16; };
  if (type === 'Point') pt(coords);
  else if (type === 'LineString') { b.writeUInt32LE(coords.length, o); o += 4; coords.forEach(pt); }
  else { b.writeUInt32LE(coords.length, o); o += 4; for (const r of coords) { b.writeUInt32LE(r.length, o); o += 4; r.forEach(pt); } }
  return b;
}
function bbox(pts) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of pts) { if (p[0] < a) a = p[0]; if (p[1] < b) b = p[1]; if (p[0] > c) c = p[0]; if (p[1] > d) d = p[1]; }
  return [a, b, c, d];
}

/** GeoPackage binary → { type, coords } (Point / LineString / Polygon; Multi* — бірінші бөлігі). Оқылмаса — null. */
function decodeGeom(buf) {
  try {
    if (!buf || buf.length < 8) return null;
    const b = Buffer.from(buf.buffer ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) : buf);
    if (b.toString('ascii', 0, 2) !== 'GP') return null;
    const flags = b.readUInt8(3);
    if (flags & 0x10) return null;                      // бос геометрия
    const envLen = [0, 32, 48, 48, 64][(flags >> 1) & 7] || 0;
    return readWkb(b, 8 + envLen).g;
  } catch (e) { return null; }
}
function readWkb(b, o) {
  const le = b.readUInt8(o) === 1;
  const u32 = k => (le ? b.readUInt32LE(k) : b.readUInt32BE(k));
  const f64 = k => (le ? b.readDoubleLE(k) : b.readDoubleBE(k));
  let t = u32(o + 1); o += 5;
  let dims = 2;
  if (t & 0x80000000 || t & 0x40000000) { dims += (t & 0x80000000 ? 1 : 0) + (t & 0x40000000 ? 1 : 0); t &= 0xffff; }   // EWKB Z/M
  if (t > 1000) { dims += Math.floor(t / 1000) === 3 ? 2 : 1; t %= 1000; }                                                // ISO Z / M / ZM
  const pt = () => { const p = [f64(o), f64(o + 8)]; o += 8 * dims; return p; };
  const line = () => { const n = u32(o); o += 4; const a = []; for (let i = 0; i < n; i++) a.push(pt()); return a; };
  const poly = () => { const n = u32(o); o += 4; const a = []; for (let i = 0; i < n; i++) a.push(line()); return a; };
  if (t === 1) return { g: { type: 'Point', coords: pt() }, o };
  if (t === 2) return { g: { type: 'LineString', coords: line() }, o };
  if (t === 3) return { g: { type: 'Polygon', coords: poly() }, o };
  if (t >= 4 && t <= 6) {
    const n = u32(o); o += 4;
    if (!n) return { g: null, o };
    return readWkb(b, o);                                 // бірінші бөлігі жеткілікті
  }
  return { g: null, o };
}

/* ======================= Қабаттар ======================= */
const r8 = v => Math.round(v * 1e8) / 1e8;
const str = v => (v == null ? '' : String(v));

/** Әр қабат: геометрия түрі, атрибут бағандары (жазбадағы өрістің аты), жазба ↔ жол. */
const LAYERS = {
  marks: {
    title: 'Ескерткіштер', desc: 'Ескерткіш белгілері (Mura GIS)', geom: 'POINT',
    cols: ['name', 'period', 'oblast', 'district', 'place', 'type', 'category', 'status', 'note', 'created_at', 'created_by', 'updated_at', 'updated_by'],
    get: (r, c) => r[c],
    set: (r, c, v) => { r[c] = v; },
    toGeom: r => encodeGeom('Point', [+r.lon, +r.lat]),
    fromGeom: (r, g) => { if (g && g.type === 'Point') { r.lon = r8(g.coords[0]); r.lat = r8(g.coords[1]); } },
  },
  zones: {
    title: 'Қорғау аймақтары', desc: 'Ескерткіштердің қорғау аймақтарының шекаралары (Mura GIS)', geom: 'POLYGON',
    // fields.* — «Мәліметтер» панелінің өрістері; desc бағаны SQL кілт сөзімен шатаспас үшін description
    cols: ['name', 'gen', 'period', 'oblast', 'district', 'place', 'description', 'type', 'height', 'd1', 'd2', 'd3', 'created_at', 'created_by', 'updated_at', 'updated_by'],
    get: (r, c) => (c === 'name' || /_(at|by)$/.test(c) ? r[c] : (r.fields || {})[c === 'description' ? 'desc' : c]),
    set: (r, c, v) => {
      if (/_(at|by)$/.test(c)) { r[c] = v; return; }
      r.fields = r.fields || {};
      r.fields[c === 'description' ? 'desc' : c] = v;
      if (c === 'name') r.name = v;
      if (c === 'district') r.district = v;
    },
    toGeom: r => {
      const ring = (r.pts || []).map(p => [+p.lon, +p.lat]);
      if (ring.length) ring.push(ring[0]);
      return encodeGeom('Polygon', [ring]);
    },
    fromGeom: (r, g) => {
      if (!g || g.type !== 'Polygon' || !g.coords[0]) return;
      const ring = g.coords[0].slice();
      const a = ring[0], z = ring[ring.length - 1];
      if (ring.length > 1 && a[0] === z[0] && a[1] === z[1]) ring.pop();
      r.pts = ring.map(p => ({ lat: r8(p[1]), lon: r8(p[0]) }));
    },
  },
  routes: {
    title: 'Маршруттар', desc: 'Далаға шығу маршруттары (Mura GIS)', geom: 'LINESTRING',
    cols: ['name', 'a_name', 'b_name', 'vehicle', 'season', 'checked', 'note', 'created_at', 'created_by', 'updated_at', 'updated_by'],
    get: (r, c) => r[c],
    set: (r, c, v) => { r[c] = v; },
    toGeom: r => encodeGeom('LineString', (r.pts || []).map(p => [+p[1], +p[0]])),
    fromGeom: (r, g) => { if (g && g.type === 'LineString') r.pts = g.coords.map(p => [Math.round(p[1] * 1e7) / 1e7, Math.round(p[0] * 1e7) / 1e7]); },
  },
  imports: {
    title: 'Импортталған нүктелер', desc: 'KML, KMZ, GPX файлдарынан импортталған нүктелер (Mura GIS)', geom: 'POINT',
    cols: ['name', 'description', 'file', 'folder', 'imported_at'],
    get: (r, c) => r[c === 'description' ? 'desc' : c],
    set: (r, c, v) => { r[c === 'description' ? 'desc' : c] = v; },
    toGeom: r => encodeGeom('Point', [+r.lon, +r.lat]),
    fromGeom: (r, g) => { if (g && g.type === 'Point') { r.lon = r8(g.coords[0]); r.lat = r8(g.coords[1]); } },
  },
};

/* ======================= Жоба ======================= */
class Project {
  /** Бар .gpkg файлын ашу (Mura GIS кестелері жоқ болса — қосылады). */
  static open(file) {
    if (!fs.existsSync(file)) throw new Error('Файл табылмады: ' + file);
    const p = new Project(file);
    try {
      const ok = p.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'gpkg_contents'").get();
      if (!ok) throw new Error('Бұл файл GeoPackage емес (gpkg_contents кестесі жоқ).');
      p.ensure();
      if (!p.meta().name) p.setMeta({ name: path.basename(file, path.extname(file)) });
    } catch (e) { p.close(); throw e; }
    return p;
  }

  /** Жаңа жоба файлын құру. Бар файл болса — алдымен өшіріледі (сақтау терезесі қайта жазуды сұрап қойған). */
  static create(file, meta) {
    for (const f of [file, file + '-journal', file + '-wal', file + '-shm']) fs.rmSync(f, { force: true });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const p = new Project(file);
    try {
      p.db.exec('PRAGMA application_id = ' + APP_ID + '; PRAGMA user_version = ' + GPKG_VERSION + ';');
      p.ensure();
      p.setMeta({ format: FORMAT, created_at: new Date().toISOString(), ...meta });
    } catch (e) { p.close(); throw e; }
    return p;
  }

  constructor(file) {
    this.file = path.resolve(file);
    this.db = new DatabaseSync(this.file);
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  close() { try { this.db.close(); } catch (e) { /* бұрын жабылған */ } }

  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); this.db.exec('COMMIT'); return r; } catch (e) { try { this.db.exec('ROLLBACK'); } catch (e2) { /* елемейміз */ } throw e; }
  }

  /** GeoPackage-тің міндетті кестелері және Mura GIS қабаттары (бар болса — тимейді). */
  ensure() {
    const db = this.db;
    this.tx(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS gpkg_spatial_ref_sys (
          srs_name TEXT NOT NULL, srs_id INTEGER NOT NULL PRIMARY KEY, organization TEXT NOT NULL,
          organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT);
        CREATE TABLE IF NOT EXISTS gpkg_contents (
          table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT UNIQUE, description TEXT DEFAULT '',
          last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
          min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER,
          CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id));
        CREATE TABLE IF NOT EXISTS gpkg_geometry_columns (
          table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL,
          z TINYINT NOT NULL, m TINYINT NOT NULL,
          CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name),
          CONSTRAINT uk_gc_table_name UNIQUE (table_name),
          CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name),
          CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys (srs_id));
      `);
      const srs = db.prepare('INSERT OR IGNORE INTO gpkg_spatial_ref_sys (srs_name, srs_id, organization, organization_coordsys_id, definition, description) VALUES (?, ?, ?, ?, ?, ?)');
      srs.run('Undefined cartesian SRS', -1, 'NONE', -1, 'undefined', 'undefined cartesian coordinate reference system');
      srs.run('Undefined geographic SRS', 0, 'NONE', 0, 'undefined', 'undefined geographic coordinate reference system');
      srs.run('WGS 84 geodetic', SRS, 'EPSG', SRS,
        'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],' +
        'PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]]',
        'longitude/latitude coordinates in decimal degrees on the WGS 84 spheroid');

      for (const [t, L] of Object.entries(LAYERS)) {
        db.exec('CREATE TABLE IF NOT EXISTS "' + t + '" (fid INTEGER PRIMARY KEY AUTOINCREMENT, geom ' + L.geom + ', uid TEXT UNIQUE, ' +
          L.cols.map(c => '"' + c + '" TEXT').join(', ') + ', props TEXT)');
        // Ескі нұсқамен құрылған кестеде жаңа баған болмаса — қосамыз
        const have = new Set(db.prepare('PRAGMA table_info("' + t + '")').all().map(c => c.name));
        for (const c of L.cols.concat('uid', 'props')) if (!have.has(c)) db.exec('ALTER TABLE "' + t + '" ADD COLUMN "' + c + '" TEXT');
        db.prepare("INSERT OR IGNORE INTO gpkg_contents (table_name, data_type, identifier, description, srs_id) VALUES (?, 'features', ?, ?, ?)").run(t, L.title, L.desc, SRS);
        db.prepare('INSERT OR IGNORE INTO gpkg_geometry_columns (table_name, column_name, geometry_type_name, srs_id, z, m) VALUES (?, ?, ?, ?, 0, 0)').run(t, 'geom', L.geom, SRS);
      }
      db.exec('CREATE TABLE IF NOT EXISTS mura_project (key TEXT PRIMARY KEY NOT NULL, value TEXT)');
      db.prepare("INSERT OR IGNORE INTO gpkg_contents (table_name, data_type, identifier, description) VALUES ('mura_project', 'attributes', 'Жоба баптаулары', 'Mura GIS жобасының баптаулары')").run();
    });
  }

  /* ---------- Баптаулар ---------- */
  meta() {
    const o = {};
    for (const r of this.db.prepare('SELECT key, value FROM mura_project').all()) o[r.key] = r.value == null ? '' : String(r.value);
    return o;
  }
  setMeta(o) {
    const st = this.db.prepare('INSERT INTO mura_project (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    this.tx(() => { for (const [k, v] of Object.entries(o)) st.run(String(k), str(v)); });
  }

  /* ---------- Қабаттың жазбалары ---------- */
  load(t) {
    const L = LAYERS[t];
    const rows = this.db.prepare('SELECT * FROM "' + t + '" ORDER BY fid').all();
    const out = [];
    for (const row of rows) {
      let r = {};
      try { r = JSON.parse(row.props || '{}') || {}; } catch (e) { r = {}; }
      if (typeof r !== 'object' || Array.isArray(r)) r = {};
      for (const c of L.cols) if (row[c] != null) L.set(r, c, String(row[c]));
      L.fromGeom(r, decodeGeom(row.geom));
      r.id = row.uid || r.id || 'f' + row.fid;
      out.push(r);
    }
    return out;
  }

  /** Қабатты толық ауыстыру (бір транзакцияда: қате болса, бұрынғы күйі қалады). */
  write(t, items) {
    const L = LAYERS[t];
    const cols = ['geom', 'uid', ...L.cols, 'props'];
    const ins = this.db.prepare('INSERT INTO "' + t + '" (' + cols.map(c => '"' + c + '"').join(', ') + ') VALUES (' + cols.map(() => '?').join(', ') + ')');
    this.tx(() => {
      this.db.exec('DELETE FROM "' + t + '"');
      const all = [];
      for (const r of items) {
        const g = L.toGeom(r);
        ins.run(g, str(r.id), ...L.cols.map(c => str(L.get(r, c))), JSON.stringify(r));
        const dg = decodeGeom(g);
        if (dg) all.push(...(dg.type === 'Point' ? [dg.coords] : dg.type === 'LineString' ? dg.coords : dg.coords.flat()));
      }
      const e = all.length ? bbox(all) : [null, null, null, null];
      this.db.prepare("UPDATE gpkg_contents SET last_change = strftime('%Y-%m-%dT%H:%M:%fZ','now'), min_x = ?, min_y = ?, max_x = ?, max_y = ? WHERE table_name = ?").run(...e, t);
    });
  }

  /** Store/MarksStore/RoutesStore үшін бір қабаттың интерфейсі. */
  table(t) {
    return { load: () => this.load(t), write: items => this.write(t, items) };
  }

  counts() {
    const o = {};
    for (const t of Object.keys(LAYERS)) o[t] = this.db.prepare('SELECT count(*) AS n FROM "' + t + '"').get().n;
    return o;
  }
}

/** Жоба ашылмаған кездегі қабат: тізім бос, жазу — қате. */
const noTable = { load: () => [], write: () => { throw new Error('Алдымен жобаны ашыңыз не жаңа жоба құрыңыз.'); } };

module.exports = { Project, LAYERS, encodeGeom, decodeGeom, noTable };
