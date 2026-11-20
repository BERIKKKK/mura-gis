package io.github.berikkkk.muragis.core.gpkg

import io.github.berikkkk.muragis.core.db.SqlDb
import io.github.berikkkk.muragis.core.db.q
import io.github.berikkkk.muragis.core.geo.LatLon
import io.github.berikkkk.muragis.core.io.FormatException
import io.github.berikkkk.muragis.core.io.ImportedMonument
import io.github.berikkkk.muragis.core.io.ImportedRoute
import io.github.berikkkk.muragis.core.io.MONUMENT_TEXT_FIELDS
import io.github.berikkkk.muragis.core.io.MonumentGeoJson
import io.github.berikkkk.muragis.core.io.RouteFormats
import io.github.berikkkk.muragis.core.model.Ids
import io.github.berikkkk.muragis.core.model.Lang
import io.github.berikkkk.muragis.core.model.Monument
import io.github.berikkkk.muragis.core.model.Route
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

/**
 * Mura GIS жобасы (.gpkg) — жұмыс үстеліндегі main/gpkg.js пішімі (OGC GeoPackage 1.4, WGS 84).
 * Android тек marks және routes қабаттарын жазады/оқиды; zones және imports кестелері жұмыс үстелі ашуы үшін бос құрылады
 * (қорғау аймағы Android нұсқасына кірмейді).
 */
object MuraProject {
    private const val APP_ID = 0x47504B47
    private const val GPKG_VERSION = 10400
    const val FORMAT = "mura-gis-project/1"

    private class Layer(val title: String, val desc: String, val geom: String, val cols: List<String>)

    /** Бағандар — жұмыс үстеліндегі LAYERS-пен бірдей (рет те). */
    private val LAYERS = linkedMapOf(
        "marks" to Layer("Ескерткіштер", "Ескерткіш белгілері (Mura GIS)", "POINT",
            listOf("name", "period", "oblast", "district", "place", "type", "category", "status", "note", "created_at", "created_by", "updated_at", "updated_by")),
        "zones" to Layer("Қорғау аймақтары", "Ескерткіштердің қорғау аймақтарының шекаралары (Mura GIS)", "POLYGON",
            listOf("name", "gen", "period", "oblast", "district", "place", "description", "type", "height", "d1", "d2", "d3", "created_at", "created_by", "updated_at", "updated_by")),
        "routes" to Layer("Маршруттар", "Далаға шығу маршруттары (Mura GIS)", "LINESTRING",
            listOf("name", "a_name", "b_name", "vehicle", "season", "checked", "note", "created_at", "created_by", "updated_at", "updated_by")),
        "imports" to Layer("Импортталған нүктелер", "KML, KMZ, GPX файлдарынан импортталған нүктелер (Mura GIS)", "POINT",
            listOf("name", "description", "file", "folder", "imported_at")),
    )

    private const val WGS84_WKT = "GEOGCS[\"WGS 84\",DATUM[\"WGS_1984\",SPHEROID[\"WGS 84\",6378137,298.257223563,AUTHORITY[\"EPSG\",\"7030\"]],AUTHORITY[\"EPSG\",\"6326\"]]," +
        "PRIMEM[\"Greenwich\",0,AUTHORITY[\"EPSG\",\"8901\"]],UNIT[\"degree\",0.0174532925199433,AUTHORITY[\"EPSG\",\"9122\"]],AUTHORITY[\"EPSG\",\"4326\"]]"

    fun isGeoPackage(db: SqlDb) = db.tableExists("gpkg_contents")
    fun hasMuraLayers(db: SqlDb) = db.tableExists("marks") || db.tableExists("routes")

