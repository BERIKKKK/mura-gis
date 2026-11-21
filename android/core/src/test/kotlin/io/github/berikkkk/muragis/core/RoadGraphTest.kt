package io.github.berikkkk.muragis.core

import io.github.berikkkk.muragis.core.geo.Bounds
import io.github.berikkkk.muragis.core.geo.Geo
import io.github.berikkkk.muragis.core.model.Vehicle
import io.github.berikkkk.muragis.core.packages.MapPackage
import io.github.berikkkk.muragis.core.routing.RoadGraph
import io.github.berikkkk.muragis.core.routing.RoadGraphBuilder
import io.github.berikkkk.muragis.core.routing.RouteNetwork
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class RoadGraphTest {

    private val bounds = Bounds(54.9, 49.9, 55.3, 50.2)

    private fun e6(v: Double) = Math.round(v * 1e6).toInt()
    private fun way(ids: List<Long>, pts: List<Pair<Double, Double>>, vararg tags: Pair<String, String>) =
        RoadGraphBuilder.Way(ids.toLongArray(), pts.map { e6(it.first) }.toIntArray(), pts.map { e6(it.second) }.toIntArray(), mapOf(*tags))

    /**
     * 1 ——trunk—— 2 ——trunk—— 3       (ендік 50.0)
     *             |           |
     *        track grade4   path
     *             |           |
     *             4 ——————————5        (ендік 50.03; 4–5 — residential)
     * Шағын бөлек жол (100 м) — алынып тасталады.
     */
    private fun graph(): ByteArray {
        val b = RoadGraphBuilder()
        b.add(way(listOf(1, 2, 3), listOf(50.0 to 55.0, 50.0 to 55.05, 50.0 to 55.1), "highway" to "trunk", "ref" to "A-27"))
        b.add(way(listOf(2, 4), listOf(50.0 to 55.05, 50.03 to 55.05), "highway" to "track", "tracktype" to "grade4"))
        b.add(way(listOf(3, 5), listOf(50.0 to 55.1, 50.03 to 55.1), "highway" to "path"))
        b.add(way(listOf(4, 5), listOf(50.03 to 55.05, 50.03 to 55.1), "highway" to "residential", "name" to "Абай көшесі"))
        b.add(way(listOf(10, 11), listOf(50.15 to 55.2, 50.1509 to 55.2), "highway" to "service"))
        b.add(way(listOf(20, 21), listOf(50.1 to 55.0, 50.1 to 55.01), "highway" to "construction"))
        return b.build(bounds)
    }

    private fun route(g: RoadGraph, from: Pair<Double, Double>, to: Pair<Double, Double>, v: Vehicle, wet: Boolean = false) =
        g.findPath(RouteNetwork.End(from.first, from.second), RouteNetwork.End(to.first, to.second), RouteNetwork.Options(v, wet))

    @Test
    fun buildsGraphAndDropsSmallPieces() {
        val g = RoadGraph.read(graph())
        assertEquals(5, g.nodeCount)            // 1, 2, 3, 4, 5 (шағын жол және construction — жоқ)
        assertEquals(5, g.edgeCount)
    }

    @Test
    fun offroadUsesTrackAndNamesLegs() {
        val g = RoadGraph.read(graph())
        val r = route(g, 50.0 to 55.0, 50.03 to 55.1, Vehicle.OFFROAD) as RouteNetwork.Result.Ok
        // 1 → 2 (trunk) → 4 (track) → 5 (Абай көшесі)
        val expected = Geo.distance(50.0, 55.0, 50.0, 55.05) + Geo.distance(50.0, 55.05, 50.03, 55.05) + Geo.distance(50.03, 55.05, 50.03, 55.1)
        assertEquals(expected, r.len, 5.0)
        assertEquals(listOf("Республикалық жол A-27", "Грунт жол", "Абай көшесі"), r.legs.map { it.route.name.kk })
        assertNull(r.offStart); assertNull(r.offEnd)
        assertTrue(r.timeSeconds > 0)
    }

    @Test
    fun carAvoidsBadTrackAndFootUsesPath() {
        val g = RoadGraph.read(graph())
        // Көлік grade4 грунт жолға және соқпаққа шықпайды — Абай көшесіне trunk-тан жол жоқ
        val car = route(g, 50.0 to 55.0, 50.03 to 55.1, Vehicle.CAR)
        assertEquals(RouteNetwork.Result.Error.NOT_CONNECTED, (car as RouteNetwork.Result.Failed).error)
        val foot = route(g, 50.0 to 55.1, 50.03 to 55.1, Vehicle.FOOT) as RouteNetwork.Result.Ok
        assertEquals(Geo.distance(50.0, 55.1, 50.03, 55.1), foot.len, 5.0)
        assertEquals("Соқпақ", foot.legs.single().route.name.kk)
    }

    @Test
    fun startInMiddleOfEdgeAndSameEdge() {
        val g = RoadGraph.read(graph())
        val r = route(g, 50.0005 to 55.02, 50.0005 to 55.04, Vehicle.CAR) as RouteNetwork.Result.Ok
        assertEquals(Geo.distance(50.0, 55.02, 50.0, 55.04), r.len, 3.0)
        assertNotNull(r.offStart)
        assertEquals(1, r.legs.size)
    }

    @Test
    fun onewayIsRespectedForVehiclesOnly() {
        val b = RoadGraphBuilder(minComponentM = 0.0)
        b.add(way(listOf(1, 2), listOf(50.0 to 55.0, 50.0 to 55.01), "highway" to "primary", "oneway" to "yes"))
        b.add(way(listOf(2, 3, 1), listOf(50.0 to 55.01, 50.01 to 55.005, 50.0 to 55.0), "highway" to "primary"))
        val g = RoadGraph.read(b.build(bounds))
        val fwd = route(g, 50.0 to 55.0, 50.0 to 55.01, Vehicle.CAR) as RouteNetwork.Result.Ok
        assertEquals(Geo.distance(50.0, 55.0, 50.0, 55.01), fwd.len, 2.0)
        val back = route(g, 50.0 to 55.01, 50.0 to 55.0, Vehicle.CAR) as RouteNetwork.Result.Ok
        assertTrue(back.len > fwd.len * 1.5)        // айналма жолмен
        val walk = route(g, 50.0 to 55.01, 50.0 to 55.0, Vehicle.FOOT) as RouteNetwork.Result.Ok
        assertEquals(fwd.len, walk.len, 2.0)
    }

    @Test
    fun wetSeasonClosesUnknownTracksForCars() {
        val b = RoadGraphBuilder(minComponentM = 0.0)
        b.add(way(listOf(1, 2), listOf(50.0 to 55.0, 50.0 to 55.01), "highway" to "track"))
        val g = RoadGraph.read(b.build(bounds))
        assertTrue(route(g, 50.0 to 55.0, 50.0 to 55.01, Vehicle.CAR) is RouteNetwork.Result.Ok)
        val wet = route(g, 50.0 to 55.0, 50.0 to 55.01, Vehicle.CAR, wet = true)
        assertEquals(RouteNetwork.Result.Error.NO_GRAPH, (wet as RouteNetwork.Result.Failed).error)
    }

    @Test
    fun farOrOutsidePointsHaveNoGraph() {
        val g = RoadGraph.read(graph())
        assertEquals(RouteNetwork.Result.Error.NO_GRAPH, (route(g, 45.0 to 60.0, 50.0 to 55.0, Vehicle.CAR) as RouteNetwork.Result.Failed).error)
        assertEquals(RouteNetwork.Result.Error.NO_GRAPH, (route(g, 50.19 to 55.29, 50.0 to 55.0, Vehicle.CAR) as RouteNetwork.Result.Failed).error)
    }

    @Test
    fun storedInPackageInChunks() {
        val bytes = graph()
        assertTrue(RoadGraph.chunks(ByteArray(RoadGraph.CHUNK_SIZE * 2 + 5)).size == 3)
        val f = File.createTempFile("roads", ".mbtiles"); f.delete()
        JdbcSqlDb(f.path).use { db ->
            MapPackage.createTables(db)
            for ((name, data) in RoadGraph.chunks(bytes)) db.exec("INSERT INTO ${MapPackage.RESOURCES} (name, data) VALUES (?, ?)", listOf(name, data))
            assertTrue(RoadGraph.inPackage(db))
            val g = RoadGraph.fromPackage(db)!!
            assertEquals(5, g.edgeCount)
        }
        JdbcSqlDb(f.path).use { db -> db.exec("DELETE FROM ${MapPackage.RESOURCES}"); assertNull(RoadGraph.fromPackage(db)) }
        f.delete()
        assertArrayEquals(bytes, graph())
    }
}
