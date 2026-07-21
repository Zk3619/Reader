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
  var coverUrl: String = ""
  var positionSec: Double = 0.0
  var durationSec: Double = 0.0
}

@InvokeArg
class DesktopLyricShowArgs {
  var locked: Boolean = false
  var textSizeSp: Float = 20f
  var color: String = "#FFFFFF"
  var alpha: Float = 0.9f
  var align: String = "center"
  var x: Int = -1
  var y: Int = -1
}

@InvokeArg
class DesktopLyricTextArgs {
  var line: String = ""
  var meta: String = ""
}

@InvokeArg
class DesktopLyricStyleArgs {
  var textSizeSp: Float = 0f
  var color: String = ""
  var alpha: Float = -1f
  var align: String = "center"
}

@InvokeArg
class DesktopLyricLockArgs {
  var locked: Boolean = false
}

@TauriPlugin
class MusicMediaPlugin(private val activity: Activity) : Plugin(activity) {

  init {
    MusicMediaBridge.actionHandler = { action, positionSec ->
      val payload = JSObject()
      payload.put("action", action)
      if (positionSec != null) {
        payload.put("positionSec", positionSec)
      }
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
          putExtra(MusicMediaService.EXTRA_COVER_URL, args.coverUrl)
          putExtra(MusicMediaService.EXTRA_POSITION_SEC, args.positionSec)
          putExtra(MusicMediaService.EXTRA_DURATION_SEC, args.durationSec)
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
  fun checkOverlayPermission(invoke: Invoke) {
    val ret = JSObject()
    ret.put("allowed", DesktopLyricOverlay.canDrawOverlays(activity))
    invoke.resolve(ret)
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

  @Command
  fun requestIgnoreBatteryOptimizations(invoke: Invoke) {
    activity.runOnUiThread {
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          val pm = activity.getSystemService(android.content.Context.POWER_SERVICE)
            as android.os.PowerManager
          if (!pm.isIgnoringBatteryOptimizations(activity.packageName)) {
            val intent = Intent(
              android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
              Uri.parse("package:${activity.packageName}"),
            )
            activity.startActivity(intent)
          } else {
            // 已忽略时打开应用详情，方便用户复查
            val intent = Intent(
              android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
              Uri.parse("package:${activity.packageName}"),
            )
            activity.startActivity(intent)
          }
        }
        invoke.resolve(JSObject())
      } catch (e: Exception) {
        invoke.reject(e.message ?: "requestIgnoreBatteryOptimizations failed")
      }
    }
  }

  @Command
  fun showDesktopLyric(invoke: Invoke, args: DesktopLyricShowArgs) {
    activity.runOnUiThread {
      try {
        DesktopLyricOverlay.show(
          activity,
          DesktopLyricOverlay.ShowOptions(
            locked = args.locked,
            textSizeSp = args.textSizeSp,
            color = args.color,
            alpha = args.alpha,
            align = args.align,
            x = args.x,
            y = args.y,
          ),
        )
        val ret = JSObject()
        ret.put("shown", true)
        invoke.resolve(ret)
      } catch (e: Exception) {
        invoke.reject(e.message ?: "showDesktopLyric failed")
      }
    }
  }

  @Command
  fun hideDesktopLyric(invoke: Invoke) {
    activity.runOnUiThread {
      try {
        DesktopLyricOverlay.hide(activity)
        invoke.resolve(JSObject())
      } catch (e: Exception) {
        invoke.reject(e.message ?: "hideDesktopLyric failed")
      }
    }
  }

  @Command
  fun setDesktopLyricText(invoke: Invoke, args: DesktopLyricTextArgs) {
    activity.runOnUiThread {
      try {
        DesktopLyricOverlay.setText(activity, args.line, args.meta)
        invoke.resolve(JSObject())
      } catch (e: Exception) {
        invoke.reject(e.message ?: "setDesktopLyricText failed")
      }
    }
  }

  @Command
  fun setDesktopLyricStyle(invoke: Invoke, args: DesktopLyricStyleArgs) {
    activity.runOnUiThread {
      try {
        DesktopLyricOverlay.setStyle(
          activity,
          DesktopLyricOverlay.StyleOptions(
            textSizeSp = args.textSizeSp,
            color = args.color,
            alpha = args.alpha,
            align = args.align,
          ),
        )
        invoke.resolve(JSObject())
      } catch (e: Exception) {
        invoke.reject(e.message ?: "setDesktopLyricStyle failed")
      }
    }
  }

  @Command
  fun setDesktopLyricLock(invoke: Invoke, args: DesktopLyricLockArgs) {
    activity.runOnUiThread {
      try {
        DesktopLyricOverlay.setLock(activity, args.locked)
        invoke.resolve(JSObject())
      } catch (e: Exception) {
        invoke.reject(e.message ?: "setDesktopLyricLock failed")
      }
    }
  }

  @Command
  fun isDesktopLyricShown(invoke: Invoke) {
    val ret = JSObject()
    ret.put("shown", DesktopLyricOverlay.isShown())
    invoke.resolve(ret)
  }
}
