package android.text;

/** Desktop stub of android.text.TextUtils. */
public final class TextUtils {
  private TextUtils() {}

  public static boolean isEmpty(CharSequence s) {
    return s == null || s.length() == 0;
  }

  public static boolean equals(CharSequence a, CharSequence b) {
    if (a == b) return true;
    if (a == null || b == null) return false;
    int n = a.length();
    if (n != b.length()) return false;
    for (int i = 0; i < n; i++) {
      if (a.charAt(i) != b.charAt(i)) return false;
    }
    return true;
  }

  public static boolean isDigitsOnly(CharSequence s) {
    if (s == null || s.length() == 0) return false;
    for (int i = 0; i < s.length(); i++) {
      if (!Character.isDigit(s.charAt(i))) return false;
    }
    return true;
  }
}
