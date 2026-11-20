package io.github.berikkkk.muragis.mobile.work

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import io.github.berikkkk.muragis.core.db.DownloadJob
import io.github.berikkkk.muragis.core.db.JobState
import io.github.berikkkk.muragis.core.db.LayerFormat
import io.github.berikkkk.muragis.core.db.LayerKind
import io.github.berikkkk.muragis.core.db.LayerRole
import io.github.berikkkk.muragis.core.db.MapLayer
import io.github.berikkkk.muragis.core.packages.Catalog
import io.github.berikkkk.muragis.core.packages.CatalogPackage
import io.github.berikkkk.muragis.core.packages.MapPackage
import io.github.berikkkk.muragis.core.tiles.MbtilesStore
import io.github.berikkkk.muragis.core.tiles.TileMath
import io.github.berikkkk.muragis.mobile.BuildConfig
import io.github.berikkkk.muragis.mobile.MuraApp
import io.github.berikkkk.muragis.mobile.data.AndroidSqlDb
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

/**
 * Каталогтағы дайын офлайн карта пакетін жүктеу (бір MBTiles файлы). Файл алдымен `<id>.mbtiles.part` болып жазылады:
 *  - байланыс үзілсе — жұмыс «желі күтілуде» күйінде қайталанады (WorkManager: желі шарты), жалғастырғанда HTTP Range
 *    арқылы түскен жерінен әрі қарай жүктеледі;
 *  - толық түскен соң көлемі, SHA‑256 және файлдың ашылатыны (MBTiles, тайл, векторлық болса — стиль) тексеріледі;
 *  - тек содан кейін қабат ретінде тіркеліп, «Жүктелді» күйін алады.
 */
class PackageDownloadWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    companion object {
        private const val KEY = "jobId"
        const val TAG = "download"
        fun uniqueName(jobId: String) = "pkg-$jobId"

        fun enqueue(ctx: Context, jobId: String) {
            val req = OneTimeWorkRequestBuilder<PackageDownloadWorker>()
                .setInputData(workDataOf(KEY to jobId)).addTag(TAG)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.LINEAR, 15, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(ctx).enqueueUniqueWork(uniqueName(jobId), ExistingWorkPolicy.REPLACE, req)
        }

        fun stop(ctx: Context, jobId: String) = WorkManager.getInstance(ctx).cancelUniqueWork(uniqueName(jobId))

        fun partFile(mapsDir: File, job: DownloadJob) = File(mapsDir, job.layerId + ".mbtiles.part")
        fun finalFile(mapsDir: File, job: DownloadJob) = File(mapsDir, job.layerId + ".mbtiles")

        /** Жүктелген файлды тексеру: null — бәрі дұрыс, әйтпесе қате коды. */
        fun verify(f: File, p: CatalogPackage): String? {
            if (p.size > 0 && f.length() != p.size) return "verify_size"
            if (p.sha256.isNotBlank() && sha256(f) != p.sha256) return "verify_sha"
            return try {
                val db = AndroidSqlDb.openReadOnly(f)
                db.use {
                    val store = MbtilesStore(it, nameFallback = p.id)
                    if (p.format == "vector" && !MapPackage.hasStyle(it)) return "verify_style"
                    // Қамту аумағының ортасындағы тайл оқылуы керек
                    val z = store.info.minZoom.coerceAtLeast(p.minZoom)
                    val lat = (p.bounds.south + p.bounds.north) / 2; val lon = (p.bounds.west + p.bounds.east) / 2
                    if (store.tile(z, TileMath.lonToX(lon, z), TileMath.latToY(lat, z)) == null) return "verify_tiles"
                    null
                }
            } catch (e: Exception) { "verify_open" }
        }

