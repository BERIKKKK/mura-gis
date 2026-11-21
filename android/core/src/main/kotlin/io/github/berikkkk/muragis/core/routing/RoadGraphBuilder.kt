package io.github.berikkkk.muragis.core.routing

import io.github.berikkkk.muragis.core.geo.Bounds
import io.github.berikkkk.muragis.core.geo.Geo
import io.github.berikkkk.muragis.core.geo.LatLon
import io.github.berikkkk.muragis.core.routing.RoadGraph.Cls
import io.github.berikkkk.muragis.core.routing.RoadGraph.Flag

/**
 * OSM жолдарынан (highway=*) [RoadGraph] құру. Packager PBF-ті оқып, әр жолды [add] арқылы береді.
 * Түйіндер — бірнеше жолға ортақ OSM нүктелері және жол ұштары; жол сол түйіндерде қабырғаларға бөлінеді.
 * Ешқайда қосылмаған шағын үзінділер (жалпы ұзындығы [minComponentM]-ден аз) алынып тасталады — оларға жабысқан
 * нүктеден маршрут шықпай қалмас үшін.
 */
class RoadGraphBuilder(private val minComponentM: Double = 500.0) {

    /** OSM жолы: нүктелер id-і мен координаталары (микроградус) және тегтері. */
    class Way(val nodes: LongArray, val lat: IntArray, val lon: IntArray, val tags: Map<String, String>)

    private class W(val nodes: LongArray, val lat: IntArray, val lon: IntArray, val cls: Int, val flags: Int, val name: Int, val ref: Int)

    private val ways = ArrayList<W>()
    private val strings = ArrayList<String>()
    private val stringIdx = HashMap<String, Int>()

    private fun str(s: String?): Int {
        val v = s?.trim()?.takeIf { it.isNotEmpty() } ?: return -1
        return stringIdx.getOrPut(v) { strings += v; strings.size - 1 }
    }

    companion object {
        private val UNPAVED = setOf("unpaved", "dirt", "ground", "gravel", "fine_gravel", "compacted", "sand", "grass", "earth", "mud", "pebblestone", "soil", "clay")
        private val NO = setOf("no", "private")
        private val YES = setOf("yes", "1", "true")

        /** OSM highway → сынып; маршрутқа жарамсыз (салынып жатқан, жоспарланған, т.б.) — null. */
        fun classify(tags: Map<String, String>): Int? {
            if (tags["area"] == "yes") return null
            return when (tags["highway"]) {
                "motorway", "motorway_link" -> Cls.MOTORWAY
                "trunk", "trunk_link" -> Cls.TRUNK
                "primary", "primary_link" -> Cls.PRIMARY
                "secondary", "secondary_link" -> Cls.SECONDARY
                "tertiary", "tertiary_link" -> Cls.TERTIARY
                "unclassified", "road" -> Cls.UNCLASSIFIED
                "residential" -> Cls.RESIDENTIAL
                "service" -> Cls.SERVICE
                "living_street" -> Cls.LIVING
                "track" -> Cls.TRACK
                "path", "footway", "bridleway", "cycleway", "pedestrian", "steps" -> Cls.PATH
                else -> null
            }
        }

        /** Белгілер. Екінші мән — геометрияны аудару керек пе (oneway=-1). */
        fun flags(tags: Map<String, String>, cls: Int): Pair<Int, Boolean> {
            var f = 0
            val ow = tags["oneway"]
            var reverse = false
            if (ow == "-1") { f = f or Flag.ONEWAY; reverse = true }
            else if (ow in YES || tags["junction"] == "roundabout" || (cls == Cls.MOTORWAY && ow == null)) f = f or Flag.ONEWAY
            if (ow == "no") f = f and Flag.ONEWAY.inv()
            val access = tags["access"]
            if (access in NO || tags["vehicle"] in NO || tags["motor_vehicle"] in NO || tags["motorcar"] in NO) f = f or Flag.NO_MOTOR
            val foot = tags["foot"]
            if (foot in NO || (access in NO && foot != "yes" && foot != "designated" && foot != "permissive")) f = f or Flag.NO_FOOT
            val grade = when (tags["tracktype"]) { "grade1" -> 1; "grade2" -> 2; "grade3" -> 3; "grade4" -> 4; "grade5" -> 5; else -> 0 }
            if (tags["surface"] in UNPAVED || (cls == Cls.TRACK && grade != 1)) f = f or Flag.UNPAVED
            f = f or (grade shl Flag.GRADE_SHIFT)
            return f to reverse
        }
    }

