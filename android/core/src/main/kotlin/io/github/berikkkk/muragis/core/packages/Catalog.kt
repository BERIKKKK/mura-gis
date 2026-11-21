package io.github.berikkkk.muragis.core.packages

import io.github.berikkkk.muragis.core.db.LayerKind
import io.github.berikkkk.muragis.core.db.LayerRole
import io.github.berikkkk.muragis.core.db.MapLayer
import io.github.berikkkk.muragis.core.geo.Bounds
import io.github.berikkkk.muragis.core.io.arr
import io.github.berikkkk.muragis.core.io.num
import io.github.berikkkk.muragis.core.io.obj
import io.github.berikkkk.muragis.core.io.parseJson
import io.github.berikkkk.muragis.core.io.str
import io.github.berikkkk.muragis.core.model.Lang
import kotlinx.serialization.json.JsonObject

/** «Карта қабаттары» панеліндегі санаттар (көрсету реті — осы ретпен). */
enum class MapCategory(val code: String) {
    BASIC("basic"), TOPO("topo"), SATELLITE("satellite"), HISTORIC("historic"), USER("user"), OVERLAY("overlay");

    companion object {
        fun of(c: String?) = entries.firstOrNull { it.code == c }

        /** Кіріктірілген онлайн карталардың санаты. */
        private val BUILT_IN = mapOf(
            "osm" to BASIC, "otm" to TOPO, "esri-topo" to TOPO, "esri-sat" to SATELLITE, "gsh" to HISTORIC, "gsh1m" to HISTORIC,
        )

        /**
         * Қабаттың санаты: кіріктірілген карта — кесте бойынша; каталогтан жүктелген пакет — каталогтағы санаты;
         * үстіңгі қабат — [OVERLAY]; қалғаны (импорт, өз дереккөзі, аумақты өзі жүктеген) — [USER].
         */
        fun of(l: MapLayer, catalog: Catalog?): MapCategory {
            if (l.role == LayerRole.OVERLAY && l.kind == LayerKind.ONLINE) return OVERLAY
            if (l.kind == LayerKind.ONLINE && l.id.startsWith("b-")) BUILT_IN[l.sourceId]?.let { return it }
            if (l.kind == LayerKind.DOWNLOADED) catalog?.pkg(Catalog.packageIdOf(l.sourceId) ?: "")?.let { return it.category }
            return if (l.role == LayerRole.OVERLAY) OVERLAY else USER
        }
    }
}

data class L10n(val kk: String, val ru: String) {
    fun of(lang: Lang) = (if (lang == Lang.RU) ru else kk).ifBlank { kk.ifBlank { ru } }

    companion object {
        val EMPTY = L10n("", "")
        internal fun from(o: JsonObject?) = if (o == null) EMPTY else L10n(o.str("kk") ?: "", o.str("ru") ?: "")
    }
}

/** Каталогтағы бір карта пакеті (тегін жүктелетін, офлайн пайдалануға рұқсат етілген). */
data class CatalogPackage(
    val id: String,
    val regionId: String,
    val category: MapCategory,
    val title: L10n,
    val url: String,
    val file: String,
    val size: Long,
    val sha256: String,
    /** vector — стиль/қаріп/белгішесі бар; raster — тек тайлдар. */
    val format: String,
    val minZoom: Int,
    val maxZoom: Int,
    val bounds: Bounds,
    /** Дерек күні (ISO, мыс. 2026-11-20). */
    val date: String,
    /** Түсірілім кезеңі (спутник мозаикасы) — бос болуы мүмкін. */
    val period: L10n,
    /** Ажыратымдылық, мыс. «10 м/пиксель» — бос болуы мүмкін. */
    val resolution: L10n,
    val source: L10n,
    val license: String,
    val licenseUrl: String,
    /** Картада көрсетілетін авторлық белгі. */
    val attribution: String,
)

data class CatalogRegion(val id: String, val title: L10n, val bounds: Bounds, val packages: List<CatalogPackage>)

/**
 * Жүктелетін аумақтар мен пакеттер каталогы (қолданбаның assets/maps/catalog.json). Жүктелген пакеттің қабаты
 * каталогпен sourceId = «pkg:<id>» арқылы байланысады — пакет туралы мәлімет көшірілмейді.
 */
class Catalog(val regions: List<CatalogRegion>) {
    fun pkg(id: String): CatalogPackage? = regions.firstNotNullOfOrNull { r -> r.packages.firstOrNull { it.id == id } }

    companion object {
        const val SOURCE_PREFIX = "pkg:"
        fun sourceIdOf(p: CatalogPackage) = SOURCE_PREFIX + p.id
        fun packageIdOf(sourceId: String): String? = sourceId.takeIf { it.startsWith(SOURCE_PREFIX) }?.removePrefix(SOURCE_PREFIX)

        private fun bounds(o: JsonObject?, key: String): Bounds? {
            val a = o?.get(key).arr()?.mapNotNull { it.num() } ?: return null
            return if (a.size == 4) Bounds(a[0], a[1], a[2], a[3]).takeIf { it.isValid } else null
        }

        fun parse(text: String): Catalog {
            val root = parseJson(text).obj()
            val regions = root?.get("regions").arr()?.mapNotNull { re ->
                val r = re.obj() ?: return@mapNotNull null
                val rid = r.str("id") ?: return@mapNotNull null
                val rb = bounds(r, "bounds") ?: return@mapNotNull null
                val pkgs = r["packages"].arr()?.mapNotNull { pe ->
                    val p = pe.obj() ?: return@mapNotNull null
                    val cat = MapCategory.of(p.str("category")) ?: return@mapNotNull null
                    CatalogPackage(
                        id = p.str("id") ?: return@mapNotNull null, regionId = rid, category = cat,
                        title = L10n.from(p["title"].obj()), url = p.str("url") ?: return@mapNotNull null,
                        file = p.str("file") ?: "", size = p["size"].num()?.toLong() ?: 0L, sha256 = (p.str("sha256") ?: "").lowercase(),
                        format = p.str("format") ?: "raster", minZoom = p["minzoom"].num()?.toInt() ?: 0, maxZoom = p["maxzoom"].num()?.toInt() ?: 14,
                        bounds = bounds(p, "bounds") ?: rb, date = p.str("date") ?: "",
                        period = L10n.from(p["period"].obj()), resolution = L10n.from(p["resolution"].obj()),
                        source = L10n.from(p["source"].obj()), license = p.str("license") ?: "", licenseUrl = p.str("license_url") ?: "",
                        attribution = p.str("attribution") ?: "",
                    )
                } ?: emptyList()
                CatalogRegion(rid, L10n.from(r["title"].obj()), rb, pkgs)
            } ?: emptyList()
            return Catalog(regions)
        }
    }
}
