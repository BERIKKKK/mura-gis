package io.github.berikkkk.muragis.packager

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.zip.Inflater

/**
 * GeoTIFF / Cloud Optimized GeoTIFF оқитын шағын оқырман: тек бірінші (толық ажыратымдылықтағы) IFD,
 * тайлдар не жолақтар, сығусыз / DEFLATE / LZW, болжауыш 1/2/3. Copernicus DEM (Float32) мен
 * Sentinel‑2 TCI (UInt8 RGB) үшін жеткілікті. Тайлдар сұралғанда ғана оқылады — файл жадқа толық жүктелмейді.
 */
class GeoTiff(val name: String, private val src: ByteSource) : AutoCloseable {
    constructor(file: File) : this(file.name, FileSource(file))
    private val order: ByteOrder
    private val big: Boolean
    private val tags = HashMap<Int, LongArray>()
    private val doubleTags = HashMap<Int, DoubleArray>()
    private val asciiTags = HashMap<Int, String>()

    val width: Int
    val height: Int
    val samples: Int
    val bits: Int
    val sampleFormat: Int
    val compression: Int
    val predictor: Int
    val blockW: Int
    val blockH: Int
    private val offsets: LongArray
    private val counts: LongArray
    val tiled: Boolean

    /** Пиксель шетінің (сол жақ жоғарғы бұрыш) координатасы және пиксель өлшемі. */
    val originX: Double
    val originY: Double
    val scaleX: Double
    val scaleY: Double
    val epsg: Int
    val nodata: Double?

    init {
        val head = read(0, 16)
        order = if (head[0] == 'I'.code.toByte()) ByteOrder.LITTLE_ENDIAN else ByteOrder.BIG_ENDIAN
        val hb = ByteBuffer.wrap(head).order(order)
        val magic = hb.getShort(2).toInt()
        big = magic == 43
        require(magic == 42 || magic == 43) { "Not a TIFF: $name" }
        val ifd = if (big) hb.getLong(8) else (hb.getInt(4).toLong() and 0xffffffffL)
        readIfd(ifd)
        width = tag(256).toInt(); height = tag(257).toInt()
        samples = tag(277, 1).toInt()
        bits = tag(258, 8).toInt()
        sampleFormat = tag(339, 1).toInt()
        compression = tag(259, 1).toInt()
        predictor = tag(317, 1).toInt()
        require(tag(284, 1).toInt() == 1) { "Planar configuration 2 is not supported" }
        tiled = tags.containsKey(322)
        if (tiled) {
            blockW = tag(322).toInt(); blockH = tag(323).toInt()
            offsets = tags[324]!!; counts = tags[325]!!
        } else {
            blockW = width; blockH = tag(278, height.toLong()).toInt().coerceAtMost(height)
            offsets = tags[273]!!; counts = tags[279]!!
        }
        val scale = doubleTags[33550] ?: error("No ModelPixelScale")
        val tie = doubleTags[33922] ?: error("No ModelTiepoint")
        scaleX = scale[0]; scaleY = scale[1]
        val keys = tags[34735]
        var e = 0; var pixelIsPoint = false
        if (keys != null) {
            var i = 4
            while (i + 3 < keys.size) {
                val id = keys[i].toInt(); val v = keys[i + 3]
                if (id == 3072 || id == 2048) e = v.toInt()
                if (id == 1025) pixelIsPoint = v == 2L
                i += 4
            }
        }
        epsg = e
        // PixelIsPoint: байлау нүктесі пиксель ортасында — шетіне келтіреміз
        val shift = if (pixelIsPoint) 0.5 else 0.0
        originX = tie[3] - tie[0] * scaleX - shift * scaleX
        originY = tie[4] + tie[1] * scaleY + shift * scaleY
        nodata = asciiTags[42113]?.trim()?.trimEnd('\u0000')?.toDoubleOrNull()
    }

    private fun read(pos: Long, n: Int): ByteArray = src.read(pos, n)

    private fun tag(id: Int, def: Long? = null): Long = tags[id]?.get(0) ?: def ?: error("Missing TIFF tag $id in $name")

