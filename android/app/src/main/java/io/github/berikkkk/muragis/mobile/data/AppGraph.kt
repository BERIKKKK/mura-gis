package io.github.berikkkk.muragis.mobile.data

import android.content.Context
import android.os.Build
import io.github.berikkkk.muragis.core.db.LayerKind
import io.github.berikkkk.muragis.core.db.LayerFormat
import io.github.berikkkk.muragis.core.db.LayerRole
import io.github.berikkkk.muragis.core.db.LayerStore
import io.github.berikkkk.muragis.core.db.LocalStore
import io.github.berikkkk.muragis.core.db.MapLayer
import io.github.berikkkk.muragis.core.server.LocalTileServer
import io.github.berikkkk.muragis.core.server.TileProvider
import io.github.berikkkk.muragis.core.sources.OfflinePolicy
import io.github.berikkkk.muragis.core.sources.SourcePolicy
import io.github.berikkkk.muragis.core.sources.TileSource
import java.io.File

/**
 * Қосымшаның тәуелділіктері (қарапайым қолмен DI). Модульдер бір-бірінен бөлек:
 * дерекқор (core LocalStore/LayerStore) ← репозиторийлер; карта файлдары (TileRegistry + жергілікті сервер) ← карта;
 * интерфейс тек ViewModel арқылы жұмыс істейді.
 */
class AppGraph(val context: Context) {
    val dbFile: File = context.getDatabasePath("mura.db")
    val mapsDir: File = File(context.filesDir, "maps").apply { mkdirs() }
    val exportsDir: File = File(context.cacheDir, "exports").apply { mkdirs() }
    val settings = Settings(context)

    @Volatile var db: AndroidSqlDb = AndroidSqlDb.openReadWrite(dbFile); private set
    @Volatile var store: LocalStore = LocalStore(db, deviceUser()); private set
    @Volatile var layers: LayerStore = LayerStore(db); private set
    val backups = Backups(File(context.filesDir, "backups"), dbFile)

    @Volatile var tiles: TileRegistry = TileRegistry(layers); private set
    val server: LocalTileServer = LocalTileServer(TileProvider { id, z, x, y -> tiles.tile(id, z, x, y) })

    init {
        seedBuiltInLayers()
    }

    private fun deviceUser() = "android:" + (Build.MODEL ?: "device")

    /** Кіріктірілген онлайн карталарды қабаттар тізіміне бір рет қосу (тек онлайн; офлайн жүктеуге рұқсат жоқ). */
    private fun seedBuiltInLayers() {
        val have = layers.layers().map { it.sourceId }.toSet()
        SourcePolicy.BUILT_IN.forEachIndexed { i, s ->
            if (s.id in have) return@forEachIndexed
            layers.save(MapLayer(
                id = "b-" + s.id, kind = LayerKind.ONLINE, format = LayerFormat.XYZ_URL, title = s.title, sourceId = s.id,
                minZoom = s.minZoom, maxZoom = s.maxZoom, attribution = s.attribution, license = s.terms,
                role = if (s.overlay) LayerRole.OVERLAY else LayerRole.BASE, visible = s.id == "osm", sort = i,
            ))
        }
    }

    /** Онлайн қабаттың дереккөзі (кіріктірілген не пайдаланушы қосқан) және оның лицензиялық саясаты. */
    fun sourceOf(l: MapLayer): TileSource? {
        if (l.kind != LayerKind.ONLINE) return null
        SourcePolicy.BUILT_IN.firstOrNull { it.id == l.sourceId }?.let { return it }
        if (l.url.isBlank()) return null
        return TileSource(
            id = l.id, title = l.title, url = l.url,
            subdomains = if (l.url.contains("{s}")) listOf("a", "b", "c") else emptyList(),
            tms = l.url.contains("{-y}"), minZoom = l.minZoom, maxZoom = l.maxZoom, attribution = l.attribution,
            overlay = l.role == LayerRole.OVERLAY,
            policy = SourcePolicy.forCustom(l.url, l.offlineRight, l.maxZoom), terms = l.license, custom = true,
        )
    }

    fun policyOf(l: MapLayer): OfflinePolicy = sourceOf(l)?.policy ?: OfflinePolicy.denied("not_online")

    /** Сақтық көшірмеден қалпына келтіру: дерекқорды жауып, файлды ауыстырып, қайта ашу. */
    @Synchronized
    fun restoreBackup(f: File) {
        tiles.closeAll()
        db.close()
        backups.restore(f)
        db = AndroidSqlDb.openReadWrite(dbFile)
        store = LocalStore(db, deviceUser())
        layers = LayerStore(db)
        tiles = TileRegistry(layers)
        seedBuiltInLayers()
    }

    fun autoBackupIfDue() {
        val day = 24L * 3600 * 1000
        if (System.currentTimeMillis() - settings.lastBackup < day) return
        if (store.monumentCount() == 0L && store.routes().isEmpty()) return
        runCatching { backups.create(db); settings.lastBackup = System.currentTimeMillis() }
    }
}
