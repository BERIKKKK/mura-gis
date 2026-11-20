package io.github.berikkkk.muragis.core.sources

import io.github.berikkkk.muragis.core.geo.Bounds
import io.github.berikkkk.muragis.core.tiles.TileMath
import java.net.URI

/** Офлайн жүктеуге рұқсат: жүктеу батырмасы тек [allowed] = true болғанда көрсетіледі. */
data class OfflinePolicy(
    val allowed: Boolean,
    /** Неге рұқсат жоқ / қандай шартпен рұқсат (UI-да аударылатын код). */
    val reason: String,
    val maxZoom: Int = 19,
    /** Бір тапсырмадағы тайлдардың ең көп саны (дереккөз серверін шамадан тыс жүктемеу үшін). */
    val maxTilesPerJob: Long = 0,
    /** Сұраныстар арасындағы ең аз кідіріс, мс. */
    val minDelayMs: Long = 0,
) {
    companion object {
        fun denied(reason: String) = OfflinePolicy(false, reason)
    }
}

/** Онлайн тайл дереккөзі (XYZ). */
data class TileSource(
    val id: String,
    val title: String,
    val url: String,
    val subdomains: List<String> = emptyList(),
    val tms: Boolean = false,
    val minZoom: Int = 0,
    val maxZoom: Int = 19,
    val attribution: String,
    val overlay: Boolean = false,
    val policy: OfflinePolicy,
    /** Лицензия / пайдалану шарттары (сілтеме не мәтін). */
    val terms: String = "",
    val custom: Boolean = false,
) {
    /** Тайл мекенжайы ({s} — кезекпен, {-y} — TMS). */
    fun tileUrl(z: Int, x: Int, y: Int): String {
        var u = url
        if (subdomains.isNotEmpty()) u = u.replace("{s}", subdomains[((x + y) % subdomains.size + subdomains.size) % subdomains.size])
        val yy = if (tms) TileMath.flipY(y, z) else y
        return u.replace("{z}", z.toString()).replace("{x}", x.toString()).replace("{y}", yy.toString()).replace("{-y}", TileMath.flipY(y, z).toString())
    }

    /** MapLibre үшін үлгілер ({s} ашылады). */
    fun templates(): List<String> {
        val base = if (url.contains("{-y}")) url.replace("{-y}", "{y}") else url
        return if (subdomains.isEmpty() || !base.contains("{s}")) listOf(base) else subdomains.map { base.replace("{s}", it) }
    }

    val isTmsTemplate get() = tms || url.contains("{-y}")
}

/**
 * Дереккөздердің лицензиялық саясаты.
 * Кіріктірілген онлайн карталардың ешқайсысы жаппай жүктеуге не офлайн сақтауға рұқсат бермейді, сондықтан олар
 * тек онлайн көрсетіледі (жүктеу батырмасы жоқ). Офлайн жүктеу тек пайдаланушы қосқан, офлайн қолдануға құқығы бар
 * дереккөзге (өз тайл-сервері, лицензиясы рұқсат ететін сервис) мүмкін — және ол [FORBIDDEN_HOSTS] тізімінде болмауы керек:
 * Google, OSM Foundation-ның жария серверлері, Esri, Bing, Yandex, Mapbox т.б. пайдаланушы «рұқсатым бар» деп белгілесе де бұғатталады.
 */
object SourcePolicy {
    /** Жаппай жүктеуге/кэштеуге шарттары тыйым салатын хосттар (ішкі домендерімен). */
    val FORBIDDEN_HOSTS = listOf(
        "google.com", "googleapis.com", "gstatic.com", "google.kz", "google.ru",
        "openstreetmap.org", "openstreetmap.fr", "opentopomap.org", "openstreetmap.de",
        "arcgisonline.com", "arcgis.com", "virtualearth.net", "bing.com",
        "yandex.net", "yandex.ru", "yandex.com", "mapbox.com", "here.com", "hereapi.com",
        "thunderforest.com", "stadiamaps.com", "maptiler.com", "tomtom.com", "apple.com", "2gis.com",
        "nakarte.me", "tiles.nakarte.me", "wikimapia.org",
    )

    fun host(url: String): String? = runCatching {
        URI(url.replace("{s}", "a").replace(Regex("\\{[^}]*}"), "0")).host?.lowercase()
    }.getOrNull()

