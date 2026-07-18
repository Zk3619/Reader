package com.github.catvod.spider;

import android.app.Application;
import android.content.Context;

/**
 * 桌面 stub：站点 jar 内 Init 常 ClassFormatError；签名对齐常见用法
 * {@code Application Init.context()}。
 */
public final class Init {
  private static final Application APP = Application.getDesktop();

  private Init() {}

  public static void init() {}

  public static void init(Context context) {
    // no-op
  }

  public static void init(Application application) {
    // no-op
  }

  public static void init(Object context) {
    // no-op
  }

  public static void set(Context context) {
    // no-op — desktop keeps singleton Application
  }

  /** 多数源期望返回 Application，而非裸 Context。 */
  public static Application context() {
    return APP;
  }

  public static Application getApplication() {
    return APP;
  }

  public static Init get() {
    return Holder.INSTANCE;
  }

  private static final class Holder {
    static final Init INSTANCE = new Init();
  }
}
