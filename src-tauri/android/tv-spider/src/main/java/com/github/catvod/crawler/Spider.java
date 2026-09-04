package com.github.catvod.crawler;

import android.content.Context;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import okhttp3.Dns;
import okhttp3.OkHttpClient;

/**
 * 对齐 FongMi host Spider。JAR 内 csp_* 通常 extend 此类；
 * 不可再放 {@code com.github.catvod.spider.Init}，否则会盖住 JAR 自带 Init/DexNative。
 */
public abstract class Spider {

  public String siteKey;

  private static volatile OkHttpClient CLIENT;

  public static Dns safeDns() {
    return Dns.SYSTEM;
  }

  public static OkHttpClient client() {
    OkHttpClient c = CLIENT;
    if (c == null) {
      synchronized (Spider.class) {
        c = CLIENT;
        if (c == null) {
          CLIENT =
              c =
                  new OkHttpClient.Builder()
                      .connectionSpecs(
                          java.util.Arrays.asList(
                              okhttp3.ConnectionSpec.MODERN_TLS,
                              okhttp3.ConnectionSpec.COMPATIBLE_TLS,
                              okhttp3.ConnectionSpec.CLEARTEXT))
                      .build();
        }
      }
    }
    return c;
  }

  public void init(Context context) throws Exception {}

  public void init(Context context, String extend) throws Exception {
    init(context);
  }

  public String homeContent(boolean filter) throws Exception {
    return "";
  }

  public String homeVideoContent() throws Exception {
    return "";
  }

  public String categoryContent(String tid, String pg, boolean filter, HashMap<String, String> extend)
      throws Exception {
    return "";
  }

  public String detailContent(List<String> ids) throws Exception {
    return "";
  }

  public String searchContent(String key, boolean quick) throws Exception {
    return "";
  }

  public String searchContent(String key, boolean quick, String pg) throws Exception {
    return "";
  }

  public String playerContent(String flag, String id, List<String> vipFlags) throws Exception {
    return "";
  }

  public String liveContent(String url) throws Exception {
    return "";
  }

  public boolean manualVideoCheck() throws Exception {
    return false;
  }

  public boolean isVideoFormat(String url) throws Exception {
    return false;
  }

  public Object[] proxy(Map<String, String> params) throws Exception {
    return null;
  }

  public String action(String action) throws Exception {
    return null;
  }

  public void initApi(SpiderApi api) {}

  public void destroy() {}
}
