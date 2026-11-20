package io.github.berikkkk.muragis.mobile

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.github.berikkkk.muragis.core.db.LayerFormat
import io.github.berikkkk.muragis.core.db.LayerKind
import io.github.berikkkk.muragis.core.db.LayerStore
import io.github.berikkkk.muragis.core.db.LocalStore
import io.github.berikkkk.muragis.core.db.MapLayer
import io.github.berikkkk.muragis.core.geo.Bounds
import io.github.berikkkk.muragis.core.gpkg.MuraProject
import io.github.berikkkk.muragis.core.model.Category
import io.github.berikkkk.muragis.core.model.Lang
import io.github.berikkkk.muragis.core.model.Localized
import io.github.berikkkk.muragis.core.model.Monument
import io.github.berikkkk.muragis.core.model.Route
import io.github.berikkkk.muragis.core.model.RoutePoint
import io.github.berikkkk.muragis.core.server.LocalTileServer
import io.github.berikkkk.muragis.core.tiles.MbtilesStore
import io.github.berikkkk.muragis.core.tiles.MbtilesWriter
import io.github.berikkkk.muragis.core.tiles.TileMath
import io.github.berikkkk.muragis.mobile.data.AndroidSqlDb
import io.github.berikkkk.muragis.mobile.data.TileRegistry
import io.github.berikkkk.muragis.mobile.map.SymbolIcons
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** Құрылғыда (эмуляторда) — Android-тың өз SQLite-ы, Bitmap, loopback сервер. */
@RunWith(AndroidJUnit4::class)
class DeviceStorageTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private fun file(n: String) = File(ctx.cacheDir, "t-" + System.nanoTime() + "-" + n)

    private fun png(color: Int): ByteArray {
        val b = Bitmap.createBitmap(256, 256, Bitmap.Config.ARGB_8888); b.eraseColor(color)
        return ByteArrayOutputStream().also { b.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray()
    }

    @Test fun localStorePersistsAcrossReopenWithSeparateLanguages() {
        val f = file("mura.db")
        val s = LocalStore(AndroidSqlDb.openReadWrite(f), "test")
        val m = s.saveMonument(Monument(lat = 42.65, lon = 68.12, name = Localized("Сүткент", "Сюткент"), category = Category.REP))
        s.saveMonument(m.copy(name = m.name.with(Lang.RU, "Городище Сюткент")))
        val r = s.saveRoute(Route(name = Localized("Жол", ""), points = listOf(RoutePoint(42.0, 68.0), RoutePoint(42.65, 68.12, m.id))))
        s.db.close()
        val s2 = LocalStore(AndroidSqlDb.openReadWrite(f))
        val back = s2.monument(m.id)!!
        assertEquals("Сүткент", back.name.kk)
        assertEquals("Городище Сюткент", back.name.ru)
        assertEquals(Category.REP, back.category)
        assertEquals(m.id, s2.route(r.id)!!.points[1].monumentId)
        s2.db.close()
    }

    @Test fun projectGpkgRoundTripWithAndroidSqlite() {
        val f = file("p.gpkg")
        val m = Monument(lat = 43.1, lon = 69.2, name = Localized("Ескерткіш", "Памятник"))
        AndroidSqlDb.create(f).use { MuraProject.export(it, listOf(m), emptyList(), Lang.KK, "Тест") }
        AndroidSqlDb.openReadOnly(f).use { db ->
            MuraProject.requireProject(db)
            // Android SQLite android_metadata кестесін қоспауы керек (таза GeoPackage)
            assertTrue(!db.tableExists("android_metadata"))
            val back = MuraProject.readMarks(db, Lang.KK).single().monument
            assertEquals(m.name, back.name)
            assertEquals(43.1, back.lat, 1e-9)
        }
    }

    @Test fun mbtilesServedThroughLoopbackServer() {
        val f = file("a.mbtiles")
        val tile = png(Color.RED)
        MbtilesWriter(AndroidSqlDb.create(f)).use { w ->
            w.setMetadata(mapOf("name" to "t", "format" to "png", "minzoom" to "10", "maxzoom" to "10"))
            w.put(10, 700, 380, tile)
        }
        val store = MbtilesStore(AndroidSqlDb.openReadOnly(f))
        assertArrayEquals(tile, store.tile(10, 700, 380))
        LocalTileServer({ _, z, x, y -> store.tile(z, x, y)?.let { io.github.berikkkk.muragis.core.server.TileResponse(it, "image/png") } }).use { srv ->
            val c = URL(srv.baseUrl + "/t/L/10/700/380").openConnection() as HttpURLConnection
            assertEquals(200, c.responseCode)
            assertArrayEquals(tile, c.inputStream.readBytes())
        }
        store.close()
    }

    @Test fun ellipticalMercatorTilesAreReprojected() {
        val f = file("y.mbtiles")
        val z = 10
        val x = TileMath.lonToX(69.6, z); val y = TileMath.latToY(42.3, z)
        MbtilesWriter(AndroidSqlDb.create(f)).use { w ->
            w.setMetadata(mapOf("name" to "y", "format" to "png"))
            for (dy in -1..1) w.put(z, x, y + dy, png(Color.BLUE))
        }
        val db = AndroidSqlDb.openReadWrite(file("l.db"))
        LocalStore(db)
        val layers = LayerStore(db)
        layers.save(MapLayer(id = "Y", kind = LayerKind.IMPORTED, format = LayerFormat.MBTILES, title = "y", path = f.path,
            minZoom = z, maxZoom = z, bounds = Bounds(69.0, 42.0, 70.0, 43.0), projection = "EPSG:3395"))
        val t = TileRegistry(layers).tile("Y", z, x, y)
        assertNotNull(t)
        val bmp = BitmapFactory.decodeByteArray(t!!.data, 0, t.data.size)
        assertEquals(256, bmp.width)
        assertEquals(Color.BLUE, bmp.getPixel(128, 128))
    }

    @Test fun monumentSymbolsRender() {
        val icons = SymbolIcons.all(ctx, 60)
        assertEquals(20, icons.size)                 // 5 түр × 4 санат
        val b = icons.getValue("sym-archeo-rep")
        assertEquals(75, b.height)
        // Белгінің төменгі бөлігінде санаттың (республикалық — қызыл) түсі бар
        var red = 0
        for (yy in 0 until b.height) for (xx in 0 until b.width) if (Color.red(b.getPixel(xx, yy)) > 200 && Color.green(b.getPixel(xx, yy)) < 80) red++
        assertTrue("қызыл пиксель: $red", red > 200)
    }
}
