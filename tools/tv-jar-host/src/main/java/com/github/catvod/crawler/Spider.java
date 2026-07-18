package com.github.catvod.crawler;

import android.content.Context;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import okhttp3.Dns;
import okhttp3.OkHttpClient;

/**
 * Desktop host stub of CatVod Spider base class.
 * 方法签名必须与 FongMi catvod Spider 一致，否则源 jar 会 NoSuchMethodError。
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
          CLIENT = c = new OkHttpClient.Builder().build();
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

  /** 部分源（XBPQ 等）在 init 后由宿主注入 SpiderApi */
  public void initApi(SpiderApi api) {}

  public void destroy() {}
}
