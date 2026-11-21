package io.github.berikkkk.muragis.core.routing

import io.github.berikkkk.muragis.core.db.SqlDb
import io.github.berikkkk.muragis.core.geo.Bounds
import io.github.berikkkk.muragis.core.geo.Geo
import io.github.berikkkk.muragis.core.geo.LatLon
import io.github.berikkkk.muragis.core.model.Localized
import io.github.berikkkk.muragis.core.model.Route
import io.github.berikkkk.muragis.core.model.Vehicle
import io.github.berikkkk.muragis.core.packages.MapPackage
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Офлайн жол графы (OpenStreetMap жолдарынан) және A* қозғалтқышы — интернетсіз «Маршрут құру».
 *
 * Граф Android-тан тыс дайындалады (tools/packager `roads`) және негізгі карта пакетінің `mura_resources` кестесінде
 * [CHUNK_PREFIX]`000`, `001`… бөліктері болып сақталады (Android SQLite курсоры 2 МБ-тан үлкен BLOB оқи алмайды).
 * Түйіндер — жол тораптары мен ұштары; қабырға — екі торап арасындағы жол бөлігі (геометриясымен, сыныбымен, белгілерімен).
 * Салмақ — жүру уақыты: жылдамдық жол сыныбы, көлік ([Vehicle]) және «ылғалды маусымнан» ([speedKmh]).
 * Басы/соңы жолдан тыс болса — ең жақын рұқсат етілген жолға дейін түзу бөлік (RouteNetwork сияқты, уақытқа кірмейді).
 * Нәтиже [RouteNetwork.Result] пішімінде — маршрут құру парағы, карта және сақтау өзгеріссіз жұмыс істейді.
 */
