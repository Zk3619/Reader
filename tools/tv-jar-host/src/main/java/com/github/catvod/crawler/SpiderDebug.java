package com.github.catvod.crawler;

/** Desktop stub of SpiderDebug. */
public final class SpiderDebug {
  private SpiderDebug() {}

  public static void log(Throwable th) {
    if (th != null) th.printStackTrace();
  }

  public static void log(String msg) {
    if (msg != null && !msg.isEmpty()) System.out.println("[SpiderDebug] " + msg);
  }

  public static void log(String tag, String msg, Object... args) {
    if (msg == null || msg.isEmpty()) return;
    try {
      System.out.println("[" + tag + "] " + String.format(msg, args));
    } catch (Exception e) {
      System.out.println("[" + tag + "] " + msg);
    }
  }
}
