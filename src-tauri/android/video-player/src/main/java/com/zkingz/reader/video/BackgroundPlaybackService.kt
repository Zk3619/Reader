package com.zkingz.reader.video

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * 听视频 / 后台保活最小集（对齐小喵 BackgroundPlaybackService）。
 */
class BackgroundPlaybackService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Reader 听视频"
    ensureChannel()
    val open = PendingIntent.getActivity(
      this,
      0,
      Intent(this, VideoPlayerActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val n: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText("后台播放中")
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setContentIntent(open)
      .setOngoing(true)
      .build()
    startForeground(NOTIF_ID, n)
    return START_STICKY
  }

  override fun onDestroy() {
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val mgr = getSystemService(NotificationManager::class.java) ?: return
    mgr.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "听视频", NotificationManager.IMPORTANCE_LOW),
    )
  }

  companion object {
    const val CHANNEL_ID = "reader_video_bg"
    const val NOTIF_ID = 71001
    const val EXTRA_TITLE = "title"
  }
}
