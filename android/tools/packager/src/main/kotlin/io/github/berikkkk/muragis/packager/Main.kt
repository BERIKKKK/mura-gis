package io.github.berikkkk.muragis.packager

import io.github.berikkkk.muragis.core.geo.Bounds
import io.github.berikkkk.muragis.core.packages.MapPackage
import java.io.File
import java.security.MessageDigest
import java.util.Locale

/**
 * Mura GIS офлайн карта пакеттерін дайындау (Android-тан тыс). Командалар:
 *
 *  dem       --dem <қалта> --bounds w,s,e,n --contours <out.geojson> --hillshade <out.mbtiles> [--interval 10] [--index 50]
 *  s2        --scenes <тізім.txt> [--cache <қалта>] [--threads 32] --bounds w,s,e,n --out <out.mbtiles> [--minzoom 8] [--maxzoom 14] [--gain 1.0] [--quality 0.8]
 *  assemble  --in <тайлдар.mbtiles> --out <пакет.mbtiles> --id <пакет id> [--style <style.json>] [--glyphs <қалта>]
 *            [--sprite] [--hillshade <hillshade.mbtiles>] [--meta key=value]...
 *  sha256    <файл>
 *
 * Толық реті — tools/packager/README.md және tools/packager/build-kobda.sh.
 */
fun main(args: Array<String>) {
    Locale.setDefault(Locale.ROOT)
    if (args.isEmpty()) { println("Commands: dem | s2 | assemble | sha256"); return }
    val opts = HashMap<String, MutableList<String>>()
    var i = 1
    while (i < args.size) {
        val k = args[i].removePrefix("--")
        val v = if (i + 1 < args.size && !args[i + 1].startsWith("--")) args[++i] else "true"
        opts.getOrPut(k) { ArrayList() } += v
        i++
    }
    fun opt(k: String) = opts[k]?.first()
    fun req(k: String) = opt(k) ?: error("--$k is required")
    fun bounds() = req("bounds").split(',').map { it.trim().toDouble() }.let { Bounds(it[0], it[1], it[2], it[3]) }
    val t0 = System.currentTimeMillis()
    when (args[0]) {
        "dem" -> {
            val b = bounds()
            println("DEM grid…")
            val g = DemGrid.build(File(req("dem")), b)
            println("  grid ${g.cols}x${g.rows}, elevation ${g.range()}")
            opt("contours")?.let { out ->
                val smooth = g.smoothed(2)
                val interval = opt("interval")?.toInt() ?: 10
                val lines = Contours.trace(smooth, interval, minLengthM = opt("min-loop")?.toDouble() ?: 400.0)
                println("  contours: ${lines.size} lines")
                Contours.writeGeoJson(lines, File(out), opt("index")?.toInt() ?: 50)
            }
            opt("hillshade")?.let { out ->
                val f = File(out); f.delete()
                val shade = g.smoothed(1).hillshade(zFactor = opt("zfactor")?.toDouble() ?: 3.0)
                TileOut(f).use { o ->
                    HillshadeTiles.render(g, shade, o, b, opt("minzoom")?.toInt() ?: 6, opt("maxzoom")?.toInt() ?: 12)
                    o.meta(mapOf("name" to "hillshade", "format" to "png", "bounds" to b.encode()))
                }
            }
        }
        "s2" -> {
            val b = bounds()
            // Әр жол: «<атау> <url не файл>», басымдық ретімен (бірінші — негізгі сахна)
            val cache = File(opt("cache") ?: "s2-cache")
            val list = File(req("scenes")).readLines().map { it.trim() }.filter { it.isNotEmpty() && !it.startsWith("#") }.map { line ->
                val (name, loc) = line.split(Regex("\\s+"), limit = 2).let { if (it.size == 2) it[0] to it[1] else File(it[0]).name to it[0] }
                if (loc.startsWith("http")) GeoTiff(name, HttpRangeSource(loc, File(cache, name))) else GeoTiff(File(loc))
            }
            val out = File(req("out")); out.delete()
            val maxZ = opt("maxzoom")?.toInt() ?: 14; val minZ = opt("minzoom")?.toInt() ?: 8
            val q = opt("quality")?.toFloat() ?: 0.8f
            TileOut(out).use { o ->
                SentinelMosaic(list, opt("gain")?.toFloat() ?: 1.0f).use { m -> m.renderMax(o, b, maxZ, q, opt("threads")?.toInt() ?: 32) }
                SentinelMosaic.pyramid(o, b, maxZ, minZ, q)
                o.meta(mapOf("name" to "sentinel-2", "format" to "jpg", "minzoom" to "$minZ", "maxzoom" to "$maxZ", "bounds" to b.encode()))
            }
        }
        "assemble" -> assemble(File(req("in")), File(req("out")), req("id"), opt("style")?.let(::File), opt("glyphs")?.let(::File),
            opt("sprite") == "true", opt("hillshade")?.let(::File),
            (opts["meta"] ?: emptyList()).associate { it.substringBefore('=') to it.substringAfter('=') })
        "sha256" -> println(sha256(File(args[1])))
        else -> error("Unknown command ${args[0]}")
    }
    println("done in ${(System.currentTimeMillis() - t0) / 1000} s")
}

