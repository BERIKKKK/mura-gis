package io.github.berikkkk.muragis.packager

import io.github.berikkkk.muragis.core.geo.Bounds
import java.io.File
import kotlin.math.PI
import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Copernicus DEM GLO‑30 негізіндегі биіктік торы: бірнеше 1°×1° тайлдан аумаққа тұрақты торды (ендік/бойлық бойынша)
 * құрастырады. Тор қадамы — дереккөздің өз қадамы (1″ × 1.5″, 50° ендіктен солтүстікте ≈ 30 м).
 */
class DemGrid(val bounds: Bounds, val dLat: Double, val dLon: Double, val rows: Int, val cols: Int, val z: FloatArray) {
    fun lat(r: Double) = bounds.north - r * dLat
    fun lon(c: Double) = bounds.west + c * dLon
    operator fun get(r: Int, c: Int) = z[r * cols + c]

    /** Бөлшек тор координатасындағы мән (билинейлі). */
    fun sample(r: Double, c: Double): Float {
        val r0 = floor(r).toInt().coerceIn(0, rows - 2); val c0 = floor(c).toInt().coerceIn(0, cols - 2)
        val fr = (r - r0).toFloat().coerceIn(0f, 1f); val fc = (c - c0).toFloat().coerceIn(0f, 1f)
        val a = this[r0, c0]; val b = this[r0, c0 + 1]; val cc = this[r0 + 1, c0]; val d = this[r0 + 1, c0 + 1]
        return (a * (1 - fc) + b * fc) * (1 - fr) + (cc * (1 - fc) + d * fc) * fr
    }

    companion object {
        /** [dir] ішіндегі Copernicus_DSM_COG_10_N50_00_E055_00_DEM.tif сияқты файлдардан тор құрастыру. */
        fun build(dir: File, b: Bounds): DemGrid {
            val tiles = HashMap<String, Pair<GeoTiff, FloatArray>>()
            fun tile(lat: Int, lon: Int): Pair<GeoTiff, FloatArray>? {
                val key = "$lat,$lon"
                tiles[key]?.let { return it }
                val ns = if (lat >= 0) "N%02d".format(lat) else "S%02d".format(-lat)
                val ew = if (lon >= 0) "E%03d".format(lon) else "W%03d".format(-lon)
                val f = File(dir, "Copernicus_DSM_COG_10_${ns}_00_${ew}_00_DEM.tif")
                if (!f.isFile) return null
                val t = GeoTiff(f)
                println("  DEM: $t")
                return (t to t.readFloats()).also { tiles[key] = it }
            }
            val dLat = 1.0 / 3600
            val dLon = if (min(kotlin.math.abs(b.south), kotlin.math.abs(b.north)) >= 50) 1.5 / 3600 else 1.0 / 3600
            val rows = ((b.north - b.south) / dLat).toInt() + 1
            val cols = ((b.east - b.west) / dLon).toInt() + 1
            val z = FloatArray(rows * cols)
            var missing = 0L
            for (r in 0 until rows) {
                val lat = b.north - r * dLat
                for (c in 0 until cols) {
                    val lon = b.west + c * dLon
                    val t = tile(floor(lat).toInt(), floor(lon).toInt())
                    if (t == null) { missing++; continue }
                    val (g, data) = t
                    // Пиксель орталары: (originX + (i + 0.5)·scaleX)
                    val px = (lon - g.originX) / g.scaleX - 0.5
                    val py = (g.originY - lat) / g.scaleY - 0.5
                    val x0 = floor(px).toInt().coerceIn(0, g.width - 2); val y0 = floor(py).toInt().coerceIn(0, g.height - 2)
                    val fx = (px - x0).toFloat().coerceIn(0f, 1f); val fy = (py - y0).toFloat().coerceIn(0f, 1f)
                    val w = g.width
                    val v = (data[y0 * w + x0] * (1 - fx) + data[y0 * w + x0 + 1] * fx) * (1 - fy) +
                        (data[(y0 + 1) * w + x0] * (1 - fx) + data[(y0 + 1) * w + x0 + 1] * fx) * fy
                    z[r * cols + c] = v
                }
            }
            tiles.values.forEach { it.first.close() }
            require(missing == 0L) { "DEM tiles are missing for $missing grid cells" }
            return DemGrid(b, dLat, dLon, rows, cols, z)
        }
    }

    /** Жұмсарту: 3×3 орташа, [passes] рет (DSM-дегі ұсақ «шуды» горизонтальдардан алып тастау үшін). */
    fun smoothed(passes: Int): DemGrid {
        var src = z.copyOf()
        val tmp = FloatArray(src.size)
        repeat(passes) {
            for (r in 0 until rows) for (c in 0 until cols) {
                var s = 0f; var n = 0
                for (dr in -1..1) { val rr = r + dr; if (rr < 0 || rr >= rows) continue
                    for (dc in -1..1) { val c2 = c + dc; if (c2 < 0 || c2 >= cols) continue; s += src[rr * cols + c2]; n++ } }
                tmp[r * cols + c] = s / n
            }
            src = tmp.copyOf()
        }
        return DemGrid(bounds, dLat, dLon, rows, cols, src)
    }

    /**
     * Жер бедерінің көлеңкесі (Horn әдісі), 0..1. Күн: азимут 315°, биіктігі 45°; жазық далада бедер көрінуі үшін
     * тік масштаб [zFactor] есе үлкейтіледі.
     */
    fun hillshade(zFactor: Double = 3.0, azimuth: Double = 315.0, altitude: Double = 45.0): FloatArray {
        val out = FloatArray(rows * cols)
        val zen = (90 - altitude) * PI / 180
        val az = (360 - azimuth + 90) % 360 * PI / 180
        for (r in 0 until rows) {
            val lat = lat(r.toDouble()) * PI / 180
            val dx = dLon * 111_320.0 * cos(lat)
            val dy = dLat * 110_574.0
            for (c in 0 until cols) {
                fun e(rr: Int, cc: Int) = this[rr.coerceIn(0, rows - 1), cc.coerceIn(0, cols - 1)].toDouble()
                val a = e(r - 1, c - 1); val b = e(r - 1, c); val cc = e(r - 1, c + 1)
                val d = e(r, c - 1); val f = e(r, c + 1)
                val g = e(r + 1, c - 1); val h = e(r + 1, c); val i = e(r + 1, c + 1)
                val dzdx = ((cc + 2 * f + i) - (a + 2 * d + g)) / (8 * dx) * zFactor
                val dzdy = ((g + 2 * h + i) - (a + 2 * b + cc)) / (8 * dy) * zFactor
                val slope = atan(sqrt(dzdx * dzdx + dzdy * dzdy))
                val aspect = kotlin.math.atan2(dzdy, -dzdx)
                val s = cos(zen) * cos(slope) + sin(zen) * sin(slope) * cos(az - aspect)
                out[r * cols + c] = s.coerceIn(0.0, 1.0).toFloat()
            }
        }
        return out
    }

    fun range(): Pair<Float, Float> {
        var lo = Float.MAX_VALUE; var hi = -Float.MAX_VALUE
        for (v in z) { lo = min(lo, v); hi = max(hi, v) }
        return lo to hi
    }
}
