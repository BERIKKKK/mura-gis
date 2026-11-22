package io.github.berikkkk.muragis.core.sync

import io.github.berikkkk.muragis.core.db.LocalStore
import io.github.berikkkk.muragis.core.model.Category
import io.github.berikkkk.muragis.core.model.Localized
import io.github.berikkkk.muragis.core.model.Monument
import io.github.berikkkk.muragis.core.model.MonumentType
import io.github.berikkkk.muragis.core.model.Route
import io.github.berikkkk.muragis.core.model.RoutePoint
import io.github.berikkkk.muragis.core.model.Season
import io.github.berikkkk.muragis.core.model.Status
import io.github.berikkkk.muragis.core.model.Vehicle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put

/**
 * Синхрондалатын жазбаның пішімі — сақтау қызметіне тәуелсіз және жұмыс үстеліндегі .gpkg жазбасымен (main/gpkg.js props) бірдей:
 *   ескерткіш: id, lat, lon, name (қаз.), name_ru, period/_ru, oblast/_ru, district/_ru, place/_ru, note/_ru, type, category, status, created_*, updated_*;
 *   маршрут:   id, name/_ru, a_name/_ru, b_name/_ru, note/_ru, vehicle, season, checked, pts [[lat, lon]…], pt_marks [[нүкте №, ескерткіш id]…], created_*, updated_*.
 * Жұмыс үстелінде жоқ өрістер (oblast_ru, name_ru маршрутта, pt_marks) — қосымша, міндетті емес; жұмыс үстелі оларды өзгертпей сақтайды.
 * Бізге белгісіз өрістер (басқа нұсқа, QGIS) — [Monument.extra] / [Route.extra] арқылы өзгеріссіз қайтарылады.
 */
object SyncRecords {
    private val MARK_LOC = listOf("name", "period", "oblast", "district", "place", "note")
    private val MARK_KNOWN = setOf("id", "lat", "lon", "type", "category", "status", "created_at", "created_by", "updated_at", "updated_by") +
        MARK_LOC.flatMap { listOf(it, it + "_ru") }
    private val ROUTE_LOC = listOf("name", "a_name", "b_name", "note")
    private val ROUTE_KNOWN = setOf("id", "vehicle", "season", "checked", "pts", "pt_marks", "created_at", "created_by", "updated_at", "updated_by") +
        ROUTE_LOC.flatMap { listOf(it, it + "_ru") }

