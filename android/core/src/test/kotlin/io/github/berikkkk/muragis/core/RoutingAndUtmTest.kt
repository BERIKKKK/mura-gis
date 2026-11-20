package io.github.berikkkk.muragis.core

import io.github.berikkkk.muragis.core.geo.Utm
import io.github.berikkkk.muragis.core.model.Localized
import io.github.berikkkk.muragis.core.model.Monument
import io.github.berikkkk.muragis.core.model.Route
import io.github.berikkkk.muragis.core.model.RoutePoint
import io.github.berikkkk.muragis.core.model.Season
import io.github.berikkkk.muragis.core.model.Vehicle
import io.github.berikkkk.muragis.core.routing.RouteNetwork
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

class RoutingAndUtmTest {

    /* ---------- UTM: анықтамалық мәндер — PROJ (pyproj, EPSG:326xx/327xx) ---------- */
    @Test fun utmMatchesProj() {
        data class Ref(val lat: Double, val lon: Double, val zone: Int, val e: Double, val n: Double)
        listOf(
            Ref(50.283333, 57.166667, 40, 511874.189, 5570147.019),
            Ref(-33.9, 70.5, 42, 638689.894, 6247919.039),
            Ref(43.25, 76.95, 43, 658297.296, 4790423.553),
            Ref(47.1, 52.0, 39, 575883.335, 5216761.964),
        ).forEach { r ->
            val u = Utm.fromLatLon(r.lat, r.lon)
            assertEquals(r.zone, u.zone)
            assertEquals(r.lat < 0, u.south)
            assertEquals(r.e, u.easting, 0.01)
            assertEquals(r.n, u.northing, 0.01)
            val back = Utm.toLatLon(u.zone, u.south, u.easting, u.northing)
            assertEquals(r.lat, back.lat, 1e-8)
            assertEquals(r.lon, back.lon, 1e-8)
        }
        assertEquals("40U 511874 5570147", Utm.formatUtm(50.283333, 57.166667))
        assertEquals("50.283333, 57.166667", Utm.formatDd(50.283333, 57.166667))
    }

    @Test fun utmRoundTripAcrossKazakhstan() {
        val rnd = Random(7)
        repeat(500) {
            val lat = 40.5 + rnd.nextDouble() * 15; val lon = 46.4 + rnd.nextDouble() * 41
            val u = Utm.fromLatLon(lat, lon)
            val b = Utm.toLatLon(u.zone, u.south, u.easting, u.northing)
            assertEquals(lat, b.lat, 1e-8); assertEquals(lon, b.lon, 1e-8)
        }
    }

    /* ---------- Жол іздеу: жұмыс үстеліндегі routes/graph.js-пен бірдей нәтиже ---------- */
    private fun scenario(seed: Int): Pair<List<Route>, List<Monument>> {
        val rnd = Random(seed)
        val lat0 = 50.28; val lon0 = 57.16
        // Тор тәрізді жолдар (қиылысатын), бір-біріне жалғасатын тармақтар және кездейсоқ «қисық» маршруттар
        val routes = ArrayList<Route>()
        fun id(i: Int) = "%016x".format(0x1000L + i)
        fun add(pts: List<Pair<Double, Double>>, v: Vehicle, s: Season) {
            routes += Route(id = id(routes.size), name = Localized("r${routes.size}"), vehicle = v, season = s, points = pts.map { RoutePoint(it.first, it.second) })
        }
        val vs = Vehicle.entries
        for (k in 0 until 4) add((0..6).map { i -> lat0 + k * 0.03 + rnd.nextDouble() * 0.004 to lon0 + i * 0.03 }, vs[k % 3], if (k == 2) Season.DRY else Season.ALL)
        for (k in 0 until 4) add((0..6).map { i -> lat0 - 0.01 + i * 0.02 + rnd.nextDouble() * 0.003 to lon0 + 0.015 + k * 0.045 }, vs[(k + 1) % 3], Season.ALL)
        // Т-тәрізді тармақ: ұшы басқа маршруттың ортасына жақын
        add(listOf(lat0 + 0.2 to lon0 + 0.1, lat0 + 0.12 to lon0 + 0.0905, lat0 + 0.0905 + 0.0004 to lon0 + 0.09), Vehicle.OFFROAD, Season.ALL)
        repeat(3) {
            var la = lat0 + rnd.nextDouble() * 0.1; var lo = lon0 + rnd.nextDouble() * 0.18
            add((0..8).map { la += (rnd.nextDouble() - .4) * 0.01; lo += (rnd.nextDouble() - .3) * 0.012; la to lo }, vs[rnd.nextInt(3)], Season.ALL)
        }
        val marks = (0 until 6).map { i ->
            val r = routes[rnd.nextInt(routes.size)]; val p = r.points[rnd.nextInt(r.points.size)]
            Monument(id = "%016x".format(0xa000L + i), lat = p.lat + (rnd.nextDouble() - .5) * 0.003, lon = p.lon + (rnd.nextDouble() - .5) * 0.003, name = Localized("m$i"))
        }
        return routes to marks
    }