    /** GeoPackage-тің міндетті кестелері және Mura GIS қабаттары (жұмыс үстеліндегі ensure()). */
    fun ensure(db: SqlDb) = db.tx {
        db.exec("""CREATE TABLE IF NOT EXISTS gpkg_spatial_ref_sys (
            srs_name TEXT NOT NULL, srs_id INTEGER NOT NULL PRIMARY KEY, organization TEXT NOT NULL,
            organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT)""")
        db.exec("""CREATE TABLE IF NOT EXISTS gpkg_contents (
            table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT UNIQUE, description TEXT DEFAULT '',
            last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER,
            CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id))""")
        db.exec("""CREATE TABLE IF NOT EXISTS gpkg_geometry_columns (
            table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL,
            z TINYINT NOT NULL, m TINYINT NOT NULL,
            CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name),
            CONSTRAINT uk_gc_table_name UNIQUE (table_name),
            CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name),
            CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys (srs_id))""")
        val srs = "INSERT OR IGNORE INTO gpkg_spatial_ref_sys (srs_name, srs_id, organization, organization_coordsys_id, definition, description) VALUES (?, ?, ?, ?, ?, ?)"
        db.exec(srs, listOf("Undefined cartesian SRS", -1L, "NONE", -1L, "undefined", "undefined cartesian coordinate reference system"))
        db.exec(srs, listOf("Undefined geographic SRS", 0L, "NONE", 0L, "undefined", "undefined geographic coordinate reference system"))
        db.exec(srs, listOf("WGS 84 geodetic", 4326L, "EPSG", 4326L, WGS84_WKT, "longitude/latitude coordinates in decimal degrees on the WGS 84 spheroid"))
        for ((t, l) in LAYERS) {
            db.exec("CREATE TABLE IF NOT EXISTS ${q(t)} (fid INTEGER PRIMARY KEY AUTOINCREMENT, geom ${l.geom}, uid TEXT UNIQUE, " +
                l.cols.joinToString(", ") { q(it) + " TEXT" } + ", props TEXT)")
            val have = db.columnsOf(t).toSet()
            for (c in l.cols + listOf("uid", "props")) if (c !in have) db.exec("ALTER TABLE ${q(t)} ADD COLUMN ${q(c)} TEXT")
            db.exec("INSERT OR IGNORE INTO gpkg_contents (table_name, data_type, identifier, description, srs_id) VALUES (?, 'features', ?, ?, ?)", listOf(t, l.title, l.desc, 4326L))
            db.exec("INSERT OR IGNORE INTO gpkg_geometry_columns (table_name, column_name, geometry_type_name, srs_id, z, m) VALUES (?, 'geom', ?, ?, 0, 0)", listOf(t, l.geom, 4326L))
        }
        db.exec("CREATE TABLE IF NOT EXISTS mura_project (key TEXT PRIMARY KEY NOT NULL, value TEXT)")
        db.exec("INSERT OR IGNORE INTO gpkg_contents (table_name, data_type, identifier, description) VALUES ('mura_project', 'attributes', 'Жоба баптаулары', 'Mura GIS жобасының баптаулары')")
    }

    /** Жаңа (бос) файлда жоба құру. */
    fun create(db: SqlDb, meta: Map<String, String>) {
        db.exec("PRAGMA application_id = $APP_ID")
        db.exec("PRAGMA user_version = $GPKG_VERSION")
        ensure(db)
        setMeta(db, mapOf("format" to FORMAT, "created_at" to Ids.now()) + meta)
    }

    fun meta(db: SqlDb): Map<String, String> =
        if (!db.tableExists("mura_project")) emptyMap()
        else db.query("SELECT key, value FROM mura_project") { (it.string("key") ?: "") to (it.string("value") ?: "") }.toMap()

    fun setMeta(db: SqlDb, m: Map<String, String>) = db.tx {
        for ((k, v) in m) db.exec("INSERT INTO mura_project (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", listOf(k, v))
    }

    private fun writeLayer(db: SqlDb, t: String, rows: List<Triple<ByteArray, String, Map<String, String>>>, props: List<String>, envPts: List<DoubleArray>) {
        val l = LAYERS.getValue(t)
        val cols = listOf("geom", "uid") + l.cols + listOf("props")
        val sql = "INSERT INTO ${q(t)} (" + cols.joinToString(", ") { q(it) } + ") VALUES (" + cols.joinToString(", ") { "?" } + ")"
        db.tx {
            db.exec("DELETE FROM ${q(t)}")
            rows.forEachIndexed { i, (geom, uid, vals) ->
                db.exec(sql, listOf<Any?>(geom, uid) + l.cols.map { vals[it] ?: "" } + listOf(props[i]))
            }
            val e: List<Any?> = if (envPts.isEmpty()) listOf(null, null, null, null)
            else listOf(envPts.minOf { it[0] }, envPts.minOf { it[1] }, envPts.maxOf { it[0] }, envPts.maxOf { it[1] })
            db.exec("UPDATE gpkg_contents SET last_change = strftime('%Y-%m-%dT%H:%M:%fZ','now'), min_x = ?, min_y = ?, max_x = ?, max_y = ? WHERE table_name = ?", e + t)
        }
    }

    /** Ескерткіштерді marks қабатына жазу: бағандарда — [lang] тіліндегі мән (жұмыс үстелі көрсетеді), props-та — екі тіл. */
    fun writeMarks(db: SqlDb, list: List<Monument>, lang: Lang) {
        val rows = ArrayList<Triple<ByteArray, String, Map<String, String>>>()
        val props = ArrayList<String>()
        for (m in list) {
            val p = MonumentGeoJson.properties(m, lang)
            val vals = HashMap<String, String>()
            for ((k, f) in MONUMENT_TEXT_FIELDS) vals[k] = f(m).display(lang)
            vals["type"] = m.type.code; vals["category"] = m.category.code; vals["status"] = m.status.code
            vals["created_at"] = m.createdAt; vals["created_by"] = m.createdBy; vals["updated_at"] = m.updatedAt; vals["updated_by"] = m.updatedBy
            rows += Triple(GpkgGeometry.encode(Geom.Point(m.lon, m.lat)), m.id, vals)
            // Жұмыс үстеліндегі жазба пішімі: id, lat, lon + өрістер
            props += JsonObject(p + mapOf("updated_by" to JsonPrimitive(m.updatedBy), "created_by" to JsonPrimitive(m.createdBy)))
                .let { io.github.berikkkk.muragis.core.io.JSON.encodeToString(JsonElement.serializer(), it) }
        }
        writeLayer(db, "marks", rows, props, list.map { doubleArrayOf(it.lon, it.lat) })
    }

