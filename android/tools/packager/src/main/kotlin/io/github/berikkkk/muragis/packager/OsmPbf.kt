package io.github.berikkkk.muragis.packager

import io.github.berikkkk.muragis.core.geo.Bounds
import io.github.berikkkk.muragis.core.routing.RoadGraphBuilder
import java.io.DataInputStream
import java.io.EOFException
import java.io.File
import java.util.zip.Inflater

/**
 * OSM PBF файлын оқу (сыртқы кітапханасыз): тек жол графына керегі — аумақтағы нүктелер және highway=* жолдары.
 * Пішім: https://wiki.openstreetmap.org/wiki/PBF_Format. Geofabrik файлдарында нүктелер жолдардан бұрын келеді,
 * сондықтан бір өту жеткілікті.
 */
object OsmPbf {

    /** Протобуф оқырманы (бір буфер ішінде). */
    private class Pb(val buf: ByteArray, var pos: Int, val end: Int) {
        fun more() = pos < end
        fun varint(): Long {
            var r = 0L; var s = 0
            while (true) { val b = buf[pos++].toInt(); r = r or ((b and 0x7f).toLong() shl s); if (b and 0x80 == 0) return r; s += 7 }
        }
        fun sub(): Pb { val l = varint().toInt(); val p = Pb(buf, pos, pos + l); pos += l; return p }
        fun string(): String { val l = varint().toInt(); val s = String(buf, pos, l, Charsets.UTF_8); pos += l; return s }
        fun skip(wire: Int) { when (wire) { 0 -> varint(); 1 -> pos += 8; 2 -> { val l = varint().toInt(); pos += l }; 5 -> pos += 4; else -> error("wire $wire") } }
        /** Тығыздалған varint тізбегі. */
        inline fun packed(f: (Long) -> Unit) { val p = sub(); while (p.more()) f(p.varint()) }
    }

    private fun zz(v: Long) = (v ushr 1) xor -(v and 1)

    /** Аумақтағы ([margin] градус қосып) жолдарды [out]-қа береді. */
    fun readRoads(file: File, b: Bounds, out: RoadGraphBuilder, margin: Double = 0.02) {
        val s = (b.south - margin) * 1e9; val n = (b.north + margin) * 1e9
        val w = (b.west - margin) * 1e9; val e = (b.east + margin) * 1e9
        // Нүкте id → (lat << 32 | lon) микроградуспен
        val nodes = HashMap<Long, Long>(1 shl 22)
        var ways = 0; var blocks = 0
        DataInputStream(file.inputStream().buffered(1 shl 20)).use { inp ->
            while (true) {
                val hl = try { inp.readInt() } catch (_: EOFException) { break }
                val hdr = ByteArray(hl).also { inp.readFully(it) }
                var type = ""; var size = 0
                Pb(hdr, 0, hl).let { p -> while (p.more()) { val t = p.varint().toInt(); when (t shr 3) { 1 -> type = p.string(); 3 -> size = p.varint().toInt(); else -> p.skip(t and 7) } } }
                val blob = ByteArray(size).also { inp.readFully(it) }
                if (type != "OSMData") continue
                val data = unblob(blob)
                block(Pb(data, 0, data.size), s, n, w, e, nodes) { ids, tags ->
                    val lat = IntArray(ids.size); val lon = IntArray(ids.size)
                    var k = 0
                    // Аумақтан шыққан жерде жол бөлінеді: әр үзінді бөлек жол болып қосылады
                    fun flush(to: Int) {
                        if (to - k >= 2) {
                            val sub = ids.copyOfRange(k, to)
                            if (out.add(RoadGraphBuilder.Way(sub, lat.copyOfRange(k, to), lon.copyOfRange(k, to), tags))) ways++
                        }
                    }
                    for (i in ids.indices) {
                        val c = nodes[ids[i]]
                        if (c == null) { flush(i); k = i + 1; continue }
                        lat[i] = (c shr 32).toInt(); lon[i] = c.toInt()
                    }
                    flush(ids.size)
                }
                if (++blocks % 500 == 0) println("  blocks $blocks, nodes ${nodes.size}, roads $ways")
            }
        }
        println("  nodes in area ${nodes.size}, roads $ways")
    }

