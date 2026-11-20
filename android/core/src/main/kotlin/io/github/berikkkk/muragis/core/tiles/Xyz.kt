package io.github.berikkkk.muragis.core.tiles

import io.github.berikkkk.muragis.core.geo.Bounds
import io.github.berikkkk.muragis.core.io.FormatException
import java.io.File
import java.util.zip.ZipFile

/**
 * Тайлдардың қалталық құрылымы.
 *   STANDARD — {z}/{x}/{y}.{ext} (OSM/XYZ; SAS.Planet «Экспорт → OsmAnd/Locus/… z/x/y» т.б.);
 *   SASPLANET — SAS.Planet-тің өз кэш құрылымы: z{z+1}/{x div 1024}/x{x}/{y div 1024}/y{y}.{ext}.
 */
enum class XyzLayout { STANDARD, SASPLANET }

/** Құрылымды анықтау нәтижесі (жолдар тізімінен, жадты аз пайдаланып). */
data class XyzScan(
    val layout: XyzLayout,
    val prefix: String,
    val ext: String,
    val zooms: Map<Int, TileMath.Range>,
    val tileCount: Long,
) {
    val minZoom get() = zooms.keys.min()
    val maxZoom get() = zooms.keys.max()

    /** Қамту аумағы: ең кіші масштабтағы тайлдар (TMS болса — y аударылады). */
    fun bounds(tms: Boolean): Bounds {
        val r = zooms.getValue(minZoom)
        val rr = if (!tms) r else r.copy(minY = TileMath.flipY(r.maxY, r.z), maxY = TileMath.flipY(r.minY, r.z))
        return TileMath.rangeBounds(rr)
    }

    fun path(z: Int, x: Int, y: Int, ext: String = this.ext): String = prefix + when (layout) {
        XyzLayout.STANDARD -> "$z/$x/$y.$ext"
        XyzLayout.SASPLANET -> "z${z + 1}/${x / 1024}/x$x/${y / 1024}/y$y.$ext"
    }
}

object XyzScanner {
    private val STD = Regex("^(.*?/)?(\\d{1,2})/(\\d{1,8})/(\\d{1,8})\\.(png|jpe?g|webp)$", RegexOption.IGNORE_CASE)
    private val SAS = Regex("^(.*?/)?z(\\d{1,2})/(\\d{1,5})/x(\\d{1,8})/(\\d{1,5})/y(\\d{1,8})\\.(png|jpe?g|webp)$", RegexOption.IGNORE_CASE)

    private class Acc { var minX = Int.MAX_VALUE; var maxX = -1; var minY = Int.MAX_VALUE; var maxY = -1 }

    /** paths — түбірге қатысты жолдар ('/' бөлгішпен). Тайл табылмаса — FormatException. */
    fun scan(paths: Sequence<String>): XyzScan {
        var layout: XyzLayout? = null
        var prefix = ""
        val exts = HashMap<String, Int>()
        val acc = HashMap<Int, Acc>()
        var count = 0L
        for (raw in paths) {
            val p = raw.replace('\\', '/')
            val s = SAS.matchEntire(p)
            val z: Int; val x: Int; val y: Int; val ext: String; val pre: String; val lay: XyzLayout
            if (s != null) {
                val zz = s.groupValues[2].toInt() - 1
                val xx = s.groupValues[4].toInt(); val yy = s.groupValues[6].toInt()
                if (zz < 0 || s.groupValues[3].toInt() != xx / 1024 || s.groupValues[5].toInt() != yy / 1024) continue
                z = zz; x = xx; y = yy; ext = s.groupValues[7]; pre = s.groupValues[1]; lay = XyzLayout.SASPLANET
            } else {
                val m = STD.matchEntire(p) ?: continue
                z = m.groupValues[2].toInt(); x = m.groupValues[3].toInt(); y = m.groupValues[4].toInt()
                ext = m.groupValues[5]; pre = m.groupValues[1]; lay = XyzLayout.STANDARD
            }
            if (z > 24 || x >= (1 shl z) || y >= (1 shl z)) continue
            if (layout == null) { layout = lay; prefix = pre }
            if (lay != layout || pre != prefix) continue          // бір жиынтық қана (бірінші табылған)
            exts.merge(ext.lowercase(), 1, Int::plus)
            val a = acc.getOrPut(z) { Acc() }
            if (x < a.minX) a.minX = x; if (x > a.maxX) a.maxX = x
            if (y < a.minY) a.minY = y; if (y > a.maxY) a.maxY = y
            count++
        }
        if (layout == null || acc.isEmpty()) throw FormatException("xyz_no_tiles", "No z/x/y tiles found")
        return XyzScan(layout, prefix, exts.maxBy { it.value }.key, acc.mapValues { (z, a) -> TileMath.Range(z, a.minX, a.maxX, a.minY, a.maxY) }, count)
    }
}

private val ALT_EXT = listOf("png", "jpg", "jpeg", "webp")

/** Қалтадағы тайлдар. */
class DirTileStore(private val root: File, val scan: XyzScan, private val tms: Boolean = false, name: String = root.name) : TileStore {
    override val info = TileSetInfo(name, TileFormat.ofName(scan.ext), scan.minZoom, scan.maxZoom, scan.bounds(tms))

    override fun tile(z: Int, x: Int, y: Int): ByteArray? {
        val yy = if (tms) TileMath.flipY(y, z) else y
        for (e in listOf(scan.ext) + ALT_EXT.filter { it != scan.ext }) {
            val f = File(root, scan.path(z, x, yy, e))
            if (f.isFile) return f.readBytes()
        }
        return null
    }

    override fun close() {}

    companion object {
        fun walk(root: File): Sequence<String> = root.walkTopDown().filter { it.isFile }.map { it.relativeTo(root).invariantSeparatorsPath }
    }
}

/** ZIP архивіндегі тайлдар: ZipFile орталық каталогты оқиды, тайл сұралғанда ғана сол жазба ашылады. */
class ZipTileStore(file: File, val scan: XyzScan, private val tms: Boolean = false, name: String = file.nameWithoutExtension) : TileStore {
    private val zip = ZipFile(file)
    override val info = TileSetInfo(name, TileFormat.ofName(scan.ext), scan.minZoom, scan.maxZoom, scan.bounds(tms))

    override fun tile(z: Int, x: Int, y: Int): ByteArray? {
        val yy = if (tms) TileMath.flipY(y, z) else y
        for (e in listOf(scan.ext) + ALT_EXT.filter { it != scan.ext }) {
            val entry = zip.getEntry(scan.path(z, x, yy, e)) ?: continue
            return zip.getInputStream(entry).use { it.readBytes() }
        }
        return null
    }

    override fun close() = zip.close()

    companion object {
        fun scan(file: File): XyzScan = try {
            ZipFile(file).use { z -> XyzScanner.scan(z.entries().asSequence().filter { !it.isDirectory }.map { it.name }) }
        } catch (e: java.util.zip.ZipException) {
            throw FormatException("zip", "Not a ZIP archive")
        }
    }
}
