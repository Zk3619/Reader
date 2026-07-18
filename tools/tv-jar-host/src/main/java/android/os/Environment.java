package android.os;

import java.io.File;

/** Desktop stub of android.os.Environment（TVBox 路径等）。 */
public final class Environment {
  private Environment() {}

  public static File getExternalStorageDirectory() {
    String prop = System.getProperty("reader.tv.jar.cache");
    File root = null;
    if (prop != null && !prop.isBlank()) {
      root = new File(prop.trim()).getParentFile();
    }
    if (root == null) {
      String cacheEnv = System.getenv("READER_TV_JAR_CACHE");
      if (cacheEnv != null && !cacheEnv.isBlank()) {
        root = new File(cacheEnv.trim()).getParentFile();
      }
    }
    if (root == null) {
      root = new File(System.getProperty("user.home", "."), ".reader");
    }
    File ext = new File(root, "tv-external-storage");
    //noinspection ResultOfMethodCallIgnored
    ext.mkdirs();
    return ext;
  }

  public static String getExternalStorageState() {
    return "mounted";
  }
}
