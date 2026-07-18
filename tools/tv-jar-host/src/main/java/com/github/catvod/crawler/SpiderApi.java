package com.github.catvod.crawler;

import com.google.gson.JsonArray;

/**
 * 部分源（如 XBPQ）依赖宿主提供的 SpiderApi。
 * 桌面侧提供最小可用实现：日志 + 本地 proxy 地址，解析/并发请求返回空串。
 */
public class SpiderApi {
  public void log(String msg) {
    if (msg != null && !msg.isEmpty()) {
      System.out.println("[SpiderApi] " + msg);
    }
  }

  /** 本地影视 proxy 主机（对齐 FongMi 9978） */
  public String getAddress(boolean remote) {
    return "127.0.0.1";
  }

  public String getPort() {
    String p = System.getenv("READER_TV_PROXY_PORT");
    if (p != null && !p.isBlank()) return p.trim();
    return "9978";
  }

  public String multiReq(JsonArray arr) {
    return "[]";
  }

  public String webParse(String flag, String url) {
    return "";
  }
}