        fun sha256(f: File): String {
            val md = MessageDigest.getInstance("SHA-256")
            f.inputStream().use { i -> val buf = ByteArray(1 shl 16); while (true) { val n = i.read(buf); if (n < 0) break; md.update(buf, 0, n) } }
            return md.digest().joinToString("") { "%02x".format(it) }
        }
    }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val g = (applicationContext as MuraApp).graph
        val id = inputData.getString(KEY) ?: return@withContext Result.failure()
        var job = g.layers.job(id) ?: return@withContext Result.failure()
        val pkg = Catalog.packageIdOf(job.sourceId)?.let { g.catalog.pkg(it) }
        if (pkg == null) { g.layers.saveJob(job.copy(state = JobState.FAILED, error = "no_package")); return@withContext Result.failure() }
        if (job.state == JobState.PAUSED || job.state == JobState.CANCELLED) return@withContext Result.success()
        val part = partFile(g.mapsDir, job)
        val dest = finalFile(g.mapsDir, job)
        job = job.copy(state = JobState.RUNNING, error = "", total = pkg.size, done = part.length(), bytes = part.length())
        g.layers.saveJob(job)
        val notifId = id.hashCode()
        runCatching { setForeground(Notifications.foreground(applicationContext, notifId, job.title, job.percent)) }

        try {
            download(pkg, part) { bytes ->
                job = job.copy(done = bytes, bytes = bytes)
                g.layers.saveJob(job)
                setProgressAsync(workDataOf("percent" to job.percent))
                runCatching { setForegroundAsync(Notifications.foreground(applicationContext, notifId, job.title, job.percent)) }
            }
        } catch (e: HttpStatusException) {
            // Сервер файлды бермейді (мыс. 404) — қайталаудың мәні жоқ, пайдаланушыға қате көрсетіледі
            g.layers.saveJob(job.copy(state = JobState.FAILED, error = "http_" + e.code, done = part.length(), bytes = part.length()))
            return@withContext Result.failure()
        } catch (e: IOException) {
            if (isStopped) return@withContext Result.success()
            // Байланыс үзілді: желі қайта пайда болғанда жалғасады (түскен бөлігі сақталады)
            g.layers.job(id)?.takeIf { it.state == JobState.RUNNING }?.let { g.layers.saveJob(it.copy(state = JobState.QUEUED, error = "network", done = part.length(), bytes = part.length())) }
            return@withContext Result.retry()
        }
        if (isStopped) return@withContext Result.success()   // пауза/болдырмау — күйді ViewModel жазды

        verify(part, pkg)?.let { err ->
            part.delete()
            g.layers.saveJob(job.copy(state = JobState.FAILED, error = err, done = 0, bytes = 0))
            return@withContext Result.failure()
        }
        dest.delete()
        if (!part.renameTo(dest)) { g.layers.saveJob(job.copy(state = JobState.FAILED, error = "io")); return@withContext Result.failure() }
        g.layers.save(MapLayer(
            id = job.layerId, kind = LayerKind.DOWNLOADED, format = LayerFormat.MBTILES, title = pkg.title.kk.ifBlank { pkg.id },
            path = dest.path, sourceId = Catalog.sourceIdOf(pkg), minZoom = pkg.minZoom, maxZoom = pkg.maxZoom, bounds = pkg.bounds,
            attribution = pkg.attribution, license = pkg.license, tileFormat = if (pkg.format == "vector") "pbf" else "jpg",
            role = LayerRole.BASE, sort = 100, sizeBytes = dest.length(),
        ))
        g.tiles.invalidate(job.layerId)
        g.layers.saveJob(job.copy(state = JobState.COMPLETED, done = pkg.size, bytes = pkg.size, error = ""))
        Result.success()
    }

    /** HTTP Range арқылы жалғастыра жүктеу. Тоқтатылса ([isStopped]) — қайтады, түскен бөлігі файлда қалады. */
    private fun download(p: CatalogPackage, part: File, onProgress: (Long) -> Unit) {
        var have = part.length()
        if (p.size > 0 && have > p.size) { part.delete(); have = 0 }
        if (p.size > 0 && have == p.size) return
        val c = URL(p.url).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 20_000; c.readTimeout = 30_000
            c.instanceFollowRedirects = true
            c.setRequestProperty("User-Agent", "MuraGIS-Android/${BuildConfig.VERSION_NAME}")
            if (have > 0) c.setRequestProperty("Range", "bytes=$have-")
            val code = c.responseCode
            val append = when (code) {
                206 -> true
                200 -> false            // сервер Range-ті елемеді — басынан
                416 -> return           // бәрі түскен
                429, in 500..599 -> throw IOException("HTTP $code")   // уақытша — қайталанады
                else -> throw HttpStatusException(code)
            }
            if (!append) have = 0
            var last = 0L
            c.inputStream.use { inp ->
                FileOutputStream(part, append).use { out ->
                    val buf = ByteArray(1 shl 16)
                    while (true) {
                        if (isStopped) return
                        val n = inp.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        have += n
                        val now = System.currentTimeMillis()
                        if (now - last > 700) { last = now; out.flush(); onProgress(have) }
                    }
                }
            }
            onProgress(have)
            if (p.size > 0 && have < p.size) throw IOException("Incomplete $have / ${p.size}")
        } finally { c.disconnect() }
    }
}

/** Қайталанбайтын HTTP жауабы (4xx). */
class HttpStatusException(val code: Int) : Exception("HTTP $code")