    private fun readIfd(pos: Long) {
        val cntSize = if (big) 8 else 2
        val entrySize = if (big) 20 else 12
        val cb = ByteBuffer.wrap(read(pos, cntSize)).order(order)
        val n = if (big) cb.getLong(0).toInt() else cb.getShort(0).toInt() and 0xffff
        val eb = ByteBuffer.wrap(read(pos + cntSize, n * entrySize)).order(order)
        for (i in 0 until n) {
            val p = i * entrySize
            val id = eb.getShort(p).toInt() and 0xffff
            val type = eb.getShort(p + 2).toInt() and 0xffff
            val count = if (big) eb.getLong(p + 4) else eb.getInt(p + 4).toLong() and 0xffffffffL
            val sz = when (type) { 1, 2, 6, 7 -> 1; 3, 8 -> 2; 4, 9, 11 -> 4; 5, 10, 12, 16, 17, 18 -> 8; else -> 1 }
            val total = (count * sz).toInt()
            val inline = if (big) 8 else 4
            val valPos = p + if (big) 12 else 8
            val data: ByteBuffer = if (total <= inline) {
                ByteBuffer.wrap(eb.array(), valPos, inline).slice().order(order)
            } else {
                val off = if (big) eb.getLong(valPos) else eb.getInt(valPos).toLong() and 0xffffffffL
                ByteBuffer.wrap(read(off, total)).order(order)
            }
            when (type) {
                2 -> asciiTags[id] = String(ByteArray(total).also { data.get(it) }, Charsets.US_ASCII)
                11 -> doubleTags[id] = DoubleArray(count.toInt()) { data.getFloat(it * 4).toDouble() }
                12 -> doubleTags[id] = DoubleArray(count.toInt()) { data.getDouble(it * 8) }
                else -> tags[id] = LongArray(count.toInt()) { k ->
                    when (sz) {
                        1 -> data.get(k).toLong() and 0xff
                        2 -> data.getShort(k * 2).toLong() and 0xffff
                        4 -> data.getInt(k * 4).toLong() and 0xffffffffL
                        else -> data.getLong(k * 8)
                    }
                }
            }
        }
    }

    val blocksAcross get() = (width + blockW - 1) / blockW
    val blocksDown get() = (height + blockH - 1) / blockH
    val bytesPerPixel get() = samples * bits / 8

    /**
     * Блокты (тайл не жолақ) ашып, пиксельдерді жергілікті байт ретімен емес, ортақ түрде береді:
     * UInt8 — байттар; Float32 — [ByteOrder.LITTLE_ENDIAN] float мәндері. Өлшемі: blockW × blockH × bytesPerPixel.
     */
    fun block(bx: Int, by: Int): ByteArray {
        val idx = by * blocksAcross + bx
        val raw = if (counts[idx] == 0L) return ByteArray(blockW * blockH * bytesPerPixel) else read(offsets[idx], counts[idx].toInt())
        val rows = if (tiled) blockH else minOf(blockH, height - by * blockH)
        val expected = blockW * rows * bytesPerPixel
        val data = when (compression) {
            1 -> raw
            8, 32946 -> inflate(raw, expected)
            5 -> lzw(raw, expected)
            else -> error("TIFF compression $compression is not supported ($name)")
        }
        val out = if (data.size >= expected) data else data.copyOf(expected)
        when (predictor) {
            2 -> undoHorizontal(out, blockW, rows)
            3 -> return undoFloat(out, blockW, rows)
        }
        if (bits > 8 && order == ByteOrder.BIG_ENDIAN) swap(out, bits / 8)
        return if (rows == blockH) out else out.copyOf(blockW * blockH * bytesPerPixel)
    }

    private fun inflate(src: ByteArray, expected: Int): ByteArray {
        val inf = Inflater()
        inf.setInput(src)
        val out = ByteArray(expected)
        var n = 0
        while (n < expected && !inf.finished()) {
            val k = inf.inflate(out, n, expected - n)
            if (k == 0 && (inf.needsInput() || inf.needsDictionary())) break
            n += k
        }
        inf.end()
        return out
    }

    private fun lzw(src: ByteArray, expected: Int): ByteArray {
        val out = ByteArrayOutputStream(expected)
        val dict = arrayOfNulls<ByteArray>(4096)
        for (i in 0 until 256) dict[i] = byteArrayOf(i.toByte())
        var next = 258; var width = 9; var bitPos = 0L; var prev: ByteArray? = null
        val totalBits = src.size * 8L
        while (bitPos + width <= totalBits) {
            var code = 0
            for (k in 0 until width) {
                val b = (src[((bitPos + k) / 8).toInt()].toInt() shr (7 - ((bitPos + k) % 8).toInt())) and 1
                code = (code shl 1) or b
            }
            bitPos += width
            if (code == 257) break
            if (code == 256) { next = 258; width = 9; prev = null; continue }
            val entry = if (code < next && dict[code] != null) dict[code]!! else prev!! + prev[0]
            out.write(entry)
            if (prev != null && next < 4096) { dict[next++] = prev + entry[0] }
            prev = entry
            width = when { next + 1 >= 2048 -> 12; next + 1 >= 1024 -> 11; next + 1 >= 512 -> 10; else -> 9 }
        }
        return out.toByteArray()
    }

    private fun swap(b: ByteArray, size: Int) {
        var i = 0
        while (i + size <= b.size) { b.reverse(i, i + size); i += size }
    }

