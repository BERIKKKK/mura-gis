package io.github.berikkkk.muragis.mobile.data

import android.location.Location
import android.os.SystemClock
import io.github.berikkkk.muragis.core.geo.Geo
import io.github.berikkkk.muragis.core.geo.LatLon
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.max

/**
 * Жазылып жатқан трек — нақты жүрілген жол (GPS). Алдын ала есептелетін маршруттан бөлек.
 * [activeMs] — кідірістерсіз жазу уақыты; [runningSince] — жазу қосулы болса, соңғы жалғасқан сәт (elapsedRealtime).
 */
data class TrackRec(
    val startedAt: Long,
    val points: List<LatLon>,
    val distance: Double,
    val activeMs: Long,
    val runningSince: Long?,
) {
    val running: Boolean get() = runningSince != null
    fun elapsedMs(now: Long = SystemClock.elapsedRealtime()): Long = activeMs + (runningSince?.let { now - it } ?: 0L)
}

/**
 * Трек жазушы: TrackService (алдыңғы қатардағы қызмет, экран өшсе де жұмыс істейді) GPS нүктелерін осында береді,
 * интерфейс күйді [state] арқылы бақылайды. Жоба Settings-ке мезгіл-мезгіл сақталады.
 */
class TrackRecorder(private val settings: Settings) {
    private val _state = MutableStateFlow(restore())
    val state: StateFlow<TrackRec?> = _state
    private var lastSaved = 0L

    fun start() {
        _state.value = TrackRec(System.currentTimeMillis(), emptyList(), 0.0, 0L, SystemClock.elapsedRealtime())
        persist(force = true)
    }

    fun pause() {
        val s = _state.value ?: return
        if (!s.running) return
        _state.value = s.copy(activeMs = s.elapsedMs(), runningSince = null)
        persist(force = true)
    }

    fun resume() {
        val s = _state.value ?: return
        if (s.running) return
        _state.value = s.copy(runningSince = SystemClock.elapsedRealtime())
        persist(force = true)
    }

    /** Нашар дәлдіктегі (> 35 м) нүктелер мен орнында тұрған кездегі «секірістер» алынбайды. */
    fun add(loc: Location) {
        val s = _state.value ?: return
        if (!s.running || !loc.hasAccuracy() || loc.accuracy > MAX_ACCURACY) return
        val p = LatLon(loc.latitude, loc.longitude)
        val last = s.points.lastOrNull()
        val d = if (last == null) 0.0 else Geo.distance(last.lat, last.lon, p.lat, p.lon)
        if (last != null && d < max(MIN_STEP, loc.accuracy * 0.5)) return
        _state.value = s.copy(points = s.points + p, distance = s.distance + d)
        persist()
    }

    fun clear() {
        _state.value = null
        settings.trackDraft = null
    }

    private fun persist(force: Boolean = false) {
        val now = SystemClock.elapsedRealtime()
        if (!force && now - lastSaved < 20_000) return
        lastSaved = now
        val s = _state.value ?: run { settings.trackDraft = null; return }
        settings.trackDraft = JSONObject()
            .put("startedAt", s.startedAt).put("activeMs", s.elapsedMs(now)).put("distance", s.distance).put("running", s.running)
            .put("pts", JSONArray(s.points.map { JSONArray(listOf(it.lat, it.lon)) })).toString()
    }

    /**
     * Қосымша қайта ашылғанда: жазу кідіртілген болса — кідіртілген күйде қайтады (пайдаланушы жалғастырады не сақтайды).
     * Жазу жүріп тұрғанда жүйе процесті жауып тастаса (батарея үнемдеу) — жазу жалғасады: TrackService қайта іске қосылады.
     */
    private fun restore(): TrackRec? = settings.trackDraft?.let { str ->
        runCatching {
            val o = JSONObject(str)
            val a = o.getJSONArray("pts")
            TrackRec(o.getLong("startedAt"), (0 until a.length()).map { i -> a.getJSONArray(i).let { LatLon(it.getDouble(0), it.getDouble(1)) } },
                o.optDouble("distance", 0.0), o.optLong("activeMs", 0L), if (o.optBoolean("running", false)) SystemClock.elapsedRealtime() else null)
        }.getOrNull()
    }

    companion object {
        const val MAX_ACCURACY = 35f
        const val MIN_STEP = 3.0
    }
}
