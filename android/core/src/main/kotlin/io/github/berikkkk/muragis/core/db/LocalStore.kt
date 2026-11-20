package io.github.berikkkk.muragis.core.db

import io.github.berikkkk.muragis.core.io.ImportedMonument
import io.github.berikkkk.muragis.core.io.ImportedRoute
import io.github.berikkkk.muragis.core.model.Category
import io.github.berikkkk.muragis.core.model.Ids
import io.github.berikkkk.muragis.core.model.Lang
import io.github.berikkkk.muragis.core.model.Localized
import io.github.berikkkk.muragis.core.model.Monument
import io.github.berikkkk.muragis.core.model.MonumentType
import io.github.berikkkk.muragis.core.model.Route
import io.github.berikkkk.muragis.core.model.RoutePoint
import io.github.berikkkk.muragis.core.model.Season
import io.github.berikkkk.muragis.core.model.Status
import io.github.berikkkk.muragis.core.model.Validation
import io.github.berikkkk.muragis.core.model.Vehicle

/**
 * Құрылғыдағы негізгі дерекқор (SQLite): ескерткіштер, маршруттар, карта қабаттары, жүктеу тапсырмалары.
 * Әр тілдің мәні — бөлек баған (name_kk, name_ru …), сондықтан бір тілдің мәні екіншісінің үстінен жазылмайды.
 * Болашақ синхрондауға дайындық: тұрақты 16 таңбалы id, updated_at (ISO, UTC), жұмсақ өшіру (deleted = 1, «tombstone»).
 */
class LocalStore(val db: SqlDb, private val user: String = "") {

    companion object {
        const val SCHEMA_VERSION = 1
        private val LOC = listOf("name", "period", "oblast", "district", "place", "note")
        private val ROUTE_LOC = listOf("name", "a_name", "b_name", "note")
    }

    init {
        migrate()
    }

