package com.github.catvod;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Enumeration;

/**
 * 对齐 FongMi host `com.github.catvod.Proxy`。
 * 加固 JAR 用 {@link #getUrl} 拼播放地址；未 {@link #set} 时端口为 -1。
 */
public final class Proxy {
  private static volatile int port = -1;

  private Proxy() {}

  public static void set(int port) {
    Proxy.port = port;
  }

  public static int getPort() {
    return port;
  }

  public static String getUrl() {
    return getUrl(true);
  }

  public static String getUrl(boolean local) {
    String host = local ? "127.0.0.1" : firstLanIpv4();
    if (host == null || host.isEmpty()) host = "127.0.0.1";
    return "http://" + host + ":" + getPort() + "/proxy";
  }

  private static String firstLanIpv4() {
    try {
      Enumeration<NetworkInterface> en = NetworkInterface.getNetworkInterfaces();
      while (en.hasMoreElements()) {
        NetworkInterface nif = en.nextElement();
        if (!nif.isUp() || nif.isLoopback()) continue;
        Enumeration<InetAddress> addrs = nif.getInetAddresses();
        while (addrs.hasMoreElements()) {
          InetAddress addr = addrs.nextElement();
          if (addr instanceof Inet4Address && !addr.isLoopbackAddress()) {
            return addr.getHostAddress();
          }
        }
      }
    } catch (Exception ignored) {
    }
    return "";
  }
}