    private fun undoHorizontal(b: ByteArray, w: Int, rows: Int) {
        val bps = bits / 8
        if (bps == 1) {
            val rowLen = w * samples
            for (r in 0 until rows) {
                val o = r * rowLen
                for (i in samples until rowLen) b[o + i] = (b[o + i] + b[o + i - samples]).toByte()
            }
        } else if (bps == 2) {
            val bb = ByteBuffer.wrap(b).order(order)
            val rowLen = w * samples
            for (r in 0 until rows) for (i in samples until rowLen) {
                val p = (r * rowLen + i) * 2
                bb.putShort(p, (bb.getShort(p) + bb.getShort(p - samples * 2)).toShort())
            }
        }
    }

    /** Жылжымалы нүктелі болжауыш (TIFF Technical Note 3): байт жазықтықтары + көлденең айырма. */
    private fun undoFloat(b: ByteArray, w: Int, rows: Int): ByteArray {
        val bps = bits / 8
        val rowBytes = w * samples * bps
        val out = ByteArray(blockW * blockH * bps * samples)
        val ob = ByteBuffer.wrap(out).order(ByteOrder.LITTLE_ENDIAN)
        val tmp = ByteArray(bps)
        for (r in 0 until rows) {
            val o = r * rowBytes
            for (i in samples until rowBytes) b[o + i] = (b[o + i] + b[o + i - samples]).toByte()
            val n = w * samples
            for (k in 0 until n) {
                for (j in 0 until bps) tmp[j] = b[o + j * n + k]       // tmp — big-endian
                val p = (r * n + k) * bps
                if (bps == 4) ob.putFloat(p, ByteBuffer.wrap(tmp).order(ByteOrder.BIG_ENDIAN).getFloat(0))
                else if (bps == 8) ob.putDouble(p, ByteBuffer.wrap(tmp).order(ByteOrder.BIG_ENDIAN).getDouble(0))
            }
        }
        return out
    }

    /** Бүкіл растрды Float32 массивіне оқу (DEM үшін, шағын файлдар). */
    fun readFloats(): FloatArray {
        require(samples == 1 && bits == 32 && sampleFormat == 3) { "Expected Float32 single band" }
        val out = FloatArray(width * height)
        for (by in 0 until blocksDown) for (bx in 0 until blocksAcross) {
            val fb = ByteBuffer.wrap(block(bx, by)).order(if (predictor == 3) ByteOrder.LITTLE_ENDIAN else ByteOrder.LITTLE_ENDIAN).asFloatBuffer()
            for (y in 0 until blockH) {
                val gy = by * blockH + y
                if (gy >= height) break
                for (x in 0 until blockW) {
                    val gx = bx * blockW + x
                    if (gx >= width) break
                    out[gy * width + gx] = fb.get(y * blockW + x)
                }
            }
        }
        return out
    }

    override fun close() = src.close()

    override fun toString() = "$name: ${width}x$height s=$samples b=$bits f=$sampleFormat c=$compression p=$predictor " +
        "block=${blockW}x$blockH tiled=$tiled epsg=$epsg origin=($originX,$originY) scale=($scaleX,$scaleY) nodata=$nodata"
}

/** Байттар көзі: жергілікті файл не HTTP Range арқылы оқылатын қашықтағы COG. */
interface ByteSource : AutoCloseable {
    fun read(pos: Long, n: Int): ByteArray
}

class FileSource(file: File) : ByteSource {
    private val raf = RandomAccessFile(file, "r")
    override fun read(pos: Long, n: Int): ByteArray = synchronized(raf) { ByteArray(n).also { raf.seek(pos); raf.readFully(it) } }
    override fun close() = raf.close()
}

/**
 * Cloud Optimized GeoTIFF-ті HTTP Range сұраныстарымен оқу: тек қажетті блоктар жүктеледі және [cacheDir]-ке
 * сақталады (қайта іске қосқанда желіге қайта шықпайды). Көп ағынмен параллель сұрауға болады.
 */
class HttpRangeSource(private val url: String, private val cacheDir: File) : ByteSource {
    init { cacheDir.mkdirs() }

    override fun read(pos: Long, n: Int): ByteArray {
        val f = File(cacheDir, "$pos-$n.bin")
        if (f.isFile && f.length() == n.toLong()) return f.readBytes()
        var last: Exception? = null
        for (attempt in 0 until 8) {
            try {
                val c = java.net.URL(url).openConnection() as java.net.HttpURLConnection
                c.connectTimeout = 30_000; c.readTimeout = 120_000
                c.setRequestProperty("Range", "bytes=$pos-${pos + n - 1}")
                c.setRequestProperty("User-Agent", "MuraGIS-packager/1.0")
                try {
                    if (c.responseCode != 206) error("HTTP ${c.responseCode} for $url")
                    val b = c.inputStream.use { it.readBytes() }
                    require(b.size == n) { "Short read ${b.size} / $n" }
                    val tmp = File(cacheDir, "$pos-$n.tmp${Thread.currentThread().id}")
                    tmp.writeBytes(b); tmp.renameTo(f)
                    return b
                } finally { c.disconnect() }
            } catch (e: Exception) { last = e; Thread.sleep(1000L * (attempt + 1)) }
        }
        throw last!!
    }

    override fun close() {}
}
