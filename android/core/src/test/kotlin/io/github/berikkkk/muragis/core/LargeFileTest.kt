package io.github.berikkkk.muragis.core

import io.github.berikkkk.muragis.core.tiles.MbtilesStore
import io.github.berikkkk.muragis.core.tiles.MbtilesWriter
import io.github.berikkkk.muragis.core.tiles.ZipTileStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.util.Random

/** Тек largeFileTest тапсырмасында (жады 128 МБ) іске қосылады. */
class LargeFileTest {
    @Test fun largeMbtilesWithSmallHeap() {
        assumeTrue(System.getProperty("mura.large") == "true")
        val f = TestUtil.tmp("large.mbtiles")
        val rnd = Random(1)
        val tile = ByteArray(16 * 1024).also { rnd.nextBytes(it); it[0] = 0x89.toByte(); it[1] = 0x50; it[2] = 0x4E; it[3] = 0x47 }
        var n = 0
        MbtilesWriter(JdbcSqlDb(f.path)).use { w ->
            w.setMetadata(mapOf("name" to "Large", "format" to "png", "minzoom" to "14", "maxzoom" to "14"))
            w.batch { for (x in 10900 until 11060) for (y in 6000 until 6160) { w.put(14, x, y, tile); n++ } }
        }
        val mb = f.length() / 1024 / 1024
        println("MBTiles: $n тайл, $mb МБ; heap max = ${Runtime.getRuntime().maxMemory() / 1024 / 1024} МБ")
        assertEquals(true, mb > 300)
        val t0 = System.nanoTime()
        MbtilesStore(JdbcSqlDb(f.path)).use { s ->
            assertEquals(14, s.info.maxZoom)
            assertNotNull(s.info.bounds)
            repeat(2000) { assertNotNull(s.tile(14, 10900 + rnd.nextInt(160), 6000 + rnd.nextInt(160))) }
        }
        println("Ашу + 2000 кездейсоқ тайл: ${(System.nanoTime() - t0) / 1_000_000} мс")
        f.delete()
    }

    @Test fun largeZipWithSmallHeap() {
        assumeTrue(System.getProperty("mura.large") == "true")
        val f = TestUtil.tmp("large.zip")
        val tile = ByteArray(2048).also { it[0] = 0x89.toByte(); it[1] = 0x50; it[2] = 0x4E; it[3] = 0x47 }
        var n = 0
        java.util.zip.ZipOutputStream(f.outputStream().buffered()).use { z ->
            z.setLevel(0)
            for (x in 5000 until 5320) for (y in 3000 until 3320) {
                z.putNextEntry(java.util.zip.ZipEntry("z14/${x / 1024}/x$x/${y / 1024}/y$y.png")); z.write(tile); z.closeEntry(); n++
            }
        }
        val t0 = System.nanoTime()
        val scan = ZipTileStore.scan(f)
        println("ZIP: $n жазба, ${f.length() / 1024 / 1024} МБ, талдау ${(System.nanoTime() - t0) / 1_000_000} мс")
        assertEquals(n.toLong(), scan.tileCount)
        ZipTileStore(f, scan).use { s -> repeat(2000) { assertNotNull(s.tile(13, 5000 + it % 320, 3000 + it % 320)) } }
        f.delete()
    }
}
