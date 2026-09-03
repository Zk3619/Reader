package com.github.catvod.crawler;

/** XBPQ 等源在 init 后由宿主注入。 */
public class SpiderApi {
  public void log(String msg) {
    if (msg != null && !msg.isEmpty()) {
      android.util.Log.i("SpiderApi", msg);
    }
  }

  public String getAddress(boolean remote) {
    return "127.0.0.1";
  }

  public String getPort() {
    int p = com.github.catvod.Proxy.getPort();
    return p > 0 ? String.valueOf(p) : "9978";
  }

  public String multiReq(Object arr) {
    return "[]";
  }

  public String webParse(String flag, String url) {
    return "";
  }
}
