package io.github.berikkkk.muragis.core

import io.github.berikkkk.muragis.core.db.LayerFormat
import io.github.berikkkk.muragis.core.db.LayerKind
import io.github.berikkkk.muragis.core.db.LayerRole
import io.github.berikkkk.muragis.core.db.MapLayer
import io.github.berikkkk.muragis.core.model.Lang
import io.github.berikkkk.muragis.core.packages.Catalog
import io.github.berikkkk.muragis.core.packages.MapCategory
import io.github.berikkkk.muragis.core.packages.MapPackage
import io.github.berikkkk.muragis.core.server.LocalTileServer
import io.github.berikkkk.muragis.core.server.TileProvider
import io.github.berikkkk.muragis.core.server.TileResponse
import io.github.berikkkk.muragis.core.tiles.MbtilesWriter
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.GZIPOutputStream

class PackagesTest {

    private val catalogFile = File("../app/src/main/assets/maps/catalog.json")

    @Test
    fun appCatalogHasThreeKobdaPackages() {
        val c = Catalog.parse(catalogFile.readText())
        val r = c.regions.single { it.id == "kobda" }
        assertEquals(listOf(MapCategory.BASIC, MapCategory.TOPO, MapCategory.SATELLITE), r.packages.map { it.category })
        for (p in r.packages) {
            assertTrue(p.url, p.url.startsWith("https://"))
            assertEquals(64, p.sha256.length)
            assertTrue(p.size > 0)
            assertTrue(p.license.isNotBlank() && p.attribution.isNotBlank() && p.date.isNotBlank() && p.source.kk.isNotBlank())
            assertTrue(r.bounds.contains(50.15, 55.66))   // Қобда ауылы
        }
        val s2 = r.packages.single { it.category == MapCategory.SATELLITE }
        assertEquals("10 м/пиксель", s2.resolution.of(Lang.KK))
        assertTrue(s2.period.of(Lang.RU).contains("2025-07"))
        assertEquals("Хобдинский район — базовая карта", r.packages[0].title.of(Lang.RU))
    }

    @Test
    fun categories() {
        val c = Catalog.parse(catalogFile.readText())
        fun online(src: String, overlay: Boolean = false) = MapLayer(id = "b-$src", kind = LayerKind.ONLINE, format = LayerFormat.XYZ_URL, title = src, sourceId = src,
            role = if (overlay) LayerRole.OVERLAY else LayerRole.BASE)
        assertEquals(MapCategory.BASIC, MapCategory.of(online("osm"), c))
        assertEquals(MapCategory.TOPO, MapCategory.of(online("otm"), c))
        assertEquals(MapCategory.TOPO, MapCategory.of(online("esri-topo"), c))
        assertEquals(MapCategory.SATELLITE, MapCategory.of(online("esri-sat"), c))
        assertEquals(MapCategory.HISTORIC, MapCategory.of(online("gsh"), c))
        assertEquals(MapCategory.OVERLAY, MapCategory.of(online("esri-places", overlay = true), c))
        val pkg = MapLayer(kind = LayerKind.DOWNLOADED, format = LayerFormat.MBTILES, title = "t", sourceId = "pkg:kobda-topo-2026-11-20")
        assertEquals(MapCategory.TOPO, MapCategory.of(pkg, c))
        assertEquals(MapCategory.USER, MapCategory.of(MapLayer(kind = LayerKind.IMPORTED, format = LayerFormat.MBTILES, title = "x"), c))
        // Өз дереккөзінен аумақ жүктеу — қолданушы картасы
        assertEquals(MapCategory.USER, MapCategory.of(MapLayer(kind = LayerKind.DOWNLOADED, format = LayerFormat.MBTILES, title = "x", sourceId = "abc"), c))
        assertEquals("kobda-base", Catalog.packageIdOf("pkg:kobda-base"))
        assertNull(Catalog.packageIdOf("osm"))
    }

