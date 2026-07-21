package com.zkingz.reader

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.IBinder
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.media.app.NotificationCompat.MediaStyle
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * 音乐播放前台服务：MediaSessionCompat（含拖拽 seek）+ MediaStyle 通知
 */
class MusicMediaService : Service() {

  companion object {
    const val CHANNEL_ID = "reader_music_playback"
    const val NOTIFICATION_ID = 0x4D55
    const val ACTION_PLAY = "com.zkingz.reader.music.PLAY"
    const val ACTION_PAUSE = "com.zkingz.reader.music.PAUSE"
    const val ACTION_NEXT = "com.zkingz.reader.music.NEXT"
    const val ACTION_PREV = "com.zkingz.reader.music.PREV"
    const val ACTION_SEEK_FORWARD = "com.zkingz.reader.music.SEEK_FORWARD"
    const val ACTION_SEEK_BACK = "com.zkingz.reader.music.SEEK_BACK"
    const val EXTRA_TITLE = "title"
    const val EXTRA_ARTIST = "artist"
    const val EXTRA_PLAYING = "playing"
    const val EXTRA_COVER_URL = "coverUrl"
    const val EXTRA_POSITION_SEC = "positionSec"
    const val EXTRA_DURATION_SEC = "durationSec"

    private val coverExecutor = Executors.newSingleThreadExecutor()
    @Volatile private var cachedCoverUrl: String? = null
    @Volatile private var cachedCoverBitmap: Bitmap? = null
  }

  private var mediaSession: MediaSessionCompat? = null
  private var lastTitle: String = "音乐"
  private var lastArtist: String = ""
  private var lastPlaying: Boolean = false
  private var lastPositionMs: Long = 0L
  private var lastDurationMs: Long = 0L

  override fun onCreate() {
    super.onCreate()
    mediaSession = MediaSessionCompat(this, "ReaderMusic").apply {
      setFlags(
        MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
          MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS,
      )
      setCallback(object : MediaSessionCompat.Callback() {
        override fun onPlay() = MusicMediaBridge.emitAction("play")
        override fun onPause() = MusicMediaBridge.emitAction("pause")
        override fun onSkipToNext() = MusicMediaBridge.emitAction("next")
        override fun onSkipToPrevious() = MusicMediaBridge.emitAction("prev")
        override fun onFastForward() = MusicMediaBridge.emitAction("seek_forward")
        override fun onRewind() = MusicMediaBridge.emitAction("seek_back")
        override fun onSeekTo(pos: Long) {
          val sec = (pos.coerceAtLeast(0L) / 1000.0)
          MusicMediaBridge.emitAction("seek", sec)
        }
      })
      isActive = true
    }
  }

