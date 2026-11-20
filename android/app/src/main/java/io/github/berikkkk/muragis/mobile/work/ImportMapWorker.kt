package io.github.berikkkk.muragis.mobile.work

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import androidx.work.CoroutineWorker
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import io.github.berikkkk.muragis.core.db.LayerFormat
import io.github.berikkkk.muragis.core.db.LayerKind
import io.github.berikkkk.muragis.core.db.LayerRole
import io.github.berikkkk.muragis.core.db.MapLayer
import io.github.berikkkk.muragis.core.io.FormatException
import io.github.berikkkk.muragis.core.model.Ids
import io.github.berikkkk.muragis.core.tiles.FileKind
import io.github.berikkkk.muragis.core.tiles.GpkgTileStore
import io.github.berikkkk.muragis.core.tiles.MbtilesStore
import io.github.berikkkk.muragis.core.tiles.MbtilesWriter
import io.github.berikkkk.muragis.core.tiles.SqliteMapKind
import io.github.berikkkk.muragis.core.tiles.TileFormat
import io.github.berikkkk.muragis.core.tiles.TileSetInfo
import io.github.berikkkk.muragis.core.tiles.TileStore
import io.github.berikkkk.muragis.core.tiles.XyzScanner
import io.github.berikkkk.muragis.core.tiles.ZipTileStore
import io.github.berikkkk.muragis.mobile.MuraApp
import io.github.berikkkk.muragis.mobile.data.AndroidSqlDb
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

/**
 * Сыртқы картаны импорттау (Storage Access Framework арқылы таңдалған файл не қалта).
 * Қадамдар: пішімді анықтау → құрылымды тексеру → координаталар жүйесі → масштабтар → қамту аумағы → кітапханаға тіркеу.
 * Файл қосымшаның сақтау орнына ағынмен көшіріледі (SQLite/ZIP файлды тек жол арқылы аша алады; content:// URI-дің
 * тұрақты рұқсаты жеткіліксіз). Қалта (XYZ / SAS.Planet) бір MBTiles файлына жиналады — мыңдаған ұсақ файлдың орнына.
 * Нәтиже: outputData { layerId } не { error = код }.
 */
class ImportMapWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    companion object {
        const val TAG = "import-map"
        fun enqueue(ctx: Context, uri: Uri, tree: Boolean, tms: Boolean, projection: String, role: LayerRole): UUID {
            val req = OneTimeWorkRequestBuilder<ImportMapWorker>()
                .setInputData(workDataOf("uri" to uri.toString(), "tree" to tree, "tms" to tms, "projection" to projection, "role" to role.code))
                .addTag(TAG).build()
            WorkManager.getInstance(ctx).enqueue(req)
            return req.id
        }
    }

    private val cr get() = applicationContext.contentResolver

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val g = (applicationContext as MuraApp).graph
        val uri = Uri.parse(inputData.getString("uri") ?: return@withContext Result.failure())
        val tree = inputData.getBoolean("tree", false)
        val tms = inputData.getBoolean("tms", false)
        val projection = inputData.getString("projection") ?: "EPSG:3857"
        val role = LayerRole.of(inputData.getString("role"))
        val id = Ids.newId()
        runCatching { setForeground(Notifications.foreground(applicationContext, id.hashCode(), applicationContext.getString(io.github.berikkkk.muragis.mobile.R.string.import_map_title), 0, true)) }
        try {
            val layer = if (tree) importTree(g.mapsDir, id, uri, tms) else importFile(g.mapsDir, id, uri, tms)
            g.layers.save(layer.copy(role = role, projection = projection, visible = false, sort = 1000))
            Result.success(workDataOf("layerId" to layer.id))
        } catch (e: FormatException) {
            File(g.mapsDir, "$id.tmp").delete()
            Result.failure(workDataOf("error" to e.code))
        } catch (e: Exception) {
            File(g.mapsDir, "$id.tmp").delete()
            Result.failure(workDataOf("error" to "io", "detail" to (e.message ?: e.javaClass.simpleName)))
        }
    }

    private fun displayName(uri: Uri): String = runCatching {
        cr.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
    }.getOrNull() ?: uri.lastPathSegment?.substringAfterLast('/') ?: "map"

    private fun layerFrom(id: String, info: TileSetInfo, fmt: LayerFormat, file: File, title: String, tms: Boolean, extra: String = ""): MapLayer {
        if (!info.format.raster) throw FormatException("vector_unsupported")
        return MapLayer(
            id = id, kind = LayerKind.IMPORTED, format = fmt, title = title.ifBlank { info.name }, url = extra, path = file.path,
            minZoom = info.minZoom, maxZoom = info.maxZoom, bounds = info.bounds, attribution = info.attribution,
            tileFormat = info.format.ext, tms = tms, sizeBytes = file.length(), role = LayerRole.BASE,
        )
    }

    private fun importFile(dir: File, id: String, uri: Uri, tms: Boolean): MapLayer {
        val name = displayName(uri)
        val tmp = File(dir, "$id.tmp")
        val head = ByteArray(16)
        cr.openInputStream(uri)?.use { inp ->
            tmp.outputStream().use { out ->
                val buf = ByteArray(256 * 1024)
                var first = true
                while (true) {
                    val n = inp.read(buf)
                    if (n < 0) break
                    if (first) { System.arraycopy(buf, 0, head, 0, minOf(16, n)); first = false }
                    out.write(buf, 0, n)
                }
            }
        } ?: throw FormatException("io")
        val title = name.substringBeforeLast('.')
        when (FileKind.sniff(head)) {
            FileKind.SQLITE -> {
                val kind = AndroidSqlDb.openReadOnly(tmp).use { SqliteMapKind.detect(it) }
                when (kind) {
                    SqliteMapKind.MBTILES -> {
                        val f = File(dir, "$id.mbtiles"); tmp.renameTo(f)
                        val info = MbtilesStore(AndroidSqlDb.openReadOnly(f), invertY = if (tms) true else null, nameFallback = title).use { probe(it) }
                        return layerFrom(id, info, LayerFormat.MBTILES, f, title, tms)
                    }
                    SqliteMapKind.GPKG_TILES -> {
                        val f = File(dir, "$id.gpkg"); tmp.renameTo(f)
                        val table = AndroidSqlDb.openReadOnly(f).use { GpkgTileStore.tileTables(it).first() }
                        val info = GpkgTileStore(AndroidSqlDb.openReadOnly(f), table).use { probe(it) }
                        return layerFrom(id, info, LayerFormat.GPKG_TILES, f, title, false, table)
                    }
                    SqliteMapKind.MURA_PROJECT -> { tmp.delete(); throw FormatException("is_project") }
                    SqliteMapKind.GPKG_FEATURES_ONLY -> { tmp.delete(); throw FormatException("gpkg_no_tiles") }
                    SqliteMapKind.UNKNOWN -> { tmp.delete(); throw FormatException("unknown_format") }
                }
            }
            FileKind.ZIP -> {
                val f = File(dir, "$id.zip"); tmp.renameTo(f)
                val scan = try { ZipTileStore.scan(f) } catch (e: FormatException) { f.delete(); throw e }
                val info = ZipTileStore(f, scan, tms, title).use { probe(it) }
                return layerFrom(id, info, LayerFormat.XYZ_ZIP, f, title, tms)
            }
            FileKind.TIFF -> { tmp.delete(); throw FormatException("geotiff_unsupported") }
            FileKind.UNKNOWN -> { tmp.delete(); throw FormatException("unknown_format") }
        }
        @Suppress("UNREACHABLE_CODE")
        throw FormatException("unknown_format")
    }

    /** Құрылымды тексеру: бір тайлды шынымен оқып көру (бүлінген файл тізімге түспейді). */
    private fun probe(s: TileStore): TileSetInfo {
        val i = s.info
        val b = i.bounds ?: throw FormatException("no_bounds")
        val z = i.maxZoom.coerceAtMost(i.minZoom + 2)
        val c = io.github.berikkkk.muragis.core.tiles.TileMath.range(b, i.minZoom)
        val sample = s.tile(i.minZoom, c.minX, c.minY) ?: s.tile(z, io.github.berikkkk.muragis.core.tiles.TileMath.lonToX((b.west + b.east) / 2, z),
            io.github.berikkkk.muragis.core.tiles.TileMath.latToY((b.south + b.north) / 2, z))
        if (sample != null && TileFormat.sniff(sample) == TileFormat.PBF) throw FormatException("vector_unsupported")
        return i
    }

    /** Қалтадағы z/x/y (не SAS.Planet) тайлдарын бір MBTiles файлына жинау. */
    private fun importTree(dir: File, id: String, treeUri: Uri, tms: Boolean): MapLayer {
        val rootId = DocumentsContract.getTreeDocumentId(treeUri)
        val title = rootId.substringAfterLast(':').substringAfterLast('/').ifBlank { "tiles" }
        val f = File(dir, "$id.mbtiles")
        var layout: io.github.berikkkk.muragis.core.tiles.XyzLayout? = null
        var prefix = ""
        var count = 0L
        var firstTile: ByteArray? = null
        val writer = MbtilesWriter(AndroidSqlDb.create(f))
        try {
            val stack = ArrayDeque<Pair<String, String>>()           // (documentId, салыстырмалы жол)
            stack.addLast(rootId to "")
            val pending = ArrayList<Triple<XyzScanner.Parsed, String, Unit>>()
            fun flush() {
                if (pending.isEmpty()) return
                writer.batch {
                    for ((t, docId, _) in pending) {
                        val bytes = cr.openInputStream(DocumentsContract.buildDocumentUriUsingTree(treeUri, docId))?.use { it.readBytes() } ?: continue
                        if (firstTile == null) firstTile = bytes
                        val y = if (tms) io.github.berikkkk.muragis.core.tiles.TileMath.flipY(t.y, t.z) else t.y
                        writer.put(t.z, t.x, y, bytes)
                        count++
                    }
                }
                pending.clear()
                setProgressAsync(workDataOf("count" to count))
            }
            while (stack.isNotEmpty()) {
                if (isStopped) throw FormatException("cancelled")
                val (docId, rel) = stack.removeLast()
                val children = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, docId)
                cr.query(children, arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_MIME_TYPE), null, null, null)?.use { c ->
                    while (c.moveToNext()) {
                        val cid = c.getString(0); val nm = c.getString(1) ?: continue; val mime = c.getString(2)
                        val path = if (rel.isEmpty()) nm else "$rel/$nm"
                        if (mime == DocumentsContract.Document.MIME_TYPE_DIR) { stack.addLast(cid to path); continue }
                        val t = XyzScanner.parse(path) ?: continue
                        if (layout == null) { layout = t.layout; prefix = t.prefix }
                        if (t.layout != layout || t.prefix != prefix) continue
                        pending += Triple(t, cid, Unit)
                        if (pending.size >= 500) flush()
                    }
                }
            }
            flush()
            if (count == 0L) throw FormatException("xyz_no_tiles")
            val fmt = TileFormat.sniff(firstTile)
            writer.setMetadata(mapOf("name" to title, "format" to fmt.ext.ifEmpty { "png" }, "type" to "baselayer",
                "description" to "Imported folder (${layout!!.name.lowercase()})"))
        } catch (e: Exception) {
            writer.close(); f.delete(); throw e
        }
        writer.close()
        val info = MbtilesStore(AndroidSqlDb.openReadOnly(f), nameFallback = title).use { probe(it) }
        // metadata-да minzoom/maxzoom/bounds жоқ — MbtilesStore тайлдардан есептеді; енді жазып қоямыз
        MbtilesWriter(AndroidSqlDb.create(f)).use { w ->
            w.setMetadata(mapOf("minzoom" to info.minZoom.toString(), "maxzoom" to info.maxZoom.toString(), "bounds" to info.bounds!!.encode()))
        }
        return layerFrom(id, info, LayerFormat.MBTILES, f, title, false)
    }
}
