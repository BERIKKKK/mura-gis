package io.github.berikkkk.muragis.core

import io.github.berikkkk.muragis.core.download.FetchResult
import io.github.berikkkk.muragis.core.download.StopReason
import io.github.berikkkk.muragis.core.download.TileDownloader
import io.github.berikkkk.muragis.core.download.TileSink
import io.github.berikkkk.muragis.core.geo.Bounds
import io.github.berikkkk.muragis.core.server.LocalTileServer
import io.github.berikkkk.muragis.core.server.TileResponse
import io.github.berikkkk.muragis.core.sources.OfflinePolicy
import io.github.berikkkk.muragis.core.sources.SourcePolicy
import io.github.berikkkk.muragis.core.sources.TileSource
import io.github.berikkkk.muragis.core.tiles.MbtilesStore
import io.github.berikkkk.muragis.core.tiles.MbtilesWriter
import io.github.berikkkk.muragis.core.tiles.TileMath
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.HttpURLConnection
import java.net.URL

class DownloadServerPolicyTest {
    @Test fun builtInSourcesAreOnlineOnly() {
        assertTrue(SourcePolicy.BUILT_IN.isNotEmpty())
        assertTrue(SourcePolicy.BUILT_IN.none { it.policy.allowed })
        assertTrue(SourcePolicy.BUILT_IN.all { it.attribution.isNotBlank() })
    }

    @Test fun customSourcePolicy() {
        // Пайдаланушы «рұқсатым бар» десе де — Google, OSM, Esri бұғатталады
        assertFalse(SourcePolicy.forCustom("https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", true, 20).allowed)
        assertFalse(SourcePolicy.forCustom("https://khms0.googleapis.com/kh?v=1&x={x}&y={y}&z={z}", true, 20).allowed)
        assertFalse(SourcePolicy.forCustom("https://a.tile.openstreetmap.org/{z}/{x}/{y}.png", true, 19).allowed)
        assertFalse(SourcePolicy.forCustom("https://server.arcgisonline.com/x/{z}/{y}/{x}", true, 19).allowed)
        assertFalse(SourcePolicy.forCustom("https://tiles.example.kz/{z}/{x}/{y}.png", false, 19).allowed)
        assertTrue(SourcePolicy.forCustom("https://tiles.example.kz/{z}/{x}/{y}.png", true, 19).allowed)
    }

    private fun src(allowed: Boolean = true, max: Long = 0) = TileSource("own", "Own", "https://tiles.example.kz/{z}/{x}/{y}.png", attribution = "© Own",
        policy = OfflinePolicy(allowed, "test", maxZoom = 19, maxTilesPerJob = max))

    private class MemSink : TileSink {
        val m = HashMap<String, ByteArray>()
        override fun has(z: Int, x: Int, y: Int) = m.containsKey("$z/$x/$y")
        override fun put(z: Int, x: Int, y: Int, data: ByteArray) { m["$z/$x/$y"] = data }
    }

    @Test fun downloadPauseResumeAndRetry() {
        val area = Bounds(68.0, 42.0, 69.0, 43.0)
        val total = TileMath.count(area, 5, 9)
        val sink = MemSink()
        var calls = 0
        var throttled = false
        val fetcher = { url: String ->
            calls++
            if (!throttled && calls == 3) { throttled = true; FetchResult(429, null, 2000) } else FetchResult(200, url.toByteArray())
        }
        val sleeps = ArrayList<Long>()
        val d = TileDownloader(src(), fetcher, sink) { sleeps += it }
        var n = 0
        // Тоқтату (пауза) 5 тайлдан кейін
        assertEquals(StopReason.PAUSED, d.run(area, 5, 9, { n++ >= 5 }) {})
        val afterPause = sink.m.size
        assertTrue(afterPause in 1 until total)
        assertTrue(2000L in sleeps)                     // Retry-After сақталды
        // Жалғастыру: бар тайлдар қайта жүктелмейді
        val before = calls
        var last: io.github.berikkkk.muragis.core.download.Progress? = null
        assertEquals(StopReason.COMPLETED, d.run(area, 5, 9, { false }) { last = it })
        assertEquals(total.toInt(), sink.m.size)
        assertEquals((total - afterPause).toInt(), calls - before)
        assertEquals(100, last!!.percent)
    }

    @Test fun downloadRefusedWhenNotAllowedOrTooLarge() {
        val d = TileDownloader(src(allowed = false), { FetchResult(200, ByteArray(1)) }, MemSink()) {}
        assertEquals(StopReason.FAILED, d.run(Bounds(68.0, 42.0, 69.0, 43.0), 5, 6, { false }) {})
        assertEquals("not_allowed", d.lastError)
        val d2 = TileDownloader(src(max = 10), { FetchResult(200, ByteArray(1)) }, MemSink()) {}
        assertEquals(StopReason.FAILED, d2.run(Bounds(60.0, 40.0, 80.0, 50.0), 5, 12, { false }) {})
        assertEquals("too_many_tiles", d2.lastError)
    }

    @Test fun downloadIntoMbtilesThenServeOverLoopback() {
        val f = TestUtil.tmp("dl.mbtiles")
        val area = Bounds(68.0, 42.0, 68.5, 42.5)
        MbtilesWriter(JdbcSqlDb(f.path)).use { w ->
            val sink = object : TileSink {
                override fun has(z: Int, x: Int, y: Int) = w.has(z, x, y)
                override fun put(z: Int, x: Int, y: Int, data: ByteArray) = w.put(z, x, y, data)
                override fun <T> batch(block: () -> T) = w.batch(block)
            }
            val png = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 1, 2, 3)
            assertEquals(StopReason.COMPLETED, TileDownloader(src(), { FetchResult(200, png) }, sink) {}.run(area, 6, 8, { false }) {})
            w.setMetadata(mapOf("name" to "dl", "format" to "png", "minzoom" to "6", "maxzoom" to "8", "bounds" to area.encode()))
        }
        val store = MbtilesStore(JdbcSqlDb(f.path))
        val x = TileMath.lonToX(68.2, 8); val y = TileMath.latToY(42.2, 8)
        LocalTileServer({ id, z, xx, yy -> if (id == "L1") store.tile(z, xx, yy)?.let { TileResponse(it, "image/png") } else null }).use { srv ->
            fun get(path: String): Pair<Int, ByteArray> {
                val c = URL(srv.baseUrl + path).openConnection(java.net.Proxy.NO_PROXY) as HttpURLConnection
                return c.responseCode to (if (c.responseCode == 200) c.inputStream.readBytes() else ByteArray(0))
            }
            val (code, body) = get("/t/L1/8/$x/$y")
            assertEquals(200, code)
            assertArrayEquals(store.tile(8, x, y), body)
            assertEquals(204, get("/t/L1/3/0/0").first)            // тайл жоқ
            assertEquals(204, get("/t/NOPE/8/$x/$y").first)
            assertEquals(404, get("/other").first)
            assertNotNull(srv.template("L1"))
            // Бірнеше қатар сұраныс (keep-alive / қатар ағындар)
            val results = (1..40).toList().parallelStream().map { get("/t/L1/8/$x/$y").first }.toList()
            assertTrue(results.all { it == 200 })
        }
        store.close()
    }
}
