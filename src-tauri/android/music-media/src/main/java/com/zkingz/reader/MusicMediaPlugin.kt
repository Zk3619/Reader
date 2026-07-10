package com.zkingz.reader

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class SyncMediaArgs {
  var playing: Boolean = false
  var title: String = ""
  var artist: String = ""
}

@TauriPlugin
class MusicMediaPlugin(private val activity: Activity) : Plugin(activity) {

  init {
    MusicMediaBridge.actionHandler = { action ->
      val payload = JSObject()
      payload.put("action", action)
      trigger("android-media-action", payload)
    }
  }

  @Command
  fun syncMusicNotification(invoke: Invoke, args: SyncMediaArgs) {
    activity.runOnUiThread {
      try {
        val intent = Intent(activity, MusicMediaService::class.java).apply {
          putExtra(MusicMediaService.EXTRA_TITLE, args.title)
          putExtra(MusicMediaService.EXTRA_ARTIST, args.artist)
          putExtra(MusicMediaService.EXTRA_PLAYING, args.playing)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          activity.startForegroundService(intent)
        } else {
          activity.startService(intent)
        }
        invoke.resolve(JSObject())
      } catch (e: Exception) {
        invoke.reject(e.message ?: "syncMusicNotification failed")
      }
    }
  }

  @Command
  fun requestOverlayPermission(invoke: Invoke) {
    activity.runOnUiThread {
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          if (!Settings.canDrawOverlays(activity)) {
            val intent = Intent(
              Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
              Uri.parse("package:${activity.packageName}"),
            )
            activity.startActivity(intent)
          }
        }
        invoke.resolve(JSObject())
      } catch (e: Exception) {
        invoke.reject(e.message ?: "requestOverlayPermission failed")
      }
    }
  }
}
