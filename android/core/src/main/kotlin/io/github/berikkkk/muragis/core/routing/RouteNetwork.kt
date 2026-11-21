package io.github.berikkkk.muragis.core.routing

import io.github.berikkkk.muragis.core.geo.Geo
import io.github.berikkkk.muragis.core.geo.LatLon
import io.github.berikkkk.muragis.core.model.Monument
import io.github.berikkkk.muragis.core.model.Route
import io.github.berikkkk.muragis.core.model.Season
import io.github.berikkkk.muragis.core.model.Vehicle
import java.util.PriorityQueue
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor

/**
 * Сақталған маршруттар желісі және жол іздеу — жұмыс үстеліндегі src/routes/graph.js (buildNetwork, findPath) көшірмесі.
 * Әр маршрут — сынық сызық. Желі түйіндері: маршрут ұштары, Т/Х-тәрізді тораптар, ескерткіш маңындағы нүктелер.
 * Жол іздеу — Дейкстра (салмағы — жүру уақыты). Басы/соңы желіден тыс болса — ең жақын қабырғаға дейін түзу бөлік.
 * Нәтиже жұмыс үстелі кодымен кросс-тексеріледі (RouteNetworkTest, android/tools/desktop-compat.mjs find-path).
 */
class RouteNetwork private constructor(val nodes: List<Node>, val edges: List<Edge>, private val adj: List<List<Edge>>, private val markNode: Map<String, Int>) {

    data class Node(val id: Int, val lat: Double, val lon: Double, val markId: String)
    class Edge(val id: Int, val a: Int, val b: Int, val len: Double, val coords: List<LatLon>, val route: Route)

    /** Жол іздеу параметрлері: көлік (желі қабырғасының рұқсаты мен жылдамдығы) және «ылғалды маусым». */
    data class Options(val vehicle: Vehicle = Vehicle.OFFROAD, val wet: Boolean = false)

    /** Басы не соңы: желі түйіні, ескерткіш (id + координата) не кез келген нүкте. */
    data class End(val lat: Double, val lon: Double, val markId: String? = null, val node: Int? = null)

    data class Leg(val route: Route, val len: Double, val coords: List<LatLon>)

    /** Желіден тыс түзу бөлік (басында не соңында). */
    data class OffLeg(val from: LatLon, val to: LatLon, val len: Double)

    sealed interface Result {
        data class Ok(val legs: List<Leg>, val len: Double, val timeSeconds: Double, val coords: List<LatLon>, val offStart: OffLeg?, val offEnd: OffLeg?) : Result {
            /** Толық сызық: желіден тыс бөліктер қоса. */
            val fullCoords: List<LatLon> get() = buildList {
                offStart?.let { add(it.from) }
                addAll(coords)
                offEnd?.let { add(it.to) }
            }
            val totalLen: Double get() = len + (offStart?.len ?: 0.0) + (offEnd?.len ?: 0.0)
        }

        /** NO_GRAPH — офлайн жол графы бұл жерді қамтымайды (не нүкте жолдан тым алыс). */
        enum class Error { NO_NETWORK, NOT_CONNECTED, NO_GRAPH }
        data class Failed(val error: Error) : Result
    }