class RoadGraph private constructor(
    val bounds: Bounds,
    private val nodeLat: IntArray, private val nodeLon: IntArray,
    private val edgeA: IntArray, private val edgeB: IntArray, private val edgeLen: FloatArray,
    private val edgeCls: ByteArray, private val edgeFlags: ByteArray, private val edgeName: IntArray, private val edgeRef: IntArray,
    /** Қабырға геометриясының басы [ptLat]/[ptLon]-да; соңғысы — келесі қабырғаның басы (өлшемі E + 1). */
    private val edgeGeom: IntArray,
    private val ptLat: IntArray, private val ptLon: IntArray,
    private val names: Array<String>,
) {
    val nodeCount get() = nodeLat.size
    val edgeCount get() = edgeA.size

    /** Жол сыныптары (OSM highway). */
    object Cls {
        const val MOTORWAY = 0; const val TRUNK = 1; const val PRIMARY = 2; const val SECONDARY = 3; const val TERTIARY = 4
        const val UNCLASSIFIED = 5; const val RESIDENTIAL = 6; const val SERVICE = 7; const val LIVING = 8; const val TRACK = 9; const val PATH = 10
    }

    /** Қабырға белгілері: [ONEWAY] — тек A → B бағыты (көлікке); [GRADE_SHIFT] — tracktype 1–5 (0 — белгісіз). */
    object Flag {
        const val ONEWAY = 1; const val NO_MOTOR = 2; const val NO_FOOT = 4; const val UNPAVED = 8; const val GRADE_SHIFT = 4
    }

    companion object {
        const val CHUNK_PREFIX = "roads/graph.bin."
        const val CHUNK_SIZE = 1 shl 20
        private const val MAGIC = 0x3147524D   // «MRG1»
        private const val VERSION = 1
        /** Жолдан осыдан алыс нүкте — «бұл жерде жол желісі жоқ». */
        const val MAX_SNAP_M = 5000.0
        private const val CELL = 0.01
        private const val E6 = 1e-6
        private const val RAD = PI / 180.0
        private const val TO_B = -2; private const val TO_A = -3; private const val FROM_A = -4; private const val FROM_B = -5; private const val DIRECT = -6

        private val CLASS_NAMES = arrayOf(
            Localized("Автомагистраль", "Автомагистраль"), Localized("Республикалық жол", "Магистральная дорога"),
            Localized("Негізгі жол", "Основная дорога"), Localized("Облыстық жол", "Областная дорога"),
            Localized("Аудандық жол", "Районная дорога"), Localized("Жергілікті жол", "Местная дорога"),
            Localized("Көше", "Улица"), Localized("Қызметтік жол", "Служебный проезд"), Localized("Тұрғын аула", "Жилая зона"),
            Localized("Грунт жол", "Грунтовая дорога"), Localized("Соқпақ", "Тропа"),
        )
        private val CAR_KMH = doubleArrayOf(90.0, 80.0, 70.0, 60.0, 50.0, 40.0, 30.0, 15.0, 10.0)

        /** Жүру жылдамдығы, км/сағ; 0 — бұл көлікке рұқсат жоқ. */
        fun speedKmh(cls: Int, flags: Int, v: Vehicle, wet: Boolean): Double {
            val unpaved = flags and Flag.UNPAVED != 0
            val grade = (flags shr Flag.GRADE_SHIFT) and 7
            return when (v) {
                Vehicle.FOOT -> if (flags and Flag.NO_FOOT != 0 || cls == Cls.MOTORWAY) 0.0 else 4.5
                Vehicle.CAR -> when {
                    flags and Flag.NO_MOTOR != 0 || cls == Cls.PATH -> 0.0
                    cls == Cls.TRACK -> when {
                        grade == 1 -> if (wet) 20.0 else 30.0
                        grade == 2 -> if (wet) 12.0 else 20.0
                        wet || grade >= 4 -> 0.0
                        else -> 15.0
                    }
                    unpaved -> min(CAR_KMH[cls], 40.0) * (if (wet) 0.6 else 1.0)
                    else -> CAR_KMH[cls]
                }
                Vehicle.OFFROAD -> when {
                    flags and Flag.NO_MOTOR != 0 || cls == Cls.PATH -> 0.0
                    cls == Cls.TRACK -> when (grade) { 1 -> 35.0; 2 -> 30.0; 4 -> 20.0; 5 -> 15.0; else -> 25.0 } * (if (wet) 0.7 else 1.0)
                    unpaved -> min(CAR_KMH[cls], 50.0) * (if (wet) 0.7 else 1.0)
                    else -> CAR_KMH[cls]
                }
            }
        }

        private fun maxKmh(v: Vehicle) = if (v == Vehicle.FOOT) 4.5 else 90.0

        /* ------------------------------- Пішім (little-endian) ------------------------------- */

        /** Графты байттарға жазу (packager). Геометрия әр қабырғада ұштарымен бірге: [geom] өлшемі E + 1. */
        fun write(
            bounds: Bounds, nodeLat: IntArray, nodeLon: IntArray, edgeA: IntArray, edgeB: IntArray, edgeLen: FloatArray,
            edgeCls: ByteArray, edgeFlags: ByteArray, edgeName: IntArray, edgeRef: IntArray, geom: IntArray,
            ptLat: IntArray, ptLon: IntArray, names: List<String>,
        ): ByteArray {
            val n = nodeLat.size; val e = edgeA.size; val p = ptLat.size
            val strs = names.map { it.toByteArray(Charsets.UTF_8) }
            val size = 4 * 10 + n * 8 + e * (4 + 4 + 4 + 1 + 1 + 4 + 4) + (e + 1) * 4 + p * 8 + strs.sumOf { 4 + it.size }
            val b = ByteBuffer.allocate(size).order(ByteOrder.LITTLE_ENDIAN)
            b.putInt(MAGIC).putInt(VERSION).putInt(n).putInt(e).putInt(p).putInt(strs.size)
            for (v in listOf(bounds.west, bounds.south, bounds.east, bounds.north)) b.putInt(Math.round(v / E6).toInt())
            nodeLat.forEach { b.putInt(it) }; nodeLon.forEach { b.putInt(it) }
            edgeA.forEach { b.putInt(it) }; edgeB.forEach { b.putInt(it) }; edgeLen.forEach { b.putFloat(it) }
            b.put(edgeCls); b.put(edgeFlags)
            edgeName.forEach { b.putInt(it) }; edgeRef.forEach { b.putInt(it) }; geom.forEach { b.putInt(it) }
            ptLat.forEach { b.putInt(it) }; ptLon.forEach { b.putInt(it) }
            strs.forEach { b.putInt(it.size); b.put(it) }
            return b.array()
        }

        fun read(bytes: ByteArray): RoadGraph {
            val b = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
            require(b.int == MAGIC) { "Not a Mura road graph" }
            require(b.int == VERSION) { "Unsupported road graph version" }
            val n = b.int; val e = b.int; val p = b.int; val s = b.int
            val bounds = Bounds(b.int * E6, b.int * E6, b.int * E6, b.int * E6)
            fun ints(k: Int) = IntArray(k).also { b.asIntBuffer().get(it); b.position(b.position() + k * 4) }
            val nLat = ints(n); val nLon = ints(n)
            val ea = ints(e); val eb = ints(e)
            val len = FloatArray(e).also { b.asFloatBuffer().get(it); b.position(b.position() + e * 4) }
            val cls = ByteArray(e).also { b.get(it) }; val fl = ByteArray(e).also { b.get(it) }
            val en = ints(e); val er = ints(e); val g = ints(e + 1)
            val pLat = ints(p); val pLon = ints(p)
            val names = Array(s) { val k = b.int; val a = ByteArray(k); b.get(a); String(a, Charsets.UTF_8) }
            return RoadGraph(bounds, nLat, nLon, ea, eb, len, cls, fl, en, er, g, pLat, pLon, names)
        }

        /** Байттарды пакет ресурстарына бөліктеп жазу үшін: (атау, бөлік). */
        fun chunks(bytes: ByteArray): List<Pair<String, ByteArray>> =
            (0 until (bytes.size + CHUNK_SIZE - 1) / CHUNK_SIZE).map { i ->
                CHUNK_PREFIX + "%03d".format(i) to bytes.copyOfRange(i * CHUNK_SIZE, min(bytes.size, (i + 1) * CHUNK_SIZE))
            }

        /** Пакетте жол графы бар ма. */
        fun inPackage(db: SqlDb): Boolean = db.tableExists(MapPackage.RESOURCES) &&
            (db.scalarLong("SELECT count(*) FROM ${MapPackage.RESOURCES} WHERE name = ?", listOf(CHUNK_PREFIX + "000")) ?: 0L) > 0L

        /** Карта пакетінен графты оқу; графы жоқ болса — null. */
        fun fromPackage(db: SqlDb): RoadGraph? {
            if (!inPackage(db)) return null
            val names = db.query("SELECT name FROM ${MapPackage.RESOURCES} WHERE name LIKE ? ORDER BY name", listOf("$CHUNK_PREFIX%")) { it.string("name") ?: "" }
            val parts = names.map { MapPackage.resource(db, it) ?: error("Missing $it") }
            val all = ByteArray(parts.sumOf { it.size })
            var o = 0
            for (p in parts) { p.copyInto(all, o); o += p.size }
            return read(all)
        }
    }

    /* ------------------------------- Индекстер (жүктелгенде бір рет) ------------------------------- */

    /** Түйіннің қабырғалары (CSR). */
    private val adjStart: IntArray
    private val adjEdge: IntArray
    /** Кеңістіктік тор: ұяшықтағы қабырғалар (CSR). */
    private val cols: Int
    private val rows: Int
    private val cellStart: IntArray
    private val cellEdge: IntArray

    init {
        val n = nodeLat.size; val e = edgeA.size
        val deg = IntArray(n + 1)
        for (i in 0 until e) { deg[edgeA[i]]++; if (edgeB[i] != edgeA[i]) deg[edgeB[i]]++ }
        adjStart = IntArray(n + 1)
        for (i in 0 until n) adjStart[i + 1] = adjStart[i] + deg[i]
        adjEdge = IntArray(adjStart[n])
        val fill = adjStart.copyOf()
        for (i in 0 until e) { adjEdge[fill[edgeA[i]]++] = i; if (edgeB[i] != edgeA[i]) adjEdge[fill[edgeB[i]]++] = i }

        cols = max(1, Math.ceil((bounds.east - bounds.west) / CELL).toInt())
        rows = max(1, Math.ceil((bounds.north - bounds.south) / CELL).toInt())
        val counts = IntArray(cols * rows + 1)
        forEachEdgeCell { _, c -> counts[c]++ }
        cellStart = IntArray(cols * rows + 1)
        for (c in 0 until cols * rows) cellStart[c + 1] = cellStart[c] + counts[c]
        cellEdge = IntArray(cellStart[cols * rows])
        val cf = cellStart.copyOf()
        forEachEdgeCell { ed, c -> cellEdge[cf[c]++] = ed }
    }

    private fun col(lon: Double) = floor((lon - bounds.west) / CELL).toInt().coerceIn(0, cols - 1)
    private fun row(lat: Double) = floor((lat - bounds.south) / CELL).toInt().coerceIn(0, rows - 1)

    /** Әр қабырға үшін — ол қамтитын ұяшықтар (кесінділердің қоршау тіктөртбұрышы бойынша, қайталанбай). */
    private inline fun forEachEdgeCell(f: (Int, Int) -> Unit) {
        val seen = HashSet<Int>()
        for (ed in edgeA.indices) {
            seen.clear()
            for (k in edgeGeom[ed] until edgeGeom[ed + 1] - 1) {
                val c0 = col(min(ptLon[k], ptLon[k + 1]) * E6); val c1 = col(max(ptLon[k], ptLon[k + 1]) * E6)
                val r0 = row(min(ptLat[k], ptLat[k + 1]) * E6); val r1 = row(max(ptLat[k], ptLat[k + 1]) * E6)
                for (r in r0..r1) for (c in c0..c1) { val cell = r * cols + c; if (seen.add(cell)) f(ed, cell) }
            }
        }
    }

    fun covers(lat: Double, lon: Double) = bounds.contains(lat, lon)

    /* ------------------------------- Жол іздеу ------------------------------- */

    private fun pt(k: Int) = LatLon(ptLat[k] * E6, ptLon[k] * E6)

    /** Жолға жабысу: [edge] қабырғасының [seg]-кесіндісіндегі [point], А-дан қашықтығы [fromA]. */
    private class Snap(val edge: Int, val seg: Int, val point: LatLon, val d: Double, val fromA: Double, val toB: Double)

    private fun allowed(ed: Int, o: RouteNetwork.Options) = speedKmh(edgeCls[ed].toInt(), edgeFlags[ed].toInt(), o.vehicle, o.wet) > 0

    /** Көлікпен A → B бағытынан кері жүруге бола ма. */
    private fun backwardOk(ed: Int, o: RouteNetwork.Options) = o.vehicle == Vehicle.FOOT || edgeFlags[ed].toInt() and Flag.ONEWAY == 0

    private fun cost(ed: Int, len: Double, o: RouteNetwork.Options) =
        len / (speedKmh(edgeCls[ed].toInt(), edgeFlags[ed].toInt(), o.vehicle, o.wet) * 1000 / 3600)

    private fun snap(p: LatLon, o: RouteNetwork.Options): Snap? {
        if (!bounds.contains(p.lat, p.lon)) return null
        val kx = 111_320.0 * cos(p.lat * RAD); val ky = 110_574.0
        val c0 = col(p.lon); val r0 = row(p.lat)
        val cellM = min(CELL * kx, CELL * ky)
        var best: Snap? = null
        val maxRing = (MAX_SNAP_M / cellM).toInt() + 1
        val seen = HashSet<Int>()
        for (ring in 0..maxRing) {
            if (best != null && best.d < (ring - 1) * cellM) break
            for (r in r0 - ring..r0 + ring) for (c in c0 - ring..c0 + ring) {
                if (r < 0 || c < 0 || r >= rows || c >= cols) continue
                if (max(abs(r - r0), abs(c - c0)) != ring) continue
                val cell = r * cols + c
                for (q in cellStart[cell] until cellStart[cell + 1]) {
                    val ed = cellEdge[q]
                    if (!seen.add(ed) || !allowed(ed, o)) continue
                    for (k in edgeGeom[ed] until edgeGeom[ed + 1] - 1) {
                        val ax = (ptLon[k] * E6 - p.lon) * kx; val ay = (ptLat[k] * E6 - p.lat) * ky
                        val bx = (ptLon[k + 1] * E6 - p.lon) * kx; val by = (ptLat[k + 1] * E6 - p.lat) * ky
                        val dx = bx - ax; val dy = by - ay; val l2 = dx * dx + dy * dy
                        val t = if (l2 > 0) (-(ax * dx + ay * dy) / l2).coerceIn(0.0, 1.0) else 0.0
                        val x = ax + t * dx; val y = ay + t * dy
                        val d = sqrt(x * x + y * y)
                        if (best == null || d < best.d) {
                            val point = LatLon(p.lat + y / ky, p.lon + x / kx)
                            best = Snap(ed, k - edgeGeom[ed], point, d, 0.0, 0.0)
                        }
                    }
                }
            }
        }
        val s = best ?: return null
        if (s.d > MAX_SNAP_M) return null
        // А-дан жабысу нүктесіне дейінгі қашықтық (геометрия бойынша)
        val g0 = edgeGeom[s.edge]
        var fromA = 0.0
        for (k in g0 until g0 + s.seg) fromA += Geo.distance(ptLat[k] * E6, ptLon[k] * E6, ptLat[k + 1] * E6, ptLon[k + 1] * E6)
        fromA += Geo.distance(ptLat[g0 + s.seg] * E6, ptLon[g0 + s.seg] * E6, s.point.lat, s.point.lon)
        val total = geomLength(s.edge)
        return Snap(s.edge, s.seg, s.point, s.d, fromA, max(0.0, total - fromA))
    }

    private fun geomLength(ed: Int): Double {
        var s = 0.0
        for (k in edgeGeom[ed] until edgeGeom[ed + 1] - 1) s += Geo.distance(ptLat[k] * E6, ptLon[k] * E6, ptLat[k + 1] * E6, ptLon[k + 1] * E6)
        return s
    }

    /** Жабысу нүктесінен қабырғаның А не Б ұшына дейінгі геометрия (нүктеден бастап). */
    private fun partToEnd(s: Snap, toB: Boolean): List<LatLon> {
        val g0 = edgeGeom[s.edge]; val g1 = edgeGeom[s.edge + 1]
        val out = ArrayList<LatLon>(); out += s.point
        if (toB) for (k in g0 + s.seg + 1 until g1) out += pt(k) else for (k in g0 + s.seg downTo g0) out += pt(k)
        return out
    }

    /** Бір қабырғадағы екі жабысу нүктесінің арасы. */
    private fun between(a: Snap, b: Snap): List<LatLon> {
        val g0 = edgeGeom[a.edge]
        val out = ArrayList<LatLon>(); out += a.point
        if (a.fromA <= b.fromA) for (k in g0 + a.seg + 1..g0 + b.seg) out += pt(k)
        else for (k in g0 + a.seg downTo g0 + b.seg + 1) out += pt(k)
        out += b.point
        return out
    }

    private fun edgeCoords(ed: Int, forward: Boolean): List<LatLon> {
        val r = (edgeGeom[ed] until edgeGeom[ed + 1]).map { pt(it) }
        return if (forward) r else r.reversed()
    }

    /** Карта мен тізімдегі атауы: жол аты, болмаса нөмірі (сыныбымен), болмаса — сыныбы. */
    fun label(ed: Int): Localized {
        val cls = CLASS_NAMES[edgeCls[ed].toInt().coerceIn(0, CLASS_NAMES.size - 1)]
        val name = edgeName[ed].takeIf { it >= 0 }?.let { names[it] }
        val ref = edgeRef[ed].takeIf { it >= 0 }?.let { names[it] }
        return when {
            name != null && ref != null -> Localized("$name ($ref)", "$name ($ref)")
            name != null -> Localized(name, name)
            ref != null -> Localized(cls.kk + " " + ref, cls.ru + " " + ref)
            else -> cls
        }
    }

    /** Бір бөлік: қабырға (атауы үшін), ұзындығы, уақыты, геометриясы. */
    private class Piece(val edge: Int, val len: Double, val time: Double, val coords: List<LatLon>)

    fun findPath(from: RouteNetwork.End, to: RouteNetwork.End, o: RouteNetwork.Options): RouteNetwork.Result {
        val pa = LatLon(from.lat, from.lon); val pb = LatLon(to.lat, to.lon)
        val A = snap(pa, o); val B = snap(pb, o)
        if (A == null || B == null) return RouteNetwork.Result.Failed(RouteNetwork.Result.Error.NO_GRAPH)
        val n = nodeLat.size; val s = n; val t = n + 1
        val g = DoubleArray(n + 2) { Double.POSITIVE_INFINITY }
        val prevNode = IntArray(n + 2) { -1 }
        // ≥ 0 — қабырға; басынан ұшқа: TO_B / TO_A; ұштан соңына: FROM_A / FROM_B; бір қабырғада тікелей: DIRECT
        val prevEdge = IntArray(n + 2) { -1 }
        val done = BooleanArray(n + 2)
        val heap = Heap()
        val vmax = maxKmh(o.vehicle) * 1000 / 3600
        val kx = 111_320.0 * cos(pb.lat * RAD); val ky = 110_574.0
        fun h(v: Int): Double {
            if (v == t) return 0.0
            val lat = if (v == s) A.point.lat else nodeLat[v] * E6; val lon = if (v == s) A.point.lon else nodeLon[v] * E6
            val dx = (lon - B.point.lon) * kx; val dy = (lat - B.point.lat) * ky
            return sqrt(dx * dx + dy * dy) / vmax
        }
        fun relax(u: Int, v: Int, c: Double, how: Int) {
            val nd = g[u] + c
            if (nd < g[v]) { g[v] = nd; prevNode[v] = u; prevEdge[v] = how; heap.push(nd + h(v), v) }
        }
        g[s] = 0.0; heap.push(h(s), s)
        val ae = A.edge; val be = B.edge
        while (heap.size > 0) {
            val u = heap.pop()
            if (done[u]) continue
            done[u] = true
            if (u == t) break
            if (u == s) {
                relax(s, edgeB[ae], cost(ae, A.toB, o), TO_B)
                if (backwardOk(ae, o)) relax(s, edgeA[ae], cost(ae, A.fromA, o), TO_A)
                if (ae == be && (B.fromA >= A.fromA || backwardOk(ae, o))) relax(s, t, cost(ae, abs(B.fromA - A.fromA), o), DIRECT)
                continue
            }
            for (q in adjStart[u] until adjStart[u + 1]) {
                val ed = adjEdge[q]
                if (!allowed(ed, o)) continue
                val fwd = edgeA[ed] == u
                if (fwd) relax(u, edgeB[ed], cost(ed, edgeLen[ed].toDouble(), o), ed)
                if (edgeB[ed] == u && backwardOk(ed, o)) relax(u, edgeA[ed], cost(ed, edgeLen[ed].toDouble(), o), ed)
            }
            // Соңғы қабырғаның ұшынан жабысу нүктесіне
            if (u == edgeA[be]) relax(u, t, cost(be, B.fromA, o), FROM_A)
            if (u == edgeB[be] && backwardOk(be, o)) relax(u, t, cost(be, B.toB, o), FROM_B)
        }
        if (g[t] == Double.POSITIVE_INFINITY) return RouteNetwork.Result.Failed(RouteNetwork.Result.Error.NOT_CONNECTED)

        // Жолды қалпына келтіру
        val pieces = ArrayList<Piece>()
        var v = t
        while (v != s) {
            val u = prevNode[v]; val how = prevEdge[v]
            pieces += when (how) {
                DIRECT -> Piece(ae, abs(B.fromA - A.fromA), g[v] - g[u], between(A, B))
                TO_B -> Piece(ae, A.toB, g[v] - g[u], partToEnd(A, true))
                TO_A -> Piece(ae, A.fromA, g[v] - g[u], partToEnd(A, false))
                FROM_A -> Piece(be, B.fromA, g[v] - g[u], partToEnd(B, false).reversed())
                FROM_B -> Piece(be, B.toB, g[v] - g[u], partToEnd(B, true).reversed())
                else -> Piece(how, edgeLen[how].toDouble(), g[v] - g[u], edgeCoords(how, edgeA[how] == u))
            }
            v = u
        }
        pieces.reverse()

        // Іргелес бөліктер бір атаумен болса — бір аяқ
        class MLeg(val label: Localized, var len: Double, var time: Double, val coords: MutableList<LatLon>)
        val legs = ArrayList<MLeg>()
        for (p in pieces) {
            if (p.coords.size < 2 || p.len < 0.5) continue   // нүкте дәл торапта болса — нөлдік бөлік
            val lb = label(p.edge)
            val last = legs.lastOrNull()
            if (last != null && last.label == lb) { last.coords += p.coords.drop(1); last.len += p.len; last.time += p.time }
            else legs += MLeg(lb, p.len, p.time, p.coords.toMutableList())
        }
        val coords = legs.flatMapIndexed { i, l -> if (i > 0) l.coords.drop(1) else l.coords }
        return RouteNetwork.Result.Ok(
            legs = legs.map { RouteNetwork.Leg(Route(id = "", name = it.label, vehicle = o.vehicle), it.len, it.coords) },
            len = legs.sumOf { it.len }, timeSeconds = legs.sumOf { it.time }, coords = coords.ifEmpty { listOf(A.point, B.point) },
            offStart = if (A.d > 1) RouteNetwork.OffLeg(pa, A.point, A.d) else null,
            offEnd = if (B.d > 1) RouteNetwork.OffLeg(B.point, pb, B.d) else null,
        )
    }

    /** A* үшін екілік үйме (кілт — бағалау, мән — түйін). */
    private class Heap {
        private var keys = DoubleArray(1024)
        private var vals = IntArray(1024)
        var size = 0; private set

        fun push(k: Double, v: Int) {
            if (size == keys.size) { keys = keys.copyOf(size * 2); vals = vals.copyOf(size * 2) }
            var i = size++
            while (i > 0) {
                val p = (i - 1) / 2
                if (keys[p] <= k) break
                keys[i] = keys[p]; vals[i] = vals[p]; i = p
            }
            keys[i] = k; vals[i] = v
        }

        fun pop(): Int {
            val top = vals[0]
            val k = keys[--size]; val v = vals[size]
            var i = 0
            while (true) {
                var c = 2 * i + 1
                if (c >= size) break
                if (c + 1 < size && keys[c + 1] < keys[c]) c++
                if (keys[c] >= k) break
                keys[i] = keys[c]; vals[i] = vals[c]; i = c
            }
            keys[i] = k; vals[i] = v
            return top
        }
    }
}
