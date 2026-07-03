package com.zkingz.reader

import android.app.Activity
import android.view.WindowManager
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class BrightnessLevelArgs {
  var level: Int = 100
}

@TauriPlugin
class DisplayReaderPlugin(private val activity: Activity) : Plugin(activity) {

  private var savedBrightness: Float = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE

  @Command
  fun setBrightness(invoke: Invoke) {
    activity.runOnUiThread {
      try {
        val args = invoke.parseArgs(BrightnessLevelArgs::class.java)
        val level = args.level.coerceIn(0, 100)
        val attrs = activity.window.attributes
        attrs.screenBrightness = level / 100f
        activity.window.attributes = attrs
        invoke.resolve(JSObject())
      } catch (e: Exception) {
        invoke.reject(e.message ?: "setBrightness failed")
      }
    }
  }

  @Command
  fun getBrightness(invoke: Invoke) {
    activity.runOnUiThread {
      try {
        val current = activity.window.attributes.screenBrightness
        val level =
          if (current < 0f) {
            100
          } else {
            (current * 100f).toInt().coerceIn(0, 100)
          }
        val ret = JSObject()
        ret.put("level", level)
        invoke.resolve(ret)
      } catch (e: Exception) {
        invoke.reject(e.message ?: "getBrightness failed")
      }
    }
  }

  @Command
  fun captureBrightness(invoke: Invoke) {
    activity.runOnUiThread {
      savedBrightness = activity.window.attributes.screenBrightness
      invoke.resolve(JSObject())
    }
  }

  @Command
  fun restoreBrightness(invoke: Invoke) {
    activity.runOnUiThread {
      try {
        val attrs = activity.window.attributes
        attrs.screenBrightness = savedBrightness
        activity.window.attributes = attrs
        invoke.resolve(JSObject())
      } catch (e: Exception) {
        invoke.reject(e.message ?: "restoreBrightness failed")
      }
    }
  }
}
