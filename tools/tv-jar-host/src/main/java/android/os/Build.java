package android.os;

/**
 * Desktop stub of android.os.Build — 源常读 MANUFACTURER/MODEL/BRAND/VERSION.SDK_INT。
 * 自动生成的空 stub 无字段会触发 NoSuchFieldError。
 */
public class Build {
  public static final String UNKNOWN = "unknown";

  public static String MANUFACTURER = "Reader";
  public static String BRAND = "Reader";
  public static String MODEL = "Desktop";
  public static String DEVICE = "desktop";
  public static String PRODUCT = "reader";
  public static String HARDWARE = "desktop";
  public static String FINGERPRINT = "reader/desktop:1.0";
  public static String HOST = "reader";
  public static String ID = "READER";
  public static String DISPLAY = "ReaderDesktop";
  public static String BOARD = "desktop";
  public static String BOOTLOADER = "unknown";
  public static String[] SUPPORTED_ABIS = new String[] {"x86_64", "armeabi-v7a"};
  public static String[] SUPPORTED_32_BIT_ABIS = new String[] {"armeabi-v7a"};
  public static String[] SUPPORTED_64_BIT_ABIS = new String[] {"x86_64"};

  public static class VERSION {
    public static final String RELEASE = "14";
    public static final String CODENAME = "REL";
    public static final String INCREMENTAL = "0";
    public static final int SDK_INT = 34;
    public static final String SECURITY_PATCH = "2024-01-01";
  }

  public static class VERSION_CODES {
    public static final int BASE = 1;
    public static final int LOLLIPOP = 21;
    public static final int M = 23;
    public static final int N = 24;
    public static final int O = 26;
    public static final int P = 28;
    public static final int Q = 29;
    public static final int R = 30;
    public static final int S = 31;
    public static final int TIRAMISU = 33;
    public static final int UPSIDE_DOWN_CAKE = 34;
  }
}
