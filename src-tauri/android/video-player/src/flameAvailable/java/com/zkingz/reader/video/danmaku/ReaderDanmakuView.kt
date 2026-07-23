package com.zkingz.reader.video.danmaku

import android.content.Context
import android.util.AttributeSet
import android.util.Log
import master.flame.danmaku.controller.DrawHandler
import master.flame.danmaku.danmaku.model.BaseDanmaku
import master.flame.danmaku.danmaku.model.DanmakuTimer
import master.flame.danmaku.danmaku.model.android.DanmakuContext
import master.flame.danmaku.ui.widget.DanmakuView
import java.io.File

/**
 * FlameMaster 弹幕视图（有 DanmakuFlameMaster.aar 时编译）。
 */
class ReaderDanmakuView @JvmOverloads constructor(
  context: Context,
  attrs: AttributeSet? = null,
  defStyleAttr: Int = 0,
) : DanmakuView(context, attrs, defStyleAttr) {
  private val danmakuContext = DanmakuContext.create()
  private val loader = BiliDanmakuLoader.instance()
  private var trackSelected = true

  init {
    enableDanmakuDrawingCache(true)
    val overlapping = HashMap<Int, Boolean>()
    overlapping[BaseDanmaku.TYPE_SCROLL_LR] = true
    overlapping[BaseDanmaku.TYPE_SCROLL_RL] = true
    overlapping[BaseDanmaku.TYPE_FIX_TOP] = true
    overlapping[BaseDanmaku.TYPE_FIX_BOTTOM] = true
    danmakuContext.isDuplicateMergingEnabled = true
    danmakuContext.preventOverlapping(overlapping)
    setCallback(object : DrawHandler.Callback {
      override fun prepared() {
        if (trackSelected) {
          start()
          show()
        }
      }

      override fun updateTimer(timer: DanmakuTimer?) {}
      override fun danmakuShown(danmaku: BaseDanmaku?) {}
      override fun drawingFinished() {}
    })
  }

  fun loadDanmaku(filePath: String): Boolean {
    return try {
      val f = File(filePath)
      if (!f.isFile) {
        Log.e(TAG, "missing $filePath")
        return false
      }
      release()
      loader.load(filePath)
      val src = loader.dataSource ?: return false
      val parser = BiliDanmakuParser().apply { load(src) }
      prepare(parser, danmakuContext)
      true
    } catch (e: Exception) {
      Log.e(TAG, "loadDanmaku", e)
      false
    }
  }

  fun syncTo(ms: Long) {
    try {
      seekTo(ms)
    } catch (e: Throwable) {
      Log.w(TAG, "seekTo", e)
    }
  }

  fun setSelected(on: Boolean) {
    trackSelected = on
    if (on) {
      show()
      resume()
    } else {
      hide()
      pause()
    }
  }

  companion object {
    private const val TAG = "ReaderDanmakuView"
  }
}