    @Test
    fun resolveStyleReplacesLinksAndLanguage() {
        val style = """{"glyphs":"mura://glyphs/{fontstack}/{range}.pbf","sprite":"mura://sprite","sources":{"osm":{"tiles":["mura://tiles/{z}/{x}/{y}"]},
            "hs":{"tiles":["mura://set/hillshade/{z}/{x}/{y}"]}},"layers":[{"layout":{"text-field":["get","name_kk"]}}]}"""
        val kk = MapPackage.resolveStyle(style, "http://127.0.0.1:5000", "L1", ru = false)
        assertTrue(kk.contains("http://127.0.0.1:5000/t/L1/{z}/{x}/{y}"))
        assertTrue(kk.contains("http://127.0.0.1:5000/s/L1/hillshade/{z}/{x}/{y}"))
        assertTrue(kk.contains("http://127.0.0.1:5000/r/L1/glyphs/{fontstack}/{range}.pbf"))
        assertTrue(kk.contains("\"http://127.0.0.1:5000/r/L1/sprite\""))
        assertTrue(kk.contains("\"name_kk\"") && !kk.contains("mura://"))
        assertTrue(MapPackage.resolveStyle(style, "http://x", "L1", ru = true).contains("\"name_ru\""))
    }

    @Test
    fun packageTablesAndGunzip() {
        val f = File.createTempFile("pkg", ".mbtiles").also { it.delete(); it.deleteOnExit() }
        JdbcSqlDb(f.path).use { db ->
            MbtilesWriter(db).put(3, 2, 1, byteArrayOf(1, 2, 3))
            MapPackage.createTables(db)
            assertFalse(MapPackage.hasStyle(db))
            db.exec("INSERT INTO mura_resources (name, data) VALUES (?, ?)", listOf("style.json", "{}".toByteArray()))
            db.exec("INSERT INTO mura_tiles VALUES ('hillshade', 3, 2, 6, ?)", listOf(byteArrayOf(9)))   // TMS: 2^3-1-1 = 6
            assertTrue(MapPackage.hasStyle(db))
            assertArrayEquals(byteArrayOf(9), MapPackage.extraTile(db, "hillshade", 3, 2, 1))
            assertNull(MapPackage.resource(db, "sprite.png"))
        }
        val raw = "vector tile".toByteArray()
        val gz = ByteArrayOutputStream().also { o -> GZIPOutputStream(o).use { it.write(raw) } }.toByteArray()
        assertArrayEquals(raw, MapPackage.gunzipIfNeeded(gz))
        assertArrayEquals(raw, MapPackage.gunzipIfNeeded(raw))
    }

    @Test
    fun localServerServesResourcesAndExtraTiles() {
        val provider = object : TileProvider {
            override fun tile(layerId: String, z: Int, x: Int, y: Int) = null
            override fun resource(layerId: String, path: String) =
                if (layerId == "L1" && path == "glyphs/Noto Sans Regular/0-255.pbf") TileResponse(byteArrayOf(7), "application/x-protobuf") else null
            override fun extraTile(layerId: String, set: String, z: Int, x: Int, y: Int) =
                if (set == "hillshade" && z == 5) TileResponse(byteArrayOf(8), "image/png") else null
        }
        LocalTileServer(provider).use { s ->
            fun get(p: String): Pair<Int, ByteArray> {
                val c = URL(s.baseUrl + p).openConnection() as HttpURLConnection
                return try { c.responseCode to (if (c.responseCode == 200) c.inputStream.readBytes() else ByteArray(0)) } finally { c.disconnect() }
            }
            assertEquals(200, get("/r/L1/glyphs/Noto%20Sans%20Regular/0-255.pbf").first)
            assertArrayEquals(byteArrayOf(7), get("/r/L1/glyphs/Noto%20Sans%20Regular/0-255.pbf").second)
            assertEquals(404, get("/r/L1/glyphs/../secret").first)
            assertEquals(404, get("/r/L1/sprite.json").first)
            assertArrayEquals(byteArrayOf(8), get("/s/L1/hillshade/5/1/2").second)
            assertEquals(204, get("/s/L1/hillshade/6/1/2").first)
            assertEquals(204, get("/t/L1/1/0/0").first)
            assertNotNull(s.port)
        }
    }
}
