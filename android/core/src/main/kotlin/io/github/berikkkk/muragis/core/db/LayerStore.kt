package io.github.berikkkk.muragis.core.db

import io.github.berikkkk.muragis.core.geo.Bounds
import io.github.berikkkk.muragis.core.model.Ids

/** Карта қабатының түрі. */
enum class LayerKind(val code: String) {
    ONLINE("online"),        // интернеттен (кіріктірілген не пайдаланушы қосқан XYZ)
    DOWNLOADED("downloaded"),// қосымшада жүктелген офлайн пакет (MBTiles)
    IMPORTED("imported");    // сырттан импортталған файл (MBTiles, ZIP, қалта → MBTiles, GeoPackage)

    companion object { fun of(c: String?) = entries.firstOrNull { it.code == c } ?: ONLINE }
}

/** Қабат файлының пішімі. */
enum class LayerFormat(val code: String) {
    XYZ_URL("xyz-url"), MBTILES("mbtiles"), XYZ_ZIP("xyz-zip"), GPKG_TILES("gpkg-tiles");

    companion object { fun of(c: String?) = entries.firstOrNull { it.code == c } ?: XYZ_URL }
}

enum class LayerRole(val code: String) {
    BASE("base"), OVERLAY("overlay");

    companion object { fun of(c: String?) = entries.firstOrNull { it.code == c } ?: BASE }
}

data class MapLayer(
    val id: String = Ids.newId(),
    val kind: LayerKind,
    val format: LayerFormat,
    val title: String,
    /** Онлайн: XYZ үлгісі (пайдаланушы қосқан) не кіріктірілген дереккөз id-і [sourceId]. */
    val url: String = "",
    /** Офлайн: қосымшаның сақтау орнындағы файл. */
    val path: String = "",
    val sourceId: String = "",
    val minZoom: Int = 0,
    val maxZoom: Int = 19,
    val bounds: Bounds? = null,
    val attribution: String = "",
    /** Лицензия: пайдаланушы көрсеткен шарттар / ескерту. Онлайн custom дереккөзде «offline=1» белгісі де осында. */
    val license: String = "",
    val tileFormat: String = "",
    /** XYZ ↔ TMS: y осін аудару (пайдаланушы түзете алады). Мағынасы пішімге қарай: MBTiles — tms, қалта/ZIP — tms. */
    val tms: Boolean = false,
    val opacity: Double = 1.0,
    val visible: Boolean = false,
    val role: LayerRole = LayerRole.BASE,
    val sort: Int = 0,
    val sizeBytes: Long = 0,
    /** Пайдаланушы қосқан онлайн дереккөз: «офлайн сақтауға құқығым бар» деп растаған ба. */
    val offlineRight: Boolean = false,
    /** Тайлдардың проекциясы (EPSG:3857 не EPSG:3395 — SAS.Planet-тегі Яндекс). */
    val projection: String = "EPSG:3857",
    val createdAt: String = Ids.now(),
) {
    val isOffline get() = kind != LayerKind.ONLINE
}

enum class JobState(val code: String) {
    QUEUED("queued"), RUNNING("running"), PAUSED("paused"), COMPLETED("completed"), FAILED("failed"), CANCELLED("cancelled");

    val active get() = this == QUEUED || this == RUNNING

    companion object { fun of(c: String?) = entries.firstOrNull { it.code == c } ?: PAUSED }
}

data class DownloadJob(
    val id: String = Ids.newId(),
    val sourceId: String,
    val layerId: String,
    val title: String,
    val bounds: Bounds,
    val minZoom: Int,
    val maxZoom: Int,
    val total: Long = 0,
    val done: Long = 0,
    val failed: Long = 0,
    val bytes: Long = 0,
    val state: JobState = JobState.QUEUED,
    val error: String = "",
    val createdAt: String = Ids.now(),
    val updatedAt: String = Ids.now(),
) {
    val percent: Int get() = if (total <= 0) 0 else ((done + failed) * 100 / total).toInt().coerceIn(0, 100)
}

