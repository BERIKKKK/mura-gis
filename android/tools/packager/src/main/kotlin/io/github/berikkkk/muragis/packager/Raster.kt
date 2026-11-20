package io.github.berikkkk.muragis.packager

import io.github.berikkkk.muragis.core.geo.Bounds
import io.github.berikkkk.muragis.core.geo.Utm
import io.github.berikkkk.muragis.core.tiles.MbtilesWriter
import io.github.berikkkk.muragis.core.tiles.TileMath
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import javax.imageio.IIOImage
import javax.imageio.ImageIO
import javax.imageio.ImageWriteParam
import kotlin.math.floor

/** Растр тайлдарын кодтау: толық жабылған тайл — JPEG, шеттегі (мөлдір бөлігі бар) — PNG. */
object Codec {
    fun jpeg(img: BufferedImage, quality: Float): ByteArray {
        val w = ImageIO.getImageWritersByFormatName("jpeg").next()
        val bos = ByteArrayOutputStream()
        ImageIO.createImageOutputStream(bos).use { ios ->
            w.output = ios
            val p = w.defaultWriteParam.apply { compressionMode = ImageWriteParam.MODE_EXPLICIT; compressionQuality = quality }
            w.write(null, IIOImage(img, null, null), p)
        }
        w.dispose()
        return bos.toByteArray()
    }

    fun png(img: BufferedImage): ByteArray = ByteArrayOutputStream().also { ImageIO.write(img, "png", it) }.toByteArray()

    fun decode(b: ByteArray): BufferedImage = ImageIO.read(ByteArrayInputStream(b))
}

/** Бір MBTiles файлына көп ағынмен жазу (жазу — бір құлып астында, транзакциялармен). */
class TileOut(file: File) : AutoCloseable {
    private val db = JdbcSqlDb(file.path)
    val writer = MbtilesWriter(db)
    private var pending = 0

    init { db.exec("PRAGMA journal_mode=OFF"); db.exec("PRAGMA synchronous=OFF"); db.conn.autoCommit = false }

    @Synchronized fun put(z: Int, x: Int, y: Int, data: ByteArray) {
        writer.put(z, x, y, data)
        if (++pending >= 500) { db.conn.commit(); pending = 0 }
    }

    @Synchronized fun get(z: Int, x: Int, y: Int): ByteArray? =
        db.query("SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?",
            listOf(z, x, TileMath.flipY(y, z))) { it.blob("tile_data") }.firstOrNull()

    @Synchronized fun meta(m: Map<String, String>) {
        for ((k, v) in m) db.exec("INSERT OR REPLACE INTO metadata (name, value) VALUES (?, ?)", listOf(k, v))
    }

    override fun close() { db.conn.commit(); db.conn.autoCommit = true; db.close() }
}

/** Тайлдар бойынша параллель өңдеу. */
fun parallelTiles(z: Int, b: Bounds, threads: Int = Runtime.getRuntime().availableProcessors(), work: (x: Int, y: Int) -> Unit) {
    val r = TileMath.range(b, z)
    val pool = Executors.newFixedThreadPool(threads)
    val done = AtomicLong(); val total = r.count
    for (y in r.minY..r.maxY) for (x in r.minX..r.maxX) pool.execute {
        try { work(x, y) } catch (e: Throwable) { e.printStackTrace() }
        val d = done.incrementAndGet()
        if (d % 500 == 0L || d == total) println("    z$z: $d / $total")
    }
    pool.shutdown(); pool.awaitTermination(7, TimeUnit.DAYS)
}

/** Тайл пиксельдерінің ендігі/бойлығы (пиксель ортасы). */
private fun pixelLat(z: Int, y: Int, py: Int) = TileMath.y3857ToLat((y * 256 + py + 0.5) / (256.0 * (1 shl z)))
private fun pixelLon(z: Int, x: Int, px: Int) = (x * 256 + px + 0.5) / (256.0 * (1 shl z)) * 360.0 - 180.0

