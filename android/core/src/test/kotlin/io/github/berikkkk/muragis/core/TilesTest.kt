package io.github.berikkkk.muragis.core

import io.github.berikkkk.muragis.core.db.SqlDb
import io.github.berikkkk.muragis.core.geo.Bounds
import io.github.berikkkk.muragis.core.io.FormatException
import io.github.berikkkk.muragis.core.tiles.DirTileStore
import io.github.berikkkk.muragis.core.tiles.FileKind
import io.github.berikkkk.muragis.core.tiles.GpkgTileStore
import io.github.berikkkk.muragis.core.tiles.MbtilesStore
import io.github.berikkkk.muragis.core.tiles.MbtilesWriter
import io.github.berikkkk.muragis.core.tiles.SqliteMapKind
import io.github.berikkkk.muragis.core.tiles.TileFormat
import io.github.berikkkk.muragis.core.tiles.TileMath
import io.github.berikkkk.muragis.core.tiles.XyzLayout
import io.github.berikkkk.muragis.core.tiles.XyzScanner
import io.github.berikkkk.muragis.core.tiles.ZipTileStore
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File

class TilesTest {
    /** Тайл мазмұны — өз координатасы бар PNG-тәрізді байттар (қай тайл қайтқанын тексеру үшін). */
    private fun png(z: Int, x: Int, y: Int) = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47) + "$z/$x/$y".toByteArray()

    @Test fun tileMath() {
        assertEquals(1L, TileMath.count(Bounds.WORLD, 0, 0))
        assertEquals(1L + 4 + 16, TileMath.count(Bounds.WORLD, 0, 2))
        // Шымкент маңы, z=10
        val x = TileMath.lonToX(69.6, 10); val y = TileMath.latToY(42.3, 10)
        val b = TileMath.tileBounds(10, x, y)
        assertTrue(b.contains(42.3, 69.6))
        assertEquals(y, TileMath.flipY(TileMath.flipY(y, 10), 10))
        assertEquals(0.5, TileMath.latToY3857(0.0), 1e-12)
        assertTrue(TileMath.latToY3395(60.0) > TileMath.latToY3857(60.0))   // эллипсоидтық Меркатор — ығысу
    }

    @Test fun mbtilesTmsRowsAreFlipped() {
        val f = TestUtil.tmp("a.mbtiles")
        MbtilesWriter(JdbcSqlDb(f.path)).use { w ->
            w.setMetadata(mapOf("name" to "Test", "format" to "png", "minzoom" to "3", "maxzoom" to "4"))
            w.batch { for (z in 3..4) for (x in 0 until 4) for (y in 0 until 3) w.put(z, x, y, png(z, x, y)) }
        }
        // Шикі кестеде tile_row — TMS
        JdbcSqlDb(f.path).use { db ->
            assertEquals(1L, db.scalarLong("SELECT count(*) FROM tiles WHERE zoom_level=3 AND tile_column=1 AND tile_row=?", listOf(TileMath.flipY(2, 3).toLong())))
            assertEquals(SqliteMapKind.MBTILES, SqliteMapKind.detect(db))
        }
        MbtilesStore(JdbcSqlDb(f.path)).use { s ->
            assertArrayEquals(png(3, 1, 2), s.tile(3, 1, 2))
            assertNull(s.tile(3, 7, 7))
            assertEquals(3, s.info.minZoom); assertEquals(4, s.info.maxZoom)
            assertEquals(TileFormat.PNG, s.info.format)
            // metadata-да bounds жоқ → тайлдардан есептелді (z=3, x 0..3, y 0..2)
            val exp = TileMath.rangeBounds(TileMath.Range(3, 0, 3, 0, 2))
            assertEquals(exp.north, s.info.bounds!!.north, 1e-9)
            assertEquals(exp.south, s.info.bounds!!.south, 1e-9)
        }
    }

    @Test fun mbtilesWithXyzSchemeAndMissingMetadata() {
        val f = TestUtil.tmp("xyz.mbtiles")
        JdbcSqlDb(f.path).use { db ->
            db.exec("CREATE TABLE metadata (name TEXT, value TEXT)")
            db.exec("CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)")
            db.exec("INSERT INTO metadata VALUES ('scheme','xyz')")
            db.exec("INSERT INTO tiles VALUES (5, 10, 11, ?)", listOf(png(5, 10, 11)))
        }
        MbtilesStore(JdbcSqlDb(f.path)).use { s ->
            assertArrayEquals(png(5, 10, 11), s.tile(5, 10, 11))
            assertEquals(5, s.info.minZoom); assertEquals(TileFormat.PNG, s.info.format)
        }
        // Пайдаланушы y осін қолмен аударса
        MbtilesStore(JdbcSqlDb(f.path), invertY = true).use { s -> assertArrayEquals(png(5, 10, 11), s.tile(5, 10, TileMath.flipY(11, 5))) }
    }

    @Test fun xyzStandardAndSasPlanetFolders() {
        val std = TestUtil.tmp("std").apply { mkdirs() }
        val sas = TestUtil.tmp("sas").apply { mkdirs() }
        for (z in 2..3) for (x in 1..2) for (y in 1..2) {
            File(std, "Maps/$z/$x/$y.png").apply { parentFile.mkdirs(); writeBytes(png(z, x, y)) }
            File(sas, "z${z + 1}/${x / 1024}/x$x/${y / 1024}/y$y.jpg").apply { parentFile.mkdirs(); writeBytes(png(z, x, y)) }
        }
        File(std, "readme.txt").writeText("x")
        val s1 = XyzScanner.scan(DirTileStore.walk(std))
        assertEquals(XyzLayout.STANDARD, s1.layout); assertEquals("Maps/", s1.prefix); assertEquals(8L, s1.tileCount)
        assertArrayEquals(png(3, 2, 1), DirTileStore(std, s1).tile(3, 2, 1))
        val s2 = XyzScanner.scan(DirTileStore.walk(sas))
        assertEquals(XyzLayout.SASPLANET, s2.layout); assertEquals("jpg", s2.ext); assertEquals(2, s2.minZoom)
        val ds = DirTileStore(sas, s2)
        assertArrayEquals(png(2, 1, 2), ds.tile(2, 1, 2))
        assertEquals(TileMath.rangeBounds(TileMath.Range(2, 1, 2, 1, 2)), ds.info.bounds)
        try { XyzScanner.scan(sequenceOf("a.txt", "b/c.png")); fail() } catch (e: FormatException) { assertEquals("xyz_no_tiles", e.code) }
    }

    @Test fun zipTiles() {
        val f = TestUtil.tmp("tiles.zip")
        java.util.zip.ZipOutputStream(f.outputStream()).use { z ->
            for (x in 0..1) for (y in 0..1) { z.putNextEntry(java.util.zip.ZipEntry("export/z5/0/x$x/0/y$y.png")); z.write(png(4, x, y)); z.closeEntry() }
        }
        val scan = ZipTileStore.scan(f)
        assertEquals(XyzLayout.SASPLANET, scan.layout); assertEquals(4, scan.minZoom)
        ZipTileStore(f, scan).use { assertArrayEquals(png(4, 1, 0), it.tile(4, 1, 0)); assertNull(it.tile(4, 5, 5)) }
        assertEquals(FileKind.ZIP, FileKind.sniff(f.readBytes().copyOf(16)))
    }

    private fun gpkgTiles(db: SqlDb, org: String, code: Long, half: Double) {
        db.exec("CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT, srs_id INTEGER PRIMARY KEY, organization TEXT, organization_coordsys_id INTEGER, definition TEXT, description TEXT)")
        db.exec("INSERT INTO gpkg_spatial_ref_sys VALUES ('x', 3857, ?, ?, 'x', '')", listOf(org, code))
        db.exec("CREATE TABLE gpkg_contents (table_name TEXT PRIMARY KEY, data_type TEXT, identifier TEXT, description TEXT, last_change TEXT, min_x REAL, min_y REAL, max_x REAL, max_y REAL, srs_id INTEGER)")
        db.exec("INSERT INTO gpkg_contents (table_name, data_type, identifier, srs_id) VALUES ('ortho', 'tiles', 'Ортофото', 3857)")
        db.exec("CREATE TABLE gpkg_tile_matrix_set (table_name TEXT PRIMARY KEY, srs_id INTEGER, min_x REAL, min_y REAL, max_x REAL, max_y REAL)")
        db.exec("INSERT INTO gpkg_tile_matrix_set VALUES ('ortho', 3857, ?, ?, ?, ?)", listOf(-half, -half, half, half))
        db.exec("CREATE TABLE gpkg_tile_matrix (table_name TEXT, zoom_level INTEGER, matrix_width INTEGER, matrix_height INTEGER, tile_width INTEGER, tile_height INTEGER, pixel_x_size REAL, pixel_y_size REAL)")
        db.exec("INSERT INTO gpkg_tile_matrix VALUES ('ortho', 0, 1024, 1024, 256, 256, 1, 1)")
        db.exec("CREATE TABLE ortho (id INTEGER PRIMARY KEY, zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)")
        db.exec("INSERT INTO ortho (zoom_level, tile_column, tile_row, tile_data) VALUES (0, 700, 380, ?)", listOf(png(10, 700, 380)))
    }

    @Test fun geopackageTilesWebMercatorOnly() {
        val ok = TestUtil.tmp("ok.gpkg")
        JdbcSqlDb(ok.path).use { gpkgTiles(it, "EPSG", 3857, TileMath.EARTH_HALF) }
        JdbcSqlDb(ok.path).use { assertEquals(SqliteMapKind.GPKG_TILES, SqliteMapKind.detect(it)) }
        GpkgTileStore(JdbcSqlDb(ok.path), "ortho").use { s ->
            assertEquals(10, s.info.minZoom)                 // gpkg zoom_level 0, матрица 1024 → XYZ z=10
            assertArrayEquals(png(10, 700, 380), s.tile(10, 700, 380))
            assertEquals("Ортофото", s.info.name)
        }
        val bad = TestUtil.tmp("bad.gpkg")
        JdbcSqlDb(bad.path).use { gpkgTiles(it, "EPSG", 32642, 500000.0) }
        try { GpkgTileStore(JdbcSqlDb(bad.path), "ortho"); fail() } catch (e: FormatException) { assertEquals("gpkg_tiles_crs", e.code) }
    }
}
