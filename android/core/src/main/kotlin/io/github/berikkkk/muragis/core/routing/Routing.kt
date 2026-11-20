package io.github.berikkkk.muragis.core.routing

import io.github.berikkkk.muragis.core.geo.LatLon

/**
 * Жол желісі бойынша автоматты маршрут есептеудің архитектуралық негізі.
 * Маңызды: карта тайлдары (растр суреттер) жол табуға жарамайды — оған жол желісінің графы (мыс. OSM PBF-тен
 * дайындалған GraphHopper/Valhalla/BRouter деректері) және маршруттау қозғалтқышы керек. 1.0 нұсқасында ондай қозғалтқыш
 * қосылмаған: [RoutingRegistry.available] бос болғанда интерфейс «автоматты маршрут» әрекетін көрсетпейді.
 * Маршрутты қолмен сызу интернетсіз әрқашан жұмыс істейді — ол бұл модульге тәуелді емес.
 */
enum class TravelProfile { CAR, OFFROAD, FOOT }

data class RoutingRequest(val waypoints: List<LatLon>, val profile: TravelProfile)

sealed interface RoutingResult {
    data class Ok(val points: List<LatLon>, val lengthMeters: Double, val durationSeconds: Double?) : RoutingResult
    data class Failed(val reason: String) : RoutingResult
}

interface RoutingEngine {
    val id: String
    /** Қамтылған аумақ пен деректер дайын ба (мыс. офлайн граф жүктелген бе). */
    fun isReady(): Boolean
    fun covers(p: LatLon): Boolean
    fun route(req: RoutingRequest): RoutingResult
}

/** Қолжетімді қозғалтқыштар тізімі. Болашақта офлайн граф пакеттері осында тіркеледі. */
object RoutingRegistry {
    private val engines = mutableListOf<RoutingEngine>()

    fun register(e: RoutingEngine) { synchronized(engines) { engines.removeAll { it.id == e.id }; engines += e } }
    fun available(): List<RoutingEngine> = synchronized(engines) { engines.filter { it.isReady() } }
    fun engineFor(points: List<LatLon>): RoutingEngine? = available().firstOrNull { e -> points.all { e.covers(it) } }
}