    companion object {
        const val SNAP_M = 150.0
        const val MARK_M = 300.0
        private const val PAD = 0.005
        private const val RAD = PI / 180.0
        private val R = Geo.R

        fun rank(v: Vehicle) = when (v) { Vehicle.CAR -> 0; Vehicle.OFFROAD -> 1; Vehicle.FOOT -> 2 }
        /** Жұмыс үстеліндегі VEHICLES[].speed, км/сағ. */
        fun speedKmh(v: Vehicle) = when (v) { Vehicle.CAR -> 50.0; Vehicle.OFFROAD -> 30.0; Vehicle.FOOT -> 4.5 }

        private fun dist(a: LatLon, b: LatLon) = Geo.distance(a.lat, a.lon, b.lat, b.lon)
        private fun xy(p: LatLon, lat0: Double) = doubleArrayOf(p.lon * RAD * R * cos(lat0 * RAD), p.lat * RAD * R)
        private fun ll(x: Double, y: Double, lat0: Double) = LatLon(y / R / RAD, x / (R * cos(lat0 * RAD)) / RAD)

        private class Proj(val i: Int, val t: Double, val point: LatLon, val d: Double)

        private fun projSeg(p: LatLon, a: LatLon, b: LatLon): Triple<Double, LatLon, Double> {
            val lat0 = p.lat
            val pp = xy(p, lat0); val aa = xy(a, lat0); val bb = xy(b, lat0)
            val dx = bb[0] - aa[0]; val dy = bb[1] - aa[1]; val l2 = dx * dx + dy * dy
            var t = if (l2 != 0.0) ((pp[0] - aa[0]) * dx + (pp[1] - aa[1]) * dy) / l2 else 0.0
            t = t.coerceIn(0.0, 1.0)
            val point = ll(aa[0] + t * dx, aa[1] + t * dy, lat0)
            return Triple(t, point, dist(p, point))
        }

        private fun nearestOnLine(p: LatLon, pts: List<LatLon>): Proj? {
            var best: Proj? = null
            for (i in 0 until pts.size - 1) {
                val (t, point, d) = projSeg(p, pts[i], pts[i + 1])
                if (best == null || d < best.d) best = Proj(i, t, point, d)
            }
            return best
        }

        private fun segX(a: LatLon, b: LatLon, c: LatLon, d: LatLon): Triple<Double, Double, LatLon>? {
            val lat0 = a.lat
            val A = xy(a, lat0); val B = xy(b, lat0); val C = xy(c, lat0); val D = xy(d, lat0)
            val r0 = B[0] - A[0]; val r1 = B[1] - A[1]; val s0 = D[0] - C[0]; val s1 = D[1] - C[1]
            val den = r0 * s1 - r1 * s0
            if (abs(den) < 1e-9) return null
            val q0 = C[0] - A[0]; val q1 = C[1] - A[1]
            val t = (q0 * s1 - q1 * s0) / den; val u = (q0 * r1 - q1 * r0) / den
            if (t < 0 || t > 1 || u < 0 || u > 1) return null
            return Triple(t, u, ll(A[0] + t * r0, A[1] + t * r1, lat0))
        }

        private fun bbox(pts: List<LatLon>): DoubleArray {
            var a = 90.0; var b = 180.0; var c = -90.0; var d = -180.0
            for (p in pts) { if (p.lat < a) a = p.lat; if (p.lon < b) b = p.lon; if (p.lat > c) c = p.lat; if (p.lon > d) d = p.lon }
            return doubleArrayOf(a, b, c, d)
        }

        private fun near(x: DoubleArray, y: DoubleArray) = !(x[0] > y[2] + PAD || y[0] > x[2] + PAD || x[1] > y[3] + PAD || y[1] > x[3] + PAD)

        private class Cut(val i: Int, val t: Double, val point: LatLon, val end: Char? = null, val mark: String? = null) {
            var k = 0; var n = 0; var node = 0
            val pos get() = i + t
        }

        fun lineLength(pts: List<LatLon>): Double { var s = 0.0; for (i in 1 until pts.size) s += dist(pts[i - 1], pts[i]); return s }

        fun build(routes: List<Route>, marks: List<Monument> = emptyList()): RouteNetwork {
            val rs = routes.filter { it.points.size >= 2 }
            val pts = rs.map { r -> r.points.map { LatLon(it.lat, it.lon) } }
            val boxes = pts.map { bbox(it) }
            val cuts = pts.map { p -> mutableListOf(Cut(0, 0.0, p[0], end = 'a'), Cut(p.size - 2, 1.0, p[p.size - 1], end = 'b')) }
            fun nearEnd(k: Int, c: Cut) = dist(c.point, pts[k][0]) < SNAP_M || dist(c.point, pts[k][pts[k].size - 1]) < SNAP_M

            // Т-тәрізді тораптар
            for (k1 in rs.indices) {
                for (e in listOf(pts[k1][0], pts[k1][pts[k1].size - 1])) {
                    val eb = doubleArrayOf(e.lat, e.lon, e.lat, e.lon)
                    for (k2 in rs.indices) {
                        if (k1 == k2 || !near(eb, boxes[k2])) continue
                        val n = nearestOnLine(e, pts[k2]) ?: continue
                        val c = Cut(n.i, n.t, n.point)
                        if (n.d < SNAP_M && !nearEnd(k2, c)) cuts[k2] += c
                    }
                }
            }
            // Х-тәрізді тораптар
            for (k1 in rs.indices) for (k2 in k1 + 1 until rs.size) {
                if (!near(boxes[k1], boxes[k2])) continue
                val p1 = pts[k1]; val p2 = pts[k2]
                for (i in 0 until p1.size - 1) {
                    val sb = bbox(listOf(p1[i], p1[i + 1]))
                    for (j in 0 until p2.size - 1) {
                        if (!near(sb, bbox(listOf(p2[j], p2[j + 1])))) continue
                        val x = segX(p1[i], p1[i + 1], p2[j], p2[j + 1]) ?: continue
                        val c1 = Cut(i, x.first, x.third); val c2 = Cut(j, x.second, x.third)
                        if (!nearEnd(k1, c1)) cuts[k1] += c1
                        if (!nearEnd(k2, c2)) cuts[k2] += c2
                    }
                }
            }
            // Маршрут ескерткіштің жанынан өтеді
            for (m in marks) {
                val p = LatLon(m.lat, m.lon)
                val pb = doubleArrayOf(p.lat, p.lon, p.lat, p.lon)
                for (k in rs.indices) {
                    if (!near(pb, boxes[k])) continue
                    val n = nearestOnLine(p, pts[k]) ?: continue
                    if (n.d < MARK_M && !(dist(p, pts[k][0]) < MARK_M || dist(p, pts[k][pts[k].size - 1]) < MARK_M)) cuts[k] += Cut(n.i, n.t, n.point, mark = m.id)
                }
            }

            // Кесу нүктелерін түйіндерге біріктіру (union–find)
            val all = ArrayList<Cut>()
            cuts.forEachIndexed { k, cs -> cs.forEach { c -> c.k = k; c.n = all.size; all += c } }
            val par = IntArray(all.size) { it }
            fun find(x: Int): Int { var i = x; while (par[i] != i) { par[i] = par[par[i]]; i = par[i] }; return i }
            fun join(x: Int, y: Int) { val a = find(x); val b = find(y); if (a != b) par[b] = a }
            fun cellA(p: LatLon) = floor(p.lat / 0.002).toLong()
            fun cellB(p: LatLon) = floor(p.lon / 0.003).toLong()
            val grid = HashMap<Pair<Long, Long>, MutableList<Cut>>()
            for (c in all) grid.getOrPut(cellA(c.point) to cellB(c.point)) { mutableListOf() } += c
            for (c in all) {
                val a = cellA(c.point); val b = cellB(c.point)
                for (da in -1..1) for (db in -1..1) {
                    for (o in grid[(a + da) to (b + db)] ?: continue) if (o.n > c.n && dist(o.point, c.point) < SNAP_M) join(c.n, o.n)
                }
            }
            // Ескерткіштер: топ ескерткішке MARK_M-ден жақын болса — сол ескерткіштікі
            val groups = LinkedHashMap<Int, MutableList<Cut>>()
            for (c in all) groups.getOrPut(find(c.n)) { mutableListOf() } += c
            val markOf = LinkedHashMap<Int, Monument>()
            for ((g, cs) in groups) {
                val hinted = cs.firstOrNull { it.mark != null }
                if (hinted != null) { marks.firstOrNull { it.id == hinted.mark }?.let { markOf[g] = it }; continue }
                val cen = LatLon(cs.sumOf { it.point.lat } / cs.size, cs.sumOf { it.point.lon } / cs.size)
                var best: Monument? = null; var bd = MARK_M
                for (m in marks) { val d = dist(cen, LatLon(m.lat, m.lon)); if (d < bd) { bd = d; best = m } }
                if (best != null) markOf[g] = best
            }
            val byMark = HashMap<String, Int>()
            for ((g, m) in markOf) { val o = byMark[m.id]; if (o != null) join(o, g) else byMark[m.id] = g }

            class NodeAcc(val id: Int) { val pts = ArrayList<LatLon>(); var mark: Monument? = null }
            val acc = ArrayList<NodeAcc>()
            val nodeOf = HashMap<Int, Int>()
            for (c in all) {
                val g = find(c.n)
                val id = nodeOf.getOrPut(g) { acc += NodeAcc(acc.size); acc.size - 1 }
                acc[id].pts += c.point
                c.node = id
            }
            for ((g, m) in markOf) { val nd = nodeOf[find(g)]?.let { acc[it] }; if (nd != null && nd.mark == null) nd.mark = m }
            val nodes = acc.map { a ->
                val m = a.mark
                if (m != null) Node(a.id, m.lat, m.lon, m.id)
                else Node(a.id, a.pts.sumOf { it.lat } / a.pts.size, a.pts.sumOf { it.lon } / a.pts.size, "")
            }

            // Қабырғалар
            val edges = ArrayList<Edge>()
            rs.forEachIndexed { k, r ->
                val cs = cuts[k].sortedBy { it.pos }
                var prev = cs[0]
                for (q in 1 until cs.size) {
                    val c = cs[q]
                    if (c.node == prev.node && q < cs.size - 1) continue
                    val coords = ArrayList<LatLon>()
                    coords += prev.point
                    for (i in prev.i + 1..c.i) coords += pts[k][i]
                    coords += c.point
                    val len = lineLength(coords)
                    if (c.node != prev.node || len > 2 * SNAP_M) edges += Edge(edges.size, prev.node, c.node, len, coords, r)
                    prev = c
                }
            }
            val adj = List(nodes.size) { ArrayList<Edge>() }
            for (e in edges) { adj[e.a] += e; if (e.b != e.a) adj[e.b] += e }
            val markNode = nodes.filter { it.markId.isNotEmpty() }.associate { it.markId to it.id }
            return RouteNetwork(nodes, edges, adj, markNode)
        }
    }

