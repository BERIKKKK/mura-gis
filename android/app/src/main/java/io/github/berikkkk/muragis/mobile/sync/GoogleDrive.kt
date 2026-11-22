package io.github.berikkkk.muragis.mobile.sync

import io.github.berikkkk.muragis.core.sync.CloudFile
import io.github.berikkkk.muragis.core.sync.CloudStore
import io.github.berikkkk.muragis.core.sync.SyncException
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Google Drive — синхрондаудың бірінші сақтау модулі (Drive API v3, тікелей HTTPS, Mura GIS серверінсіз).
 * Тек қолданбаның жасырын аумағы (appDataFolder, рұқсат — drive.appdata). Жұмыс үстеліндегі main/sync/gdrive.js-пен бірдей:
 * файл атаулары, қате кодтары (offline, auth, quota, rate, server). OneDrive/Dropbox модульдері де [CloudStore]-ды іске асырады.
 * [token] — жарамды кіру токені (force = true: ескісі қабылданбады, жаңасын алу).
 */
class GoogleDrive(private val token: (force: Boolean) -> String) : CloudStore {
    private val api = "https://www.googleapis.com/drive/v3"
    private val upload = "https://www.googleapis.com/upload/drive/v3"
    @Volatile private var ids: Map<String, String> = emptyMap()
    @Volatile private var dups: List<CloudFile> = emptyList()

    data class Account(val id: String, val email: String, val name: String, val free: Long?)

    private class Resp(val code: Int, val body: String)

    private fun req(url: String, method: String = "GET", type: String? = null, body: ByteArray? = null, retry: Boolean = true): String {
        val r = try {
            val c = URL(url).openConnection() as HttpURLConnection
            c.connectTimeout = 20_000; c.readTimeout = 60_000
            // HttpURLConnection PATCH-ты білмейді: Google API-лері X-HTTP-Method-Override қабылдайды
            if (method == "PATCH") { c.requestMethod = "POST"; c.setRequestProperty("X-HTTP-Method-Override", "PATCH") } else c.requestMethod = method
            c.setRequestProperty("Authorization", "Bearer " + token(false))
            if (body != null) { c.doOutput = true; c.setRequestProperty("Content-Type", type ?: "application/json; charset=utf-8"); c.outputStream.use { it.write(body) } }
            val code = c.responseCode
            val text = (if (code in 200..299) c.inputStream else c.errorStream)?.use { it.readBytes().toString(Charsets.UTF_8) } ?: ""
            c.disconnect()
            Resp(code, text)
        } catch (e: SyncException) { throw e } catch (e: IOException) { throw SyncException("offline", e.message ?: "offline") }
        if (r.code == 401 && retry) { token(true); return req(url, method, type, body, false) }
        if (r.code in 200..299) return r.body
        val err = runCatching { JSONObject(r.body).optJSONObject("error") }.getOrNull()
        val reasons = err?.optJSONArray("errors")?.let { a -> (0 until a.length()).map { a.optJSONObject(it)?.optString("reason") ?: "" } } ?: emptyList()
        val msg = err?.optString("message")?.ifEmpty { null } ?: "HTTP ${r.code}"
        throw when {
            r.code == 401 -> SyncException("auth", msg)
            r.code == 403 && reasons.any { it.contains("storageQuotaExceeded") || it.contains("quotaExceeded") } -> SyncException("quota", msg)
            r.code == 429 || (r.code == 403 && reasons.any { it.contains("ateLimitExceeded") }) -> SyncException("rate", msg)
            r.code == 403 -> SyncException("auth", msg)
            r.code >= 500 -> SyncException("server", msg)
            else -> SyncException("http", msg)
        }
    }

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    override fun list(): List<CloudFile> {
        val out = ArrayList<CloudFile>()
        var page = ""
        do {
            val q = "spaces=appDataFolder&pageSize=1000&orderBy=" + enc("modifiedTime desc") +
                "&fields=" + enc("nextPageToken,files(id,name,version,modifiedTime,size)") + (if (page.isNotEmpty()) "&pageToken=" + enc(page) else "")
            val j = JSONObject(req("$api/files?$q"))
            val a = j.optJSONArray("files")
            if (a != null) for (i in 0 until a.length()) {
                val f = a.getJSONObject(i)
                out += CloudFile(f.optString("name"), f.optString("version").ifEmpty { f.optString("modifiedTime") }, f.optString("id"), f.optString("size").toLongOrNull() ?: 0L)
            }
            page = j.optString("nextPageToken", "")
        } while (page.isNotEmpty())
        // Бір атаулы бірнеше файл болса (жасау кезінде желі үзілген) — ең соңғысы
        val seen = HashSet<String>(); val uniq = ArrayList<CloudFile>()
        for (f in out) if (seen.add(f.name)) uniq += f
        ids = uniq.associate { it.name to it.id }
        dups = out.filter { it !in uniq }
        return uniq
    }

    override fun read(f: CloudFile): String {
        val id = f.id.ifEmpty { ids[f.name] ?: throw SyncException("http", "not found") }
        return req("$api/files/${enc(id)}?alt=media")
    }

    override fun write(name: String, text: String): CloudFile {
        val id = ids[name]
        val j = if (id != null) {
            JSONObject(req("$upload/files/${enc(id)}?uploadType=media&fields=id,name,version", "PATCH", "application/json; charset=utf-8", text.toByteArray()))
        } else {
            val b = "mura" + java.lang.Long.toHexString(System.nanoTime())
            val meta = JSONObject().put("name", name).put("parents", org.json.JSONArray().put("appDataFolder")).put("mimeType", "application/json")
            val body = "--$b\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n$meta\r\n--$b\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n$text\r\n--$b--"
            JSONObject(req("$upload/files?uploadType=multipart&fields=id,name,version", "POST", "multipart/related; boundary=$b", body.toByteArray())).also {
                ids = ids + (name to it.optString("id"))
            }
        }
        for (d in dups.filter { it.name == name }) runCatching { req("$api/files/${enc(d.id)}", "DELETE") }
        return CloudFile(name, j.optString("version"), j.optString("id"))
    }

    /** Аккаунт: тұрақты id (permissionId), e-mail, аты, бос орын (байт; шексіз — null). */
    fun account(): Account {
        val j = JSONObject(req("$api/about?fields=" + enc("user(displayName,emailAddress,permissionId),storageQuota(limit,usage)")))
        val u = j.optJSONObject("user") ?: JSONObject(); val q = j.optJSONObject("storageQuota") ?: JSONObject()
        val limit = q.optString("limit").toLongOrNull()
        return Account(u.optString("permissionId").ifEmpty { u.optString("emailAddress") }, u.optString("emailAddress"), u.optString("displayName"),
            limit?.let { maxOf(0L, it - (q.optString("usage").toLongOrNull() ?: 0L)) })
    }
}
