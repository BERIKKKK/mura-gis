package io.github.berikkkk.muragis.core.geo

import java.util.Locale
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.pow
import kotlin.math.roundToLong
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan

/**
 * UTM (WGS 84) ↔ географиялық координата. Тасымалдау формулалары (Snyder, USGS PP 1395), дәлдігі ~1 мм.
 * Аймақ 6°-тық стандартты тор бойынша (Норвегия/Шпицберген ерекшеліктерісіз — Қазақстан үшін қажет емес).
 */
object Utm {
    data class Point(val zone: Int, val south: Boolean, val easting: Double, val northing: Double) {
        /** Ендік белдеуінің әрпі (C…X); 80° S-тан оңтүстікте не 84° N-нан солтүстікте — бос. */
        var band: Char? = null
            internal set

        /** «40U 511874 5570147» — экранда көрсету және көшіру пішімі. */
        fun format(): String = "$zone${band ?: if (south) 'S' else 'N'} ${easting.roundToLong()} ${northing.roundToLong()}"
    }

    private const val A = 6378137.0
    private const val F = 1 / 298.257223563
    private const val K0 = 0.9996
    private val E2 = F * (2 - F)
    private val EP2 = E2 / (1 - E2)
    private const val BANDS = "CDEFGHJKLMNPQRSTUVWXX"
    private const val RAD = Math.PI / 180

    fun zoneOf(lon: Double) = (floor((lon + 180) / 6).toInt() + 1).coerceIn(1, 60)
    private fun centralMeridian(zone: Int) = ((zone - 1) * 6 - 180 + 3).toDouble()

    fun fromLatLon(lat: Double, lon: Double, zone: Int = zoneOf(lon)): Point {
        val p = lat * RAD; val l = lon * RAD; val l0 = centralMeridian(zone) * RAD
        val sp = sin(p); val cp = cos(p); val tp = tan(p)
        val n = A / sqrt(1 - E2 * sp * sp); val t = tp * tp; val c = EP2 * cp * cp; val a = cp * (l - l0)
        val e4 = E2 * E2; val e6 = e4 * E2
        val m = A * ((1 - E2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * p - (3 * E2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * sin(2 * p) +
            (15 * e4 / 256 + 45 * e6 / 1024) * sin(4 * p) - (35 * e6 / 3072) * sin(6 * p))
        val e = K0 * n * (a + (1 - t + c) * a.pow(3) / 6 + (5 - 18 * t + t * t + 72 * c - 58 * EP2) * a.pow(5) / 120) + 500000
        var no = K0 * (m + n * tp * (a * a / 2 + (5 - t + 9 * c + 4 * c * c) * a.pow(4) / 24 + (61 - 58 * t + t * t + 600 * c - 330 * EP2) * a.pow(6) / 720))
        if (lat < 0) no += 10_000_000.0
        return Point(zone, lat < 0, e, no).also { if (lat >= -80 && lat <= 84) it.band = BANDS[floor((lat + 80) / 8).toInt()] }
    }

    fun toLatLon(zone: Int, south: Boolean, easting: Double, northing: Double): LatLon {
        val e1 = (1 - sqrt(1 - E2)) / (1 + sqrt(1 - E2)); val e4 = E2 * E2; val e6 = e4 * E2
        val x = easting - 500000; val m = (if (south) northing - 10_000_000.0 else northing) / K0
        val mu = m / (A * (1 - E2 / 4 - 3 * e4 / 64 - 5 * e6 / 256))
        val p1 = mu + (3 * e1 / 2 - 27 * e1.pow(3) / 32) * sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1.pow(4) / 32) * sin(4 * mu) +
            (151 * e1.pow(3) / 96) * sin(6 * mu) + (1097 * e1.pow(4) / 512) * sin(8 * mu)
        val s1 = sin(p1); val c1 = cos(p1); val t1 = tan(p1)
        val n1 = A / sqrt(1 - E2 * s1 * s1); val tt = t1 * t1; val cc = EP2 * c1 * c1
        val r1 = A * (1 - E2) / (1 - E2 * s1 * s1).pow(1.5); val d = x / (n1 * K0)
        val lat = p1 - (n1 * t1 / r1) * (d * d / 2 - (5 + 3 * tt + 10 * cc - 4 * cc * cc - 9 * EP2) * d.pow(4) / 24 +
            (61 + 90 * tt + 298 * cc + 45 * tt * tt - 252 * EP2 - 3 * cc * cc) * d.pow(6) / 720)
        val lon = centralMeridian(zone) * RAD + (d - (1 + 2 * tt + cc) * d.pow(3) / 6 + (5 - 2 * cc + 28 * tt - 3 * cc * cc + 8 * EP2 + 24 * tt * tt) * d.pow(5) / 120) / c1
        return LatLon(lat / RAD, lon / RAD)
    }

    /** Көшіру пішімдері (DD / DMS / UTM) — бір жерде, барлық экран бірдей көшірсін. */
    fun formatDd(lat: Double, lon: Double) = String.format(Locale.ROOT, "%.6f, %.6f", lat, lon)
    fun formatDms(lat: Double, lon: Double) = Coords.dmsLat(lat) + " " + Coords.dmsLon(lon)
    fun formatUtm(lat: Double, lon: Double) = fromLatLon(lat, lon).format()
}