fun sha256(f: File): String {
    val md = MessageDigest.getInstance("SHA-256")
    f.inputStream().use { i -> val buf = ByteArray(1 shl 20); while (true) { val n = i.read(buf); if (n < 0) break; md.update(buf, 0, n) } }
    return md.digest().joinToString("") { "%02x".format(it) }
}

/** Қаріптің қолданылатын диапазондары: латын, кирилл (қазақ әріптері 0400–04FF ішінде), тыныс белгілері. */
private val GLYPH_RANGES = listOf("0-255", "256-511", "1024-1279", "1280-1535", "8192-8447")

fun assemble(input: File, out: File, id: String, style: File?, glyphs: File?, sprite: Boolean, hillshade: File?, meta: Map<String, String>) {
    out.delete()
    input.copyTo(out)
    JdbcSqlDb(out.path).use { db ->
        MapPackage.createTables(db)
        if (hillshade != null) db.exec("ATTACH DATABASE ? AS hs", listOf(hillshade.path))
        db.tx {
            fun res(name: String, data: ByteArray) = db.exec("INSERT OR REPLACE INTO ${MapPackage.RESOURCES} (name, data) VALUES (?, ?)", listOf(name, data))
            style?.let { res(MapPackage.STYLE, it.readBytes()) }
            glyphs?.listFiles()?.filter { it.isDirectory }?.forEach { font ->
                for (r in GLYPH_RANGES) File(font, "$r.pbf").takeIf { it.isFile }?.let { res("glyphs/${font.name}/$r.pbf", it.readBytes()) }
            }
            if (sprite) for (ratio in 1..2) {
                val (json, png) = Sprite.build(ratio)
                val sfx = if (ratio == 2) "@2x" else ""
                res("sprite$sfx.json", json.toByteArray()); res("sprite$sfx.png", png)
            }
            if (hillshade != null) {
                db.exec("INSERT OR REPLACE INTO ${MapPackage.EXTRA_TILES} SELECT 'hillshade', zoom_level, tile_column, tile_row, tile_data FROM hs.tiles")
            }
            for ((k, v) in meta + mapOf(MapPackage.META_ID to id, MapPackage.META_VERSION to "1"))
                db.exec("INSERT OR REPLACE INTO metadata (name, value) VALUES (?, ?)", listOf(k, v))
        }
        if (hillshade != null) db.exec("DETACH DATABASE hs")
        db.exec("PRAGMA journal_mode=DELETE")
        db.exec("VACUUM")
    }
    println("  ${out.name}: ${out.length()} bytes, sha256 ${sha256(out)}")
}
