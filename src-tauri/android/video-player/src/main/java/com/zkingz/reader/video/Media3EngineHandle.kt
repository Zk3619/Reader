package com.zkingz.reader.video

/**
 * Media3（ExoPlayer）会话句柄：仅在 media3Available 源集编入真实实现。
 */
interface Media3EngineHandle {
  fun onStop()
  fun onDestroy()
}
