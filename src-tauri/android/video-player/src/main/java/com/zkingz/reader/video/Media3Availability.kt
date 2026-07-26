package com.zkingz.reader.video

/**
 * Media3 是否编入本构建。真实值由 media3Available / media3Missing 源集提供。
 */
object Media3Availability {
  /** 由同包 `Media3AvailabilityFlags`（源集分流）提供 */
  @JvmStatic
  fun isCompiled(): Boolean = Media3AvailabilityFlags.COMPILED
}
