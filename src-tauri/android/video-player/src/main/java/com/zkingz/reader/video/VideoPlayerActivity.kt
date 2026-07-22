package com.zkingz.reader.video

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/**
 * 全屏播放页占位（E2）。
 * - engine=libmpv → 后续接 Surface + mpvlib AAR
 * - engine=media3 → 后续接 ExoPlayer/PlayerView
 * 当前展示 URL，保证 Activity 可启动、协议可联调。
 */
class VideoPlayerActivity : AppCompatActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val engine = intent.getStringExtra(EXTRA_ENGINE) ?: "media3"
    val url = intent.getStringExtra(EXTRA_URL) ?: ""
    val title = intent.getStringExtra(EXTRA_TITLE) ?: "Video"
    val tv = TextView(this)
    tv.text = "[$engine] $title\n$url\n\n(Stub — wire libmpv / Media3 VO next)"
    tv.setPadding(48, 48, 48, 48)
    setContentView(tv)
  }

  companion object {
    const val EXTRA_ENGINE = "engine"
    const val EXTRA_URL = "url"
    const val EXTRA_TITLE = "title"

    fun open(activity: Activity, engine: String, url: String, title: String?) {
      val i = Intent(activity, VideoPlayerActivity::class.java)
      i.putExtra(EXTRA_ENGINE, engine)
      i.putExtra(EXTRA_URL, url)
      i.putExtra(EXTRA_TITLE, title ?: "")
      activity.startActivity(i)
    }
  }
}

@InvokeArg
class VideoOpenArgs {
  var engine: String = "media3"
  var url: String = ""
  var title: String = ""
}

@TauriPlugin
class VideoPlayerPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun openPlayer(invoke: Invoke) {
    val args = invoke.parseArgs(VideoOpenArgs::class.java)
    if (args.url.isBlank()) {
      invoke.reject("url required")
      return
    }
    val eng = args.engine.lowercase()
    if (eng != "libmpv" && eng != "media3") {
      invoke.reject("engine must be libmpv or media3")
      return
    }
    activity.runOnUiThread {
      VideoPlayerActivity.open(activity, eng, args.url, args.title)
      val res = JSObject()
      res.put("ok", true)
      invoke.resolve(res)
    }
  }
}
