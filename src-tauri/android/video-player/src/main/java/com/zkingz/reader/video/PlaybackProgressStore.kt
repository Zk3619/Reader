package com.zkingz.reader.video

import android.content.Context
import android.content.SharedPreferences

object PlaybackProgressStore {
  private const val PREF = "reader.video.progress.v1"

  private fun prefs(ctx: Context): SharedPreferences =
    ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)

  fun save(ctx: Context, url: String, positionSec: Double) {
    if (url.isBlank() || positionSec < 5) return
    prefs(ctx).edit().putFloat(key(url), positionSec.toFloat()).apply()
  }

  fun load(ctx: Context, url: String): Double {
    if (url.isBlank()) return 0.0
    return prefs(ctx).getFloat(key(url), 0f).toDouble()
  }

  private fun key(url: String): String = "p:" + url.hashCode().toString()
}
