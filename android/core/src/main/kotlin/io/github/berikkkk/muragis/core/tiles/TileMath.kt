package io.github.berikkkk.muragis.core.tiles

import io.github.berikkkk.muragis.core.geo.Bounds
import kotlin.math.PI
import kotlin.math.atan
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sinh
import kotlin.math.tan

/** Web Mercator (EPSG:3857) тайл торы, XYZ нөмірлеу (y — солтүстіктен оңтүстікке). */
object TileMath {
    const val MAX_LAT = 85.0511287798066
    const val EARTH_HALF = 20037508.342789244

    fun n(z: Int) = 1 shl z

    fun lonToX(lon: Double, z: Int): Int = floor((lon + 180.0) / 360.0 * n(z)).toInt().coerceIn(0, n(z) - 1)

    fun latToY(lat: Double, z: Int): Int {
        val l = lat.coerceIn(-MAX_LAT, MAX_LAT) * PI / 180.0
        val y = (1.0 - ln(tan(l) + 1.0 / kotlin.math.cos(l)) / PI) / 2.0 * n(z)
        return floor(y).toInt().coerceIn(0, n(z) - 1)
    }

    fun xToLon(x: Int, z: Int) = x.toDouble() / n(z) * 360.0 - 180.0
    fun yToLat(y: Int, z: Int) = atan(sinh(PI * (1 - 2.0 * y / n(z)))) * 180.0 / PI

    /** Тайлдың географиялық шекарасы. */
    fun tileBounds(z: Int, x: Int, y: Int) = Bounds(xToLon(x, z), yToLat(y + 1, z), xToLon(x + 1, z), yToLat(y, z))

    /** TMS ↔ XYZ: жол нөмірін аудару (MBTiles tile_row — TMS, яғни оңтүстіктен). */
    fun flipY(y: Int, z: Int) = n(z) - 1 - y

    data class Range(val z: Int, val minX: Int, val maxX: Int, val minY: Int, val maxY: Int) {
        val count: Long get() = (maxX - minX + 1).toLong() * (maxY - minY + 1).toLong()
    }

    fun range(b: Bounds, z: Int): Range {
        val minX = lonToX(b.west, z); val maxX = lonToX(b.east - 1e-12, z)
        val minY = latToY(b.north, z); val maxY = latToY(b.south + 1e-12, z)
        return Range(z, minX, maxOf(minX, maxX), minY, maxOf(minY, maxY))
    }

    /** Аумақтағы тайлдар саны [minZ..maxZ] (жүктеу көлемін алдын ала есептеу). */
    fun count(b: Bounds, minZ: Int, maxZ: Int): Long = (minZ..maxZ).sumOf { range(b, it).count }

    /** Тайлдар аралығы → география (қамту аумағы). */
    fun rangeBounds(r: Range) = Bounds(xToLon(r.minX, r.z), yToLat(r.maxY + 1, r.z), xToLon(r.maxX + 1, r.z), yToLat(r.minY, r.z))

    /* ---------- Эллипсоидтық Меркатор (EPSG:3395, мыс. SAS.Planet-тегі Яндекс карталары) ---------- */
    private const val E = 0.0818191908426215   // WGS 84 эксцентриситеті

    /** Ендік → 3395 торындағы глобалдық Y (0..1, солтүстіктен). */
    fun latToY3395(lat: Double): Double {
        val phi = lat.coerceIn(-MAX_LAT, MAX_LAT) * PI / 180.0
        val con = E * sin(phi)
        val ts = tan(PI / 4 + phi / 2) * ((1 - con) / (1 + con)).pow(E / 2)
        return (1.0 - ln(ts) / PI) / 2.0
    }

    /** Ендік → 3857 торындағы глобалдық Y (0..1). */
    fun latToY3857(lat: Double): Double {
        val l = lat.coerceIn(-MAX_LAT, MAX_LAT) * PI / 180.0
        return (1.0 - ln(tan(l) + 1.0 / kotlin.math.cos(l)) / PI) / 2.0
    }

    /** 3857 глобалдық Y (0..1) → ендік. */
    fun y3857ToLat(y: Double) = atan(sinh(PI * (1 - 2.0 * y))) * 180.0 / PI

    @Suppress("unused")
    private fun unusedExp() = exp(0.0)
}
