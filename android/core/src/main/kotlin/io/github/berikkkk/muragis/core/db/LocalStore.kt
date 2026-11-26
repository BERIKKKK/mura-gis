package io.github.berikkkk.muragis.core.db

import io.github.berikkkk.muragis.core.io.ImportedMonument
import io.github.berikkkk.muragis.core.io.ImportedPlace
import io.github.berikkkk.muragis.core.io.ImportedRoute
import io.github.berikkkk.muragis.core.model.Category
import io.github.berikkkk.muragis.core.model.Ids
import io.github.berikkkk.muragis.core.model.Lang
import io.github.berikkkk.muragis.core.model.Localized
import io.github.berikkkk.muragis.core.model.Monument
import io.github.berikkkk.muragis.core.model.MonumentType
import io.github.berikkkk.muragis.core.model.Place
import io.github.berikkkk.muragis.core.model.PlaceKind
import io.github.berikkkk.muragis.core.model.Route
import io.github.berikkkk.muragis.core.model.RoutePoint
import io.github.berikkkk.muragis.core.model.Season
import io.github.berikkkk.muragis.core.model.Status
import io.github.berikkkk.muragis.core.model.Validation
import io.github.berikkkk.muragis.core.model.Vehicle

/**
 * Құрылғыдағы негізгі дерекқор (SQLite): ескерткіштер, өзге нысандар, маршруттар, карта қабаттары, жүктеу тапсырмалары.
 * Әр тілдің мәні — бөлек баған (name_kk, name_ru …), сондықтан бір тілдің мәні екіншісінің үстінен жазылмайды.
 * Болашақ синхрондауға дайындық: тұрақты 16 таңбалы id, updated_at (ISO, UTC), жұмсақ өшіру (deleted = 1, «tombstone»).
 */
class LocalStore(val db: SqlDb, private val user: String = "") {

    /** Жаңа ескерткіш пен маршрут қай жобаға жазылады (синхрондау: «Баптаулар → Синхрондау → Белсенді жоба»). Бос — жобасыз. */
    @Volatile var defaultProject: String = ""

    /** Ескерткіш не маршрут өзгергенде (сақтау, өшіру, импорт) — синхрондау кезегі үшін. Синхрондаудың өз жазуы шақырмайды. */
    @Volatile var onChange: (() -> Unit)? = null
    private fun changed() { runCatching { onChange?.invoke() } }