    fun isForbiddenHost(url: String): Boolean {
        val h = host(url) ?: return true
        return FORBIDDEN_HOSTS.any { h == it || h.endsWith(".$it") }
    }

    /** Пайдаланушы қосқан дереккөздің саясаты. */
    fun forCustom(url: String, userDeclaredOfflineRight: Boolean, maxZoom: Int): OfflinePolicy = when {
        !url.startsWith("https://") && !url.startsWith("http://") -> OfflinePolicy.denied("bad_url")
        isForbiddenHost(url) -> OfflinePolicy.denied("provider_forbids")
        !userDeclaredOfflineRight -> OfflinePolicy.denied("no_declared_right")
        else -> OfflinePolicy(true, "declared_by_user", maxZoom = maxZoom, maxTilesPerJob = 250_000, minDelayMs = 50)
    }

    /** Жүктеу тапсырмасын тексеру: рұқсат, масштаб, тайл саны. null — бәрі дұрыс, әйтпесе қате коды. */
    fun checkJob(src: TileSource, bounds: Bounds, minZ: Int, maxZ: Int): String? {
        val p = src.policy
        if (!p.allowed) return "not_allowed"
        if (!bounds.isValid) return "bad_area"
        if (minZ < src.minZoom || maxZ > minOf(src.maxZoom, p.maxZoom) || minZ > maxZ) return "bad_zoom"
        val n = TileMath.count(bounds, minZ, maxZ)
        if (p.maxTilesPerJob > 0 && n > p.maxTilesPerJob) return "too_many_tiles"
        return null
    }

    private const val OSM_TERMS = "https://operations.osmfoundation.org/policies/tiles/"
    private const val ESRI_TERMS = "https://www.esri.com/en-us/legal/terms/full-master-agreement"
    private const val ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/"

    /** Жұмыс үстеліндегі src/js/basemaps.js-тегі негізгі карталар (тек онлайн). */
    val BUILT_IN: List<TileSource> = listOf(
        TileSource("osm", "OpenStreetMap", "https://tile.openstreetmap.org/{z}/{x}/{y}.png", maxZoom = 19,
            attribution = "© OpenStreetMap contributors", policy = OfflinePolicy.denied("osm_tile_policy"), terms = OSM_TERMS),
        TileSource("otm", "OpenTopoMap", "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", listOf("a", "b", "c"), maxZoom = 17,
            attribution = "© OpenStreetMap contributors, SRTM · © OpenTopoMap (CC-BY-SA)", policy = OfflinePolicy.denied("provider_forbids"), terms = "https://opentopomap.org/about"),
        TileSource("esri-topo", "Esri World Topo", ESRI + "World_Topo_Map/MapServer/tile/{z}/{y}/{x}", maxZoom = 19,
            attribution = "© Esri, HERE, Garmin, OpenStreetMap", policy = OfflinePolicy.denied("license_required"), terms = ESRI_TERMS),
        TileSource("esri-sat", "Esri World Imagery", ESRI + "World_Imagery/MapServer/tile/{z}/{y}/{x}", maxZoom = 18,
            attribution = "© Esri, Maxar, Earthstar Geographics", policy = OfflinePolicy.denied("license_required"), terms = ESRI_TERMS),
        TileSource("gsh", "Генштаб (AtloMaps, nakarte.me)", "https://tiles.nakarte.me/topomapper/{z}/{x}/{y}", maxZoom = 13,
            attribution = "Генштаб КСРО · AtloMaps · nakarte.me", policy = OfflinePolicy.denied("terms_unknown"), terms = "https://nakarte.me"),
        TileSource("gsh1m", "Генштаб 1:1 000 000 (nakarte.me)", "https://{s}.tiles.nakarte.me/topo001m/{z}/{x}/{y}", listOf("a", "b", "c"), tms = true, maxZoom = 10,
            attribution = "Генштаб КСРО · nakarte.me", policy = OfflinePolicy.denied("terms_unknown"), terms = "https://nakarte.me"),
        TileSource("esri-places", "Esri: шекаралар мен атаулар", ESRI + "Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", maxZoom = 19,
            attribution = "© Esri", overlay = true, policy = OfflinePolicy.denied("license_required"), terms = ESRI_TERMS),
        TileSource("esri-roads", "Esri: жолдар", ESRI + "Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}", maxZoom = 19,
            attribution = "© Esri", overlay = true, policy = OfflinePolicy.denied("license_required"), terms = ESRI_TERMS),
    )
}
