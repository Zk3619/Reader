package android.provider;

import android.content.ContentResolver;

/** Desktop stub — 部分 csp_* 源读取 ANDROID_ID 等 Secure 设置。 */
public final class Settings {
  private Settings() {}

  public static final class Secure {
    /** 常见 emulator 默认 ANDROID_ID；桌面无真实设备 ID 时使用稳定占位。 */
    private static final String DESKTOP_ANDROID_ID = "9774d56d682e549c";

    private Secure() {}

    public static final String ANDROID_ID = "android_id";

    public static String getString(ContentResolver resolver, String name) {
      if (name == null) return "";
      if (ANDROID_ID.equals(name)) return DESKTOP_ANDROID_ID;
      return "";
    }
  }
}