/** Жер бедерінің көлеңкесі тайлдары (мөлдір PNG): көлеңке — қара, күнге қараған беткей — ақ, жартылай мөлдір. */
object HillshadeTiles {
    fun render(g: DemGrid, shade: FloatArray, out: TileOut, b: Bounds, minZ: Int, maxZ: Int) {
        val flat = 0.7071f
        for (z in minZ..maxZ) parallelTiles(z, b) { x, y ->
            val img = BufferedImage(256, 256, BufferedImage.TYPE_INT_ARGB)
            var any = false
            for (py in 0 until 256) {
                val r = (g.bounds.north - pixelLat(z, y, py)) / g.dLat
                if (r < 0 || r > g.rows - 1) continue
                for (px in 0 until 256) {
                    val c = (pixelLon(z, x, px) - g.bounds.west) / g.dLon
                    if (c < 0 || c > g.cols - 1) continue
                    val r0 = floor(r).toInt().coerceAtMost(g.rows - 2); val c0 = floor(c).toInt().coerceAtMost(g.cols - 2)
                    val fr = (r - r0).toFloat(); val fc = (c - c0).toFloat()
                    fun s(rr: Int, cc: Int) = shade[rr * g.cols + cc]
                    val s = (s(r0, c0) * (1 - fc) + s(r0, c0 + 1) * fc) * (1 - fr) + (s(r0 + 1, c0) * (1 - fc) + s(r0 + 1, c0 + 1) * fc) * fr
                    val argb = if (s < flat) {
                        val a = ((flat - s) / flat * 150).toInt().coerceIn(0, 255)
                        (a shl 24) or 0x1E1A16
                    } else {
                        val a = ((s - flat) / (1 - flat) * 90).toInt().coerceIn(0, 255)
                        (a shl 24) or 0xFFFDF5
                    }
                    if (argb ushr 24 > 0) any = true
                    img.setRGB(px, py, argb)
                }
            }
            if (any) out.put(z, x, y, Codec.png(img))
        }
    }
}

/**
 * Sentinel‑2 TCI (L2A, 10 м, табиғи түс) сахналарынан Web Mercator тайлдары. Сахналар басымдық ретімен беріледі:
 * әр пиксель — деректері бар (0,0,0 емес) бірінші сахнадан. Бастапқы файлдар UTM-де (39N/40N), билинейлі қайта іріктеу.
 */
class SentinelMosaic(sources: List<GeoTiff>, private val gain: Float) : AutoCloseable {
    private class Scene(val tif: GeoTiff) {
        val zone = tif.epsg - 32600
        val cache = object : LinkedHashMap<Int, ByteArray>(64, 0.75f, true) {
            override fun removeEldestEntry(e: MutableMap.MutableEntry<Int, ByteArray>) = size > 60
        }
        private val inflight = java.util.concurrent.ConcurrentHashMap<Int, java.util.concurrent.CompletableFuture<ByteArray>>()
        fun block(bx: Int, by: Int): ByteArray {
            val key = by * tif.blocksAcross + bx
            synchronized(cache) { cache[key]?.let { return it } }
            // Бір блокты бірнеше ағын қатар сұраса — бір рет жүктеледі
            val mine = java.util.concurrent.CompletableFuture<ByteArray>()
            val f = inflight.putIfAbsent(key, mine) ?: mine
            if (f === mine) {
                try {
                    val b = tif.block(bx, by)
                    synchronized(cache) { cache[key] = b }
                    mine.complete(b)
                } catch (e: Throwable) { mine.completeExceptionally(e) } finally { inflight.remove(key) }
            }
            return f.get()
        }
        fun px(col: Int, row: Int, out: IntArray, k: Int): Boolean {
            val b = block(col / tif.blockW, row / tif.blockH)
            val i = ((row % tif.blockH) * tif.blockW + (col % tif.blockW)) * 3
            val r = b[i].toInt() and 0xff; val g = b[i + 1].toInt() and 0xff; val bl = b[i + 2].toInt() and 0xff
            if (r == 0 && g == 0 && bl == 0) return false
            out[k] = r; out[k + 1] = g; out[k + 2] = bl
            return true
        }
    }

    private val scenes = sources.map { t -> Scene(t.also { println("  S2: $it"); require(it.samples == 3 && it.bits == 8) }) }

