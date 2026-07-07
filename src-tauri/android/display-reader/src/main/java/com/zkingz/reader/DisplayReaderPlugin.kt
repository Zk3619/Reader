package com.zkingz.reader

import android.app.Activity
import android.content.Intent
import android.content.pm.ActivityInfo
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
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
  /** 为 true 时写入 Settings.System.SCREEN_BRIGHTNESS（需 WRITE_SETTINGS） */
  var syncSystem: Boolean = false
}

@InvokeArg
class ScreenOrientationArgs {
  var mode: Int = 0
}

@InvokeArg
class KeepScreenOnArgs {
  var seconds: Int = 0
}

@TauriPlugin
class DisplayReaderPlugin(private val activity: Activity) : Plugin(activity) {

  private var savedWindowBrightness: Float = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
  private var savedSystemBrightness: Int = -1
  private var savedSystemBrightnessMode: Int = -1
  private val keepScreenHandler = Handler(Looper.getMainLooper())
  private var keepScreenRunnable: Runnable? = null

  private fun runOnMain(invoke: Invoke, block: () -> Unit) {
    val task = {
      try {
        block()
      } catch (e: Exception) {
        invoke.reject(e.message ?: "display-reader failed")
      }
    }
    if (Looper.myLooper() == Looper.getMainLooper()) {
      task()
    } else {
      activity.runOnUiThread(task)
    }
  }

  /** 对齐 Legado：0–255 映射，非零最低 0.004 */
  private fun percentToWindow(level: Int): Float {
    val clamped = level.coerceIn(0, 100)
    if (clamped == 0) return 0f
    if (clamped == 100) return 1f
    return (clamped / 100f).coerceAtLeast(0.004f)
  }

  private fun percentToSystem(level: Int): Int =
    when (level.coerceIn(0, 100)) {
      0 -> 1
      else -> (level * 255 / 100).coerceIn(1, 255)
    }

