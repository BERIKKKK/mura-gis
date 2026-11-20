package io.github.berikkkk.muragis.mobile.work

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.ForegroundInfo
import io.github.berikkkk.muragis.mobile.R

object Notifications {
    const val CHANNEL = "mura_work"

    fun ensureChannel(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, ctx.getString(R.string.notif_channel), NotificationManager.IMPORTANCE_LOW))
        }
    }

    fun foreground(ctx: Context, id: Int, title: String, percent: Int, indeterminate: Boolean = false): ForegroundInfo {
        ensureChannel(ctx)
        val n = NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(title)
            .setContentText(if (indeterminate) ctx.getString(R.string.notif_working) else "$percent%")
            .setProgress(100, percent, indeterminate)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build()
        return if (Build.VERSION.SDK_INT >= 29) ForegroundInfo(id, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC) else ForegroundInfo(id, n)
    }
}