  override fun onDestroy() {
    mediaSession?.run {
      isActive = false
      release()
    }
    mediaSession = null
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    ensureChannel()
    when (intent?.action) {
      ACTION_PLAY -> MusicMediaBridge.emitAction("play")
      ACTION_PAUSE -> MusicMediaBridge.emitAction("pause")
      ACTION_NEXT -> MusicMediaBridge.emitAction("next")
      ACTION_PREV -> MusicMediaBridge.emitAction("prev")
      ACTION_SEEK_FORWARD -> MusicMediaBridge.emitAction("seek_forward")
      ACTION_SEEK_BACK -> MusicMediaBridge.emitAction("seek_back")
      else -> {
        val title = intent?.getStringExtra(EXTRA_TITLE) ?: "音乐"
        val artist = intent?.getStringExtra(EXTRA_ARTIST) ?: ""
        val playing = intent?.getBooleanExtra(EXTRA_PLAYING, false) ?: false
        val coverUrl = intent?.getStringExtra(EXTRA_COVER_URL)?.trim().orEmpty()
        val positionSec = intent?.getDoubleExtra(EXTRA_POSITION_SEC, 0.0) ?: 0.0
        val durationSec = intent?.getDoubleExtra(EXTRA_DURATION_SEC, 0.0) ?: 0.0
        lastTitle = title
        lastArtist = artist
        lastPlaying = playing
        lastPositionMs = (positionSec.coerceAtLeast(0.0) * 1000).toLong()
        lastDurationMs = (durationSec.coerceAtLeast(0.0) * 1000).toLong()
        updateSessionMetadata(cachedCoverBitmap)
        updatePlaybackState()
        startForeground(
          NOTIFICATION_ID,
          buildNotification(title, artist, playing, cachedCoverBitmap),
        )
        if (coverUrl.isNotEmpty() && coverUrl != cachedCoverUrl) {
          preloadCover(coverUrl, title, artist, playing)
        }
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

  private fun playbackActions(): Long {
    return PlaybackStateCompat.ACTION_PLAY or
      PlaybackStateCompat.ACTION_PAUSE or
      PlaybackStateCompat.ACTION_PLAY_PAUSE or
      PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
      PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
      PlaybackStateCompat.ACTION_SEEK_TO or
      PlaybackStateCompat.ACTION_FAST_FORWARD or
      PlaybackStateCompat.ACTION_REWIND
  }

  private fun updatePlaybackState() {
    val state = if (lastPlaying) {
      PlaybackStateCompat.STATE_PLAYING
    } else {
      PlaybackStateCompat.STATE_PAUSED
    }
    mediaSession?.setPlaybackState(
      PlaybackStateCompat.Builder()
        .setActions(playbackActions())
        .setState(state, lastPositionMs, if (lastPlaying) 1f else 0f)
        .build(),
    )
  }

  private fun updateSessionMetadata(cover: Bitmap?) {
    val builder = MediaMetadataCompat.Builder()
      .putString(MediaMetadataCompat.METADATA_KEY_TITLE, lastTitle)
      .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, lastArtist)
      .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, lastDurationMs)
    if (cover != null) {
      builder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, cover)
    }
    mediaSession?.setMetadata(builder.build())
  }

  private fun buildNotification(
    title: String,
    artist: String,
    playing: Boolean,
    cover: Bitmap?,
  ): Notification {
    val playPauseAction = if (playing) ACTION_PAUSE else ACTION_PLAY
    val playPauseLabel = if (playing) "暂停" else "播放"
    val style = MediaStyle()
      .setShowActionsInCompactView(1, 2, 3)
    mediaSession?.sessionToken?.let { style.setMediaSession(it) }
    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(artist)
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setOngoing(playing)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
      .addAction(android.R.drawable.ic_media_rew, "快退 10 秒", pending(ACTION_SEEK_BACK))
      .addAction(android.R.drawable.ic_media_previous, "上一首", pending(ACTION_PREV))
      .addAction(
        if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
        playPauseLabel,
        pending(playPauseAction),
      )
      .addAction(android.R.drawable.ic_media_next, "下一首", pending(ACTION_NEXT))
      .addAction(android.R.drawable.ic_media_ff, "快进 10 秒", pending(ACTION_SEEK_FORWARD))
      .setStyle(style)
    if (cover != null) {
      builder.setLargeIcon(cover)
    }
    return builder.build()
  }

  private fun preloadCover(url: String, title: String, artist: String, playing: Boolean) {
    coverExecutor.execute {
      try {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
          connectTimeout = 4000
          readTimeout = 4000
          instanceFollowRedirects = true
        }
        conn.inputStream.use { stream ->
          val bmp = BitmapFactory.decodeStream(stream) ?: return@execute
          cachedCoverUrl = url
          cachedCoverBitmap = bmp
          lastTitle = title
          lastArtist = artist
          lastPlaying = playing
          updateSessionMetadata(bmp)
          updatePlaybackState()
          val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
          mgr.notify(NOTIFICATION_ID, buildNotification(title, artist, playing, bmp))
        }
      } catch (_: Exception) {
        /* ignore cover load failures */
      }
    }
  }
}

/** 由 MusicMediaPlugin 注入，将通知/会话操作回传前端 */
object MusicMediaBridge {
  var actionHandler: ((action: String, positionSec: Double?) -> Unit)? = null

  fun emitAction(action: String, positionSec: Double? = null) {
    actionHandler?.invoke(action, positionSec)
  }
}