  private fun canWriteSystemSettings(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.System.canWrite(activity)

  private fun readSystemBrightnessPercent(): Int? =
    try {
      val raw =
        Settings.System.getInt(
          activity.contentResolver,
          Settings.System.SCREEN_BRIGHTNESS,
        )
      if (raw < 0) null else (raw * 100 / 255).coerceIn(0, 100)
    } catch (_: Exception) {
      null
    }

  /** 仅在已授权时写入系统亮度；须切 MANUAL 并 notifyChange */
  private fun tryWriteSystemBrightness(levelPercent: Int): Boolean {
    if (!canWriteSystemSettings()) return false
    return try {
      val resolver = activity.contentResolver
      val target = percentToSystem(levelPercent)
      Settings.System.putInt(
        resolver,
        Settings.System.SCREEN_BRIGHTNESS_MODE,
        Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL,
      )
      Settings.System.putInt(resolver, Settings.System.SCREEN_BRIGHTNESS, target)
      val uri = Settings.System.getUriFor(Settings.System.SCREEN_BRIGHTNESS)
      resolver.notifyChange(uri, null)
      val readback = readSystemBrightnessPercent()
      readback != null && kotlin.math.abs(readback - levelPercent) <= 3
    } catch (_: Exception) {
      false
    }
  }

  private fun setWindowBrightness(level: Float) {
    val attrs = activity.window.attributes
    attrs.screenBrightness = level
    activity.window.attributes = attrs
  }

  private fun applyManualBrightness(levelPercent: Int, syncSystem: Boolean): JSObject {
    val level = levelPercent.coerceIn(0, 100)
    // 主路径：窗口亮度（Legado 同款，无需 WRITE_SETTINGS）
    setWindowBrightness(percentToWindow(level))
    val systemApplied = if (syncSystem) tryWriteSystemBrightness(level) else false
    val ret = JSObject()
    ret.put("level", level)
    ret.put("windowApplied", true)
    ret.put("systemApplied", systemApplied)
    ret.put("needsWriteSettings", syncSystem && !canWriteSystemSettings())
    return ret
  }

  @Command
  fun setBrightness(invoke: Invoke) {
    val args = invoke.parseArgs(BrightnessLevelArgs::class.java)
    runOnMain(invoke) {
      val ret = applyManualBrightness(args.level, args.syncSystem)
      invoke.resolve(ret)
    }
  }

  @Command
  fun getBrightness(invoke: Invoke) {
    runOnMain(invoke) {
      val window = activity.window.attributes.screenBrightness
      val level =
        if (window >= 0f) {
          (window * 100f).toInt().coerceIn(0, 100)
        } else {
          readSystemBrightnessPercent() ?: 100
        }
      val ret = JSObject()
      ret.put("level", level)
      invoke.resolve(ret)
    }
  }

  @Command
  fun captureBrightness(invoke: Invoke) {
    runOnMain(invoke) {
      savedWindowBrightness = activity.window.attributes.screenBrightness
      savedSystemBrightness =
        try {
          Settings.System.getInt(
            activity.contentResolver,
            Settings.System.SCREEN_BRIGHTNESS,
          )
        } catch (_: Exception) {
          -1
        }
      savedSystemBrightnessMode =
        try {
          Settings.System.getInt(
            activity.contentResolver,
            Settings.System.SCREEN_BRIGHTNESS_MODE,
          )
        } catch (_: Exception) {
          -1
        }
      invoke.resolve(JSObject())
    }
  }

  @Command
  fun restoreBrightness(invoke: Invoke) {
    runOnMain(invoke) {
      if (canWriteSystemSettings()) {
        try {
          if (savedSystemBrightnessMode >= 0) {
            Settings.System.putInt(
              activity.contentResolver,
              Settings.System.SCREEN_BRIGHTNESS_MODE,
              savedSystemBrightnessMode,
            )
          }
          if (savedSystemBrightness > 0) {
            Settings.System.putInt(
              activity.contentResolver,
              Settings.System.SCREEN_BRIGHTNESS,
              savedSystemBrightness,
            )
            val uri = Settings.System.getUriFor(Settings.System.SCREEN_BRIGHTNESS)
            activity.contentResolver.notifyChange(uri, null)
          }
        } catch (_: Exception) {
          /* ignore */
        }
      }
      setWindowBrightness(savedWindowBrightness)
      invoke.resolve(JSObject())
    }
  }

  /** 自动亮度：交还系统控制（对齐 Legado BRIGHTNESS_OVERRIDE_NONE） */
  @Command
  fun followSystemBrightness(invoke: Invoke) {
    runOnMain(invoke) {
      setWindowBrightness(WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE)
      invoke.resolve(JSObject())
    }
  }

  @Command
  fun canWriteDisplaySettings(invoke: Invoke) {
    runOnMain(invoke) {
      val ret = JSObject()
      ret.put("allowed", canWriteSystemSettings())
      invoke.resolve(ret)
    }
  }

  /** 仅由用户主动触发；勿在滑条拖动时自动调用（离开应用会导致 WebView 被杀） */
  @Command
  fun openWriteSettingsPermission(invoke: Invoke) {
    runOnMain(invoke) {
      if (canWriteSystemSettings()) {
        invoke.resolve(JSObject())
        return@runOnMain
      }
      val intent =
        Intent(
          Settings.ACTION_MANAGE_WRITE_SETTINGS,
          Uri.parse("package:${activity.packageName}"),
        )
      activity.startActivity(intent)
      invoke.resolve(JSObject())
    }
  }

  @Command
  fun setScreenOrientation(invoke: Invoke) {
    val args = invoke.parseArgs(ScreenOrientationArgs::class.java)
    runOnMain(invoke) {
      activity.requestedOrientation =
        when (args.mode) {
          1 -> ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
          2 -> ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
          3 -> ActivityInfo.SCREEN_ORIENTATION_SENSOR
          4 -> ActivityInfo.SCREEN_ORIENTATION_REVERSE_PORTRAIT
          5 -> ActivityInfo.SCREEN_ORIENTATION_REVERSE_LANDSCAPE
          else -> ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
      invoke.resolve(JSObject())
    }
  }

  @Command
  fun setKeepScreenOn(invoke: Invoke) {
    val args = invoke.parseArgs(KeepScreenOnArgs::class.java)
    runOnMain(invoke) {
      keepScreenRunnable?.let { keepScreenHandler.removeCallbacks(it) }
      keepScreenRunnable = null

      if (args.seconds == 0) {
        activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        invoke.resolve(JSObject())
        return@runOnMain
      }

      activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

      if (args.seconds > 0) {
        val runnable =
          Runnable {
            activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            keepScreenRunnable = null
          }
        keepScreenRunnable = runnable
        keepScreenHandler.postDelayed(runnable, args.seconds.toLong() * 1000L)
      }

      invoke.resolve(JSObject())
    }
  }
}
