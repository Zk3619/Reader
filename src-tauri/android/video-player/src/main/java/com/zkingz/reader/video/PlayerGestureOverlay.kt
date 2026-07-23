package com.zkingz.reader.video

import android.annotation.SuppressLint
import android.content.Context
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import kotlin.math.abs

/**
 * 手势层：左亮度、右音量、水平 seek；双击暂停；长按临时倍速。
 */
@SuppressLint("ViewConstructor")
class PlayerGestureOverlay(
  context: Context,
  private val callbacks: Callbacks,
) : FrameLayout(context) {
  interface Callbacks {
    fun onTogglePause()
    fun onSeekDelta(deltaSec: Float)
    fun onVolumeDelta(delta: Float)
    fun onBrightnessDelta(delta: Float)
    fun onLongPressSpeed(active: Boolean)
    fun onSeekPreview(deltaSec: Float, ended: Boolean)
  }

  private var downX = 0f
  private var downY = 0f
  private var mode = Mode.NONE
  private var longPressSpeed = false

  private enum class Mode { NONE, SEEK, VOLUME, BRIGHTNESS }

  private val gesture = GestureDetector(
    context,
    object : GestureDetector.SimpleOnGestureListener() {
      override fun onDoubleTap(e: MotionEvent): Boolean {
        callbacks.onTogglePause()
        return true
      }

      override fun onLongPress(e: MotionEvent) {
        longPressSpeed = true
        callbacks.onLongPressSpeed(true)
      }

      override fun onSingleTapConfirmed(e: MotionEvent): Boolean {
        // 单击留给系统控件显隐；暂停用双击
        return false
      }
    },
  )

  init {
    isClickable = true
    isFocusable = true
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    gesture.onTouchEvent(event)
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        downX = event.x
        downY = event.y
        mode = Mode.NONE
      }
      MotionEvent.ACTION_MOVE -> {
        val dx = event.x - downX
        val dy = event.y - downY
        if (mode == Mode.NONE && (abs(dx) > 24 || abs(dy) > 24)) {
          mode = when {
            abs(dx) > abs(dy) -> Mode.SEEK
            event.x < width / 2f -> Mode.BRIGHTNESS
            else -> Mode.VOLUME
          }
        }
        when (mode) {
          Mode.SEEK -> callbacks.onSeekPreview(dx / width * 90f, false)
          Mode.VOLUME -> callbacks.onVolumeDelta(-dy / height)
          Mode.BRIGHTNESS -> callbacks.onBrightnessDelta(-dy / height)
          Mode.NONE -> {}
        }
        if (mode != Mode.NONE) {
          downX = event.x
          downY = event.y
        }
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        if (mode == Mode.SEEK) {
          val dx = event.x - downX
          // last preview already applied incrementally; final no-op
          callbacks.onSeekPreview(0f, true)
        }
        if (longPressSpeed) {
          longPressSpeed = false
          callbacks.onLongPressSpeed(false)
        }
        mode = Mode.NONE
      }
    }
    return true
  }
}
