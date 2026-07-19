package com.github.catvod.spider;

import android.app.Application;
import android.content.Context;

import com.github.catvod.crawler.Spider;
import com.reader.tvjarhost.Main;

/**
 * 桌面 stub：站点 jar 内 Init 常 ClassFormatError；签名对齐常见用法
 * {@code Application Init.context()} / {@code Init.getSpider(api)}。
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

  /**
   * 站点 jar 内常见跨 Spider 调用入口（如 XBPQ / 聚合源）。
   * {@code name} 可为 {@code csp_Xxx}、{@code Xxx} 或全限定类名。
   */
  public static Spider getSpider(String name) throws Exception {
    return Main.loadSpiderByApi(name);
  }

  /** 部分源带 ext 重载；桌面侧忽略 ext，与宿主 getSpider 缓存策略一致。 */
  public static Spider getSpider(String name, String ext) throws Exception {
    return getSpider(name);
  }

  private static final class Holder {
    static final Init INSTANCE = new Init();
  }
}
