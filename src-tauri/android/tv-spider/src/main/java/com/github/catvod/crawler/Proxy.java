package com.github.catvod.crawler;

/** 部分源引用 crawler.Proxy；转发到 host {@link com.github.catvod.Proxy}。 */
public final class Proxy {
  private Proxy() {}

  public static void set(int port) {
    com.github.catvod.Proxy.set(port);
  }

  public static int getPort() {
    return com.github.catvod.Proxy.getPort();
  }

  public static String getUrl() {
    return com.github.catvod.Proxy.getUrl();
  }

  public static String getUrl(boolean local) {
    return com.github.catvod.Proxy.getUrl(local);
  }
}
