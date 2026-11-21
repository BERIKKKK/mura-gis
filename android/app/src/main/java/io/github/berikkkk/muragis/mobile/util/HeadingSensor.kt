package io.github.berikkkk.muragis.mobile.util

import android.content.Context
import android.hardware.GeomagneticField
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import android.hardware.display.DisplayManager
import android.view.Display
import android.view.Surface
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin

/**
 * Құрылғының компасы (айналу векторы датчигі): телефонның үсті қай бағытқа қарап тұрғанын градуспен береді
 * (0 — нақты солтүстік, сағат тілімен). Тек навигация режимі қосулы және экран ашық кезде жұмыс істейді.
 * Шуды азайту үшін тегістеледі, карта жиі қайта салынбауы үшін ~1,5°-тан аз өзгеріс жіберілмейді.
 */
class HeadingSensor(ctx: Context) {
    private val sm = ctx.getSystemService(SensorManager::class.java)
    private val sensor: Sensor? = sm?.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    private val _heading = MutableStateFlow<Float?>(null)
    val heading: StateFlow<Float?> = _heading
    val available: Boolean get() = sensor != null

    /** Магниттік ауытқу (нақты солтүстікке түзету), GPS нүктесі белгілі болса. */
    @Volatile var declination = 0f; private set
    private var declAt = 0L

    private var active = false
    private val rot = FloatArray(9)
    private val remapped = FloatArray(9)
    private val orient = FloatArray(3)
    private var smooth: Double? = null
    private var lastEmit = 0L

    private val listener = object : SensorEventListener {
        override fun onSensorChanged(e: SensorEvent) {
            SensorManager.getRotationMatrixFromVector(rot, e.values)
            val (ax, ay) = when (displayRotation()) {
                Surface.ROTATION_90 -> SensorManager.AXIS_Y to SensorManager.AXIS_MINUS_X
                Surface.ROTATION_180 -> SensorManager.AXIS_MINUS_X to SensorManager.AXIS_MINUS_Y
                Surface.ROTATION_270 -> SensorManager.AXIS_MINUS_Y to SensorManager.AXIS_X
                else -> SensorManager.AXIS_X to SensorManager.AXIS_Y
            }
            SensorManager.remapCoordinateSystem(rot, ax, ay, remapped)
            SensorManager.getOrientation(remapped, orient)
            val raw = Math.toRadians(Math.toDegrees(orient[0].toDouble()) + declination)
            // Бұрышты тегістеу (359° → 1° өтуі дұрыс болуы үшін — бірлік шеңбер арқылы)
            val s = smooth
            smooth = if (s == null) raw else {
                val k = 0.2
                atan2((1 - k) * sin(s) + k * sin(raw), (1 - k) * cos(s) + k * cos(raw))
            }
            val deg = ((Math.toDegrees(smooth!!) % 360 + 360) % 360).toFloat()
            val now = SystemClock.elapsedRealtime()
            val prev = _heading.value
            if (prev == null || (angleDiff(prev, deg) >= 1.5f && now - lastEmit >= 80)) {
                lastEmit = now
                _heading.value = deg
            }
        }
        override fun onAccuracyChanged(s: Sensor?, a: Int) {}
    }

    // Қосымша контексінен де жұмыс істейді (Activity керек емес)
    private val dm = ctx.getSystemService(DisplayManager::class.java)
    private fun displayRotation(): Int = runCatching { dm.getDisplay(Display.DEFAULT_DISPLAY).rotation }.getOrDefault(Surface.ROTATION_0)

    fun setActive(on: Boolean) {
        if (on == active || sensor == null) return
        active = on
        if (on) {
            smooth = null
            sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_UI)
        } else {
            sm.unregisterListener(listener)
            _heading.value = null
        }
    }

    /** GPS нүктесі бойынша магниттік ауытқуды жаңарту (жиі емес — 10 минутта бір рет жеткілікті). */
    fun updateDeclination(lat: Double, lon: Double, alt: Double) {
        val now = SystemClock.elapsedRealtime()
        if (declAt != 0L && now - declAt < 600_000) return
        declAt = now
        declination = GeomagneticField(lat.toFloat(), lon.toFloat(), alt.toFloat(), System.currentTimeMillis()).declination
    }

    companion object {
        fun angleDiff(a: Float, b: Float): Float { val d = abs(a - b) % 360; return if (d > 180) 360 - d else d }
    }
}
