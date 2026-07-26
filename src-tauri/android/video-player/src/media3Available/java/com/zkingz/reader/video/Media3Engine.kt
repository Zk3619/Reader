package com.zkingz.reader.video

import android.net.Uri
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView

/**
 * 增强构建：挂载 Media3 / ExoPlayer 全屏页。
 */
object Media3Engine {
  fun start(
    activity: AppCompatActivity,
    cfg: PlayerLaunchConfig,
    topBar: View,
  ): Media3EngineHandle {
    val root = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
    activity.setContentView(root)
    root.addView(topBar)

    val playerView = PlayerView(activity)
    playerView.layoutParams = LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f,
    )
    root.addView(playerView)
    val errBar = LinearLayout(activity).apply {
      orientation = LinearLayout.HORIZONTAL
      visibility = View.GONE
    }
    val errTv = TextView(activity).apply {
      layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
    }
    val retry = Button(activity).apply { text = "重试" }
    errBar.addView(errTv)
    errBar.addView(retry)
    root.addView(errBar)

    var exo: ExoPlayer? = ExoPlayer.Builder(activity).build()
    val player = exo!!
    playerView.player = player
    val vol = if (cfg.muted) 0f else (cfg.volume / 100.0).toFloat().coerceIn(0f, 1f)
    player.volume = vol
    player.addListener(object : Player.Listener {
      override fun onPlayerError(error: PlaybackException) {
        errBar.visibility = View.VISIBLE
        errTv.text = "Media3 失败: ${error.errorCodeName}"
      }

      override fun onPlaybackStateChanged(playbackState: Int) {
        if (playbackState == Player.STATE_READY) errBar.visibility = View.GONE
      }
    })

    fun prepare() {
      val builder = MediaItem.Builder().setUri(Uri.parse(cfg.url))
      player.setMediaItem(builder.build())
      player.prepare()
      val opening = cfg.openingSkipSec.coerceAtLeast(0.0)
      val start = if (cfg.startSec > 0) cfg.startSec else opening
      if (start > 0) player.seekTo((start * 1000).toLong())
      player.playWhenReady = true
    }

    retry.setOnClickListener { prepare() }
    if (cfg.url.isBlank()) {
      errBar.visibility = View.VISIBLE
      errTv.text = "无播放地址"
    } else {
      prepare()
    }

    return object : Media3EngineHandle {
      override fun onStop() {
        exo?.playWhenReady = false
      }

      override fun onDestroy() {
        exo?.stop()
        exo?.release()
        exo = null
      }
    }
  }
}