    companion object {
        /** 1 — бастапқы схема; 2 — өзге нысандар (places); 3 — синхрондау: жоба байланысы (project_id) және жобалар (sync_projects);
         *  4 — өзге нысандардың жобасы (places.project_id) — жоба бойынша іріктеу үшін. */
        const val SCHEMA_VERSION = 4
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
                    offline_right INTEGER NOT NULL DEFAULT 0, projection TEXT NOT NULL DEFAULT 'EPSG:3857',
                    created_at TEXT NOT NULL DEFAULT '')""")
                db.exec("""CREATE TABLE IF NOT EXISTS download_jobs (
                    id TEXT PRIMARY KEY NOT NULL, source_id TEXT NOT NULL, layer_id TEXT NOT NULL, title TEXT NOT NULL,
                    bounds TEXT NOT NULL, min_zoom INTEGER NOT NULL, max_zoom INTEGER NOT NULL,
                    total INTEGER NOT NULL DEFAULT 0, done INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0,
                    bytes INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL, error TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '')""")
                db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL DEFAULT '')")
            }
            if (v < 2) {
                // Өзге нысандар: бар кестелерге тимейді — ескі дерекқор жаңа нұсқада толық оқылады
                db.exec("""CREATE TABLE IF NOT EXISTS places (
                    id TEXT PRIMARY KEY NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL,
                    name_kk TEXT NOT NULL DEFAULT '', name_ru TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL DEFAULT '', updated_by TEXT NOT NULL DEFAULT '',
                    extra TEXT NOT NULL DEFAULT '', deleted INTEGER NOT NULL DEFAULT 0)""")
                db.exec("CREATE INDEX IF NOT EXISTS places_updated ON places(updated_at)")
            }
            if (v < 3) {
                // Синхрондау: тек жаңа баған (әдепкі бос — «жобасыз») және жаңа кесте; бар жазбалар өзгермейді
                for (t in listOf("monuments", "routes")) {
                    if ("project_id" !in db.columnsOf(t)) db.exec("ALTER TABLE $t ADD COLUMN project_id TEXT NOT NULL DEFAULT ''")
                    db.exec("CREATE INDEX IF NOT EXISTS ${t}_project ON $t(project_id)")
                }
                db.exec("""CREATE TABLE IF NOT EXISTS sync_projects (
                    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL DEFAULT '', oblast TEXT NOT NULL DEFAULT '', district TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '')""")
            }
            if (v < 4) {
                // Өзге нысандардың жобасы: тек жаңа баған (әдепкі бос — «жобасыз»); бар жазбалар өзгермейді
                if ("project_id" !in db.columnsOf("places")) db.exec("ALTER TABLE places ADD COLUMN project_id TEXT NOT NULL DEFAULT ''")
                db.exec("CREATE INDEX IF NOT EXISTS places_project ON places(project_id)")
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
            extra = r.string("extra") ?: "", projectId = r.string("project_id") ?: "",
        )
    }

    fun monuments(): List<Monument> = db.query("SELECT * FROM monuments WHERE deleted = 0", emptyList(), ::monumentFrom)

    fun monument(id: String): Monument? = db.query("SELECT * FROM monuments WHERE id = ? AND deleted = 0", listOf(id), ::monumentFrom).firstOrNull()

    fun monumentCount(): Long = db.scalarLong("SELECT count(*) FROM monuments WHERE deleted = 0") ?: 0L

    private fun writeMonument(m: Monument) {
        val cols = listOf("id", "lat", "lon") + LOC.flatMap { listOf(it + "_kk", it + "_ru") } +
            listOf("type", "category", "status", "created_at", "created_by", "updated_at", "updated_by", "extra", "deleted", "project_id")
        val locVals = listOf(m.name, m.period, m.oblast, m.district, m.place, m.note).flatMap { listOf(it.kk, it.ru) }
        val vals = listOf<Any?>(m.id, m.lat, m.lon) + locVals +
            listOf(m.type.code, m.category.code, m.status.code, m.createdAt, m.createdBy, m.updatedAt, m.updatedBy, m.extra, 0L, m.projectId)
        db.exec("INSERT OR REPLACE INTO monuments (" + cols.joinToString(",") + ") VALUES (" + cols.joinToString(",") { "?" } + ")", vals)
    }

    /** Бар жазбаның жобасы (жоқ болса — null). */
    private fun projectOf(table: String, id: String): String? = db.scalarString("SELECT project_id FROM $table WHERE id = ?", listOf(id))

    /** Сақтау (жаңа не бар жазба). Тексеріледі; created_* сақталады, updated_* жаңарады; бар жазбаның жобасы өзгермейді. */
    fun saveMonument(m: Monument): Monument {
        val c = Validation.clean(m)
        val now = Ids.now()
        val old = db.query("SELECT created_at, created_by, project_id FROM monuments WHERE id = ?", listOf(c.id)) {
            Triple(it.string("created_at") ?: "", it.string("created_by") ?: "", it.string("project_id") ?: "") }.firstOrNull()
        val rec = c.copy(
            createdAt = old?.first?.ifEmpty { null } ?: c.createdAt.ifEmpty { now },
            createdBy = old?.second?.ifEmpty { null } ?: c.createdBy.ifEmpty { user },
            updatedAt = now, updatedBy = user,
            projectId = old?.third ?: c.projectId.ifEmpty { defaultProject },
        )
        db.tx { writeMonument(rec) }
        changed()
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
        if (n > 0) changed()
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
                    writeMonument(inc.copy(createdAt = inc.createdAt.ifEmpty { now }, updatedAt = stamp, updatedBy = inc.updatedBy, projectId = defaultProject))
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
        if (added + updated > 0) changed()
        return ImportResult(added, updated, skipped)
    }

    /* ======================= Өзге нысандар ======================= */

    private fun placeFrom(r: Row) = Place(
        id = r.string("id")!!, lat = r.double("lat")!!, lon = r.double("lon")!!,
        name = Localized(r.string("name_kk") ?: "", r.string("name_ru") ?: ""), kind = PlaceKind.of(r.string("kind")),
        createdAt = r.string("created_at") ?: "", createdBy = r.string("created_by") ?: "",
        updatedAt = r.string("updated_at") ?: "", updatedBy = r.string("updated_by") ?: "",
        extra = r.string("extra") ?: "", projectId = r.string("project_id") ?: "",
    )

    fun places(): List<Place> = db.query("SELECT * FROM places WHERE deleted = 0", emptyList(), ::placeFrom)

    fun place(id: String): Place? = db.query("SELECT * FROM places WHERE id = ? AND deleted = 0", listOf(id), ::placeFrom).firstOrNull()

    private fun writePlace(p: Place) {
        val cols = listOf("id", "lat", "lon", "name_kk", "name_ru", "kind", "created_at", "created_by", "updated_at", "updated_by", "extra", "deleted", "project_id")
        val vals = listOf<Any?>(p.id, p.lat, p.lon, p.name.kk, p.name.ru, p.kind.code, p.createdAt, p.createdBy, p.updatedAt, p.updatedBy, p.extra, 0L, p.projectId)
        db.exec("INSERT OR REPLACE INTO places (" + cols.joinToString(",") + ") VALUES (" + cols.joinToString(",") { "?" } + ")", vals)
    }

    /** Сақтау (жаңа не бар жазба): created_* сақталады, updated_* жаңарады; бар жазбаның жобасы өзгермейді (ескерткіштегідей). */
    fun savePlace(p: Place): Place {
        val c = Validation.clean(p)
        val now = Ids.now()
        val old = db.query("SELECT created_at, created_by, project_id FROM places WHERE id = ?", listOf(c.id)) {
            Triple(it.string("created_at") ?: "", it.string("created_by") ?: "", it.string("project_id") ?: "") }.firstOrNull()
        val rec = c.copy(
            createdAt = old?.first?.ifEmpty { null } ?: c.createdAt.ifEmpty { now },
            createdBy = old?.second?.ifEmpty { null } ?: c.createdBy.ifEmpty { user },
            updatedAt = now, updatedBy = user,
            projectId = old?.third ?: c.projectId.ifEmpty { defaultProject },
        )
        db.tx { writePlace(rec) }
        return rec
    }

    /** Жұмсақ өшіру (ескерткіштердегідей «tombstone» қалады). */
    fun deletePlaces(ids: Collection<String>): Int {
        if (ids.isEmpty()) return 0
        val now = Ids.now()
        var n = 0
        db.tx {
            for (id in ids) {
                n += (db.scalarLong("SELECT count(*) FROM places WHERE id = ? AND deleted = 0", listOf(id)) ?: 0L).toInt()
                db.exec("UPDATE places SET deleted = 1, updated_at = ?, updated_by = ? WHERE id = ?", listOf(now, user, id))
            }
        }
        return n
    }

    /** Импорт: id бірдей болса — жаңасы қалады; тек файлдағы тілдің атауы ауыстырылады (ескерткіштердегідей). */
    fun importPlaces(list: List<ImportedPlace>): ImportResult {
        var added = 0; var updated = 0; var skipped = 0
        val now = Ids.now()
        db.tx {
            for (ip in list) {
                val inc = try { Validation.clean(ip.place) } catch (e: Exception) { skipped++; continue }
                val local = if (ip.hasId) db.query("SELECT * FROM places WHERE id = ?", listOf(inc.id), ::placeFrom).firstOrNull() else null
                val stamp = inc.updatedAt.ifEmpty { now }
                if (local == null) {
                    writePlace(inc.copy(createdAt = inc.createdAt.ifEmpty { now }, updatedAt = stamp, projectId = defaultProject)); added++; continue
                }
                if (stamp <= local.updatedAt) { skipped++; continue }
                var name = local.name
                for (l in ip.langs) name = name.with(l, inc.name[l])
                writePlace(local.copy(lat = inc.lat, lon = inc.lon, kind = inc.kind, name = name,
                    updatedAt = stamp, updatedBy = inc.updatedBy, extra = inc.extra.ifEmpty { local.extra }))
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
            extra = r.string("extra") ?: "", projectId = r.string("project_id") ?: "",
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
            listOf("vehicle", "season", "checked", "created_at", "created_by", "updated_at", "updated_by", "extra", "deleted", "project_id")
        val vals = listOf<Any?>(r.id) + listOf(r.name, r.aName, r.bName, r.note).flatMap { listOf(it.kk, it.ru) } +
            listOf(r.vehicle.code, r.season.code, r.checked, r.createdAt, r.createdBy, r.updatedAt, r.updatedBy, r.extra, 0L, r.projectId)
        db.exec("INSERT OR REPLACE INTO routes (" + cols.joinToString(",") + ") VALUES (" + cols.joinToString(",") { "?" } + ")", vals)
        db.exec("DELETE FROM route_points WHERE route_id = ?", listOf(r.id))
        r.points.forEachIndexed { i, p ->
            db.exec("INSERT INTO route_points (route_id, seq, lat, lon, monument_id) VALUES (?, ?, ?, ?, ?)", listOf(r.id, i.toLong(), p.lat, p.lon, p.monumentId))
        }
    }

    fun saveRoute(r: Route): Route {
        val c = Validation.clean(r)
        val now = Ids.now()
        val old = db.query("SELECT created_at, created_by, project_id FROM routes WHERE id = ?", listOf(c.id)) {
            Triple(it.string("created_at") ?: "", it.string("created_by") ?: "", it.string("project_id") ?: "") }.firstOrNull()
        val rec = c.copy(
            createdAt = old?.first?.ifEmpty { null } ?: c.createdAt.ifEmpty { now },
            createdBy = old?.second?.ifEmpty { null } ?: c.createdBy.ifEmpty { user },
            updatedAt = now, updatedBy = user,
            projectId = old?.third ?: c.projectId.ifEmpty { defaultProject },
        )
        db.tx { writeRoute(rec) }
        changed()
        return rec
    }

    fun deleteRoute(id: String) {
        db.tx {
            db.exec("UPDATE routes SET deleted = 1, updated_at = ?, updated_by = ? WHERE id = ?", listOf(Ids.now(), user, id))
            db.exec("DELETE FROM route_points WHERE route_id = ?", listOf(id))
        }
        changed()
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
                    writeRoute(inc.copy(createdAt = inc.createdAt.ifEmpty { now }, updatedAt = stamp, projectId = defaultProject)); added++; continue
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
        if (added + updated > 0) changed()
        return ImportResult(added, updated, skipped)
    }

    /* ======================= Синхрондау (core/sync/StoreSyncLocal) ======================= */

    data class SyncProject(val id: String, val name: String = "", val oblast: String = "", val district: String = "", val createdAt: String = "", val updatedAt: String = "")

    private fun projectFrom(r: Row) = SyncProject(r.string("id")!!, r.string("name") ?: "", r.string("oblast") ?: "", r.string("district") ?: "",
        r.string("created_at") ?: "", r.string("updated_at") ?: "")

    fun syncProjects(): List<SyncProject> = db.query("SELECT * FROM sync_projects ORDER BY name COLLATE NOCASE", emptyList(), ::projectFrom)
    fun syncProject(id: String): SyncProject? = db.query("SELECT * FROM sync_projects WHERE id = ?", listOf(id), ::projectFrom).firstOrNull()
    fun saveSyncProject(p: SyncProject) = db.exec("INSERT OR REPLACE INTO sync_projects (id, name, oblast, district, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        listOf(p.id, p.name, p.oblast, p.district, p.createdAt.ifEmpty { Ids.now() }, p.updatedAt.ifEmpty { Ids.now() }))

    /** Жобаның тірі жазбалары (өшірілгендері — синхрондау күйіндегі «tombstone» арқылы танылады). */
    fun monumentsIn(project: String): List<Monument> = db.query("SELECT * FROM monuments WHERE project_id = ? AND deleted = 0", listOf(project), ::monumentFrom)
    fun routesIn(project: String): List<Route> {
        val pts = HashMap<String, MutableList<RoutePoint>>()
        db.forEach("SELECT p.route_id, p.lat, p.lon, p.monument_id FROM route_points p JOIN routes r ON r.id = p.route_id WHERE r.project_id = ? AND r.deleted = 0 ORDER BY p.route_id, p.seq", listOf(project)) {
            pts.getOrPut(it.string("route_id")!!) { ArrayList() } += RoutePoint(it.double("lat")!!, it.double("lon")!!, it.string("monument_id"))
        }
        return db.query("SELECT * FROM routes WHERE project_id = ? AND deleted = 0", listOf(project)) { routeFrom(it, pts[it.string("id")] ?: emptyList()) }
    }

    /**
     * Басқа құрылғыдан келген жазбаларды жобаға жазу (уақыт белгілері өзгермейді, [onChange] шақырылмайды).
     * id басқа жобада бар жазба қабылданбайды (бір id екі жобада болса, біреуі жоғалмауы үшін); саны — жазылғаны.
     */
    fun applySynced(project: String, monuments: List<Monument>, routes: List<Route>, delMonuments: List<String>, delRoutes: List<String>): Int {
        var n = 0
        db.tx {
            for (m in monuments) {
                val p = projectOf("monuments", m.id)
                if (p != null && p.isNotEmpty() && p != project) continue
                if (!Validation.validCoord(m.lat, m.lon)) continue
                writeMonument(m.copy(projectId = project)); n++
            }
            for (r in routes) {
                val p = projectOf("routes", r.id)
                if (p != null && p.isNotEmpty() && p != project) continue
                if (r.points.size < 2) continue
                writeRoute(r.copy(projectId = project)); n++
            }
            for (id in delMonuments) db.exec("UPDATE monuments SET deleted = 1 WHERE id = ? AND project_id = ?", listOf(id, project))
            for (id in delRoutes) {
                if (projectOf("routes", id) != project) continue
                db.exec("UPDATE routes SET deleted = 1 WHERE id = ?", listOf(id))
                db.exec("DELETE FROM route_points WHERE route_id = ?", listOf(id))
            }
        }
        return n
    }

    /** Жобасыз жазбаларды жобаға алу: [ids] берілсе — тек солар (бұлтта бар id-лер), берілмесе — барлығы (пайдаланушы келісімімен). */
    fun assignToProject(project: String, monumentIds: Collection<String>? = null, routeIds: Collection<String>? = null): Int {
        var n = 0
        db.tx {
            for ((t, ids) in listOf("monuments" to monumentIds, "routes" to routeIds)) {
                if (ids == null) {
                    n += (db.scalarLong("SELECT count(*) FROM $t WHERE project_id = '' AND deleted = 0") ?: 0L).toInt()
                    db.exec("UPDATE $t SET project_id = ? WHERE project_id = '' AND deleted = 0", listOf(project))
                } else for (id in ids) {
                    if (projectOf(t, id) != "") continue
                    db.exec("UPDATE $t SET project_id = ? WHERE id = ? AND project_id = '' AND deleted = 0", listOf(project, id)); n++
                }
            }
        }
        return n
    }

    /** Жобасыз (тек осы телефондағы) ескерткіштер мен маршруттар саны. */
    fun unassignedCount(): Int = ((db.scalarLong("SELECT count(*) FROM monuments WHERE project_id = '' AND deleted = 0") ?: 0L) +
        (db.scalarLong("SELECT count(*) FROM routes WHERE project_id = '' AND deleted = 0") ?: 0L)).toInt()

    /* ======================= Баптаулар / мета ======================= */

    fun meta(key: String): String? = db.scalarString("SELECT value FROM meta WHERE key = ?", listOf(key))
    fun setMeta(key: String, value: String) = db.exec("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", listOf(key, value))

    /** Ағымдағы тіл бойынша атау (тізім, карта). */
    fun displayName(m: Monument, lang: Lang) = m.name.display(lang)
}
