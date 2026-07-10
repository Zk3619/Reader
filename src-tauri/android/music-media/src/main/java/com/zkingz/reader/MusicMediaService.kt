package com.zkingz.reader

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * 音乐播放前台服务：通知栏 play/pause/next/prev
 */
class MusicMediaService : Service() {

  companion object {
    const val CHANNEL_ID = "reader_music_playback"
    const val NOTIFICATION_ID = 0x4D55
    const val ACTION_PLAY = "com.zkingz.reader.music.PLAY"
    const val ACTION_PAUSE = "com.zkingz.reader.music.PAUSE"
    const val ACTION_NEXT = "com.zkingz.reader.music.NEXT"
    const val ACTION_PREV = "com.zkingz.reader.music.PREV"
    const val EXTRA_TITLE = "title"
    const val EXTRA_ARTIST = "artist"
    const val EXTRA_PLAYING = "playing"
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    ensureChannel()
    when (intent?.action) {
      ACTION_PLAY -> MusicMediaBridge.emitAction("play")
      ACTION_PAUSE -> MusicMediaBridge.emitAction("pause")
      ACTION_NEXT -> MusicMediaBridge.emitAction("next")
      ACTION_PREV -> MusicMediaBridge.emitAction("prev")
      else -> {
        val title = intent?.getStringExtra(EXTRA_TITLE) ?: "音乐"
        val artist = intent?.getStringExtra(EXTRA_ARTIST) ?: ""
        val playing = intent?.getBooleanExtra(EXTRA_PLAYING, false) ?: false
        startForeground(NOTIFICATION_ID, buildNotification(title, artist, playing))
      }
    }
    return START_STICKY
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = NotificationChannel(
      CHANNEL_ID,
      "音乐播放",
      NotificationManager.IMPORTANCE_LOW,
    )
    mgr.createNotificationChannel(channel)
  }

  private fun pending(action: String): PendingIntent {
    val intent = Intent(this, MusicMediaService::class.java).apply { this.action = action }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    return PendingIntent.getService(this, action.hashCode(), intent, flags)
  }

  private fun buildNotification(title: String, artist: String, playing: Boolean): Notification {
    val playPauseAction = if (playing) ACTION_PAUSE else ACTION_PLAY
    val playPauseLabel = if (playing) "暂停" else "播放"
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(artist)
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setOngoing(playing)
      .addAction(android.R.drawable.ic_media_previous, "上一首", pending(ACTION_PREV))
      .addAction(
        if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
        playPauseLabel,
        pending(playPauseAction),
      )
      .addAction(android.R.drawable.ic_media_next, "下一首", pending(ACTION_NEXT))
      .build()
  }
}

/** 由 MusicMediaPlugin 注入，将通知操作回传 Tauri */
object MusicMediaBridge {
  var actionHandler: ((String) -> Unit)? = null
  fun emitAction(action: String) {
    actionHandler?.invoke(action)
  }
}