    fun allowed(r: Route, o: Options): Boolean {
        if (rank(r.vehicle) > rank(o.vehicle)) return false
        if (o.wet && r.season == Season.DRY) return false
        return true
    }

    /** м/с */
    private fun speed(r: Route, o: Options) = (if (o.vehicle == Vehicle.FOOT) 4.5 else speedKmh(r.vehicle)) * 1000 / 3600

    private class Near(val edge: Edge, val i: Int, val point: LatLon, val d: Double)

    private fun nearestEdge(p: LatLon, o: Options): Near? {
        var best: Near? = null
        for (e in edges) {
            if (!allowed(e.route, o)) continue
            val n = nearestOnLine(p, e.coords) ?: continue
            if (best == null || n.d < best.d) best = Near(e, n.i, n.point, n.d)
        }
        return best
    }

    private class Loc(
        val node: Int? = null, val at: LatLon, val off: Double, val offPt: LatLon? = null,
        val edge: Edge? = null, val toA: List<LatLon> = emptyList(), val toB: List<LatLon> = emptyList(), val la: Double = 0.0, val lb: Double = 0.0,
    )

    private fun locate(end: End, o: Options): Loc? {
        end.node?.let { id -> val n = nodes.getOrNull(id) ?: return null; return Loc(node = n.id, at = LatLon(n.lat, n.lon), off = 0.0) }
        end.markId?.let { mid -> markNode[mid]?.let { return Loc(node = it, at = LatLon(end.lat, end.lon), off = 0.0) } }
        val p = LatLon(end.lat, end.lon)
        val ne = nearestEdge(p, o) ?: return null
        val e = ne.edge
        val toA = e.coords.subList(0, ne.i + 1) + ne.point
        val toB = listOf(ne.point) + e.coords.subList(ne.i + 1, e.coords.size)
        val la = lineLength(toA); val lb = lineLength(toB)
        if (la < SNAP_M) return Loc(node = e.a, at = p, off = ne.d, offPt = ne.point)
        if (lb < SNAP_M) return Loc(node = e.b, at = p, off = ne.d, offPt = ne.point)
        return Loc(edge = e, toA = toA, toB = toB, la = la, lb = lb, at = p, off = ne.d, offPt = ne.point)
    }

