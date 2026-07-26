package com.zkingz.reader.video

import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * 轻量构建：不依赖 androidx.media3，仅展示不可用说明。
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
    root.addView(TextView(activity).apply {
      setPadding(48, 48, 48, 48)
      text = "Media3 未编入此构建（Artplayer-only / lite）。\n\n" +
        "请使用增强构建：pnpm tauri android … enhanced\n\n" +
        "标题: ${cfg.title.ifBlank { "(无)" }}"
    })
    return object : Media3EngineHandle {
      override fun onStop() {}
      override fun onDestroy() {}
    }
  }
}