/** map_layers және download_jobs кестелері (схемасы — [LocalStore]). */
class LayerStore(private val db: SqlDb) {
    private fun layerFrom(r: Row) = MapLayer(
        id = r.string("id")!!, kind = LayerKind.of(r.string("kind")), format = LayerFormat.of(r.string("format")),
        title = r.string("title") ?: "", url = r.string("url") ?: "", path = r.string("path") ?: "", sourceId = r.string("source_id") ?: "",
        minZoom = r.long("min_zoom")?.toInt() ?: 0, maxZoom = r.long("max_zoom")?.toInt() ?: 19, bounds = Bounds.decode(r.string("bounds")),
        attribution = r.string("attribution") ?: "", license = r.string("license") ?: "", tileFormat = r.string("tile_format") ?: "",
        tms = (r.long("tms") ?: 0L) != 0L, opacity = r.double("opacity") ?: 1.0, visible = (r.long("visible") ?: 0L) != 0L,
        role = LayerRole.of(r.string("role")), sort = r.long("sort")?.toInt() ?: 0, sizeBytes = r.long("size_bytes") ?: 0L,
        offlineRight = (r.long("offline_right") ?: 0L) != 0L, projection = r.string("projection") ?: "EPSG:3857",
        createdAt = r.string("created_at") ?: "",
    )

    fun layers(): List<MapLayer> = db.query("SELECT * FROM map_layers ORDER BY sort, created_at", emptyList(), ::layerFrom)
    fun layer(id: String): MapLayer? = db.query("SELECT * FROM map_layers WHERE id = ?", listOf(id), ::layerFrom).firstOrNull()

    fun save(l: MapLayer) {
        val cols = listOf("id", "kind", "format", "title", "url", "path", "source_id", "min_zoom", "max_zoom", "bounds", "attribution",
            "license", "tile_format", "tms", "opacity", "visible", "role", "sort", "size_bytes", "offline_right", "projection", "created_at")
        db.exec("INSERT OR REPLACE INTO map_layers (" + cols.joinToString(",") + ") VALUES (" + cols.joinToString(",") { "?" } + ")", listOf(
            l.id, l.kind.code, l.format.code, l.title, l.url, l.path, l.sourceId, l.minZoom.toLong(), l.maxZoom.toLong(), l.bounds?.encode() ?: "",
            l.attribution, l.license, l.tileFormat, if (l.tms) 1L else 0L, l.opacity, if (l.visible) 1L else 0L, l.role.code, l.sort.toLong(), l.sizeBytes, if (l.offlineRight) 1L else 0L, l.projection, l.createdAt,
        ))
    }

    fun delete(id: String) = db.exec("DELETE FROM map_layers WHERE id = ?", listOf(id))

    private fun jobFrom(r: Row) = DownloadJob(
        id = r.string("id")!!, sourceId = r.string("source_id")!!, layerId = r.string("layer_id")!!, title = r.string("title") ?: "",
        bounds = Bounds.decode(r.string("bounds")) ?: Bounds(0.0, 0.0, 0.0, 0.0), minZoom = r.long("min_zoom")!!.toInt(), maxZoom = r.long("max_zoom")!!.toInt(),
        total = r.long("total") ?: 0, done = r.long("done") ?: 0, failed = r.long("failed") ?: 0, bytes = r.long("bytes") ?: 0,
        state = JobState.of(r.string("state")), error = r.string("error") ?: "", createdAt = r.string("created_at") ?: "", updatedAt = r.string("updated_at") ?: "",
    )

    fun jobs(): List<DownloadJob> = db.query("SELECT * FROM download_jobs ORDER BY created_at DESC", emptyList(), ::jobFrom)
    fun job(id: String): DownloadJob? = db.query("SELECT * FROM download_jobs WHERE id = ?", listOf(id), ::jobFrom).firstOrNull()

    fun saveJob(j: DownloadJob) {
        val cols = listOf("id", "source_id", "layer_id", "title", "bounds", "min_zoom", "max_zoom", "total", "done", "failed", "bytes", "state", "error", "created_at", "updated_at")
        db.exec("INSERT OR REPLACE INTO download_jobs (" + cols.joinToString(",") + ") VALUES (" + cols.joinToString(",") { "?" } + ")", listOf(
            j.id, j.sourceId, j.layerId, j.title, j.bounds.encode(), j.minZoom.toLong(), j.maxZoom.toLong(), j.total, j.done, j.failed, j.bytes,
            j.state.code, j.error, j.createdAt, Ids.now(),
        ))
    }

    fun deleteJob(id: String) = db.exec("DELETE FROM download_jobs WHERE id = ?", listOf(id))
}
