package io.github.berikkkk.muragis.core.packages

import io.github.berikkkk.muragis.core.db.SqlDb
import io.github.berikkkk.muragis.core.tiles.TileMath
import java.io.ByteArrayOutputStream
import java.util.zip.GZIPInputStream

/**
 * Mura GIS офлайн карта пакеті — бір файл, стандартты MBTiles (SQLite), қосымша екі кестемен:
 *  - `tiles` — негізгі тайлдар: векторлық (pbf, gzip) не растр (JPEG/PNG);
 *  - `mura_resources(name, data)` — стиль (`style.json`), қаріптер (`glyphs/<fontstack>/<range>.pbf`),
 *    белгішелер (`sprite.json`, `sprite.png`, `sprite@2x.json`, `sprite@2x.png`);
 *  - `mura_tiles(tileset, zoom_level, tile_column, tile_row, tile_data)` — қосымша растр жиындары (мыс. `hillshade`),
 *    жолдар MBTiles-тегідей TMS ретімен.
 * Басқа MBTiles оқырмандары қосымша кестелерді елемейді, сондықтан пакет кәдімгі MBTiles ретінде де ашылады.
 *
 * `style.json` ішіндегі сілтемелер құрылғыда ауыстырылады (интернет қажет емес — бәрі жергілікті серверден):
 * [TILES] → негізгі тайлдар, [SET]`<name>/{z}/{x}/{y}` → қосымша жиын, [GLYPHS] → қаріптер, [SPRITE] → белгішелер.
 * Жазу тілі: стильдегі [NAME_FIELD] өрісі интерфейс тіліне қарай ([NAME_FIELD_RU]) ауыстырылады.
 */
object MapPackage {
    const val RESOURCES = "mura_resources"
    const val EXTRA_TILES = "mura_tiles"
    const val STYLE = "style.json"

    const val TILES = "mura://tiles/{z}/{x}/{y}"
    const val SET = "mura://set/"
    const val GLYPHS = "mura://glyphs/{fontstack}/{range}.pbf"
    const val SPRITE = "mura://sprite"
    const val NAME_FIELD = "name_kk"
    const val NAME_FIELD_RU = "name_ru"

    /** metadata кестесіндегі пакет белгілері. */
    const val META_ID = "mura:package"
    const val META_VERSION = "mura:package_version"

    fun createTables(db: SqlDb) {
        db.exec("CREATE TABLE IF NOT EXISTS $RESOURCES (name TEXT PRIMARY KEY NOT NULL, data BLOB NOT NULL)")
        db.exec("CREATE TABLE IF NOT EXISTS $EXTRA_TILES (tileset TEXT NOT NULL, zoom_level INTEGER NOT NULL, tile_column INTEGER NOT NULL, tile_row INTEGER NOT NULL, tile_data BLOB NOT NULL)")
        db.exec("CREATE UNIQUE INDEX IF NOT EXISTS mura_tiles_index ON $EXTRA_TILES (tileset, zoom_level, tile_column, tile_row)")
    }

    fun hasStyle(db: SqlDb): Boolean = db.tableExists(RESOURCES) &&
        (db.scalarLong("SELECT count(*) FROM $RESOURCES WHERE name = ?", listOf(STYLE)) ?: 0L) > 0L

    fun resource(db: SqlDb, name: String): ByteArray? = if (!db.tableExists(RESOURCES)) null
        else db.query("SELECT data FROM $RESOURCES WHERE name = ?", listOf(name)) { it.blob("data") }.firstOrNull()

    /** Қосымша жиынның тайлы (z/x/y — XYZ). */
    fun extraTile(db: SqlDb, set: String, z: Int, x: Int, y: Int): ByteArray? =
        db.query("SELECT tile_data FROM $EXTRA_TILES WHERE tileset = ? AND zoom_level = ? AND tile_column = ? AND tile_row = ?",
            listOf(set, z.toLong(), x.toLong(), TileMath.flipY(y, z).toLong())) { it.blob("tile_data") }.firstOrNull()

    /**
     * Стильдегі mura:// сілтемелерін нақты мекенжайларға ауыстыру. [base] — жергілікті сервердегі осы қабаттың
     * түбірі (мыс. `http://127.0.0.1:1234`), [layerId] — қабат id.
     */
    fun resolveStyle(style: String, base: String, layerId: String, ru: Boolean): String {
        var s = style.replace(TILES, "$base/t/$layerId/{z}/{x}/{y}")
            .replace(SET, "$base/s/$layerId/")
            .replace(GLYPHS, "$base/r/$layerId/glyphs/{fontstack}/{range}.pbf")
            .replace(SPRITE, "$base/r/$layerId/sprite")
        if (ru) s = s.replace("\"$NAME_FIELD\"", "\"$NAME_FIELD_RU\"")
        return s
    }

    /** Векторлық тайл gzip-пен сығылған болса — ашу (MapLibre-ге таза pbf беріледі). */
    fun gunzipIfNeeded(b: ByteArray): ByteArray {
        if (b.size < 2 || (b[0].toInt() and 0xff) != 0x1f || (b[1].toInt() and 0xff) != 0x8b) return b
        return GZIPInputStream(b.inputStream()).use { i -> ByteArrayOutputStream(b.size * 3).also { i.copyTo(it) }.toByteArray() }
    }
}
