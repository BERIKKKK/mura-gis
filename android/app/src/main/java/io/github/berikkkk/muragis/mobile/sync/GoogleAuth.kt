package io.github.berikkkk.muragis.mobile.sync

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.google.android.gms.auth.GoogleAuthUtil
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope
import com.google.android.gms.tasks.Tasks
import io.github.berikkkk.muragis.core.sync.SyncException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeUnit

/**
 * Google аккаунтымен кіру (Android): Google Play қызметтерінің AuthorizationClient-і, рұқсат — тек drive.appdata.
 * Mura GIS үшін бөлек тіркелу жоқ: құрылғыдағы Google аккаунты таңдалады. Токендерді Google Play қызметтері құрылғының
 * қорғалған қоймасында өзі сақтайды және жаңартады; қолданба кіру токенін тек жадта ұстайды. Mura GIS серверіне ештеңе жіберілмейді.
 * OAuth клиенті — Google Cloud жобасындағы «Android» түрлі клиент (пакет атауы + қолтаңба SHA-1), жұмыс үстелінің «Desktop app»
 * клиентімен БІР жобада: сонда екеуі де бір appDataFolder-ді көреді (docs/SYNC.md).
 */
class GoogleAuth(private val ctx: Context) {
    private val client get() = Identity.getAuthorizationClient(ctx)
    private val request = AuthorizationRequest.builder().setRequestedScopes(listOf(Scope(SCOPE))).build()
    @Volatile private var access: String? = null

    /** Кіру нәтижесі: токен не пайдаланушыға көрсетілетін рұқсат терезесі. */
    sealed class Step {
        data class Granted(val token: String) : Step()
        data class NeedsUser(val intent: PendingIntent) : Step()
    }

    private fun <T> await(t: com.google.android.gms.tasks.Task<T>): T = try { Tasks.await(t, 60, TimeUnit.SECONDS) }
        catch (e: ExecutionException) { throw mapError(e.cause ?: e) }
        catch (e: Exception) { throw mapError(e) }

    private fun mapError(e: Throwable): SyncException =
        if (e is java.io.IOException || e.message?.contains("network", true) == true) SyncException("offline", e.message ?: "offline")
        else SyncException("auth", e.message ?: "auth")

    /** Рұқсат сұрау (фон ағынында). Бұрын берілген болса — терезесіз токен қайтады. */
    fun authorize(): Step {
        val r = await(client.authorize(request))
        return result(r)
    }

    private fun result(r: AuthorizationResult): Step {
        val pi = r.pendingIntent
        if (r.hasResolution() && pi != null) return Step.NeedsUser(pi)
        val t = r.accessToken ?: throw SyncException("auth", "no token")
        access = t
        return Step.Granted(t)
    }

    /** Рұқсат терезесінен оралған нәтиже. */
    fun fromIntent(data: Intent?): Step = try { result(client.getAuthorizationResultFromIntent(data)) } catch (e: Exception) { throw SyncException("denied", e.message ?: "denied") }

    /** Жарамды кіру токені: терезе керек болса — «auth» қатесі (пайдаланушы «Баптаулар → Синхрондау»-да қайта кіреді). */
    fun token(force: Boolean): String {
        val old = access
        if (!force && old != null) return old
        if (force && old != null) runCatching { GoogleAuthUtil.clearToken(ctx, old) }
        access = null
        return when (val s = authorize()) {
            is Step.Granted -> s.token
            is Step.NeedsUser -> throw SyncException("auth", "consent required")
        }
    }

    /** Шығу: Google-дағы рұқсатты қайтару (желі болса) және жадтағы токенді өшіру. Құрылғыдағы деректерге тимейді. */
    fun signOut() {
        val t = access ?: runCatching { (authorize() as? Step.Granted)?.token }.getOrNull()
        access = null
        if (t == null) return
        runCatching {
            val c = URL("https://oauth2.googleapis.com/revoke").openConnection() as HttpURLConnection
            c.requestMethod = "POST"; c.doOutput = true; c.connectTimeout = 15_000; c.readTimeout = 15_000
            c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
            c.outputStream.use { it.write(("token=" + java.net.URLEncoder.encode(t, "UTF-8")).toByteArray()) }
            c.responseCode; c.disconnect()
        }
        runCatching { GoogleAuthUtil.clearToken(ctx, t) }
    }

    companion object { const val SCOPE = "https://www.googleapis.com/auth/drive.appdata" }
}
