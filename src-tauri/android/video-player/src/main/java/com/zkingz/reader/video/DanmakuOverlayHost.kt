package com.zkingz.reader.video

import android.content.Context
import android.util.AttributeSet
import android.util.Log
import android.view.View
import android.widget.FrameLayout

/**
 * 弹幕叠层宿主：有 FlameMaster 时挂 ReaderDanmakuView，否则空操作。
 */
class DanmakuOverlayHost @JvmOverloads constructor(
  context: Context,
  attrs: AttributeSet? = null,
) : FrameLayout(context, attrs) {
  private var view: View? = null
  private var viewClass: Class<*>? = null

  fun isAvailable(): Boolean = try {
    Class.forName("com.zkingz.reader.video.danmaku.ReaderDanmakuView")
    true
  } catch (_: Throwable) {
    false
  }

  fun attach() {
    if (view != null) return
    try {
      val cls = Class.forName("com.zkingz.reader.video.danmaku.ReaderDanmakuView")
      viewClass = cls
      val ctor = cls.getConstructor(
        Context::class.java,
        AttributeSet::class.java,
        Int::class.javaPrimitiveType,
      )
      val v = ctor.newInstance(context, null, 0) as View
      view = v
      addView(v, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    } catch (e: Throwable) {
      Log.w(TAG, "attach failed", e)
    }
  }

  fun loadFile(path: String): Boolean {
    val v = view ?: return false
    val cls = viewClass ?: return false
    return try {
      cls.getMethod("loadDanmaku", String::class.java).invoke(v, path) as? Boolean ?: false
    } catch (e: Throwable) {
      Log.w(TAG, "loadFile", e)
      false
    }
  }

  fun seekTo(ms: Long) {
    val v = view ?: return
    try {
      viewClass?.getMethod("syncTo", Long::class.javaPrimitiveType)?.invoke(v, ms)
    } catch (e: Throwable) {
      Log.w(TAG, "seekTo", e)
    }
  }

  fun pause() {
    val v = view ?: return
    try {
      viewClass?.methods?.firstOrNull { it.name == "pause" && it.parameterTypes.isEmpty() }?.invoke(v)
    } catch (_: Throwable) {
    }
  }

  fun resume() {
    val v = view ?: return
    try {
      viewClass?.methods?.firstOrNull { it.name == "resume" && it.parameterTypes.isEmpty() }?.invoke(v)
    } catch (_: Throwable) {
    }
  }

  fun setVisible(on: Boolean) {
    val v = view ?: return
    try {
      viewClass?.getMethod("setSelected", Boolean::class.javaPrimitiveType)?.invoke(v, on)
    } catch (_: Throwable) {
    }
  }

  fun release() {
    val v = view ?: return
    try {
      viewClass?.methods?.firstOrNull { it.name == "release" && it.parameterTypes.isEmpty() }?.invoke(v)
    } catch (_: Throwable) {
    }
    removeAllViews()
    view = null
    viewClass = null
  }

  companion object {
    private const val TAG = "DanmakuOverlayHost"
  }
}
