package io.github.berikkkk.muragis.core.tiles

import io.github.berikkkk.muragis.core.db.SqlDb
import io.github.berikkkk.muragis.core.db.q
import io.github.berikkkk.muragis.core.geo.Bounds
import io.github.berikkkk.muragis.core.io.FormatException
import kotlin.math.abs

/**
 * GeoPackage тайл пирамидасы. Тек Web Mercator (EPSG:3857) торы қолдау табады: матрицаның ені 2^z,
 * шекарасы бүкіл әлем (±20037508.34 м). Басқа проекция не тор — FormatException("gpkg_tiles_crs"):
 * қайта проекциялау 1.0 нұсқасында жоқ, сондықтан ондай файл «қолдау жоқ» деп көрсетіледі.
 */
class GpkgTileStore(private val db: SqlDb, val table: String) : TileStore {
    /** gpkg zoom_level → нақты XYZ масштабы. */
    private val zoomMap: Map<Int, Int>
    private val reverse: Map<Int, Int>
    override val info: TileSetInfo

    init {
        val set = db.query("SELECT srs_id, min_x, min_y, max_x, max_y FROM gpkg_tile_matrix_set WHERE table_name = ?", listOf(table)) {
            listOf(it.double("srs_id"), it.double("min_x"), it.double("min_y"), it.double("max_x"), it.double("max_y"))
        }.firstOrNull() ?: throw FormatException("gpkg_no_tiles", "No tile matrix set")
        val srs = set[0]!!.toLong()
        val org = db.query("SELECT organization o, organization_coordsys_id c FROM gpkg_spatial_ref_sys WHERE srs_id = ?", listOf(srs)) {
            (it.string("o") ?: "").uppercase() to (it.long("c") ?: -1L)
        }.firstOrNull()
        val is3857 = org != null && org.first == "EPSG" && org.second in setOf(3857L, 900913L, 3785L)
        val e = TileMath.EARTH_HALF
        val tol = 1.0
        val fullWorld = abs(set[1]!! + e) < tol && abs(set[3]!! - e) < tol && abs(set[2]!! + e) < tol && abs(set[4]!! - e) < tol
        if (!is3857 || !fullWorld) throw FormatException("gpkg_tiles_crs", "Unsupported tile matrix CRS")
        val mats = db.query("SELECT zoom_level z, matrix_width w, matrix_height h FROM gpkg_tile_matrix WHERE table_name = ?", listOf(table)) {
            Triple(it.long("z")!!.toInt(), it.long("w")!!, it.long("h")!!)
        }
        val zm = HashMap<Int, Int>()
        for ((gz, w, h) in mats) {
            if (w != h || w <= 0 || (w and (w - 1)) != 0L) throw FormatException("gpkg_tiles_crs", "Non-standard tile matrix")
            zm[gz] = java.lang.Long.numberOfTrailingZeros(w)
        }
        // Тек тайлы бар масштабтар
        val present = db.query("SELECT DISTINCT zoom_level z FROM ${q(table)}") { it.long("z")!!.toInt() }.filter { it in zm }
        if (present.isEmpty()) throw FormatException("gpkg_no_tiles", "Empty tile table")
        zoomMap = present.associateWith { zm.getValue(it) }
        reverse = zoomMap.entries.associate { it.value to it.key }
        val minG = present.minBy { zoomMap.getValue(it) }
        val r = db.query("SELECT min(tile_column) a, max(tile_column) b, min(tile_row) c, max(tile_row) d FROM ${q(table)} WHERE zoom_level = ?", listOf(minG.toLong())) {
            listOf(it.long("a")!!.toInt(), it.long("b")!!.toInt(), it.long("c")!!.toInt(), it.long("d")!!.toInt())
        }.first()
        val z0 = zoomMap.getValue(minG)
        val sample = db.query("SELECT tile_data FROM ${q(table)} LIMIT 1") { it.blob("tile_data") }.firstOrNull()
        val ident = db.query("SELECT identifier i FROM gpkg_contents WHERE table_name = ?", listOf(table)) { it.string("i") }.firstOrNull()
        info = TileSetInfo(
            name = ident?.takeIf { it.isNotBlank() } ?: table, format = TileFormat.sniff(sample),
            minZoom = zoomMap.values.min(), maxZoom = zoomMap.values.max(),
            bounds = TileMath.rangeBounds(TileMath.Range(z0, r[0], r[1], r[2], r[3])),
        )
    }

    override fun tile(z: Int, x: Int, y: Int): ByteArray? {
        val gz = reverse[z] ?: return null
        return db.query("SELECT tile_data FROM ${q(table)} WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?",
            listOf(gz.toLong(), x.toLong(), y.toLong())) { it.blob("tile_data") }.firstOrNull()
    }

    override fun close() = db.close()

    companion object {
        fun tileTables(db: SqlDb): List<String> =
            if (!db.tableExists("gpkg_contents")) emptyList()
            else db.query("SELECT table_name t FROM gpkg_contents WHERE data_type IN ('tiles', '2d-gridded-coverage')") { it.string("t")!! }
    }
}

/** Файлдың түрі бірінші байттары бойынша. */
enum class FileKind { SQLITE, ZIP, TIFF, UNKNOWN;
    companion object {
        fun sniff(head: ByteArray): FileKind {
            fun u(i: Int) = if (i < head.size) head[i].toInt() and 0xff else -1
            return when {
                head.size >= 16 && String(head, 0, 15, Charsets.US_ASCII) == "SQLite format 3" -> SQLITE
                u(0) == 0x50 && u(1) == 0x4B && (u(2) == 3 || u(2) == 5) -> ZIP
                (u(0) == 0x49 && u(1) == 0x49 && (u(2) == 42 || u(2) == 43)) || (u(0) == 0x4D && u(1) == 0x4D && u(2) == 0 && (u(3) == 42 || u(3) == 43)) -> TIFF
                else -> UNKNOWN
            }
        }
    }
}

/** SQLite файлының ішіндегі карта түрі. */
enum class SqliteMapKind { MBTILES, GPKG_TILES, GPKG_FEATURES_ONLY, MURA_PROJECT, UNKNOWN;
    companion object {
        fun detect(db: SqlDb): SqliteMapKind = when {
            db.tableExists("gpkg_contents") && GpkgTileStore.tileTables(db).isNotEmpty() -> GPKG_TILES
            db.tableExists("gpkg_contents") && (db.tableExists("marks") || db.tableExists("routes")) -> MURA_PROJECT
            db.tableExists("gpkg_contents") -> GPKG_FEATURES_ONLY
            db.tableExists("tiles") && db.columnsOf("tiles").containsAll(listOf("zoom_level", "tile_column", "tile_row", "tile_data")) -> MBTILES
            else -> UNKNOWN
        }
    }
}

@Suppress("unused") private val keepBounds: Bounds? = null
