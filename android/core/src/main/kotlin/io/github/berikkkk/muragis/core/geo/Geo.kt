package io.github.berikkkk.muragis.core.geo

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

data class LatLon(val lat: Double, val lon: Double)

/** Географиялық қамту: батыс, оңтүстік, шығыс, солтүстік (градус). */
data class Bounds(val west: Double, val south: Double, val east: Double, val north: Double) {
    val isValid get() = west.isFinite() && south.isFinite() && east.isFinite() && north.isFinite() && west <= east && south <= north
    fun contains(lat: Double, lon: Double) = lat in south..north && lon in west..east
    fun intersects(o: Bounds) = !(o.west > east || o.east < west || o.south > north || o.north < south)
    fun union(o: Bounds) = Bounds(min(west, o.west), min(south, o.south), max(east, o.east), max(north, o.north))
    fun encode() = "$west,$south,$east,$north"

    companion object {
        val WORLD = Bounds(-180.0, -85.0511287798, 180.0, 85.0511287798)
        fun decode(s: String?): Bounds? {
            val p = s?.split(',')?.mapNotNull { it.trim().toDoubleOrNull() } ?: return null
            return if (p.size == 4) Bounds(p[0], p[1], p[2], p[3]).takeIf { it.isValid } else null
        }
    }
}

object Geo {
    /** Жер радиусы — жұмыс үстеліндегі routes/graph.js dist() функциясындағыдай (м). */
    const val R = 6371008.8

    private fun rad(d: Double) = d * PI / 180.0

    /** Екі нүкте арасындағы қашықтық (гаверсинус формуласы), метр. */
    fun distance(aLat: Double, aLon: Double, bLat: Double, bLon: Double): Double {
        val dLat = rad(bLat - aLat)
        val dLon = rad(bLon - aLon)
        val h = sin(dLat / 2).let { it * it } + cos(rad(aLat)) * cos(rad(bLat)) * sin(dLon / 2).let { it * it }
        return 2 * R * asin(min(1.0, sqrt(h)))
    }

    fun length(pts: List<LatLon>): Double {
        var s = 0.0
        for (i in 1 until pts.size) s += distance(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon)
        return s
    }

    /** Дуглас–Пекер бойынша жеңілдету (tol — метр); тректерді импорттағанда қолданылады. */
    fun simplify(pts: List<LatLon>, tolMeters: Double = 3.0): List<LatLon> {
        if (pts.size < 3) return pts
        val lat0 = rad(pts.sumOf { it.lat } / pts.size)
        val kx = cos(lat0) * R * PI / 180.0
        val ky = R * PI / 180.0
        val xs = DoubleArray(pts.size) { pts[it].lon * kx }
        val ys = DoubleArray(pts.size) { pts[it].lat * ky }
        val keep = BooleanArray(pts.size)
        keep[0] = true; keep[pts.size - 1] = true
        val stack = ArrayDeque<IntArray>()
        stack.addLast(intArrayOf(0, pts.size - 1))
        while (stack.isNotEmpty()) {
            val (a, b) = stack.removeLast().let { it[0] to it[1] }
            var best = -1.0
            var idx = -1
            for (i in a + 1 until b) {
                val d = segDist(xs[i], ys[i], xs[a], ys[a], xs[b], ys[b])
                if (d > best) { best = d; idx = i }
            }
            if (idx >= 0 && best > tolMeters) {
                keep[idx] = true
                stack.addLast(intArrayOf(a, idx)); stack.addLast(intArrayOf(idx, b))
            }
        }
        return pts.filterIndexed { i, _ -> keep[i] }
    }

    private fun segDist(px: Double, py: Double, ax: Double, ay: Double, bx: Double, by: Double): Double {
        val dx = bx - ax; val dy = by - ay
        val l2 = dx * dx + dy * dy
        val t = if (l2 == 0.0) 0.0 else ((px - ax) * dx + (py - ay) * dy) / l2
        val c = t.coerceIn(0.0, 1.0)
        val ex = ax + c * dx - px; val ey = ay + c * dy - py
        return sqrt(ex * ex + ey * ey)
    }

    fun bounds(pts: List<LatLon>): Bounds? {
        if (pts.isEmpty()) return null
        return Bounds(pts.minOf { it.lon }, pts.minOf { it.lat }, pts.maxOf { it.lon }, pts.maxOf { it.lat })
    }

    fun approxEquals(a: Double, b: Double, eps: Double = 1e-9) = abs(a - b) <= eps
}