    private fun migrate() {
        val v = db.scalarLong("PRAGMA user_version") ?: 0L
        if (v >= SCHEMA_VERSION) return
        db.tx {
            if (v < 1) {
                db.exec("""CREATE TABLE IF NOT EXISTS monuments (
                    id TEXT PRIMARY KEY NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL,
                    ${LOC.joinToString(", ") { "${it}_kk TEXT NOT NULL DEFAULT '', ${it}_ru TEXT NOT NULL DEFAULT ''" }},
                    type TEXT NOT NULL, category TEXT NOT NULL, status TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL DEFAULT '', updated_by TEXT NOT NULL DEFAULT '',
                    extra TEXT NOT NULL DEFAULT '', deleted INTEGER NOT NULL DEFAULT 0)""")
                db.exec("CREATE INDEX IF NOT EXISTS monuments_updated ON monuments(updated_at)")
                db.exec("""CREATE TABLE IF NOT EXISTS routes (
                    id TEXT PRIMARY KEY NOT NULL,
                    ${ROUTE_LOC.joinToString(", ") { "${it}_kk TEXT NOT NULL DEFAULT '', ${it}_ru TEXT NOT NULL DEFAULT ''" }},
                    vehicle TEXT NOT NULL, season TEXT NOT NULL, checked TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL DEFAULT '', updated_by TEXT NOT NULL DEFAULT '',
                    extra TEXT NOT NULL DEFAULT '', deleted INTEGER NOT NULL DEFAULT 0)""")
                db.exec("""CREATE TABLE IF NOT EXISTS route_points (
                    route_id TEXT NOT NULL, seq INTEGER NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, monument_id TEXT,
                    PRIMARY KEY (route_id, seq))""")
                db.exec("""CREATE TABLE IF NOT EXISTS map_layers (
                    id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, format TEXT NOT NULL, title TEXT NOT NULL,
                    url TEXT NOT NULL DEFAULT '', path TEXT NOT NULL DEFAULT '', source_id TEXT NOT NULL DEFAULT '',
                    min_zoom INTEGER NOT NULL DEFAULT 0, max_zoom INTEGER NOT NULL DEFAULT 19, bounds TEXT NOT NULL DEFAULT '',
                    attribution TEXT NOT NULL DEFAULT '', license TEXT NOT NULL DEFAULT '', tile_format TEXT NOT NULL DEFAULT '',
                    tms INTEGER NOT NULL DEFAULT 0, opacity REAL NOT NULL DEFAULT 1, visible INTEGER NOT NULL DEFAULT 0,
                    role TEXT NOT NULL DEFAULT 'base', sort INTEGER NOT NULL DEFAULT 0, size_bytes INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT '')""")
                db.exec("""CREATE TABLE IF NOT EXISTS download_jobs (
                    id TEXT PRIMARY KEY NOT NULL, source_id TEXT NOT NULL, layer_id TEXT NOT NULL, title TEXT NOT NULL,
                    bounds TEXT NOT NULL, min_zoom INTEGER NOT NULL, max_zoom INTEGER NOT NULL,
                    total INTEGER NOT NULL DEFAULT 0, done INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0,
                    bytes INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL, error TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '')""")
                db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL DEFAULT '')")
            }
            db.exec("PRAGMA user_version = $SCHEMA_VERSION")
        }
    }

    /* ======================= Ескерткіштер ======================= */

    private fun monumentFrom(r: Row): Monument {
        fun loc(f: String) = Localized(r.string(f + "_kk") ?: "", r.string(f + "_ru") ?: "")
        return Monument(
            id = r.string("id")!!, lat = r.double("lat")!!, lon = r.double("lon")!!,
            name = loc("name"), period = loc("period"), oblast = loc("oblast"), district = loc("district"),
            place = loc("place"), note = loc("note"),
            type = MonumentType.of(r.string("type")), category = Category.of(r.string("category")), status = Status.of(r.string("status")),
            createdAt = r.string("created_at") ?: "", createdBy = r.string("created_by") ?: "",
            updatedAt = r.string("updated_at") ?: "", updatedBy = r.string("updated_by") ?: "",
            extra = r.string("extra") ?: "",
        )
    }

    fun monuments(): List<Monument> = db.query("SELECT * FROM monuments WHERE deleted = 0", emptyList(), ::monumentFrom)

    fun monument(id: String): Monument? = db.query("SELECT * FROM monuments WHERE id = ? AND deleted = 0", listOf(id), ::monumentFrom).firstOrNull()

    fun monumentCount(): Long = db.scalarLong("SELECT count(*) FROM monuments WHERE deleted = 0") ?: 0L

    private fun writeMonument(m: Monument) {
        val cols = listOf("id", "lat", "lon") + LOC.flatMap { listOf(it + "_kk", it + "_ru") } +
            listOf("type", "category", "status", "created_at", "created_by", "updated_at", "updated_by", "extra", "deleted")
        val locVals = listOf(m.name, m.period, m.oblast, m.district, m.place, m.note).flatMap { listOf(it.kk, it.ru) }
        val vals = listOf<Any?>(m.id, m.lat, m.lon) + locVals +
            listOf(m.type.code, m.category.code, m.status.code, m.createdAt, m.createdBy, m.updatedAt, m.updatedBy, m.extra, 0L)
        db.exec("INSERT OR REPLACE INTO monuments (" + cols.joinToString(",") + ") VALUES (" + cols.joinToString(",") { "?" } + ")", vals)
    }

    /** Сақтау (жаңа не бар жазба). Тексеріледі; created_* сақталады, updated_* жаңарады. */
    fun saveMonument(m: Monument): Monument {
        val c = Validation.clean(m)
        val now = Ids.now()
        val old = db.query("SELECT created_at, created_by FROM monuments WHERE id = ?", listOf(c.id)) { (it.string("created_at") ?: "") to (it.string("created_by") ?: "") }.firstOrNull()
        val rec = c.copy(
            createdAt = old?.first?.ifEmpty { null } ?: c.createdAt.ifEmpty { now },
            createdBy = old?.second?.ifEmpty { null } ?: c.createdBy.ifEmpty { user },
            updatedAt = now, updatedBy = user,
        )
        db.tx { writeMonument(rec) }
        return rec
    }

    /** Жұмсақ өшіру (синхрондау үшін «tombstone» қалады). */
    fun deleteMonuments(ids: Collection<String>): Int {
        if (ids.isEmpty()) return 0
        val now = Ids.now()
        var n = 0
        db.tx {
            for (id in ids) {
                n += (db.scalarLong("SELECT count(*) FROM monuments WHERE id = ? AND deleted = 0", listOf(id)) ?: 0L).toInt()
                db.exec("UPDATE monuments SET deleted = 1, updated_at = ?, updated_by = ? WHERE id = ?", listOf(now, user, id))
            }
        }
        return n
    }

    data class ImportResult(val added: Int, val updated: Int, val skipped: Int)

    /**
     * Импортталғанды біріктіру (жұмыс үстеліндегі importMany ережесі: id бірдей болса — жаңасы қалады).
     * Тек файлда бар тілдің ([ImportedMonument.langs]) мәтіндері ауыстырылады; екінші тілдің мәні сақталады.
     */
    fun importMonuments(list: List<ImportedMonument>): ImportResult {
        var added = 0; var updated = 0; var skipped = 0
        val now = Ids.now()
        db.tx {
            for (im in list) {
                val inc = try { Validation.clean(im.monument) } catch (e: Exception) { skipped++; continue }
                val local = if (im.hasId) db.query("SELECT * FROM monuments WHERE id = ?", listOf(inc.id), ::monumentFrom).firstOrNull() else null
                val stamp = inc.updatedAt.ifEmpty { now }
                if (local == null) {
                    writeMonument(inc.copy(createdAt = inc.createdAt.ifEmpty { now }, updatedAt = stamp, updatedBy = inc.updatedBy))
                    added++
                    continue
                }
                if (stamp <= local.updatedAt) { skipped++; continue }
                fun merge(a: Localized, b: Localized): Localized {
                    var r = a
                    for (l in im.langs) r = r.with(l, b[l])
                    return r
                }
                val rec = local.copy(
                    lat = inc.lat, lon = inc.lon, type = inc.type, category = inc.category, status = inc.status,
                    name = merge(local.name, inc.name).let { if (it.isBlank()) local.name else it },
                    period = merge(local.period, inc.period), oblast = merge(local.oblast, inc.oblast),
                    district = merge(local.district, inc.district), place = merge(local.place, inc.place), note = merge(local.note, inc.note),
                    updatedAt = stamp, updatedBy = inc.updatedBy, extra = inc.extra.ifEmpty { local.extra },
                )
                writeMonument(rec)
                updated++
            }
        }
        return ImportResult(added, updated, skipped)
    }

    /* ======================= Маршруттар ======================= */

    private fun routeFrom(r: Row, pts: List<RoutePoint>): Route {
        fun loc(f: String) = Localized(r.string(f + "_kk") ?: "", r.string(f + "_ru") ?: "")
        return Route(
            id = r.string("id")!!, name = loc("name"), aName = loc("a_name"), bName = loc("b_name"), note = loc("note"),
            vehicle = Vehicle.of(r.string("vehicle")), season = Season.of(r.string("season")), checked = r.string("checked") ?: "",
            points = pts,
            createdAt = r.string("created_at") ?: "", createdBy = r.string("created_by") ?: "",
            updatedAt = r.string("updated_at") ?: "", updatedBy = r.string("updated_by") ?: "",
            extra = r.string("extra") ?: "",
        )
    }

    private fun pointsOf(id: String) = db.query("SELECT lat, lon, monument_id FROM route_points WHERE route_id = ? ORDER BY seq", listOf(id)) {
        RoutePoint(it.double("lat")!!, it.double("lon")!!, it.string("monument_id"))
    }

    fun routes(): List<Route> {
        val pts = HashMap<String, MutableList<RoutePoint>>()
        db.forEach("SELECT route_id, lat, lon, monument_id FROM route_points ORDER BY route_id, seq") {
            pts.getOrPut(it.string("route_id")!!) { ArrayList() } += RoutePoint(it.double("lat")!!, it.double("lon")!!, it.string("monument_id"))
        }
        return db.query("SELECT * FROM routes WHERE deleted = 0") { routeFrom(it, pts[it.string("id")] ?: emptyList()) }
    }

    fun route(id: String): Route? = db.query("SELECT * FROM routes WHERE id = ? AND deleted = 0", listOf(id)) { routeFrom(it, emptyList()) }
        .firstOrNull()?.let { it.copy(points = pointsOf(id)) }

    private fun writeRoute(r: Route) {
        val cols = listOf("id") + ROUTE_LOC.flatMap { listOf(it + "_kk", it + "_ru") } +
            listOf("vehicle", "season", "checked", "created_at", "created_by", "updated_at", "updated_by", "extra", "deleted")
        val vals = listOf<Any?>(r.id) + listOf(r.name, r.aName, r.bName, r.note).flatMap { listOf(it.kk, it.ru) } +
            listOf(r.vehicle.code, r.season.code, r.checked, r.createdAt, r.createdBy, r.updatedAt, r.updatedBy, r.extra, 0L)
        db.exec("INSERT OR REPLACE INTO routes (" + cols.joinToString(",") + ") VALUES (" + cols.joinToString(",") { "?" } + ")", vals)
        db.exec("DELETE FROM route_points WHERE route_id = ?", listOf(r.id))
        r.points.forEachIndexed { i, p ->
            db.exec("INSERT INTO route_points (route_id, seq, lat, lon, monument_id) VALUES (?, ?, ?, ?, ?)", listOf(r.id, i.toLong(), p.lat, p.lon, p.monumentId))
        }
    }

    fun saveRoute(r: Route): Route {
        val c = Validation.clean(r)
        val now = Ids.now()
        val old = db.query("SELECT created_at, created_by FROM routes WHERE id = ?", listOf(c.id)) { (it.string("created_at") ?: "") to (it.string("created_by") ?: "") }.firstOrNull()
        val rec = c.copy(
            createdAt = old?.first?.ifEmpty { null } ?: c.createdAt.ifEmpty { now },
            createdBy = old?.second?.ifEmpty { null } ?: c.createdBy.ifEmpty { user },
            updatedAt = now, updatedBy = user,
        )
        db.tx { writeRoute(rec) }
        return rec
    }

    fun deleteRoute(id: String) {
        db.tx {
            db.exec("UPDATE routes SET deleted = 1, updated_at = ?, updated_by = ? WHERE id = ?", listOf(Ids.now(), user, id))
            db.exec("DELETE FROM route_points WHERE route_id = ?", listOf(id))
        }
    }

    fun importRoutes(list: List<ImportedRoute>): ImportResult {
        var added = 0; var updated = 0; var skipped = 0
        val now = Ids.now()
        db.tx {
            for (ir in list) {
                val inc = try { Validation.clean(ir.route) } catch (e: Exception) { skipped++; continue }
                val local = if (ir.hasId) route(inc.id) else null
                val stamp = inc.updatedAt.ifEmpty { now }
                if (local == null) {
                    writeRoute(inc.copy(createdAt = inc.createdAt.ifEmpty { now }, updatedAt = stamp)); added++; continue
                }
                if (stamp <= local.updatedAt) { skipped++; continue }
                fun merge(a: Localized, b: Localized): Localized { var x = a; for (l in ir.langs) x = x.with(l, b[l]); return x }
                writeRoute(local.copy(
                    name = merge(local.name, inc.name), aName = merge(local.aName, inc.aName), bName = merge(local.bName, inc.bName),
                    note = merge(local.note, inc.note), vehicle = inc.vehicle, season = inc.season, checked = inc.checked,
                    points = inc.points, updatedAt = stamp, updatedBy = inc.updatedBy,
                ))
                updated++
            }
        }
        return ImportResult(added, updated, skipped)
    }

    /* ======================= Баптаулар / мета ======================= */

    fun meta(key: String): String? = db.scalarString("SELECT value FROM meta WHERE key = ?", listOf(key))
    fun setMeta(key: String, value: String) = db.exec("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", listOf(key, value))

    /** Ағымдағы тіл бойынша атау (тізім, карта). */
    fun displayName(m: Monument, lang: Lang) = m.name.display(lang)
}
