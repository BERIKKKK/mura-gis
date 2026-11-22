package io.github.berikkkk.muragis.mobile

import android.app.Application
import io.github.berikkkk.muragis.mobile.data.AppGraph
import org.maplibre.android.MapLibre
import kotlin.concurrent.thread

class MuraApp : Application() {
    lateinit var graph: AppGraph
        private set

    override fun onCreate() {
        super.onCreate()
        MapLibre.getInstance(this)
        graph = AppGraph(this)
        graph.sync.start()
        thread(name = "mura-backup", isDaemon = true) { graph.autoBackupIfDue() }
    }
}