    fun writeRoutes(db: SqlDb, list: List<Route>, lang: Lang) {
        val rows = ArrayList<Triple<ByteArray, String, Map<String, String>>>()
        val props = ArrayList<String>()
        for (r in list) {
            val vals = mapOf(
                "name" to r.name.display(lang), "a_name" to r.aName.display(lang), "b_name" to r.bName.display(lang),
                "vehicle" to r.vehicle.code, "season" to r.season.code, "checked" to r.checked, "note" to r.note.display(lang),
                "created_at" to r.createdAt, "created_by" to r.createdBy, "updated_at" to r.updatedAt, "updated_by" to r.updatedBy,
            )
            rows += Triple(GpkgGeometry.encode(Geom.Line(r.points.map { doubleArrayOf(it.lon, it.lat) })), r.id, vals)
            val p = buildJsonObject {
                RouteFormats.properties(r, lang).forEach { (k, v) -> put(k, v) }
                put("id", r.id)
                vals.forEach { (k, v) -> put(k, v) }
                put("pts", buildJsonArray { r.points.forEach { add(buildJsonArray { add(JsonPrimitive(it.lat)); add(JsonPrimitive(it.lon)) }) } })
            }
            props += io.github.berikkkk.muragis.core.io.JSON.encodeToString(JsonElement.serializer(), p)
        }
        writeLayer(db, "routes", rows, props, list.flatMap { r -> r.points.map { doubleArrayOf(it.lon, it.lat) } })
    }

    /** Толық экспорт: жаңа файлға (бос дерекқорға) жоба. */
    fun export(db: SqlDb, monuments: List<Monument>, routes: List<Route>, lang: Lang, projectName: String) {
        create(db, mapOf("name" to projectName, "app" to "Mura GIS Android", "data_lang" to lang.code))
        writeMarks(db, monuments, lang)
        writeRoutes(db, routes, lang)
    }

    /**
     * Жолды оқу: props (JSON) + бағандар (жұмыс үстеліндегі load()). Бағандағы мән props-тағы [data_lang] тіліндегі
     * мәннен өзгеше болса (мыс. QGIS-те өңделсе) — сол тілдің мәні ретінде алынады.
     */
    private fun rowProps(row: io.github.berikkkk.muragis.core.db.Row, cols: List<String>): MutableMap<String, JsonElement> {
        val raw = row.string("props")
        val base: MutableMap<String, JsonElement> = runCatching { io.github.berikkkk.muragis.core.io.JSON.parseToJsonElement(raw ?: "{}").jsonObject.toMutableMap() }
            .getOrElse { HashMap() }
        val dataLang = (base["data_lang"] as? JsonPrimitive)?.content?.let { Lang.of(it) }
        val have = row.columns.toSet()
        for (c in cols) {
            if (c !in have || row.isNull(c)) continue
            val v = row.string(c) ?: continue
            val old = (base[c] as? JsonPrimitive)?.content
            base[c] = JsonPrimitive(v)
            if (dataLang != null && old != null && old != v) {
                val key = when (c) { "a_name" -> "from"; "b_name" -> "to"; else -> c } + "_" + dataLang.code
                if (base.containsKey(key)) base[key] = JsonPrimitive(v)
            }
        }
        return base
    }

    fun readMarks(db: SqlDb, importLang: Lang): List<ImportedMonument> {
        if (!db.tableExists("marks")) return emptyList()
        val cols = LAYERS.getValue("marks").cols
        val out = ArrayList<ImportedMonument>()
        db.forEach("SELECT * FROM marks ORDER BY fid") { row ->
            val g = GpkgGeometry.decode(row.blob("geom")) as? Geom.Point ?: return@forEach
            val p = rowProps(row, cols)
            row.string("uid")?.let { p["id"] = JsonPrimitive(it) }
            out += MonumentGeoJson.fromProperties(JsonObject(p), g.y, g.x, importLang)
        }
        return out
    }

    fun readRoutes(db: SqlDb, importLang: Lang): List<ImportedRoute> {
        if (!db.tableExists("routes")) return emptyList()
        val cols = LAYERS.getValue("routes").cols
        val out = ArrayList<ImportedRoute>()
        db.forEach("SELECT * FROM routes ORDER BY fid") { row ->
            val g = GpkgGeometry.decode(row.blob("geom")) as? Geom.Line ?: return@forEach
            if (g.pts.size < 2) return@forEach
            val p = rowProps(row, cols)
            p["mura_id"] = JsonPrimitive(row.string("uid") ?: (p["id"] as? JsonPrimitive)?.content ?: "")
            p.remove("pts")
            out += RouteFormats.fromProperties(JsonObject(p), g.pts.map { LatLon(it[1], it[0]) }, importLang)
        }
        return out
    }

    fun requireProject(db: SqlDb) {
        if (!isGeoPackage(db)) throw FormatException("gpkg_not", "Not a GeoPackage")
        if (!hasMuraLayers(db)) throw FormatException("gpkg_no_layers", "No marks/routes layers")
    }
}
