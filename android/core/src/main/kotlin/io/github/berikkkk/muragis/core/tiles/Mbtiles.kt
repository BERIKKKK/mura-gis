package io.github.berikkkk.muragis.core.tiles

import io.github.berikkkk.muragis.core.db.SqlDb
import io.github.berikkkk.muragis.core.geo.Bounds
import io.github.berikkkk.muragis.core.io.FormatException

/**
 * MBTiles (1.x) оқу. Спецификация бойынша tiles.tile_row — TMS (оңтүстіктен санайды), сондықтан XYZ сұранысының
 * y мәні аударылады: tile_row = 2^z − 1 − y. Кейбір бағдарламалар XYZ нөмірлеуімен жазады және metadata-да
 * scheme = xyz деп көрсетеді — ондайда аударылмайды. Пайдаланушы қабат баптауында [invertY] арқылы түзете алады.
 */
class MbtilesStore(private val db: SqlDb, invertY: Boolean? = null, nameFallback: String = "MBTiles") : TileStore {
    private val meta: Map<String, String>
    private val tms: Boolean
    override val info: TileSetInfo

    init {
        if (!db.tableExists("tiles")) throw FormatException("mbtiles_no_tiles", "No tiles table")
        meta = if (db.tableExists("metadata")) db.query("SELECT name, value FROM metadata") { (it.string("name") ?: "") to (it.string("value") ?: "") }.toMap() else emptyMap()
        tms = invertY ?: (meta["scheme"]?.lowercase() != "xyz")
        var minZ = meta["minzoom"]?.trim()?.toDoubleOrNull()?.toInt()
        var maxZ = meta["maxzoom"]?.trim()?.toDoubleOrNull()?.toInt()
        if (minZ == null || maxZ == null) {
            minZ = minZ ?: db.scalarLong("SELECT min(zoom_level) FROM tiles")?.toInt()
            maxZ = maxZ ?: db.scalarLong("SELECT max(zoom_level) FROM tiles")?.toInt()
        }
        if (minZ == null || maxZ == null) throw FormatException("mbtiles_empty", "No tiles")
        val sample = db.query("SELECT tile_data FROM tiles WHERE zoom_level = ? LIMIT 1", listOf(maxZ.toLong())) { it.blob("tile_data") }.firstOrNull()
        val fmt = TileFormat.ofName(meta["format"]).takeIf { it != TileFormat.UNKNOWN } ?: TileFormat.sniff(sample)
        val bounds = Bounds.decode(meta["bounds"]) ?: computeBounds(minZ)
        info = TileSetInfo(
            name = meta["name"]?.takeIf { it.isNotBlank() } ?: nameFallback,
            format = fmt, minZoom = minZ, maxZoom = maxZ, bounds = bounds,
            attribution = meta["attribution"] ?: "", description = meta["description"] ?: "",
        )
    }

    val isTms get() = tms
    val metadata get() = meta

    /** metadata-да bounds жоқ болса — ең кіші масштабтағы тайлдардан (индекс бойынша жылдам). */
    private fun computeBounds(z: Int): Bounds? {
        val r = db.query("SELECT min(tile_column) a, max(tile_column) b, min(tile_row) c, max(tile_row) d FROM tiles WHERE zoom_level = ?", listOf(z.toLong())) {
            listOf(it.long("a"), it.long("b"), it.long("c"), it.long("d"))
        }.firstOrNull() ?: return null
        if (r.any { it == null }) return null
        val (minX, maxX, r1, r2) = r.map { it!!.toInt() }
        val minY = if (tms) TileMath.flipY(r2, z) else r1
        val maxY = if (tms) TileMath.flipY(r1, z) else r2
        return TileMath.rangeBounds(TileMath.Range(z, minX, maxX, minY, maxY))
    }

    override fun tile(z: Int, x: Int, y: Int): ByteArray? {
        val row = if (tms) TileMath.flipY(y, z) else y
        return db.query("SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?",
            listOf(z.toLong(), x.toLong(), row.toLong())) { it.blob("tile_data") }.firstOrNull()
    }

    override fun close() = db.close()
}

/** MBTiles жазу (офлайн жүктеулер және қалта → MBTiles түрлендіру). Әрқашан стандартты TMS жолдары. */
class MbtilesWriter(private val db: SqlDb) : AutoCloseable {
    init {
        db.exec("CREATE TABLE IF NOT EXISTS metadata (name TEXT, value TEXT)")
        db.exec("CREATE UNIQUE INDEX IF NOT EXISTS metadata_name ON metadata (name)")
        db.exec("CREATE TABLE IF NOT EXISTS tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)")
        db.exec("CREATE UNIQUE INDEX IF NOT EXISTS tile_index ON tiles (zoom_level, tile_column, tile_row)")
    }

    fun setMetadata(m: Map<String, String>) = db.tx {
        for ((k, v) in m) db.exec("INSERT OR REPLACE INTO metadata (name, value) VALUES (?, ?)", listOf(k, v))
    }

    fun put(z: Int, x: Int, y: Int, data: ByteArray) =
        db.exec("INSERT OR REPLACE INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?)",
            listOf(z.toLong(), x.toLong(), TileMath.flipY(y, z).toLong(), data))

    fun has(z: Int, x: Int, y: Int): Boolean =
        (db.scalarLong("SELECT count(*) FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?",
            listOf(z.toLong(), x.toLong(), TileMath.flipY(y, z).toLong())) ?: 0L) > 0L

    fun count(): Long = db.scalarLong("SELECT count(*) FROM tiles") ?: 0L

    fun <T> batch(block: () -> T): T = db.tx(block)

    override fun close() = db.close()
}