    @Test fun findPathMatchesDesktop() {
        if (!TestUtil.nodeAvailable) { println("SKIP: node жоқ"); return }
        for (seed in listOf(1, 2, 3)) {
            val (routes, marks) = scenario(seed)
            val rnd = Random(100 + seed)
            data class Q(val from: RouteNetwork.End, val to: RouteNetwork.End, val o: RouteNetwork.Options)
            fun randomEnd(): RouteNetwork.End = when (rnd.nextInt(3)) {
                0 -> marks[rnd.nextInt(marks.size)].let { RouteNetwork.End(it.lat, it.lon, markId = it.id) }
                else -> RouteNetwork.End(50.27 + rnd.nextDouble() * 0.13, 57.15 + rnd.nextDouble() * 0.2)
            }
            val qs = (0 until 25).map { Q(randomEnd(), randomEnd(), RouteNetwork.Options(Vehicle.entries[rnd.nextInt(3)], rnd.nextInt(4) == 0)) }

            val input = buildJsonObject {
                put("routes", buildJsonArray {
                    routes.forEach { r -> add(buildJsonObject {
                        put("id", r.id); put("vehicle", r.vehicle.code); put("season", r.season.code)
                        put("pts", JsonArray(r.points.map { JsonArray(listOf(JsonPrimitive(it.lat), JsonPrimitive(it.lon))) }))
                    }) }
                })
                put("marks", JsonArray(marks.map { m -> buildJsonObject { put("id", m.id); put("lat", m.lat); put("lon", m.lon); put("name", m.id) } }))
                put("queries", JsonArray(qs.map { q ->
                    fun end(e: RouteNetwork.End) = buildJsonObject { put("lat", e.lat); put("lon", e.lon); e.markId?.let { put("markId", it) } }
                    buildJsonObject { put("from", end(q.from)); put("to", end(q.to)); put("opt", buildJsonObject { put("vehicle", q.o.vehicle.code); put("wet", q.o.wet) }) }
                }))
            }
            val f = TestUtil.tmp("graph-$seed.json").apply { writeText(input.toString()) }
            val o = Json.parseToJsonElement(TestUtil.desktop("find-path", f.path)).jsonObject

            val net = RouteNetwork.build(routes, marks)
            assertEquals("түйіндер (seed $seed)", o["nodes"]!!.jsonPrimitive.int, net.nodes.size)
            assertEquals("қабырғалар (seed $seed)", o["edges"]!!.jsonPrimitive.int, net.edges.size)
            var okCount = 0
            o["results"]!!.jsonArray.forEachIndexed { i, el ->
                val d = el.jsonObject
                val r = net.findPath(qs[i].from, qs[i].to, qs[i].o)
                val msg = "seed $seed, сұрау $i"
                assertEquals(msg, d["ok"]!!.jsonPrimitive.boolean, r is RouteNetwork.Result.Ok)
                if (r is RouteNetwork.Result.Ok) {
                    okCount++
                    assertEquals(msg, d["len"]!!.jsonPrimitive.double, r.len, 1e-6)
                    assertEquals(msg, d["time"]!!.jsonPrimitive.double, r.timeSeconds, 1e-6)
                    assertEquals(msg, d["n"]!!.jsonPrimitive.int, r.coords.size)
                    assertEquals(msg, (d["legs"] as JsonArray).map { it.jsonPrimitive.content }, r.legs.map { it.route.id })
                    assertEquals(msg, d["offStart"]!!.jsonPrimitive.double, r.offStart?.len ?: 0.0, 1e-6)
                    assertEquals(msg, d["offEnd"]!!.jsonPrimitive.double, r.offEnd?.len ?: 0.0, 1e-6)
                }
            }
            assertTrue("сценарийде табылған жолдар болуы керек (seed $seed)", okCount >= 5)
        }
    }

    @Test fun emptyNetworkReportsNoNetwork() {
        val r = RouteNetwork.build(emptyList()).findPath(RouteNetwork.End(50.0, 57.0), RouteNetwork.End(50.1, 57.1))
        assertTrue(r is RouteNetwork.Result.Failed && r.error == RouteNetwork.Result.Error.NO_NETWORK)
    }

    @Suppress("unused") private val keep = JsonObject(emptyMap())
}
