package io.github.berikkkk.muragis.mobile.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import io.github.berikkkk.muragis.core.db.JobState
import io.github.berikkkk.muragis.core.download.FetchResult
import io.github.berikkkk.muragis.core.download.StopReason
import io.github.berikkkk.muragis.core.download.TileDownloader
import io.github.berikkkk.muragis.core.download.TileSink
import io.github.berikkkk.muragis.core.tiles.MbtilesWriter
import io.github.berikkkk.muragis.core.tiles.TileFormat
import io.github.berikkkk.muragis.mobile.BuildConfig
import io.github.berikkkk.muragis.mobile.MuraApp
import io.github.berikkkk.muragis.mobile.data.AndroidSqlDb
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Офлайн картаны жүктеу (WorkManager, алдыңғы қатардағы қызмет — Android-тың фондық шектеулеріне сай).
 * Тайлдар MBTiles файлына жазылады; пауза/болдырмау — жұмысты тоқтату арқылы, жалғастырғанда бар тайлдар қайта жүктелмейді.
 * Тек лицензиясы офлайн сақтауға рұқсат ететін дереккөздер (SourcePolicy) — тексеру TileDownloader ішінде де қайталанады.
 */
class DownloadWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    companion object {
        private const val KEY = "jobId"
        fun uniqueName(jobId: String) = "download-$jobId"

        fun enqueue(ctx: Context, jobId: String) {
            WorkManager.getInstance(ctx).enqueueUniqueWork(uniqueName(jobId), ExistingWorkPolicy.KEEP,
                OneTimeWorkRequestBuilder<DownloadWorker>().setInputData(workDataOf(KEY to jobId)).addTag("download").build())
        }

        fun stop(ctx: Context, jobId: String) = WorkManager.getInstance(ctx).cancelUniqueWork(uniqueName(jobId))
    }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val g = (applicationContext as MuraApp).graph
        val id = inputData.getString(KEY) ?: return@withContext Result.failure()
        var job = g.layers.job(id) ?: return@withContext Result.failure()
        val target = g.layers.layer(job.layerId) ?: return@withContext Result.failure()
        val srcLayer = g.layers.layer(job.sourceId)
        val src = srcLayer?.let { g.sourceOf(it) }
        if (src == null || !src.policy.allowed) {
            g.layers.saveJob(job.copy(state = JobState.FAILED, error = "not_allowed"))
            return@withContext Result.failure()
        }
        job = job.copy(state = JobState.RUNNING, error = "")
        g.layers.saveJob(job)
        val notifId = id.hashCode()
        runCatching { setForeground(Notifications.foreground(applicationContext, notifId, job.title, job.percent)) }

        val file = File(target.path)
        val writer = MbtilesWriter(AndroidSqlDb.create(file))
        var firstTile: ByteArray? = null
        val sink = object : TileSink {
            override fun has(z: Int, x: Int, y: Int) = writer.has(z, x, y)
            override fun put(z: Int, x: Int, y: Int, data: ByteArray) { if (firstTile == null) firstTile = data; writer.put(z, x, y, data) }
            override fun <T> batch(block: () -> T): T = writer.batch(block)
        }
        val ua = "MuraGIS-Android/${BuildConfig.VERSION_NAME} (+https://github.com/BERIKKKK/mura-gis)"
        val fetcher = { url: String ->
            val c = URL(url).openConnection() as HttpURLConnection
            try {
                c.connectTimeout = 15_000; c.readTimeout = 30_000
                c.setRequestProperty("User-Agent", ua)
                val code = c.responseCode
                val retry = c.getHeaderField("Retry-After")?.trim()?.toLongOrNull()?.times(1000)
                FetchResult(code, if (code == 200) c.inputStream.use { it.readBytes() } else null, retry)
            } finally { c.disconnect() }
        }
        var lastSaved = 0L
        val dl = TileDownloader(src, fetcher, sink)
        val reason = try {
            dl.run(job.bounds, job.minZoom, job.maxZoom, { isStopped }) { p ->
                job = job.copy(total = p.total, done = p.done, failed = p.failed, bytes = p.bytes)
                val now = System.currentTimeMillis()
                if (now - lastSaved > 1000) {
                    lastSaved = now
                    g.layers.saveJob(job)
                    setProgressAsync(workDataOf("percent" to p.percent))
                    runCatching { setForegroundAsync(Notifications.foreground(applicationContext, notifId, job.title, p.percent)) }
                }
            }
        } catch (e: Exception) {
            StopReason.FAILED
        }
        val fmt = TileFormat.sniff(firstTile)
        writer.setMetadata(buildMap {
            put("name", target.title); put("type", "baselayer"); put("version", "1")
            put("minzoom", job.minZoom.toString()); put("maxzoom", job.maxZoom.toString()); put("bounds", job.bounds.encode())
            put("attribution", src.attribution); put("description", "Mura GIS Android: ${src.title}")
            if (fmt != TileFormat.UNKNOWN) put("format", fmt.ext)
        })
        writer.close()
        g.layers.layer(target.id)?.let { g.layers.save(it.copy(sizeBytes = file.length(), tileFormat = fmt.ext)) }
        g.tiles.invalidate(target.id)
        // Пауза/болдырмау күйін ViewModel өзі жазады — оны қайта жазбаймыз
        val current = g.layers.job(id)?.state
        val finalState = when (reason) {
            StopReason.COMPLETED -> JobState.COMPLETED
            StopReason.FAILED -> JobState.FAILED
            else -> if (current == JobState.CANCELLED) JobState.CANCELLED else JobState.PAUSED
        }
        if (current != JobState.CANCELLED) g.layers.saveJob(job.copy(state = finalState, error = if (finalState == JobState.FAILED) dl.lastError else ""))
        if (finalState == JobState.FAILED) Result.failure() else Result.success()
    }
}
