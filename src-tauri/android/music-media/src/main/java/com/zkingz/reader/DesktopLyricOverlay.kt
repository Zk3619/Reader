package com.zkingz.reader

import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.os.Build
import android.os.Looper
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import java.util.regex.Pattern

/**
 * Android 系统悬浮歌词（WindowManager overlay），对齐 LX Mobile LyricView 的最小子集。
 */
object DesktopLyricOverlay {
  @Volatile
  private var shown = false

  private var windowManager: WindowManager? = null
  private var rootView: LinearLayout? = null
  private var lineView: TextView? = null
  private var metaView: TextView? = null
  private var layoutParams: WindowManager.LayoutParams? = null

  private var locked = false
  private var textSizeSp = 20f
  private var textColor = Color.WHITE
  private var viewAlpha = 0.9f
  private var textAlign = Gravity.CENTER_HORIZONTAL
  private var lastLine = ""
  private var lastMeta = ""

  private var lastTouchX = 0f
  private var lastTouchY = 0f

  private fun Activity.onUi(block: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      block()
    } else {
      runOnUiThread(block)
    }
  }

  fun canDrawOverlays(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      Settings.canDrawOverlays(context)
    } else {
      true
    }
  }

  fun isShown(): Boolean = shown && rootView != null

  fun show(activity: Activity, options: ShowOptions) {
    activity.onUi {
      if (shown && rootView == null) {
        shown = false
      }
      applyOptions(options)
      if (shown && rootView != null) {
        applyStyleToViews()
        updateLayoutFlags()
        windowManager?.updateViewLayout(rootView, layoutParams)
        return@onUi
      }
      if (!canDrawOverlays(activity)) {
        throw IllegalStateException("缺少悬浮窗权限")
      }
      val wm = activity.applicationContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
      windowManager = wm

      val density = activity.resources.displayMetrics.density
      val screenW = activity.resources.displayMetrics.widthPixels
      val screenH = activity.resources.displayMetrics.heightPixels
      val width = (screenW * 0.92f).toInt().coerceAtLeast(200)

      val lp = WindowManager.LayoutParams(
        width,
        WindowManager.LayoutParams.WRAP_CONTENT,
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
          @Suppress("DEPRECATION")
          WindowManager.LayoutParams.TYPE_SYSTEM_ALERT
        },
        layoutFlags(),
        PixelFormat.TRANSLUCENT,
      ).apply {
        gravity = Gravity.TOP or Gravity.START
        x = if (options.x >= 0) options.x else ((screenW - width) / 2)
        y = if (options.y >= 0) options.y else (screenH * 0.72f).toInt()
        format = PixelFormat.TRANSLUCENT
      }
      layoutParams = lp

      val root = LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(
          (12 * density).toInt(),
          (8 * density).toInt(),
          (12 * density).toInt(),
          (8 * density).toInt(),
        )
        setBackgroundColor(Color.TRANSPARENT)
      }
      val meta = TextView(activity).apply {
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
        setTextColor(Color.argb(180, 255, 255, 255))
        maxLines = 1
        gravity = textAlign
        visibility = View.GONE
      }
      val line = TextView(activity).apply {
        setTextSize(TypedValue.COMPLEX_UNIT_SP, textSizeSp)
        setTextColor(textColor)
        typeface = Typeface.DEFAULT_BOLD
        maxLines = 2
        gravity = textAlign
        setShadowLayer(3f, 0f, 1f, Color.argb(120, 0, 0, 0))
      }
      root.addView(
        meta,
        LinearLayout.LayoutParams(
          LinearLayout.LayoutParams.MATCH_PARENT,
          LinearLayout.LayoutParams.WRAP_CONTENT,
        ),
      )
      root.addView(
        line,
        LinearLayout.LayoutParams(
          LinearLayout.LayoutParams.MATCH_PARENT,
          LinearLayout.LayoutParams.WRAP_CONTENT,
        ),
      )
      root.setOnTouchListener(dragListener())
      root.alpha = viewAlpha

      metaView = meta
      lineView = line
      rootView = root
      applyStyleToViews()
      if (lastLine.isNotEmpty() || lastMeta.isNotEmpty()) {
        renderText(lastLine, lastMeta)
      } else {
        line.text = "Reader Music"
      }

      wm.addView(root, lp)
      shown = true
    }
  }

  fun hide(activity: Activity) {
    activity.onUi {
      val root = rootView ?: return@onUi
      try {
        windowManager?.removeView(root)
      } catch (_: Exception) {
        /* already removed */
      }
      rootView = null
      lineView = null
      metaView = null
      layoutParams = null
      windowManager = null
      shown = false
    }
  }

  fun setText(activity: Activity, line: String, meta: String) {
    activity.onUi {
      lastLine = line
      lastMeta = meta
      if (!shown) return@onUi
      renderText(line, meta)
    }
  }

  fun setStyle(activity: Activity, options: StyleOptions) {
    activity.onUi {
      if (options.textSizeSp > 0) textSizeSp = options.textSizeSp
      if (options.color.isNotBlank()) textColor = parseColor(options.color)
      if (options.alpha in 0f..1f) viewAlpha = options.alpha
      textAlign = when (options.align.lowercase()) {
        "left" -> Gravity.START
        "right" -> Gravity.END
        else -> Gravity.CENTER_HORIZONTAL
      }
      if (!shown) return@onUi
      applyStyleToViews()
      rootView?.let { windowManager?.updateViewLayout(it, layoutParams) }
    }
  }

  fun setLock(activity: Activity, locked: Boolean) {
    activity.onUi {
      this.locked = locked
      if (!shown) return@onUi
      updateLayoutFlags()
      rootView?.let { windowManager?.updateViewLayout(it, layoutParams) }
    }
  }

  fun currentPosition(): Pair<Int, Int>? {
    val lp = layoutParams ?: return null
    return lp.x to lp.y
  }

  data class ShowOptions(
    var locked: Boolean = false,
    var textSizeSp: Float = 20f,
    var color: String = "#FFFFFF",
    var alpha: Float = 0.9f,
    var align: String = "center",
    var x: Int = -1,
    var y: Int = -1,
  )

  data class StyleOptions(
    var textSizeSp: Float = 0f,
    var color: String = "",
    var alpha: Float = -1f,
    var align: String = "center",
  )

  private fun applyOptions(options: ShowOptions) {
    locked = options.locked
    if (options.textSizeSp > 0) textSizeSp = options.textSizeSp
    if (options.color.isNotBlank()) textColor = parseColor(options.color)
    if (options.alpha in 0f..1f) viewAlpha = options.alpha
    textAlign = when (options.align.lowercase()) {
      "left" -> Gravity.START
      "right" -> Gravity.END
      else -> Gravity.CENTER_HORIZONTAL
    }
  }

  private fun renderText(line: String, meta: String) {
    val display = line.ifBlank { meta.ifBlank { "Reader Music" } }
    lineView?.text = display
    val showMeta = meta.isNotBlank() && line.isNotBlank() && meta != line
    metaView?.let {
      it.text = meta
      it.visibility = if (showMeta) View.VISIBLE else View.GONE
    }
  }

  private fun applyStyleToViews() {
    lineView?.apply {
      setTextSize(TypedValue.COMPLEX_UNIT_SP, textSizeSp)
      setTextColor(textColor)
      gravity = textAlign
    }
    metaView?.gravity = textAlign
    rootView?.alpha = viewAlpha
  }

  private fun layoutFlags(): Int {
    var flags = (
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
        or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
        or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
        or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
      )
    if (locked) {
      flags = flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
    }
    return flags
  }

  private fun updateLayoutFlags() {
    layoutParams?.flags = layoutFlags()
  }

  private fun dragListener(): View.OnTouchListener {
    return View.OnTouchListener { _, event ->
      if (locked) return@OnTouchListener false
      val lp = layoutParams ?: return@OnTouchListener false
      val wm = windowManager ?: return@OnTouchListener false
      val root = rootView ?: return@OnTouchListener false
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          lastTouchX = event.rawX
          lastTouchY = event.rawY
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = (event.rawX - lastTouchX).toInt()
          val dy = (event.rawY - lastTouchY).toInt()
          lastTouchX = event.rawX
          lastTouchY = event.rawY
          lp.x += dx
          lp.y += dy
          wm.updateViewLayout(root, lp)
          true
        }
        else -> false
      }
    }
  }

  private fun parseColor(input: String): Int {
    val trimmed = input.trim()
    if (trimmed.startsWith("#")) {
      return try {
        Color.parseColor(trimmed)
      } catch (_: Exception) {
        Color.WHITE
      }
    }
    val pattern = Pattern.compile(
      "rgba?\\s*\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)(?:\\s*,\\s*([\\d.]+))?\\s*\\)",
      Pattern.CASE_INSENSITIVE,
    )
    val matcher = pattern.matcher(trimmed)
    if (matcher.matches()) {
      val r = matcher.group(1)!!.toInt()
      val g = matcher.group(2)!!.toInt()
      val b = matcher.group(3)!!.toInt()
      val a = matcher.group(4)?.toFloatOrNull() ?: 1f
      return Color.argb((a * 255).toInt().coerceIn(0, 255), r, g, b)
    }
    return Color.WHITE
  }
}
