package android.content;

import java.io.File;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Desktop stub of android.content.Context with minimal storage APIs. */
public class Context {
  public static final int MODE_PRIVATE = 0;

  private static final Map<String, Map<String, Object>> PREFS = new ConcurrentHashMap<>();
  private final File filesDir;
  private final File cacheDir;

  public Context() {
    File root = resolveDataRoot();
    this.filesDir = new File(root, "tv-android-files");
    this.cacheDir = new File(root, "tv-android-cache");
    this.filesDir.mkdirs();
    this.cacheDir.mkdirs();
    ensureSpiderConfigJson();
    ensureDoubanHistoryPref();
  }

  /** 与 Main 缓存目录同级：优先系统属性 / 环境变量，否则 ~/.reader */
  private static File resolveDataRoot() {
    String prop = System.getProperty("reader.tv.jar.cache");
    if (prop != null && !prop.isBlank()) {
      File parent = new File(prop.trim()).getParentFile();
      if (parent != null) return parent;
    }
    String cacheEnv = System.getenv("READER_TV_JAR_CACHE");
    if (cacheEnv != null && !cacheEnv.isBlank()) {
      File parent = new File(cacheEnv.trim()).getParentFile();
      if (parent != null) return parent;
    }
    return new File(System.getProperty("user.home", "."), ".reader");
  }

  /**
   * 多个 csp_*（如 Douban）会读 filesDir/config.json；缺失时 JSONObject("") 直接抛 JSONException。
   * 对齐 TVBox/FongMi：至少落一份空对象，homePage 等字段可后续由设置写入。
   */
  private void ensureSpiderConfigJson() {
    try {
      File cfg = new File(filesDir, "config.json");
      if (!cfg.exists() || cfg.length() == 0) {
        java.nio.file.Files.writeString(
            cfg.toPath(), "{}", java.nio.charset.StandardCharsets.UTF_8);
      }
    } catch (Exception e) {
      System.err.println("[tv-jar-host] seed config.json skipped: " + e.getMessage());
    }
  }

  /**
   * 豆瓣「猜你喜欢」会 {@code new JSONArray(prefs.getString("historyvodname",""))}；
   * 默认空串会直接 JSONException。桌面无观看历史时写入 {@code []}。
   */
  private void ensureDoubanHistoryPref() {
    try {
      SharedPreferences prefs =
          getSharedPreferences(getPackageName() + "_preferences", MODE_PRIVATE);
      String raw = prefs.getString("historyvodname", null);
      if (raw == null || raw.isBlank() || !raw.trim().startsWith("[")) {
        prefs.edit().putString("historyvodname", "[]").apply();
      }
    } catch (Exception e) {
      System.err.println("[tv-jar-host] seed historyvodname skipped: " + e.getMessage());
    }
  }

  public Context getApplicationContext() {
    return this;
  }

  public String getPackageName() {
    return "com.zkingz.reader";
  }

  public ContentResolver getContentResolver() {
    return new ContentResolver();
  }

  public android.content.res.Resources getResources() {
    return new android.content.res.Resources();
  }

  public android.content.pm.ApplicationInfo getApplicationInfo() {
    android.content.pm.ApplicationInfo info = new android.content.pm.ApplicationInfo();
    info.packageName = getPackageName();
    info.dataDir = filesDir.getAbsolutePath();
    return info;
  }

  public int checkSelfPermission(String permission) {
    // PackageManager.PERMISSION_GRANTED
    return 0;
  }

  public File getFilesDir() {
    return filesDir;
  }

  public File getCacheDir() {
    return cacheDir;
  }

  public File getExternalFilesDir(String type) {
    File dir = new File(filesDir, type == null ? "external" : type);
    dir.mkdirs();
    return dir;
  }

  public Object getSystemService(String name) {
    return null;
  }

  public SharedPreferences getSharedPreferences(String name, int mode) {
    PREFS.computeIfAbsent(name, k -> new ConcurrentHashMap<>());
    return new MapSharedPreferences(PREFS.get(name));
  }

  public android.content.res.AssetManager getAssets() {
    return new android.content.res.AssetManager();
  }

  private static final class MapSharedPreferences implements SharedPreferences {
    private final Map<String, Object> map;

    MapSharedPreferences(Map<String, Object> map) {
      this.map = map;
    }

    @Override
    public Map<String, ?> getAll() {
      return new HashMap<>(map);
    }

    @Override
    public String getString(String key, String def) {
      Object v = map.get(key);
      return v == null ? def : String.valueOf(v);
    }

    @Override
    public int getInt(String key, int def) {
      Object v = map.get(key);
      return v instanceof Number ? ((Number) v).intValue() : def;
    }

    @Override
    public long getLong(String key, long def) {
      Object v = map.get(key);
      return v instanceof Number ? ((Number) v).longValue() : def;
    }

    @Override
    public float getFloat(String key, float def) {
      Object v = map.get(key);
      return v instanceof Number ? ((Number) v).floatValue() : def;
    }

    @Override
    public boolean getBoolean(String key, boolean def) {
      Object v = map.get(key);
      return v instanceof Boolean ? (Boolean) v : def;
    }

    @Override
    public boolean contains(String key) {
      return map.containsKey(key);
    }

    @Override
    public Editor edit() {
      return new Editor() {
        private final Map<String, Object> pending = new HashMap<>();
        private boolean clear;

        @Override
        public Editor putString(String k, String v) {
          pending.put(k, v);
          return this;
        }

        @Override
        public Editor putInt(String k, int v) {
          pending.put(k, v);
          return this;
        }

        @Override
        public Editor putLong(String k, long v) {
          pending.put(k, v);
          return this;
        }

        @Override
        public Editor putFloat(String k, float v) {
          pending.put(k, v);
          return this;
        }

        @Override
        public Editor putBoolean(String k, boolean v) {
          pending.put(k, v);
          return this;
        }

        @Override
        public Editor remove(String k) {
          pending.put(k, null);
          return this;
        }

        @Override
        public Editor clear() {
          clear = true;
          return this;
        }

        @Override
        public boolean commit() {
          apply();
          return true;
        }

        @Override
        public void apply() {
          if (clear) map.clear();
          for (Map.Entry<String, Object> e : pending.entrySet()) {
            if (e.getValue() == null) map.remove(e.getKey());
            else map.put(e.getKey(), e.getValue());
          }
          pending.clear();
          clear = false;
        }
      };
    }
  }
}
