package io.github.berikkkk.muragis.packager

import java.io.File
import java.util.Locale
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.hypot

/**
 * Биіктік горизонтальдары: «marching squares» әдісімен әр деңгейдің кесінділерін табу, оларды тор қырларының
 * кілттері арқылы тұтас сызықтарға жалғау, Дуглас–Пекер бойынша жеңілдету және GeoJSON-ға жазу.
 */
object Contours {
    data class Line(val ele: Int, val pts: DoubleArray)   // lon,lat,lon,lat,…

    /** [interval] метр сайын; [minLengthM] метрден қысқа тұйық ілмектер (DSM шуы) тасталады. */
    fun trace(g: DemGrid, interval: Int, minLengthM: Double): List<Line> {
        val (lo, hi) = g.range()
        val out = ArrayList<Line>()
        var level = ceil(lo / interval).toInt() * interval
        while (level <= floor(hi)) {
            out += traceLevel(g, level.toFloat(), minLengthM)
            level += interval
        }
        return out
    }

    // Қыр кілті: көлденең қыр (r,c)-(r,c+1) → 2·(r·cols+c), тік қыр (r,c)-(r+1,c) → 2·(r·cols+c)+1
    private fun traceLevel(g: DemGrid, lv: Float, minLengthM: Double): List<Line> {
        val cols = g.cols
        val adj = HashMap<Long, LongArray>()   // қыр → [көрші1, көрші2] (−1 — жоқ)
        fun link(a: Long, b: Long) {
            adj.getOrPut(a) { longArrayOf(-1, -1) }.let { if (it[0] < 0) it[0] = b else it[1] = b }
            adj.getOrPut(b) { longArrayOf(-1, -1) }.let { if (it[0] < 0) it[0] = a else it[1] = a }
        }
        for (r in 0 until g.rows - 1) for (c in 0 until cols - 1) {
            val tl = g[r, c] >= lv; val tr = g[r, c + 1] >= lv; val br = g[r + 1, c + 1] >= lv; val bl = g[r + 1, c] >= lv
            val idx = (if (tl) 8 else 0) or (if (tr) 4 else 0) or (if (br) 2 else 0) or (if (bl) 1 else 0)
            if (idx == 0 || idx == 15) continue
            val top = 2L * (r.toLong() * cols + c); val bottom = 2L * ((r + 1).toLong() * cols + c)
            val left = 2L * (r.toLong() * cols + c) + 1; val right = 2L * (r.toLong() * cols + c + 1) + 1
            when (idx) {
                1, 14 -> link(left, bottom)
                2, 13 -> link(bottom, right)
                3, 12 -> link(left, right)
                4, 11 -> link(top, right)
                6, 9 -> link(top, bottom)
                7, 8 -> link(left, top)
                5, 10 -> {
                    val center = (g[r, c] + g[r, c + 1] + g[r + 1, c] + g[r + 1, c + 1]) / 4 >= lv
                    if ((idx == 5) == center) { link(left, top); link(bottom, right) } else { link(left, bottom); link(top, right) }
                }
            }
        }
        fun point(e: Long, buf: DoubleArray, i: Int) {
            val cell = e / 2; val r = (cell / cols).toInt(); val c = (cell % cols).toInt()
            val vertical = e % 2 == 1L
            val a = g[r, c]; val b = if (vertical) g[r + 1, c] else g[r, c + 1]
            val t = if (b == a) 0.5 else ((lv - a) / (b - a)).toDouble().coerceIn(0.0, 1.0)
            val rr = if (vertical) r + t else r.toDouble(); val cc = if (vertical) c.toDouble() else c + t
            buf[i] = g.lon(cc); buf[i + 1] = g.lat(rr)
        }
        val seen = HashSet<Long>(adj.size * 2)
        val lines = ArrayList<Line>()
        // Алдымен ашық сызықтардың ұштарынан (бір көршісі бар қырлар), сосын тұйық ілмектер
        val starts = adj.entries.filter { it.value[1] < 0 }.map { it.key } + adj.keys
        for (s in starts) {
            if (s in seen) continue
            val chain = ArrayList<Long>()
            var prev = -1L; var cur = s
            while (cur >= 0 && cur !in seen) {
                seen += cur; chain += cur
                val n = adj[cur]!!
                val nx = if (n[0] != prev && n[0] !in seen) n[0] else if (n[1] != prev && n[1] !in seen) n[1] else -1
                prev = cur; cur = nx
            }
            val closed = adj[s]!!.let { it[1] >= 0 } && chain.size > 2 && adj[chain.last()]!!.contains(s)
            if (closed) chain += s
            if (chain.size < 3) continue
            val buf = DoubleArray(chain.size * 2)
            chain.forEachIndexed { i, e -> point(e, buf, i * 2) }
            if (closed && lengthM(buf) < minLengthM) continue
            lines += Line(lv.toInt(), simplify(buf, g.dLat * 0.35))
        }
        return lines
    }

    fun lengthM(p: DoubleArray): Double {
        var s = 0.0
        for (i in 2 until p.size step 2) {
            val k = cos(Math.toRadians(p[i + 1]))
            s += hypot((p[i] - p[i - 2]) * 111_320 * k, (p[i + 1] - p[i - 1]) * 110_574)
        }
        return s
    }

    /** Дуглас–Пекер (градуспен, бойлық cos(ендік)-ке түзетілген). */
    fun simplify(p: DoubleArray, tol: Double): DoubleArray {
        val n = p.size / 2
        if (n < 3) return p
        val keep = BooleanArray(n); keep[0] = true; keep[n - 1] = true
        val k = cos(Math.toRadians(p[1]))
        val stack = ArrayDeque<IntArray>(); stack += intArrayOf(0, n - 1)
        while (stack.isNotEmpty()) {
            val (a, b) = stack.removeLast()
            var best = -1; var bd = tol
            val ax = p[a * 2] * k; val ay = p[a * 2 + 1]; val bx = p[b * 2] * k; val by = p[b * 2 + 1]
            val dx = bx - ax; val dy = by - ay; val len = hypot(dx, dy)
            for (i in a + 1 until b) {
                val px = p[i * 2] * k; val py = p[i * 2 + 1]
                val d = if (len == 0.0) hypot(px - ax, py - ay) else kotlin.math.abs(dy * px - dx * py + bx * ay - by * ax) / len
                if (d > bd) { bd = d; best = i }
            }
            if (best >= 0) { keep[best] = true; stack += intArrayOf(a, best); stack += intArrayOf(best, b) }
        }
        val out = DoubleArray(keep.count { it } * 2)
        var j = 0
        for (i in 0 until n) if (keep[i]) { out[j++] = p[i * 2]; out[j++] = p[i * 2 + 1] }
        return out
    }

    fun writeGeoJson(lines: List<Line>, file: File, indexEvery: Int) {
        file.bufferedWriter().use { w ->
            w.write("{\"type\":\"FeatureCollection\",\"features\":[\n")
            lines.forEachIndexed { i, l ->
                if (i > 0) w.write(",\n")
                w.write("{\"type\":\"Feature\",\"properties\":{\"ele\":${l.ele},\"idx\":\"${if (l.ele % indexEvery == 0) 1 else 0}\"},")
                w.write("\"geometry\":{\"type\":\"LineString\",\"coordinates\":[")
                for (k in 0 until l.pts.size / 2) {
                    if (k > 0) w.write(",")
                    w.write(String.format(Locale.ROOT, "[%.6f,%.6f]", l.pts[k * 2], l.pts[k * 2 + 1]))
                }
                w.write("]}}")
            }
            w.write("\n]}\n")
        }
    }
}
