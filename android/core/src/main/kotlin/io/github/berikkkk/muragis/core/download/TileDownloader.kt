package io.github.berikkkk.muragis.core.download

import io.github.berikkkk.muragis.core.geo.Bounds
import io.github.berikkkk.muragis.core.sources.SourcePolicy
import io.github.berikkkk.muragis.core.sources.TileSource
import io.github.berikkkk.muragis.core.tiles.TileMath

/** HTTP жауабы: [retryAfterMs] — сервер «кейін қайталаңыз» десе (429/503). */
data class FetchResult(val code: Int, val body: ByteArray?, val retryAfterMs: Long? = null)

fun interface TileFetcher { fun fetch(url: String): FetchResult }

interface TileSink {
    fun has(z: Int, x: Int, y: Int): Boolean
    fun put(z: Int, x: Int, y: Int, data: ByteArray)
    /** Бірнеше жазуды бір транзакцияға біріктіру. */
    fun <T> batch(block: () -> T): T = block()
}

data class Progress(val total: Long, val done: Long, val failed: Long, val bytes: Long) {
    val percent: Int get() = if (total <= 0) 0 else ((done + failed) * 100 / total).toInt().coerceIn(0, 100)
}

enum class StopReason { COMPLETED, PAUSED, CANCELLED, FAILED }

/**
 * Тайлдарды жүктеу. Қайта бастағанда бар тайлдар өткізіліп жіберіледі (жалғастыру). Тоқтату [shouldStop] арқылы:
 * ол true қайтарса, ағымдағы тайл аяқталып, функция PAUSED қайтарады (қай күйге көшу — шақырушының ісі).
 * Сервер шектеулері: сұраныстар арасында [TileSource.policy] minDelayMs, 429/503 — Retry-After бойынша күту,
 * қатарынан көп қате (мыс. 403 — рұқсат жоқ) болса, жүктеу FAILED болып тоқтайды.
 */
class TileDownloader(
    private val source: TileSource,
    private val fetcher: TileFetcher,
    private val sink: TileSink,
    private val sleeper: (Long) -> Unit = { Thread.sleep(it) },
) {
    var lastError: String = ""
        private set

    fun run(bounds: Bounds, minZ: Int, maxZ: Int, shouldStop: () -> Boolean, onProgress: (Progress) -> Unit): StopReason {
        SourcePolicy.checkJob(source, bounds, minZ, maxZ)?.let { lastError = it; return StopReason.FAILED }
        val total = TileMath.count(bounds, minZ, maxZ)
        var done = 0L; var failed = 0L; var bytes = 0L
        var consecutiveErrors = 0
        var lastReport = 0L
        val delay = source.policy.minDelayMs
        for (z in minZ..maxZ) {
            val r = TileMath.range(bounds, z)
            for (x in r.minX..r.maxX) {
                val col = (r.minY..r.maxY).toList()
                // Бір бағанды бір транзакцияда жазамыз (жылдамырақ, бірақ тоқтату сәтінде деректер сақталады)
                var stop: StopReason? = null
                sink.batch {
                    for (y in col) {
                        if (shouldStop()) { stop = StopReason.PAUSED; return@batch }
                        if (sink.has(z, x, y)) { done++; continue }
                        var attempt = 0
                        while (true) {
                            val res = runCatching { fetcher.fetch(source.tileUrl(z, x, y)) }.getOrElse { FetchResult(-1, null) }
                            if (res.code == 200 && res.body != null && res.body.isNotEmpty()) {
                                sink.put(z, x, y, res.body); bytes += res.body.size; done++; consecutiveErrors = 0; break
                            }
                            if (res.code == 404 || res.code == 204) { failed++; consecutiveErrors = 0; break }   // тайл жоқ — қалыпты
                            if ((res.code == 429 || res.code == 503 || res.code == -1 || res.code >= 500) && attempt < 4) {
                                attempt++
                                sleeper(res.retryAfterMs?.coerceIn(1000, 120_000) ?: (1000L shl attempt))
                                if (shouldStop()) { stop = StopReason.PAUSED; return@batch }
                                continue
                            }
                            failed++; consecutiveErrors++
                            lastError = "http_${res.code}"
                            break
                        }
                        if (consecutiveErrors >= 20) { stop = StopReason.FAILED; return@batch }
                        if (delay > 0) sleeper(delay)
                        if (done + failed - lastReport >= 25) { lastReport = done + failed; onProgress(Progress(total, done, failed, bytes)) }
                    }
                }
                onProgress(Progress(total, done, failed, bytes))
                stop?.let { return it }
            }
        }
        onProgress(Progress(total, done, failed, bytes))
        return StopReason.COMPLETED
    }
}
