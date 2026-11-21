package io.github.berikkkk.muragis.mobile.util

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Looper
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * GPS (Google Play қызметтерінсіз — платформаның LocationManager). Тек қажет кезде қосылады:
 * «Менің орным» қосулы және экран ашық болғанда, не бір реттік нүкте сұралғанда; әйтпесе тоқтатылады (батареяны үнемдеу).
 * Интернетсіз жұмыс істейді (GPS спутниктері).
 */
class LocationTracker(ctx: Context) {
    private val lm = ctx.getSystemService(LocationManager::class.java)
    private val _location = MutableStateFlow<Location?>(null)
    val location: StateFlow<Location?> = _location
    @Volatile private var active = false
    private var oneShot: ((Location?) -> Unit)? = null
    private val handler = android.os.Handler(Looper.getMainLooper())

    private val listener = LocationListener { loc ->
        val cur = _location.value
        // Ескі не дәлдігі нашар желі нүктесі жақсы GPS нүктесін ауыстырмайды
        if (cur == null || loc.time - cur.time > 10_000 || loc.accuracy <= cur.accuracy + 5) _location.value = loc
        oneShot?.let { cb -> if (loc.accuracy <= 25f) { oneShot = null; cb(loc); if (!keepRunning) stopInternal() } }
    }

    private var keepRunning = false

    val gpsEnabled: Boolean get() = runCatching { lm.isProviderEnabled(LocationManager.GPS_PROVIDER) }.getOrDefault(false)

    @SuppressLint("MissingPermission")
    private fun startInternal() {
        if (active) return
        active = true
        for (p in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)) {
            runCatching {
                if (lm.isProviderEnabled(p)) {
                    // 1 с сайын: картадағы белгі нүктелер арасында тегіс жылжиды, жиірек нүкте — кешігу аз, бұрылыс дәлірек
                    lm.requestLocationUpdates(p, 1000L, 1f, listener, Looper.getMainLooper())
                    lm.getLastKnownLocation(p)?.let { if (_location.value == null) _location.value = it }
                }
            }
        }
    }

    private fun stopInternal() {
        if (!active) return
        active = false
        runCatching { lm.removeUpdates(listener) }
    }

    /** Үздіксіз бақылау (карта экраны ашық, «менің орным» қосулы). Рұқсат бар екенін шақырушы тексереді. */
    fun setTracking(on: Boolean) {
        keepRunning = on
        if (on) startInternal() else if (oneShot == null) stopInternal()
    }

    /** Бір рет дәл нүкте (≤25 м) не 30 с ішіндегі ең жақсысы. */
    fun requestFix(cb: (Location?) -> Unit) {
        oneShot = cb
        startInternal()
        handler.postDelayed({
            val pending = oneShot ?: return@postDelayed
            oneShot = null
            pending(_location.value)
            if (!keepRunning) stopInternal()
        }, 30_000)
    }
}