    private fun unblob(blob: ByteArray): ByteArray {
        val p = Pb(blob, 0, blob.size)
        var raw: ByteArray? = null; var rawSize = 0; var z: Pb? = null
        while (p.more()) {
            val t = p.varint().toInt()
            when (t shr 3) {
                1 -> { val s = p.sub(); raw = blob.copyOfRange(s.pos, s.end) }
                2 -> rawSize = p.varint().toInt()
                3 -> z = p.sub()
                else -> p.skip(t and 7)
            }
        }
        raw?.let { return it }
        val zz = z ?: error("Unsupported blob compression")
        val out = ByteArray(rawSize)
        Inflater().apply { setInput(blob, zz.pos, zz.end - zz.pos); inflate(out); end() }
        return out
    }

    private inline fun block(p: Pb, s: Double, n: Double, w: Double, e: Double, nodes: HashMap<Long, Long>, onWay: (LongArray, Map<String, String>) -> Unit) {
        val strings = ArrayList<String>()
        val groups = ArrayList<Pb>()
        var gran = 100L; var latOff = 0L; var lonOff = 0L
        while (p.more()) {
            val t = p.varint().toInt()
            when (t shr 3) {
                1 -> { val st = p.sub(); while (st.more()) { val tt = st.varint().toInt(); if (tt shr 3 == 1) strings += st.string() else st.skip(tt and 7) } }
                2 -> groups += p.sub()
                17 -> gran = p.varint()
                19 -> latOff = p.varint()
                20 -> lonOff = p.varint()
                else -> p.skip(t and 7)
            }
        }
        for (g in groups) while (g.more()) {
            val t = g.varint().toInt()
            when (t shr 3) {
                2 -> dense(g.sub(), gran, latOff, lonOff, s, n, w, e, nodes)
                3 -> {
                    val wp = g.sub()
                    val keys = ArrayList<Int>(); val vals = ArrayList<Int>(); val refs = ArrayList<Long>()
                    while (wp.more()) {
                        val tt = wp.varint().toInt()
                        when (tt shr 3) {
                            2 -> wp.packed { keys += it.toInt() }
                            3 -> wp.packed { vals += it.toInt() }
                            8 -> { var id = 0L; wp.packed { id += zz(it); refs += id } }
                            else -> wp.skip(tt and 7)
                        }
                    }
                    val hk = keys.indexOfFirst { strings[it] == "highway" }
                    if (hk >= 0) {
                        val tags = HashMap<String, String>()
                        for (i in keys.indices) tags[strings[keys[i]]] = strings[vals[i]]
                        onWay(refs.toLongArray(), tags)
                    }
                }
                1 -> { // Жеке нүкте (Geofabrik-те сирек)
                    val np = g.sub(); var id = 0L; var lat = 0L; var lon = 0L
                    while (np.more()) { val tt = np.varint().toInt(); when (tt shr 3) { 1 -> id = zz(np.varint()); 8 -> lat = zz(np.varint()); 9 -> lon = zz(np.varint()); else -> np.skip(tt and 7) } }
                    put(id, latOff + gran * lat, lonOff + gran * lon, s, n, w, e, nodes)
                }
                else -> g.skip(t and 7)
            }
        }
    }

    private fun put(id: Long, lat: Long, lon: Long, s: Double, n: Double, w: Double, e: Double, nodes: HashMap<Long, Long>) {
        if (lat < s || lat > n || lon < w || lon > e) return
        val la = Math.round(lat / 1000.0); val lo = Math.round(lon / 1000.0)
        nodes[id] = (la shl 32) or (lo and 0xffffffffL)
    }

    private fun dense(p: Pb, gran: Long, latOff: Long, lonOff: Long, s: Double, n: Double, w: Double, e: Double, nodes: HashMap<Long, Long>) {
        var ids = LongArray(0); var lats = LongArray(0); var lons = LongArray(0)
        fun deltas(): LongArray { val r = ArrayList<Long>(8000); var acc = 0L; p.packed { acc += zz(it); r += acc }; return r.toLongArray() }
        while (p.more()) {
            val t = p.varint().toInt()
            when (t shr 3) { 1 -> ids = deltas(); 8 -> lats = deltas(); 9 -> lons = deltas(); else -> p.skip(t and 7) }
        }
        for (i in ids.indices) put(ids[i], latOff + gran * lats[i], lonOff + gran * lons[i], s, n, w, e, nodes)
    }
}