    /** Бір пиксельдің түсі (RGB) не null (деректер жоқ). */
    private fun sample(lat: Double, lon: Double, tmp: IntArray): Int? {
        for (s in scenes) {
            val u = Utm.fromLatLon(lat, lon, s.zone)
            val c = (u.easting - s.tif.originX) / s.tif.scaleX - 0.5
            val r = (s.tif.originY - u.northing) / s.tif.scaleY - 0.5
            if (c < 0 || r < 0 || c >= s.tif.width - 1 || r >= s.tif.height - 1) continue
            val c0 = c.toInt(); val r0 = r.toInt()
            if (!s.px(c0, r0, tmp, 0) || !s.px(c0 + 1, r0, tmp, 3) || !s.px(c0, r0 + 1, tmp, 6) || !s.px(c0 + 1, r0 + 1, tmp, 9)) {
                if (s.px(Math.round(c).toInt(), Math.round(r).toInt(), tmp, 0)) return rgb(tmp[0].toFloat(), tmp[1].toFloat(), tmp[2].toFloat())
                continue
            }
            val fc = (c - c0).toFloat(); val fr = (r - r0).toFloat()
            fun ch(k: Int) = (tmp[k] * (1 - fc) + tmp[3 + k] * fc) * (1 - fr) + (tmp[6 + k] * (1 - fc) + tmp[9 + k] * fc) * fr
            return rgb(ch(0), ch(1), ch(2))
        }
        return null
    }

    private fun rgb(r: Float, g: Float, b: Float): Int {
        fun f(v: Float) = (v * gain).toInt().coerceIn(0, 255)
        return (0xff shl 24) or (f(r) shl 16) or (f(g) shl 8) or f(b)
    }

    fun renderMax(out: TileOut, b: Bounds, z: Int, quality: Float, threads: Int) = parallelTiles(z, b, threads) { x, y ->
        val img = BufferedImage(256, 256, BufferedImage.TYPE_INT_ARGB)
        val tmp = IntArray(12)
        var filled = 0
        for (py in 0 until 256) {
            val lat = pixelLat(z, y, py)
            for (px in 0 until 256) {
                val v = sample(lat, pixelLon(z, x, px), tmp) ?: continue
                img.setRGB(px, py, v); filled++
            }
        }
        if (filled > 0) out.put(z, x, y, encode(img, filled == 256 * 256, quality))
    }

    override fun close() = scenes.forEach { it.tif.close() }

    companion object {
        fun encode(img: BufferedImage, full: Boolean, quality: Float): ByteArray =
            if (full) Codec.jpeg(BufferedImage(256, 256, BufferedImage.TYPE_INT_RGB).also { it.graphics.drawImage(img, 0, 0, null) }, quality)
            else Codec.png(img)

        /** Төменгі масштабтар: төрт тайлды 2×2 орташалап кішірейту. */
        fun pyramid(out: TileOut, b: Bounds, fromZ: Int, minZ: Int, quality: Float) {
            for (z in fromZ - 1 downTo minZ) parallelTiles(z, b) { x, y ->
                val img = BufferedImage(256, 256, BufferedImage.TYPE_INT_ARGB)
                var filled = 0
                for (q in 0 until 4) {
                    val cx = x * 2 + (q and 1); val cy = y * 2 + (q shr 1)
                    val data = out.get(z + 1, cx, cy) ?: continue
                    val child = Codec.decode(data)
                    val ox = (q and 1) * 128; val oy = (q shr 1) * 128
                    for (py in 0 until 128) for (px in 0 until 128) {
                        var a = 0; var r = 0; var g = 0; var bl = 0
                        for (k in 0 until 4) {
                            val p = child.getRGB(px * 2 + (k and 1), py * 2 + (k shr 1))
                            val pa = if (child.colorModel.hasAlpha()) p ushr 24 else 255
                            if (pa < 128) continue
                            a++; r += (p shr 16) and 0xff; g += (p shr 8) and 0xff; bl += p and 0xff
                        }
                        if (a == 0) continue
                        img.setRGB(ox + px, oy + py, (0xff shl 24) or ((r / a) shl 16) or ((g / a) shl 8) or (bl / a))
                        filled++
                    }
                }
                if (filled > 0) out.put(z, x, y, encode(img, filled == 256 * 256, quality))
            }
        }
    }
}
