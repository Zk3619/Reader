package com.zkingz.reader.video

/**
 * E2.B：探测 mpvlib 是否编进 APK（不谎称可播）。
 */
object LibmpvAvailability {
  data class Status(
    val available: Boolean,
    val detail: String,
  )

  fun probe(): Status {
    return try {
      Class.forName("is.xyz.mpv.MPVView")
      Class.forName("is.xyz.mpv.MPVLib")
      Status(true, "mpvlib classes present (is.xyz.mpv)")
    } catch (e: ClassNotFoundException) {
      Status(
        false,
        "mpvlib AAR missing: place arm64 mpvlib.aar under android/video-player/libs/ (see libs/README.md)",
      )
    } catch (e: Throwable) {
      Status(false, "mpvlib probe failed: ${e.message}")
    }
  }
}
