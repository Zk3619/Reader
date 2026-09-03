package com.github.catvod.crawler;

import android.util.Log;

/** 对齐 FongMi host `SpiderDebug`，供 JAR 内日志调用。 */
public class SpiderDebug {
  private static final String TAG = "SpiderDebug";

  public static void log(Throwable th) {
    if (th != null) Log.w(TAG, th.getMessage(), th);
  }

  public static void log(String msg) {
    if (msg != null && !msg.isEmpty()) Log.d(TAG, msg);
  }

  public static void log(String tag, String msg, Object... args) {
    if (msg == null || msg.isEmpty()) return;
    String text = args != null && args.length > 0 ? String.format(msg, args) : msg;
    Log.d(tag != null && !tag.isEmpty() ? tag : TAG, text);
  }
}
