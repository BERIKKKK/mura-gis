package io.github.berikkkk.muragis.mobile.data

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import io.github.berikkkk.muragis.core.db.LayerFormat
import io.github.berikkkk.muragis.core.db.LayerStore
import io.github.berikkkk.muragis.core.db.MapLayer
import io.github.berikkkk.muragis.core.db.SqlDb
import io.github.berikkkk.muragis.core.packages.MapPackage
import io.github.berikkkk.muragis.core.server.TileProvider
import io.github.berikkkk.muragis.core.server.TileResponse
import io.github.berikkkk.muragis.core.tiles.GpkgTileStore
import io.github.berikkkk.muragis.core.tiles.MbtilesStore
import io.github.berikkkk.muragis.core.tiles.Projection
import io.github.berikkkk.muragis.core.tiles.TileFormat
import io.github.berikkkk.muragis.core.tiles.TileMath
import io.github.berikkkk.muragis.core.tiles.TileStore
import io.github.berikkkk.muragis.core.tiles.ZipTileStore
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.math.floor

/**
 * Офлайн қабаттардың тайл қоймалары: қабат алғаш сұралғанда ашылады, ашық қоймалар саны шектеулі (LRU).
 * Карта файлдары жадқа толық жүктелмейді — тек сұралған тайл оқылады.
 */
class TileRegistry(private val layers: LayerStore) : TileProvider {
    private val open = object : LruCache<String, TileStore>(6) {
        override fun entryRemoved(evicted: Boolean, key: String, oldValue: TileStore, newValue: TileStore?) {
            runCatching { oldValue.close() }
        }
    }
    private val meta = HashMap<String, MapLayer>()
    /** Офлайн пакеттердің (MBTiles + mura_resources/mura_tiles) екінші оқу қосылымы: стиль, қаріп, белгіше, қосымша тайлдар. */
    private val packages = object : LruCache<String, SqlDb>(4) {
        override fun entryRemoved(evicted: Boolean, key: String, oldValue: SqlDb, newValue: SqlDb?) {
            runCatching { oldValue.close() }
        }
    }

    @Synchronized
    fun invalidate(layerId: String) {
        open.remove(layerId)
        packages.remove(layerId)
        meta.remove(layerId)
    }

    @Synchronized
    private fun pkg(id: String): SqlDb? {
        packages.get(id)?.let { return it }
        val l = meta[id] ?: layers.layer(id)?.also { meta[id] = it } ?: return null
        if (l.format != LayerFormat.MBTILES) return null
        val f = File(l.path)
        if (!f.isFile) return null
        val db = runCatching { AndroidSqlDb.openReadOnly(f) }.getOrNull() ?: return null
        packages.put(id, db)
        return db
    }

    /** Пакеттің MapLibre стилі (mura:// сілтемелерімен) — векторлық пакет болмаса null. */
    fun packageStyle(layerId: String): String? {
        val db = pkg(layerId) ?: return null
        return synchronized(db) { MapPackage.resource(db, MapPackage.STYLE) }?.toString(Charsets.UTF_8)
    }

    override fun resource(layerId: String, path: String): TileResponse? {
        val db = pkg(layerId) ?: return null
        val name = if (path == "sprite") "sprite.json" else path
        val data = synchronized(db) { MapPackage.resource(db, name) } ?: return null
        val mime = when (name.substringAfterLast('.').lowercase()) {
            "json" -> "application/json"; "png" -> "image/png"; "pbf" -> "application/x-protobuf"; else -> "application/octet-stream"
        }
        return TileResponse(data, mime)
    }

    override fun extraTile(layerId: String, set: String, z: Int, x: Int, y: Int): TileResponse? {
        val db = pkg(layerId) ?: return null
        val data = synchronized(db) { if (db.tableExists(MapPackage.EXTRA_TILES)) MapPackage.extraTile(db, set, z, x, y) else null } ?: return null
        return TileResponse(data, TileFormat.sniff(data).mime)
    }

    @Synchronized
    private fun store(id: String): Pair<MapLayer, TileStore>? {
        val l = meta[id] ?: layers.layer(id)?.also { meta[id] = it } ?: return null
        if (!l.isOffline) return null
        open.get(id)?.let { return l to it }
        val f = File(l.path)
        if (!f.isFile) return null
        val s: TileStore = when (l.format) {
            LayerFormat.MBTILES -> MbtilesStore(AndroidSqlDb.openReadOnly(f), invertY = if (l.tms) true else null, nameFallback = l.title)
            LayerFormat.XYZ_ZIP -> ZipTileStore(f, ZipTileStore.scan(f), tms = l.tms, name = l.title)
            LayerFormat.GPKG_TILES -> GpkgTileStore(AndroidSqlDb.openReadOnly(f), l.url)   // url өрісінде — кесте атауы
            LayerFormat.XYZ_URL -> return null
        }
        open.put(id, s)
        return l to s
    }

    override fun tile(layerId: String, z: Int, x: Int, y: Int): TileResponse? {
        val (l, s) = store(layerId) ?: return null
        if (Projection.of(l.projection) == Projection.ELLIPTICAL_MERCATOR) return reproject3395(s, z, x, y)
        val data = synchronized(s) { s.tile(z, x, y) } ?: return null
        val fmt = TileFormat.sniff(data).takeIf { it != TileFormat.UNKNOWN } ?: s.info.format
        // Векторлық тайлдар (pbf) MBTiles-те gzip-пен сақталады — MapLibre-ге ашып береміз
        if (fmt == TileFormat.PBF || s.info.format == TileFormat.PBF) return TileResponse(MapPackage.gunzipIfNeeded(data), TileFormat.PBF.mime)
        return TileResponse(data, fmt.mime)
    }

    /**
     * EPSG:3395 (эллипсоидтық Меркатор) тайлдарын EPSG:3857 торына түрлендіру. Екі проекцияның бойлығы бірдей,
     * айырмашылық тек ендік бойынша (тік ығысу), сондықтан әр пиксель жолы бастапқы тайлдардың сәйкес жолынан көшіріледі.
     */
    private fun reproject3395(s: TileStore, z: Int, x: Int, y: Int): TileResponse? {
        val size = 256
        val world = size.toDouble() * (1 shl z)
        val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val cache = HashMap<Int, Bitmap?>()
        val row = IntArray(size)
        var any = false
        for (py in 0 until size) {
            val lat = TileMath.y3857ToLat((y * size + py + 0.5) / world)
            val gy = TileMath.latToY3395(lat) * world
            val ty = floor(gy / size).toInt()
            if (ty < 0 || ty >= (1 shl z)) continue
            val src = cache.getOrPut(ty) {
                synchronized(s) { s.tile(z, x, ty) }?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }
            } ?: continue
            val sy = (gy - ty * size).toInt().coerceIn(0, src.height - 1)
            if (src.width != size) continue
            src.getPixels(row, 0, size, 0, sy, size, 1)
            out.setPixels(row, 0, size, 0, py, size, 1)
            any = true
        }
        cache.values.forEach { it?.recycle() }
        if (!any) { out.recycle(); return null }
        val bos = ByteArrayOutputStream()
        out.compress(Bitmap.CompressFormat.PNG, 100, bos)
        out.recycle()
        return TileResponse(bos.toByteArray(), "image/png")
    }

    @Synchronized
    fun closeAll() { open.evictAll(); packages.evictAll() }
}