    private class Out(val to: Int, val len: Double, val coords: List<LatLon>, val route: Route)
    private class Step(val from: Int, val out: Out)

    fun findPath(from: End, to: End, o: Options = Options()): Result {
        val A = locate(from, o); val B = locate(to, o)
        if (A == null || B == null) return Result.Failed(Result.Error.NO_NETWORK)
        val n = nodes.size; val s = n; val t = n + 1
        val extra = HashMap<Int, MutableList<Out>>()
        fun addX(u: Int, v: Int, len: Double, coords: List<LatLon>, r: Route) {
            extra.getOrPut(u) { mutableListOf() } += Out(v, len, coords, r)
            extra.getOrPut(v) { mutableListOf() } += Out(u, len, coords.reversed(), r)
        }
        val src = A.node ?: s
        val dst = B.node ?: t
        A.edge?.let { e -> addX(s, e.a, A.la, A.toA.reversed(), e.route); addX(s, e.b, A.lb, A.toB, e.route) }
        B.edge?.let { e -> addX(t, e.a, B.la, B.toA.reversed(), e.route); addX(t, e.b, B.lb, B.toB, e.route) }
        if (A.edge != null && A.edge === B.edge) {
            val e = A.edge
            val pa = A.toA.size; val pb = B.toA.size
            val sub = if (pa <= pb) listOf(A.offPt!!) + e.coords.subList(pa - 1, pb - 1) + B.offPt!!
            else listOf(A.offPt!!) + e.coords.subList(pb - 1, pa - 1).reversed() + B.offPt!!
            addX(s, t, lineLength(sub), sub, e.route)
        }
        fun cost(len: Double, r: Route) = len / speed(r, o)
        val best = HashMap<Int, Double>().apply { put(src, 0.0) }
        val prev = HashMap<Int, Step>()
        // Тең салмақта кірген реті бойынша (жұмыс үстеліндегі үймемен бірдей нәтиже болуы үшін)
        var seq = 0L
        val heap = PriorityQueue<Triple<Double, Long, Int>>(compareBy<Triple<Double, Long, Int>> { it.first }.thenBy { it.second })
        heap += Triple(0.0, seq++, src)
        while (heap.isNotEmpty()) {
            val (d, _, u) = heap.poll()
            if (d > (best[u] ?: Double.POSITIVE_INFINITY)) continue
            if (u == dst) break
            val outs = ArrayList<Out>()
            if (u < n) for (e in adj[u]) if (allowed(e.route, o)) outs += Out(if (e.a == u) e.b else e.a, e.len, if (e.a == u) e.coords else e.coords.reversed(), e.route)
            extra[u]?.let { outs += it }
            for (x in outs) {
                val nd = d + cost(x.len, x.route)
                if (nd < (best[x.to] ?: Double.POSITIVE_INFINITY)) { best[x.to] = nd; prev[x.to] = Step(u, x); heap += Triple(nd, seq++, x.to) }
            }
        }
        if (src != dst && !prev.containsKey(dst)) return Result.Failed(Result.Error.NOT_CONNECTED)
        val steps = ArrayList<Step>()
        var v = dst
        while (v != src) { val p = prev.getValue(v); steps.add(0, p); v = p.from }
        class MLeg(val route: Route, var len: Double, val coords: MutableList<LatLon>)
        val legs = ArrayList<MLeg>()
        for (st in steps) {
            val last = legs.lastOrNull()
            if (last != null && last.route === st.out.route) { last.coords += st.out.coords.drop(1); last.len += st.out.len }
            else legs += MLeg(st.out.route, st.out.len, st.out.coords.toMutableList())
        }
        val coords = legs.flatMapIndexed { i, l -> if (i > 0) l.coords.drop(1) else l.coords }
        val len = legs.sumOf { it.len }
        val time = legs.sumOf { cost(it.len, it.route) }
        return Result.Ok(
            legs = legs.map { Leg(it.route, it.len, it.coords) }, len = len, timeSeconds = time, coords = coords,
            offStart = if (A.off > 1) OffLeg(A.at, A.offPt ?: A.at, A.off) else null,
            offEnd = if (B.off > 1) OffLeg(B.offPt ?: B.at, B.at, B.off) else null,
        )
    }
}
