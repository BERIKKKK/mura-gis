package io.github.berikkkk.muragis.mobile.work

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import io.github.berikkkk.muragis.mobile.MuraApp
import io.github.berikkkk.muragis.mobile.R
import io.github.berikkkk.muragis.mobile.ui.MainActivity

/**
 * Жолды жазу: алдыңғы қатардағы қызмет (location түрі). Экран өшсе не қосымша фонға кетсе де GPS нүктелері
 * TrackRecorder-ге түсе береді. Жазу тоқтағанда не кідіртілгенде қызмет тоқтатылады.
 */
class TrackService : Service() {
    private var lm: LocationManager? = null
    private val listener = LocationListener { loc -> (application as MuraApp).graph.recorder.add(loc) }
    /** Экран өшкенде процессор ұйықтап, GPS нүктелері жоғалмауы үшін (тек жазу кезінде). */
    private var wake: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    @SuppressLint("MissingPermission")
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Жүйе қызметті қайта іске қосты (START_STICKY), бірақ жазу енді жүрмейді — тоқтаймыз
        if ((application as MuraApp).graph.recorder.state.value?.running != true) { stopSelf(); return START_NOT_STICKY }
        ensureChannel(this)
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle(getString(R.string.rec_notif_title))
            .setContentText(getString(R.string.rec_notif_text))
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build()
        val type = if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0
        try {
            ServiceCompat.startForeground(this, NOTIF_ID, n, type)
            if (lm == null) {
                val m = getSystemService(LocationManager::class.java)
                m.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, listener, Looper.getMainLooper())
                lm = m
            }
            if (wake == null) wake = getSystemService(PowerManager::class.java)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MuraGIS:track").apply { setReferenceCounted(false); acquire(12 * 60 * 60 * 1000L) }
        } catch (e: Exception) {
            // Рұқсат жоқ не GPS қолжетімсіз — жазу кідіртіледі (интерфейс мұны көрсетеді)
            (application as MuraApp).graph.recorder.pause()
            stopSelf()
        }
        // Жүйе процесті жауып тастаса — қызмет қайта іске қосылып, жазу жалғасады
        return START_STICKY
    }

    override fun onDestroy() {
        runCatching { lm?.removeUpdates(listener) }
        lm = null
        runCatching { wake?.release() }
        wake = null
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL = "mura_track"
        private const val NOTIF_ID = 4201

        private fun ensureChannel(ctx: Context) {
            val nm = ctx.getSystemService(NotificationManager::class.java)
            if (nm.getNotificationChannel(CHANNEL) == null) {
                nm.createNotificationChannel(NotificationChannel(CHANNEL, ctx.getString(R.string.rec_notif_channel), NotificationManager.IMPORTANCE_LOW))
            }
        }

        fun start(ctx: Context) = ContextCompat.startForegroundService(ctx, Intent(ctx, TrackService::class.java))
        fun stop(ctx: Context) { ctx.stopService(Intent(ctx, TrackService::class.java)) }
    }
}