    /** Жолды қосу; маршрутқа жарамсыз болса — false. */
    fun add(w: Way): Boolean {
        if (w.nodes.size < 2) return false
        val cls = classify(w.tags) ?: return false
        val (f, rev) = flags(w.tags, cls)
        val nodes = if (rev) w.nodes.reversedArray() else w.nodes
        val lat = if (rev) w.lat.reversedArray() else w.lat
        val lon = if (rev) w.lon.reversedArray() else w.lon
        ways += W(nodes, lat, lon, cls, f, str(w.tags["name"]), str(w.tags["ref"]))
        return true
    }

    val wayCount get() = ways.size

    fun build(bounds: Bounds): ByteArray {
        // Түйіндер: ортақ нүктелер және жол ұштары
        val use = HashMap<Long, Int>()
        for (w in ways) {
            for (id in w.nodes) use[id] = (use[id] ?: 0) + 1
            use[w.nodes[0]] = (use[w.nodes[0]] ?: 0) + 2
            use[w.nodes[w.nodes.size - 1]] = (use[w.nodes[w.nodes.size - 1]] ?: 0) + 2
        }
        class E(val a: Long, val b: Long, val pts: List<LatLon>, val len: Double, val w: W)
        val edges = ArrayList<E>()
        val coord = HashMap<Long, LatLon>()
        for (w in ways) {
            var start = 0
            for (i in 1 until w.nodes.size) {
                if ((use[w.nodes[i]] ?: 0) < 2 && i < w.nodes.size - 1) continue
                val raw = (start..i).map { LatLon(w.lat[it] * 1e-6, w.lon[it] * 1e-6) }
                val len = Geo.length(raw)
                if (len > 0.0) {
                    val pts = if (raw.size > 2) Geo.simplify(raw, 1.5) else raw
                    edges += E(w.nodes[start], w.nodes[i], pts, len, w)
                    coord[w.nodes[start]] = raw.first(); coord[w.nodes[i]] = raw.last()
                }
                start = i
            }
        }
        // Байланысқан бөліктер: шағындары алынады
        val ids = coord.keys.toList()
        val idx = HashMap<Long, Int>(ids.size * 2).apply { ids.forEachIndexed { i, id -> put(id, i) } }
        val par = IntArray(ids.size) { it }
        fun find(x: Int): Int { var i = x; while (par[i] != i) { par[i] = par[par[i]]; i = par[i] }; return i }
        for (e in edges) { val a = find(idx.getValue(e.a)); val b = find(idx.getValue(e.b)); if (a != b) par[b] = a }
        val compLen = HashMap<Int, Double>()
        for (e in edges) { val c = find(idx.getValue(e.a)); compLen[c] = (compLen[c] ?: 0.0) + e.len }
        val kept = edges.filter { (compLen[find(idx.getValue(it.a))] ?: 0.0) >= minComponentM }

        val nodeNo = LinkedHashMap<Long, Int>()
        for (e in kept) { nodeNo.getOrPut(e.a) { nodeNo.size }; nodeNo.getOrPut(e.b) { nodeNo.size } }
        val n = nodeNo.size; val m = kept.size
        val nLat = IntArray(n); val nLon = IntArray(n)
        for ((id, i) in nodeNo) { val c = coord.getValue(id); nLat[i] = Math.round(c.lat * 1e6).toInt(); nLon[i] = Math.round(c.lon * 1e6).toInt() }
        val ea = IntArray(m); val eb = IntArray(m); val el = FloatArray(m); val ec = ByteArray(m); val ef = ByteArray(m)
        val en = IntArray(m); val er = IntArray(m); val geom = IntArray(m + 1)
        val pLat = ArrayList<Int>(); val pLon = ArrayList<Int>()
        kept.forEachIndexed { i, e ->
            ea[i] = nodeNo.getValue(e.a); eb[i] = nodeNo.getValue(e.b); el[i] = e.len.toFloat()
            ec[i] = e.w.cls.toByte(); ef[i] = e.w.flags.toByte(); en[i] = e.w.name; er[i] = e.w.ref
            geom[i] = pLat.size
            for (p in e.pts) { pLat += Math.round(p.lat * 1e6).toInt(); pLon += Math.round(p.lon * 1e6).toInt() }
        }
        geom[m] = pLat.size
        return RoadGraph.write(bounds, nLat, nLon, ea, eb, el, ec, ef, en, er, geom, pLat.toIntArray(), pLon.toIntArray(), strings)
    }
}
