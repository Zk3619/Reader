package com.github.catvod;

import android.content.Context;

import java.lang.ref.WeakReference;

/** 对齐 FongMi host `com.github.catvod.Init`，供加固 JAR / 工具类取 Application。 */
public final class Init {
  private WeakReference<Context> context = new WeakReference<>(null);

  private static Init getInstance() {
    return Holder.INSTANCE;
  }

  public static void set(Context context) {
    getInstance().context = new WeakReference<>(context);
  }

  public static Context context() {
    Context c = getInstance().context.get();
    return c;
  }

  private static final class Holder {
    static final Init INSTANCE = new Init();
  }
}
