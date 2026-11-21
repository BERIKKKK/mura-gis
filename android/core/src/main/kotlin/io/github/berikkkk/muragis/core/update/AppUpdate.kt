package io.github.berikkkk.muragis.core.update

import io.github.berikkkk.muragis.core.io.arr
import io.github.berikkkk.muragis.core.io.num
import io.github.berikkkk.muragis.core.io.obj
import io.github.berikkkk.muragis.core.io.parseJson
import io.github.berikkkk.muragis.core.io.str
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

/**
 * Android нұсқасының жаңартуын GitHub релиздерінен іздеу. Android релиздерінің тегі — `android/v<нұсқа>`
 * (жұмыс үстелінің `v*` релиздерінен бөлек). Нұсқалар versionCode бойынша салыстырылады
 * (android/version.properties ережесі: MAJOR*10000 + MINOR*100 + PATCH, алдын ала нұсқалар — сол санның алдында).
 */
object AppUpdate {
    const val REPO = "BERIKKKK/mura-gis"
    const val RELEASES_API = "https://api.github.com/repos/$REPO/releases?per_page=30"
    const val REPO_URL = "https://github.com/$REPO"
    const val TAG_PREFIX = "android/v"

    data class Release(val version: String, val code: Int, val pageUrl: String, val apkUrl: String?, val apkSize: Long, val prerelease: Boolean)

    private val VERSION = Regex("""^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$""")

    /** «2.0.0-alpha.1» → 19901, «1.0.0» → 10000; танылмаса — null. */
    fun versionCode(name: String): Int? {
        val m = VERSION.matchEntire(name.trim()) ?: return null
        val (ma, mi, pa, pre, n) = m.destructured
        val base = ma.toInt() * 10000 + mi.toInt() * 100 + pa.toInt()
        val k = n.toIntOrNull() ?: 0
        return when (pre) { "alpha" -> base - 100 + k; "beta" -> base - 50 + k; "rc" -> base - 10 + k; else -> base }
    }

    /** GitHub API жауабынан ең жаңа Android релизі (жоба мен APK-сы бар, draft емес). */
    fun latest(json: String): Release? =
        runCatching { parseJson(json) }.getOrNull().arr()?.mapNotNull { e ->
            val o = e.obj() ?: return@mapNotNull null
            if ((o["draft"] as? JsonPrimitive)?.booleanOrNull == true) return@mapNotNull null
            val tag = o.str("tag_name") ?: return@mapNotNull null
            if (!tag.startsWith(TAG_PREFIX)) return@mapNotNull null
            val version = tag.removePrefix(TAG_PREFIX)
            val code = versionCode(version) ?: return@mapNotNull null
            val apk = o["assets"].arr()?.mapNotNull { it.obj() }?.firstOrNull { (it.str("name") ?: "").endsWith(".apk") }
            Release(version, code, o.str("html_url") ?: "$REPO_URL/releases", apk?.str("browser_download_url"),
                apk?.get("size")?.num()?.toLong() ?: 0L, (o["prerelease"] as? JsonPrimitive)?.booleanOrNull == true)
        }?.maxByOrNull { it.code }

    /** Орнатылғаннан жаңасы болса — сол релиз. */
    fun newer(json: String, currentCode: Int): Release? = latest(json)?.takeIf { it.code > currentCode }
}
