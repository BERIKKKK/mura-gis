package io.github.berikkkk.muragis.core.gpkg

import java.nio.ByteBuffer
import java.nio.ByteOrder

/** GeoPackage геометриясы (GPB тақырыбы + WKB) — жұмыс үстеліндегі main/gpkg.js encodeGeom/decodeGeom. Координаталар [lon, lat]. */
sealed interface Geom {
    data class Point(val x: Double, val y: Double) : Geom
    data class Line(val pts: List<DoubleArray>) : Geom
    data class Polygon(val rings: List<List<DoubleArray>>) : Geom
}

object GpkgGeometry {
    const val SRS = 4326

    fun encode(g: Geom): ByteArray {
        val flat: List<DoubleArray> = when (g) {
            is Geom.Point -> listOf(doubleArrayOf(g.x, g.y))
            is Geom.Line -> g.pts
            is Geom.Polygon -> g.rings.flatten()
        }
        val env = if (g is Geom.Point || flat.isEmpty()) null else doubleArrayOf(
            flat.minOf { it[0] }, flat.maxOf { it[0] }, flat.minOf { it[1] }, flat.maxOf { it[1] },
        )
        val wkbLen = 5 + when (g) {
            is Geom.Point -> 16
            is Geom.Line -> 4 + 16 * g.pts.size
            is Geom.Polygon -> 4 + g.rings.sumOf { 4 + 16 * it.size }
        }
        val b = ByteBuffer.allocate(8 + (if (env != null) 32 else 0) + wkbLen).order(ByteOrder.LITTLE_ENDIAN)
        b.put('G'.code.toByte()).put('P'.code.toByte()).put(0)
        b.put((((if (env != null) 1 else 0) shl 1) or 1).toByte())
        b.putInt(SRS)
        env?.forEach { b.putDouble(it) }
        b.put(1)
        when (g) {
            is Geom.Point -> { b.putInt(1); b.putDouble(g.x); b.putDouble(g.y) }
            is Geom.Line -> { b.putInt(2); b.putInt(g.pts.size); g.pts.forEach { b.putDouble(it[0]); b.putDouble(it[1]) } }
            is Geom.Polygon -> {
                b.putInt(3); b.putInt(g.rings.size)
                for (r in g.rings) { b.putInt(r.size); r.forEach { b.putDouble(it[0]); b.putDouble(it[1]) } }
            }
        }
        return b.array()
    }

    /** GPB → геометрия (Multi* — бірінші бөлігі). Оқылмаса — null. */
    fun decode(buf: ByteArray?): Geom? {
        try {
            if (buf == null || buf.size < 8) return null
            if (buf[0] != 'G'.code.toByte() || buf[1] != 'P'.code.toByte()) return null
            val flags = buf[3].toInt() and 0xff
            if (flags and 0x10 != 0) return null
            val envLen = intArrayOf(0, 32, 48, 48, 64).getOrElse((flags shr 1) and 7) { 0 }
            return readWkb(buf, 8 + envLen)
        } catch (e: Exception) {
            return null
        }
    }

    private fun readWkb(buf: ByteArray, start: Int): Geom? {
        val b = ByteBuffer.wrap(buf)
        var o = start
        b.order(if (buf[o].toInt() == 1) ByteOrder.LITTLE_ENDIAN else ByteOrder.BIG_ENDIAN)
        var t = b.getInt(o + 1).toLong() and 0xffffffffL
        o += 5
        var dims = 2
        if (t and 0x80000000L != 0L || t and 0x40000000L != 0L) {
            dims += (if (t and 0x80000000L != 0L) 1 else 0) + (if (t and 0x40000000L != 0L) 1 else 0)
            t = t and 0xffffL
        }
        if (t > 1000) { dims += if (t / 1000 == 3L) 2 else 1; t %= 1000 }
        fun pt(): DoubleArray { val p = doubleArrayOf(b.getDouble(o), b.getDouble(o + 8)); o += 8 * dims; return p }
        fun line(): List<DoubleArray> { val n = b.getInt(o); o += 4; return List(n) { pt() } }
        return when (t) {
            1L -> pt().let { Geom.Point(it[0], it[1]) }
            2L -> Geom.Line(line())
            3L -> { val n = b.getInt(o); o += 4; Geom.Polygon(List(n) { line() }) }
            4L, 5L, 6L -> { val n = b.getInt(o); o += 4; if (n == 0) null else readWkb(buf, o) }
            else -> null
        }
    }
}
