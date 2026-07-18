package android.util;

/** Desktop stub of android.util.Base64. */
public final class Base64 {
  public static final int DEFAULT = 0;
  public static final int NO_WRAP = 2;
  public static final int URL_SAFE = 8;
  public static final int NO_PADDING = 1;

  private Base64() {}

  public static byte[] decode(String str, int flags) {
    java.util.Base64.Decoder d =
        (flags & URL_SAFE) != 0 ? java.util.Base64.getUrlDecoder() : java.util.Base64.getDecoder();
    return d.decode(str);
  }

  public static byte[] decode(byte[] input, int flags) {
    return decode(new String(input, java.nio.charset.StandardCharsets.ISO_8859_1), flags);
  }

  public static String encodeToString(byte[] input, int flags) {
    java.util.Base64.Encoder e =
        (flags & URL_SAFE) != 0 ? java.util.Base64.getUrlEncoder() : java.util.Base64.getEncoder();
    if ((flags & NO_WRAP) != 0) e = e.withoutPadding();
    // java encoder withoutPadding only drops padding; NO_WRAP approximated
    String s = e.encodeToString(input);
    if ((flags & NO_WRAP) != 0) s = s.replace("\n", "").replace("\r", "");
    if ((flags & NO_PADDING) != 0) s = s.replace("=", "");
    return s;
  }

  public static byte[] encode(byte[] input, int flags) {
    return encodeToString(input, flags).getBytes(java.nio.charset.StandardCharsets.ISO_8859_1);
  }
}