    private fun extraOf(s: String): Map<String, JsonElement> =
        runCatching { SyncEngine.JSON.parseToJsonElement(s) as? JsonObject }.getOrNull() ?: emptyMap()
    private fun extraJson(o: JsonObject, known: Set<String>): String {
        val e = o.filterKeys { it !in known }
        return if (e.isEmpty()) "" else SyncEngine.JSON.encodeToString(JsonElement.serializer(), JsonObject(e))
    }
    private fun s(o: JsonObject, k: String) = (o[k] as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content ?: ""
    private fun loc(o: JsonObject, k: String) = Localized(s(o, k), s(o, k + "_ru"))

    fun markToJson(m: Monument): JsonObject = buildJsonObject {
        extraOf(m.extra).forEach { (k, v) -> if (k !in MARK_KNOWN) put(k, v) }
        put("id", m.id); put("lat", m.lat); put("lon", m.lon)
        listOf(m.name, m.period, m.oblast, m.district, m.place, m.note).forEachIndexed { i, l -> put(MARK_LOC[i], l.kk); put(MARK_LOC[i] + "_ru", l.ru) }
        put("type", m.type.code); put("category", m.category.code); put("status", m.status.code)
        put("created_at", m.createdAt); put("created_by", m.createdBy); put("updated_at", m.updatedAt); put("updated_by", m.updatedBy)
    }

    fun markFromJson(o: JsonObject, project: String): Monument? {
        val lat = (o["lat"] as? JsonPrimitive)?.let { it.doubleOrNull ?: it.content.toDoubleOrNull() } ?: return null
        val lon = (o["lon"] as? JsonPrimitive)?.let { it.doubleOrNull ?: it.content.toDoubleOrNull() } ?: return null
        return Monument(
            id = s(o, "id"), lat = lat, lon = lon,
            name = loc(o, "name"), period = loc(o, "period"), oblast = loc(o, "oblast"), district = loc(o, "district"), place = loc(o, "place"), note = loc(o, "note"),
            type = MonumentType.of(s(o, "type")), category = Category.of(s(o, "category")), status = Status.of(s(o, "status")),
            createdAt = s(o, "created_at"), createdBy = s(o, "created_by"), updatedAt = s(o, "updated_at"), updatedBy = s(o, "updated_by"),
            extra = extraJson(o, MARK_KNOWN), projectId = project,
        )
    }

    fun routeToJson(r: Route): JsonObject = buildJsonObject {
        extraOf(r.extra).forEach { (k, v) -> if (k !in ROUTE_KNOWN) put(k, v) }
        put("id", r.id)
        listOf(r.name, r.aName, r.bName, r.note).forEachIndexed { i, l -> put(ROUTE_LOC[i], l.kk); put(ROUTE_LOC[i] + "_ru", l.ru) }
        put("vehicle", r.vehicle.code); put("season", r.season.code); put("checked", r.checked)
        put("pts", buildJsonArray { r.points.forEach { add(buildJsonArray { add(JsonPrimitive(it.lat)); add(JsonPrimitive(it.lon)) }) } })
        val links = r.points.withIndex().filter { it.value.monumentId != null }
        if (links.isNotEmpty()) put("pt_marks", buildJsonArray { links.forEach { add(buildJsonArray { add(JsonPrimitive(it.index)); add(JsonPrimitive(it.value.monumentId)) }) } })
        put("created_at", r.createdAt); put("created_by", r.createdBy); put("updated_at", r.updatedAt); put("updated_by", r.updatedBy)
    }

    fun routeFromJson(o: JsonObject, project: String): Route? {
        val pts = (o["pts"] as? JsonArray)?.mapNotNull { e ->
            val a = e as? JsonArray ?: return@mapNotNull null
            val lat = (a.getOrNull(0) as? JsonPrimitive)?.doubleOrNull ?: return@mapNotNull null
            val lon = (a.getOrNull(1) as? JsonPrimitive)?.doubleOrNull ?: return@mapNotNull null
            lat to lon
        } ?: return null
        val links = (o["pt_marks"] as? JsonArray)?.mapNotNull { e ->
            val a = e as? JsonArray ?: return@mapNotNull null
            val i = (a.getOrNull(0) as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            val id = (a.getOrNull(1) as? JsonPrimitive)?.content ?: return@mapNotNull null
            i to id
        }?.toMap() ?: emptyMap()
        return Route(
            id = s(o, "id"), name = loc(o, "name"), aName = loc(o, "a_name"), bName = loc(o, "b_name"), note = loc(o, "note"),
            vehicle = Vehicle.of(s(o, "vehicle")), season = Season.of(s(o, "season")), checked = s(o, "checked"),
            points = pts.mapIndexed { i, (lat, lon) -> RoutePoint(lat, lon, links[i]) },
            createdAt = s(o, "created_at"), createdBy = s(o, "created_by"), updatedAt = s(o, "updated_at"), updatedBy = s(o, "updated_by"),
            extra = extraJson(o, ROUTE_KNOWN), projectId = project,
        )
    }
}

/** Android дерекқорындағы бір жоба — қозғалтқышқа арналған жергілікті интерфейс (жұмыс үстеліндегі gpkgLocal). */
class StoreSyncLocal(private val store: LocalStore, private val project: String) : SyncLocal {
    override fun snapshot(): List<LocalRecord> =
        store.monumentsIn(project).map { LocalRecord("mark", it.id, SyncRecords.markToJson(it)) } +
            store.routesIn(project).map { LocalRecord("route", it.id, SyncRecords.routeToJson(it)) }

    override fun apply(puts: List<LocalRecord>, dels: List<RecordRef>) {
        store.applySynced(project,
            puts.filter { it.t == "mark" }.mapNotNull { SyncRecords.markFromJson(it.d, project) },
            puts.filter { it.t == "route" }.mapNotNull { SyncRecords.routeFromJson(it.d, project) },
            dels.filter { it.t == "mark" }.map { it.id }, dels.filter { it.t == "route" }.map { it.id })
    }

    override fun meta(): ProjectMeta = store.syncProject(project)?.let { ProjectMeta(it.name, it.oblast, it.district) } ?: ProjectMeta()

    override fun setMeta(m: ProjectMeta) {
        val old = store.syncProject(project)
        store.saveSyncProject(LocalStore.SyncProject(project, m.name, m.oblast, m.district, old?.createdAt ?: "", ""))
    }

    override fun adopt(refs: List<RecordRef>) {
        store.assignToProject(project, refs.filter { it.t == "mark" }.map { it.id }, refs.filter { it.t == "route" }.map { it.id })
    }
}
