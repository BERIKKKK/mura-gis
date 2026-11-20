package io.github.berikkkk.muragis.core.tiles

import io.github.berikkkk.muragis.core.geo.Bounds
import java.io.Closeable

/** Тайл пішімі (бірінші байттары бойынша анықталады). */
enum class TileFormat(val ext: String, val mime: String, val raster: Boolean) {
    PNG("png", "image/png", true), JPG("jpg", "image/jpeg", true), WEBP("webp", "image/webp", true),
    PBF("pbf", "application/x-protobuf", false), UNKNOWN("", "application/octet-stream", true);

    companion object {
        fun sniff(b: ByteArray?): TileFormat {
            if (b == null || b.size < 4) return UNKNOWN
            fun u(i: Int) = b[i].toInt() and 0xff
            return when {
                u(0) == 0x89 && u(1) == 0x50 && u(2) == 0x4E && u(3) == 0x47 -> PNG
                u(0) == 0xFF && u(1) == 0xD8 -> JPG
                b.size >= 12 && u(0) == 0x52 && u(1) == 0x49 && u(2) == 0x46 && u(3) == 0x46 && u(8) == 0x57 && u(9) == 0x45 -> WEBP
                u(0) == 0x1F && u(1) == 0x8B -> PBF          // gzip — әдетте векторлық тайл
                u(0) == 0x1A -> PBF
                else -> UNKNOWN
            }
        }

        fun ofName(s: String?): TileFormat = when (s?.lowercase()?.removePrefix(".")) {
            "png" -> PNG; "jpg", "jpeg" -> JPG; "webp" -> WEBP; "pbf", "mvt" -> PBF; else -> UNKNOWN
        }
    }
}

/** Проекция: стандартты Web Mercator, не SAS.Planet-тегі Яндекс сияқты эллипсоидтық Меркатор. */
enum class Projection(val code: String) {
    WEB_MERCATOR("EPSG:3857"), ELLIPTICAL_MERCATOR("EPSG:3395");

    companion object { fun of(c: String?) = entries.firstOrNull { it.code == c } ?: WEB_MERCATOR }
}

data class TileSetInfo(
    val name: String,
    val format: TileFormat,
    val minZoom: Int,
    val maxZoom: Int,
    val bounds: Bounds?,
    val attribution: String = "",
    val description: String = "",
    val projection: Projection = Projection.WEB_MERCATOR,
)

/** Тайлдар қоймасы: тайл сұралғанда ғана оқылады (бүкіл файл жадқа жүктелмейді). z/x/y — XYZ нөмірлеуі. */
interface TileStore : Closeable {
    val info: TileSetInfo
    fun tile(z: Int, x: Int, y: Int): ByteArray?
}
