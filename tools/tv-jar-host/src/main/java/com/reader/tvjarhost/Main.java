package com.reader.tvjarhost;

import java.io.*;
import java.lang.reflect.Method;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.security.Security;
import java.util.*;
import java.util.concurrent.*;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/**
 * Desktop CatVod JAR host: download/cache jar → optional dex2jar → URLClassLoader → reflect Spider.
 * JSON-RPC over TCP (one request per connection, newline-delimited).
 */
public class Main {
  static final ConcurrentHashMap<String, URLClassLoader> LOADERS = new ConcurrentHashMap<>();
  static final ConcurrentHashMap<String, Object> SPIDERS = new ConcurrentHashMap<>();
  static final ConcurrentHashMap<String, Method> PROXY_METHODS = new ConcurrentHashMap<>();
  static volatile String recentKey = null;
  static Path cacheDir;

  public static void main(String[] args) throws Exception {
    int port = 19880;
    String cacheArg = null;
    for (int i = 0; i < args.length; i++) {
      if ("--port".equals(args[i]) && i + 1 < args.length) {
        port = Integer.parseInt(args[i + 1]);
        i++;
      } else if ("--cache".equals(args[i]) && i + 1 < args.length) {
        cacheArg = args[i + 1];
        i++;
      }
    }
    // 注册 BouncyCastle 以支持 AES/ECB/PKCS7Padding 等算法
    try {
      Class<?> bcProv = Class.forName("org.bouncycastle.jce.provider.BouncyCastleProvider");
      Security.insertProviderAt((java.security.Provider) bcProv.getDeclaredConstructor().newInstance(), 1);
      System.out.println("[tv-jar-host] BouncyCastle provider registered");
    } catch (ClassNotFoundException e) {
      System.err.println("[tv-jar-host] BouncyCastle not found in classpath; PKCS7Padding will be unavailable");
    } catch (Throwable e) {
      System.err.println("[tv-jar-host] BouncyCastle init failed: " + e.getMessage());
    }
    cacheDir = resolveCacheDir(cacheArg);
    Files.createDirectories(cacheDir);
    System.setProperty("reader.tv.jar.cache", cacheDir.toAbsolutePath().normalize().toString());
    cleanupStaleCacheTemps(cacheDir);
    // 预热桌面 Context：写入 filesDir/config.json，避免 Douban 等源 JSONException
    try {
      android.app.Application.getDesktop();
    } catch (Throwable t) {
      System.err.println("[tv-jar-host] Application bootstrap: " + t.getMessage());
    }
    migrateLegacyCacheIfNeeded(cacheDir);
    syncCatvodProxyPort();
    try (ServerSocket server = new ServerSocket(port)) {
      System.out.println("tv-jar-host listening on " + port + " cache=" + cacheDir);
      ExecutorService pool = Executors.newCachedThreadPool();
      while (true) {
        Socket s = server.accept();
        pool.submit(() -> handle(s));
      }
    }
  }

  /**
   * 缓存目录优先级：
   * 1) --cache
   * 2) READER_TV_JAR_CACHE（Rust 注入，通常为 exe/AppData/tv-jar-cache）
   * 3) host jar 同级 AppData/tv-jar-cache（发布布局）
   * 4) 旧版 ~/.reader/tv-jar-cache（兼容）
   */
  static Path resolveCacheDir(String cacheArg) {
    if (cacheArg != null && !cacheArg.isBlank()) {
      return Paths.get(cacheArg.trim()).toAbsolutePath().normalize();
    }
    String env = System.getenv("READER_TV_JAR_CACHE");
    if (env != null && !env.isBlank()) {
      return Paths.get(env.trim()).toAbsolutePath().normalize();
    }
    Path hostDir = hostJarDir();
    if (hostDir != null) {
      Path beside = hostDir.resolve("AppData").resolve("tv-jar-cache");
      return beside.toAbsolutePath().normalize();
    }
    return Paths.get(System.getProperty("user.home"), ".reader", "tv-jar-cache")
        .toAbsolutePath()
        .normalize();
  }

  static void migrateLegacyCacheIfNeeded(Path target) {
    try {
      Path legacy = Paths.get(System.getProperty("user.home"), ".reader", "tv-jar-cache");
      if (!Files.isDirectory(legacy) || legacy.toAbsolutePath().normalize().equals(target.toAbsolutePath().normalize())) {
        return;
      }
      boolean targetEmpty = true;
      try (DirectoryStream<Path> ds = Files.newDirectoryStream(target)) {
        targetEmpty = !ds.iterator().hasNext();
      } catch (Exception ignored) {
      }
      if (!targetEmpty) return;
      int moved = 0;
      try (DirectoryStream<Path> ds = Files.newDirectoryStream(legacy)) {
        for (Path child : ds) {
          Path dest = target.resolve(child.getFileName().toString());
          if (!Files.exists(dest)) {
            Files.move(child, dest, StandardCopyOption.REPLACE_EXISTING);
            moved++;
          }
        }
      }
      if (moved > 0) {
        System.out.println("migrated " + moved + " entries from " + legacy + " -> " + target);
      }
    } catch (Exception e) {
      System.err.println("legacy cache migrate skipped: " + e.getMessage());
    }
  }

  static void handle(Socket socket) {
    try (socket;
         BufferedReader in = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
         BufferedWriter out = new BufferedWriter(new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8))) {
      String line = in.readLine();
      if (line == null) return;
      out.write(dispatch(line));
      out.write("\n");
      out.flush();
    } catch (Exception e) {
      e.printStackTrace();
    }
  }

  static String dispatch(String line) {
    try {
      Map<String, Object> req = Json.object(line);
      Object id = req.getOrDefault("id", 1);
      String method = String.valueOf(req.get("method"));
      @SuppressWarnings("unchecked")
      Map<String, Object> params = req.get("params") instanceof Map
          ? (Map<String, Object>) req.get("params")
          : Collections.emptyMap();
      Object result;
      switch (method) {
        case "ping":
          result = "pong";
          break;
        case "callSpider":
          result = callSpider(params);
          break;
        case "jsonExt":
          result = jsonExt(params);
          break;
        case "proxy":
          result = proxy(params);
          break;
        case "clearCache":
          result = clearCache();
          break;
        case "prefetchJar":
          result = prefetchJar(params);
          break;
        default:
          return Json.error(id, "unknown method: " + method);
      }
      return Json.ok(id, result);
    } catch (Throwable e) {
      e.printStackTrace();
      return Json.error(1, formatThrowable(e));
    }
  }

  static String formatThrowable(Throwable e) {
    Throwable cur = e;
    while (cur.getCause() != null && cur.getCause() != cur) cur = cur.getCause();
    String msg = cur.getMessage() == null ? cur.toString() : cur.getMessage();
    String name = cur.getClass().getSimpleName();
    if (msg.contains("UnsatisfiedLinkError") || msg.contains(".so") || msg.contains("JNI")) {
      return "JNI/native .so not supported on desktop: " + msg;
    }
    if (cur instanceof VerifyError || name.equals("VerifyError")) {
      return name + ": " + msg
          + "（多为 dex2jar 缺 StackMap；请确认 host 以 java -noverify 启动，或清除 tv-jar-cache 后重试）";
    }
    if (cur instanceof ClassNotFoundException || cur instanceof NoClassDefFoundError) {
      // Spider 本体缺失 ≠ 缺 stub：区分源 jar / dex2jar 与依赖
      if (msg.contains("com.github.catvod.spider.")
          && !msg.contains("Init")
          && !msg.contains("Proxy")
          && !msg.contains("ClassFormatError")) {
        return name + ": " + msg
            + "（源 JAR 中未找到该 Spider 类。请确认站点 api/jar 匹配；若为 DEX 源请安装 dex2jar 并清空 AppData/tv-jar-cache 后重试）";
      }
      if (msg.contains("ClassFormatError") || msg.contains("dex2jar")) {
        return name + ": " + msg
            + "（dex2jar 产物损坏。请运行 tools/tv-jar-host/fetch-dex2jar.ps1，并删除 tv-jar-cache 中对应 *-dex2jar.jar 后重试）";
      }
      return name + ": " + msg
          + "（桌面 host 需提供 CatVod 基类 stub；若仍缺 org.json/okhttp/gson，请运行 tools/tv-jar-host/fetch-host-libs.ps1）";
    }
    return name + ": " + msg;
  }

  static String callSpider(Map<String, Object> p) throws Exception {
    String siteKey = str(p, "siteKey");
    String api = str(p, "api");
    String ext = str(p, "ext");
    String jar = str(p, "jar");
    String method = str(p, "method");
    Object argsObj = p.get("args");
    List<Object> args = argsObj instanceof List ? (List<Object>) argsObj : Collections.emptyList();

    Object spider = getSpider(siteKey, api, ext, jar);
    Method m = findMethod(spider.getClass(), method);
    if (m == null) throw new NoSuchMethodException(method);
    Class<?>[] types = m.getParameterTypes();
    Object[] callArgs = new Object[types.length];
    for (int i = 0; i < types.length; i++) {
      Object raw = i < args.size() ? args.get(i) : null;
      callArgs[i] = coerce(raw, types[i]);
    }
    // 供 jar 内 Init.getSpider / Class.forName 使用站点 ClassLoader
    ClassLoader prev = Thread.currentThread().getContextClassLoader();
    try {
      Thread.currentThread().setContextClassLoader(spider.getClass().getClassLoader());
      Object out = m.invoke(spider, callArgs);
      return out == null ? "" : String.valueOf(out);
    } finally {
      Thread.currentThread().setContextClassLoader(prev);
    }
  }

  /**
   * 饭太硬 / fty 等 Guard jar：内含 Android .so + DexNative，只能在真机 DexClassLoader 运行。
   * 桌面若继续反射会卡住数十秒直至前端超时。
   */
  static void assertNotAndroidNativeGuardJar(Path jarFile) throws Exception {
    if (jarFile == null || !Files.isRegularFile(jarFile)) return;
    if (!looksLikeAndroidNativeGuardJar(jarFile)) return;
    throw new IllegalStateException(
        "此影视 JAR 为 Android 原生加固（DexNative / .so），桌面端无法运行。"
            + "请换用非 Guard 加固的配置，或在 Android 版使用。 path="
            + jarFile.getFileName());
  }

  static boolean looksLikeAndroidNativeGuardJar(Path jarFile) {
    try (ZipFile zf = new ZipFile(jarFile.toFile())) {
      Enumeration<? extends ZipEntry> en = zf.entries();
      while (en.hasMoreElements()) {
        String name = en.nextElement().getName();
        if (name == null) continue;
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".so")) return true;
        if (lower.endsWith(".guard")) return true;
        if (name.equals("com/github/catvod/spider/DexNative.class")) return true;
        if (lower.contains("ftyguard") || lower.contains("dexnative")) return true;
      }
    } catch (Exception e) {
      return false;
    }
    return false;
  }

  /** Init.getSpider(api) — 用当前/最近站点 ClassLoader 实例化同 jar 内 Spider。 */
  public static com.github.catvod.crawler.Spider loadSpiderByApi(String api) throws Exception {
    if (api == null || api.isBlank()) {
      throw new IllegalArgumentException("Init.getSpider: empty api");
    }
    String className = resolveSpiderClassName(api);
    // BaseSpiderGuard 构造里会再调 Init.getSpider(本类名)；桌面不能走 DexNative，禁止递归实例化 Guard
    if (className.endsWith("Guard") || className.endsWith("BaseSpiderGuard")) {
      throw new UnsupportedOperationException(
          "Android DexNative Guard 在桌面不可用: "
              + className
              + "（需 .so 加固壳，请换源或使用 Android）");
    }
    ClassLoader cl = Thread.currentThread().getContextClassLoader();
    if (cl == null && recentKey != null) cl = LOADERS.get(recentKey);
    if (cl == null) cl = Main.class.getClassLoader();
    Class<?> clz = null;
    ClassNotFoundException last = null;
    try {
      clz = Class.forName(className, true, cl);
    } catch (ClassNotFoundException e) {
      last = e;
    }
    if (clz == null) {
      for (URLClassLoader loader : LOADERS.values()) {
        try {
          clz = Class.forName(className, true, loader);
          last = null;
          break;
        } catch (ClassNotFoundException ce) {
          last = ce;
        }
      }
    }
    if (clz == null) {
      throw last != null ? last : new ClassNotFoundException(className);
    }
    Object instance = clz.getDeclaredConstructor().newInstance();
    if (!(instance instanceof com.github.catvod.crawler.Spider)) {
      throw new ClassCastException(className + " is not Spider");
    }
    return (com.github.catvod.crawler.Spider) instance;
  }

  static String resolveSpiderClassName(String api) {
    String name = api.trim();
    if (name.startsWith("csp_")) name = name.substring(4);
    if (name.contains(".")) return name;
    return "com.github.catvod.spider." + name;
  }

  static String jsonExt(Map<String, Object> p) throws Exception {
    if (recentKey == null || !LOADERS.containsKey(recentKey)) {
      throw new IllegalStateException("no jar loaded for jsonExt");
    }
    int parseType = (int) num(p.get("parseType"), 1);
    String name = str(p, "name");
    String url = str(p, "url");
    String flag = str(p, "flag");
    String suffix = parseType == 2 ? "Parallel" : parseType == 3 ? "Vip" : "Basic";
    Class<?> clz = LOADERS.get(recentKey).loadClass("com.github.catvod.parser.Json" + suffix);
    Method parse = null;
    for (Method m : clz.getMethods()) {
      if ("parse".equals(m.getName())) {
        parse = m;
        break;
      }
    }
    if (parse == null) throw new NoSuchMethodException("parse");
    LinkedHashMap<String, String> jxs = new LinkedHashMap<>();
    jxs.put(name, name);
    Object result;
    if (parse.getParameterCount() >= 3) {
      result = parse.invoke(null, name, url, flag);
    } else {
      result = parse.invoke(null, jxs, url);
    }
    return result == null ? "{}" : String.valueOf(result);
  }

  static Object clearCache() throws Exception {
    for (URLClassLoader loader : LOADERS.values()) {
      try {
        loader.close();
      } catch (Throwable ignored) {
      }
    }
    LOADERS.clear();
    SPIDERS.clear();
    PROXY_METHODS.clear();
    recentKey = null;
    if (cacheDir != null && Files.exists(cacheDir)) {
      try (var walk = Files.walk(cacheDir)) {
        walk.sorted(Comparator.reverseOrder()).forEach(p -> {
          try {
            Files.deleteIfExists(p);
          } catch (Exception ignored) {
          }
        });
      }
      Files.createDirectories(cacheDir);
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("ok", true);
    out.put("path", cacheDir != null ? cacheDir.toString() : "");
    return out;
  }

  /** 预热：下载 / dex2jar / 建立 ClassLoader，不实例化 Spider */
  static Object prefetchJar(Map<String, Object> p) throws Exception {
    String jar = str(p, "jar");
    if (jar.isBlank()) {
      Map<String, Object> out = new LinkedHashMap<>();
      out.put("ok", false);
      out.put("reason", "empty jar");
      return out;
    }
    String jaKey = md5(jar);
    ensureLoader(jaKey, jar);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("ok", true);
    out.put("key", jaKey);
    return out;
  }

  static Object proxy(Map<String, Object> p) throws Exception {
    Map<String, String> params = new HashMap<>();
    for (Map.Entry<String, Object> e : p.entrySet()) {
      params.put(e.getKey(), e.getValue() == null ? "" : String.valueOf(e.getValue()));
    }
    Method method = recentKey != null ? PROXY_METHODS.get(recentKey) : null;
    Object[] rs = invokeProxy(method, params);
    if (rs == null) {
      for (Map.Entry<String, Method> e : PROXY_METHODS.entrySet()) {
        rs = invokeProxy(e.getValue(), params);
        if (rs != null) break;
      }
    }
    if (rs == null) throw new IllegalStateException("proxy returned null");
    int code = rs[0] instanceof Number ? ((Number) rs[0]).intValue() : 500;
    String mime = rs.length > 1 && rs[1] != null ? String.valueOf(rs[1]) : "application/octet-stream";
    byte[] body = toBytes(rs.length > 2 ? rs[2] : null);
    Map<String, String> headers = new HashMap<>();
    if (rs.length > 3 && rs[3] instanceof Map) {
      for (Map.Entry<?, ?> he : ((Map<?, ?>) rs[3]).entrySet()) {
        if (he.getKey() != null && he.getValue() != null) {
          headers.put(String.valueOf(he.getKey()), String.valueOf(he.getValue()));
        }
      }
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("code", code);
    out.put("mime", mime);
    out.put("bodyBase64", Base64.getEncoder().encodeToString(body));
    out.put("headers", headers);
    return out;
  }

  static Object[] invokeProxy(Method method, Map<String, String> params) {
    try {
      if (method == null) return null;
      return (Object[]) method.invoke(null, params);
    } catch (Throwable e) {
      e.printStackTrace();
      return null;
    }
  }

  static byte[] toBytes(Object body) throws IOException {
    if (body == null) return new byte[0];
    if (body instanceof byte[]) return (byte[]) body;
    if (body instanceof InputStream) {
      try (InputStream in = (InputStream) body) {
        return in.readAllBytes();
      }
    }
    return String.valueOf(body).getBytes(StandardCharsets.UTF_8);
  }

  static Object getSpider(String siteKey, String api, String ext, String jar) throws Exception {
    String jaKey = md5(jar);
    String spKey = jaKey + siteKey;
    // 先拦 Android 原生加固 JAR，避免已缓存的 Guard 实例把 homeContent 挂死
    try {
      assertNotAndroidNativeGuardJar(resolveJar(jar));
    } catch (IllegalStateException e) {
      SPIDERS.entrySet().removeIf(en -> en.getKey().startsWith(jaKey));
      URLClassLoader doomed = LOADERS.remove(jaKey);
      if (doomed != null) {
        try {
          doomed.close();
        } catch (Exception ignored) {
        }
      }
      throw e;
    }
    Object cached = SPIDERS.get(spKey);
    if (cached != null) return cached;
    URLClassLoader loader = ensureLoader(jaKey, jar);
    String className = "com.github.catvod.spider." + api.replace("csp_", "");
    Class<?> clz;
    try {
      clz = loader.loadClass(className);
    } catch (ClassNotFoundException e) {
      // 附带 jar 内是否含该类，便于区分「下载错 jar」与「dex2jar 漏类」
      Path loadable = null;
      try {
        loadable = prepareLoadableJar(resolveJar(jar));
      } catch (Exception ignored) {
      }
      String hint = "";
      if (loadable != null && Files.isRegularFile(loadable)) {
        boolean present = jarContainsClass(loadable, className);
        hint =
            " loadable="
                + loadable.getFileName()
                + " size="
                + Files.size(loadable)
                + " containsClass="
                + present;
        if (!present) {
          String similar = suggestSimilarSpiderClasses(loadable, className);
          hint +=
              "；该 JAR/DEX 中确实没有 "
                  + className
                  + "（不是 dex2jar 偶发漏类）。请检查站点 api 与 jar 是否同一套配置"
                  + (similar.isEmpty() ? "" : ("；JAR 内相近类: " + similar));
        }
      }
      throw new ClassNotFoundException(className + hint, e);
    } catch (ClassFormatError e) {
      throw new IllegalStateException(
          "Spider 类格式损坏（多为 dex2jar 产物问题）: " + className + " — " + e.getMessage(), e);
    } catch (NoClassDefFoundError e) {
      // 依赖链里若仍碰到 jar 内损坏的 Init 等，给出明确提示
      throw new IllegalStateException(
          "Spider 依赖加载失败: " + className + " — " + e.getMessage(), e);
    }
    Object instance = clz.getDeclaredConstructor().newInstance();
    try {
      var field = clz.getField("siteKey");
      field.set(instance, siteKey);
    } catch (Throwable ignored) {
      try {
        var field = clz.getSuperclass().getField("siteKey");
        field.set(instance, siteKey);
      } catch (Throwable ignored2) {
      }
    }
    for (Method m : clz.getMethods()) {
      if ("init".equals(m.getName()) && m.getParameterCount() == 2) {
        try {
          // 传入桌面 Application stub，避免源在 init 内 NPE / 跳过文件准备
          m.invoke(instance, android.app.Application.getDesktop(), ext);
        } catch (Throwable t) {
          Throwable c = t.getCause() != null ? t.getCause() : t;
          if (String.valueOf(c).contains("Context") && String.valueOf(c).contains("null")) {
            throw new IllegalStateException(
                "Spider.init requires Android Context; desktop stub failed. " + c.getMessage());
          }
          // init 失败不阻断：许多源在无完整 Android 能力时仍可 homeContent
          System.err.println("[tv-jar-host] spider init skipped: " + c);
        }
        break;
      }
    }
    // XBPQ 等依赖 SpiderApi（log/getAddress/webParse）
    try {
      for (Method m : clz.getMethods()) {
        if ("initApi".equals(m.getName()) && m.getParameterCount() == 1) {
          m.invoke(instance, new com.github.catvod.crawler.SpiderApi());
          break;
        }
      }
    } catch (Throwable t) {
      System.err.println("[tv-jar-host] spider initApi skipped: " + t);
    }
    SPIDERS.put(spKey, instance);
    return instance;
  }

  static URLClassLoader ensureLoader(String jaKey, String jarSpec) throws Exception {
    URLClassLoader existing = LOADERS.get(jaKey);
    if (existing != null) {
      recentKey = jaKey;
      return existing;
    }
    Object lock = JAR_DOWNLOAD_LOCKS.computeIfAbsent("loader:" + jaKey, k -> new Object());
    synchronized (lock) {
      existing = LOADERS.get(jaKey);
      if (existing != null) {
        recentKey = jaKey;
        return existing;
      }
      Path jarFile = resolveJar(jarSpec);
      assertNotAndroidNativeGuardJar(jarFile);
      Path loadable = prepareLoadableJar(jarFile);
      // lib 必须在 spider jar 之前：站点 jar 常自带未补丁的 org.json，会盖掉 lib/json-*.jar
      List<URL> urls = new ArrayList<>();
      for (Path lib : hostLibJars()) {
        urls.add(lib.toUri().toURL());
        System.out.println("classpath lib " + lib);
      }
      urls.add(loadable.toUri().toURL());
      URLClassLoader loader =
          new SpiderURLClassLoader(
              urls.toArray(new URL[0]),
              new AndroidStubClassLoader(Main.class.getClassLoader()));
      // 桌面跳过 spider.Init（jar 内 Init 常 ClassFormatError；host 提供 stub）
      tryProxy(jaKey, loader);
      syncCatvodProxyPort(loader);
      LOADERS.put(jaKey, loader);
      recentKey = jaKey;
      return loader;
    }
  }

  /**
   * parent-first；禁止从站点 jar 加载损坏的 Init，并吞掉 dex2jar 坏 class 为 CNF 以便回退/报错更清晰。
   */
  static final class SpiderURLClassLoader extends URLClassLoader {
    SpiderURLClassLoader(URL[] urls, ClassLoader parent) {
      super(urls, parent);
    }

    @Override
    protected Class<?> findClass(String name) throws ClassNotFoundException {
      if ("com.github.catvod.spider.Init".equals(name)) {
        throw new ClassNotFoundException(name);
      }
      try {
        return super.findClass(name);
      } catch (ClassFormatError e) {
        throw new ClassNotFoundException(
            name + " (ClassFormatError/dex2jar: " + e.getMessage() + ")", e);
      }
    }
  }

  /** tv-jar-host.jar 同级 lib/*.jar（org.json、okhttp 等） */
  static List<Path> hostLibJars() {
    List<Path> out = new ArrayList<>();
    Path hostDir = hostJarDir();
    if (hostDir == null) return out;
    Path lib = hostDir.resolve("lib");
    // 开发：tools/tv-jar-host/lib
    Path walk = hostDir;
    for (int i = 0; i < 6 && walk != null; i++) {
      Path candidate = walk.resolve("lib");
      if (Files.isDirectory(candidate)) {
        lib = candidate;
        break;
      }
      // tools/tv-jar-host/build/libs → ../../lib
      walk = walk.getParent();
    }
    if (!Files.isDirectory(lib)) {
      // tools/tv-jar-host/lib from build/libs
      Path fromLibs = hostDir.resolve("..").resolve("..").resolve("lib").normalize();
      if (Files.isDirectory(fromLibs)) lib = fromLibs;
    }
    if (!Files.isDirectory(lib)) return out;
    try (DirectoryStream<Path> ds = Files.newDirectoryStream(lib, "*.jar")) {
      for (Path j : ds) out.add(j.toAbsolutePath().normalize());
    } catch (Exception ignored) {
    }
    return out;
  }

  static void tryInit(URLClassLoader loader) {
    /* desktop: intentionally no-op — Init pulls android.app.Application 等，失败会影响排障噪音 */
  }

  static void tryProxy(String key, URLClassLoader loader) {
    try {
      Class<?> clz = loader.loadClass("com.github.catvod.spider.Proxy");
      Method method = clz.getMethod("proxy", Map.class);
      PROXY_METHODS.put(key, method);
    } catch (Throwable ignored) {
    }
  }

  /** FongMi 在 Server 启动时 Proxy.set(port)；桌面必须同样注入，否则 getUrl 变成 127.0.0.1:-1 */
  static void syncCatvodProxyPort() {
    int port = readHttpProxyPort();
    for (URLClassLoader loader : LOADERS.values()) {
      syncCatvodProxyPort(loader);
    }
    System.setProperty("reader.tv.proxy.port", String.valueOf(port));
  }

  static void syncCatvodProxyPort(ClassLoader loader) {
    int port = readHttpProxyPort();
    for (String name :
        new String[] {"com.github.catvod.Proxy", "com.github.catvod.crawler.Proxy"}) {
      try {
        Class<?> clz = loader.loadClass(name);
        Method set = clz.getMethod("set", int.class);
        set.invoke(null, port);
        System.out.println("[tv-jar-host] " + name + ".set(" + port + ")");
      } catch (Throwable ignored) {
      }
    }
  }

  static int readHttpProxyPort() {
    String env = System.getenv("READER_TV_PROXY_PORT");
    if (env != null && !env.isBlank()) {
      try {
        int p = Integer.parseInt(env.trim());
        if (p > 0 && p < 65536) return p;
      } catch (Exception ignored) {
      }
    }
    String prop = System.getProperty("reader.tv.proxy.port");
    if (prop != null && !prop.isBlank()) {
      try {
        int p = Integer.parseInt(prop.trim());
        if (p > 0 && p < 65536) return p;
      } catch (Exception ignored) {
      }
    }
    return 9978;
  }

  static final ConcurrentHashMap<String, Object> JAR_DOWNLOAD_LOCKS = new ConcurrentHashMap<>();

  static Path resolveJar(String jarSpec) throws Exception {
    String jar = jarSpec == null ? "" : jarSpec.trim();
    String md5Expect = "";
    int sep = jar.indexOf(";md5;");
    if (sep >= 0) {
      md5Expect = jar.substring(sep + 5).trim();
      // 对齐 FongMi：;md5; 后可以是远程 md5 文本 URL
      if (md5Expect.startsWith("http://") || md5Expect.startsWith("https://")) {
        md5Expect = fetchText(md5Expect).trim();
      }
      jar = jar.substring(0, sep).trim();
    }
    if (jar.startsWith("http://") || jar.startsWith("https://")) {
      String name = md5(jar) + ".jar";
      Path dest = cacheDir.resolve(name);
      Object lock = JAR_DOWNLOAD_LOCKS.computeIfAbsent(name, k -> new Object());
      synchronized (lock) {
        boolean md5Ok =
            md5Expect.isEmpty()
                || (Files.exists(dest)
                    && Files.size(dest) > 0
                    && md5Expect.equalsIgnoreCase(fileMd5(dest)));
        if (Files.exists(dest) && Files.size(dest) > 0 && isZipMagic(dest) && md5Ok) {
          return dest;
        }
        // 已有可用 jar 但 md5 标注过期：仍尝试刷新；失败则沿用旧文件（避免 empty 下载把首页打挂）
        boolean hadValid = Files.exists(dest) && Files.size(dest) > 0 && isZipMagic(dest);
        try {
          downloadAtomic(jar, dest);
        } catch (Exception e) {
          if (hadValid) {
            System.err.println(
                "[tv-jar-host] re-download failed, keep cached jar: "
                    + dest
                    + " err="
                    + e.getMessage());
            return dest;
          }
          throw e;
        }
        if (!md5Expect.isEmpty() && Files.exists(dest) && Files.size(dest) > 0) {
          String actual = fileMd5(dest);
          if (!md5Expect.equalsIgnoreCase(actual)) {
            System.err.println(
                "[tv-jar-host] jar md5 mismatch after download (use anyway): expect="
                    + md5Expect
                    + " actual="
                    + actual
                    + " url="
                    + jar
                    + " size="
                    + Files.size(dest));
            Path dexOut =
                cacheDir.resolve(
                    dest.getFileName().toString().replace(".jar", "") + "-dex2jar.jar");
            try {
              Files.deleteIfExists(dexOut);
            } catch (Exception ignored) {
            }
          }
        }
        return dest;
      }
    }
    Path p = Paths.get(jar.replace("file://", ""));
    if (!Files.exists(p)) throw new FileNotFoundException(jar);
    return p;
  }

  static boolean isZipMagic(Path file) {
    try (InputStream in = Files.newInputStream(file)) {
      int b0 = in.read();
      int b1 = in.read();
      return b0 == 'P' && b1 == 'K';
    } catch (Exception e) {
      return false;
    }
  }

  /** 下载到唯一临时文件再替换，并按 dest 加锁，避免并发把 .part 截成空文件。 */
  static void downloadAtomic(String url, Path dest) throws Exception {
    Files.createDirectories(dest.getParent());
    Path part =
        dest.resolveSibling(
            dest.getFileName().toString() + "." + UUID.randomUUID().toString().replace("-", "") + ".part");
    try {
      download(url, part);
      if (!Files.exists(part) || Files.size(part) == 0) {
        throw new IllegalStateException("downloaded empty jar: " + url);
      }
      if (!isZipMagic(part)) {
        throw new IllegalStateException(
            "download is not a jar/zip: " + url + " size=" + Files.size(part));
      }
      try {
        Files.move(part, dest, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
      } catch (AtomicMoveNotSupportedException e) {
        Files.move(part, dest, StandardCopyOption.REPLACE_EXISTING);
      }
    } catch (Exception e) {
      try {
        Files.deleteIfExists(part);
      } catch (Exception ignored) {
      }
      throw e;
    }
  }

  static String fetchText(String url) throws Exception {
    HttpURLConnection conn = openGet(url);
    int code = conn.getResponseCode();
    if (code >= 400) {
      throw new IllegalStateException("HTTP " + code + " fetching " + url);
    }
    try (InputStream in = conn.getInputStream()) {
      return new String(in.readAllBytes(), StandardCharsets.UTF_8);
    }
  }

  static HttpURLConnection openGet(String url) throws Exception {
    HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
    conn.setConnectTimeout(20000);
    conn.setReadTimeout(120000);
    conn.setInstanceFollowRedirects(true);
    conn.setRequestProperty(
        "User-Agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    conn.setRequestProperty("Accept", "*/*");
    return conn;
  }

  static Path prepareLoadableJar(Path jarFile) throws Exception {
    if (hasClassFiles(jarFile)) return sanitizeFalseAbstractClasses(jarFile);
    if (hasDex(jarFile)) {
      Path out =
          cacheDir.resolve(jarFile.getFileName().toString().replace(".jar", "") + "-dex2jar.jar");
      if (isValidDex2JarOutput(out)
          && Files.getLastModifiedTime(out).compareTo(Files.getLastModifiedTime(jarFile)) >= 0) {
        return sanitizeFalseAbstractClasses(out);
      }
      // 删除损坏/半成品（曾出现 22 字节空壳被复用 → ClassNotFoundException: Douban）
      try {
        Files.deleteIfExists(out);
        Files.deleteIfExists(Paths.get(out + ".absfix"));
      } catch (Exception ignored) {
      }
      runDex2Jar(jarFile, out);
      if (!isValidDex2JarOutput(out)) {
        Path home = resolveDex2jarHome();
        String hint =
            home == null
                ? "未找到捆绑 dex2jar。请运行 tools/tv-jar-host/fetch-dex2jar.ps1，或将 dex2jar 放到 tools/dex2jar/（与 exe 同级亦可）。"
                : ("已找到 dex2jar="
                    + home
                    + " 但产物无效 size="
                    + (Files.exists(out) ? Files.size(out) : -1));
        try {
          Files.deleteIfExists(out);
        } catch (Exception ignored) {
        }
        throw new IllegalStateException(
            "JAR 仅含 DEX 无 .class，桌面需 dex2jar。" + hint + " path=" + jarFile);
      }
      return sanitizeFalseAbstractClasses(out);
    }
    return jarFile;
  }

  /**
   * 混淆 DEX 常乱标 ACC_ABSTRACT。HotSpot 规则：
   * - 有实例 &lt;init&gt; 且无抽象方法 → 可去 ABSTRACT（否则 InstantiationError）
   * - 仍有抽象方法 → 必须保留/恢复 ABSTRACT（否则 VerifyError / 加载失败）
   */
  static Path sanitizeFalseAbstractClasses(Path jar) throws Exception {
    Path marker = Paths.get(jar.toString() + ".absfix");
    final String MARK = "v2-abs-methods";
    Object lock =
        JAR_DOWNLOAD_LOCKS.computeIfAbsent(
            "sanitize:" + jar.toAbsolutePath().normalize(), k -> new Object());
    synchronized (lock) {
      try {
        if (Files.isRegularFile(marker)) {
          String body = Files.readString(marker);
          if (body.contains(MARK)
              && Files.getLastModifiedTime(marker).compareTo(Files.getLastModifiedTime(jar))
                  >= 0) {
            return jar;
          }
        }
      } catch (Exception ignored) {
      }
      // 清理历史半成品，避免占盘 / 干扰排障
      cleanupSiblingTemps(jar, ".absfixing");
      cleanupSiblingTemps(jar, ".converting");
      cleanupSiblingTemps(jar, ".sanitized");

      Path tmp =
          jar.resolveSibling(
              jar.getFileName()
                  + "."
                  + UUID.randomUUID().toString().replace("-", "")
                  + ".absfixing");
      int cleared = 0;
      int restored = 0;
      try {
        try (ZipFile zf = new ZipFile(jar.toFile());
            ZipOutputStream zos = new ZipOutputStream(Files.newOutputStream(tmp))) {
          Enumeration<? extends ZipEntry> en = zf.entries();
          byte[] buf = new byte[8192];
          while (en.hasMoreElements()) {
            ZipEntry in = en.nextElement();
            String name = in.getName();
            ZipEntry out = new ZipEntry(name);
            zos.putNextEntry(out);
            if (!in.isDirectory()) {
              try (InputStream is = zf.getInputStream(in)) {
                if (name.endsWith(".class")) {
                  ByteArrayOutputStream bos = new ByteArrayOutputStream();
                  int n;
                  while ((n = is.read(buf)) >= 0) bos.write(buf, 0, n);
                  byte[] cls = bos.toByteArray();
                  int[] delta = new int[1];
                  byte[] fixed = reconcileAbstractFlag(cls, delta);
                  if (delta[0] < 0) cleared++;
                  if (delta[0] > 0) restored++;
                  zos.write(fixed);
                } else {
                  int n;
                  while ((n = is.read(buf)) >= 0) zos.write(buf, 0, n);
                }
              }
            }
            zos.closeEntry();
          }
        }
        replaceFileWithRetry(tmp, jar);
        Files.writeString(
            marker,
            MARK + "\ncleared=" + cleared + "\nrestored=" + restored + "\n",
            StandardCharsets.UTF_8);
        System.out.println(
            "[tv-jar-host] abstract-flag reconcile cleared="
                + cleared
                + " restored="
                + restored
                + " in "
                + jar.getFileName());
        return jar;
      } catch (Exception e) {
        try {
          Files.deleteIfExists(tmp);
        } catch (Exception ignored) {
        }
        // 若目标 jar 仍可用且已有有效 marker，不阻断加载
        if (Files.isRegularFile(jar) && Files.size(jar) > 1024) {
          System.err.println(
              "[tv-jar-host] sanitize skipped (keep existing jar): "
                  + jar.getFileName()
                  + " err="
                  + e);
          return jar;
        }
        throw e;
      }
    }
  }

  /** Windows 上 REPLACE+ATOMIC_MOVE 常因文件占用失败；复制覆盖 + 重试更稳。 */
  static void replaceFileWithRetry(Path src, Path dest) throws IOException {
    IOException last = null;
    for (int i = 0; i < 8; i++) {
      try {
        try {
          Files.move(src, dest, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException | AccessDeniedException e) {
          Files.copy(src, dest, StandardCopyOption.REPLACE_EXISTING);
          Files.deleteIfExists(src);
        }
        return;
      } catch (IOException e) {
        last = e;
        try {
          Thread.sleep(40L * (i + 1));
        } catch (InterruptedException ie) {
          Thread.currentThread().interrupt();
          throw e;
        }
      }
    }
    // 最后尝试：写到旁路名，让调用方仍可读到新内容
    Path alt = dest.resolveSibling(dest.getFileName() + ".sanitized");
    try {
      Files.move(src, alt, StandardCopyOption.REPLACE_EXISTING);
      System.err.println(
          "[tv-jar-host] replace failed, sanitized copy at " + alt.getFileName() + " last=" + last);
      Files.copy(alt, dest, StandardCopyOption.REPLACE_EXISTING);
      return;
    } catch (IOException e2) {
      if (last != null) e2.addSuppressed(last);
      throw e2;
    }
  }

  static void cleanupSiblingTemps(Path jar, String suffix) {
    try {
      Path parent = jar.getParent();
      if (parent == null || !Files.isDirectory(parent)) return;
      String prefix = jar.getFileName().toString() + ".";
      try (DirectoryStream<Path> ds = Files.newDirectoryStream(parent, prefix + "*" + suffix)) {
        for (Path p : ds) {
          try {
            Files.deleteIfExists(p);
          } catch (Exception ignored) {
          }
        }
      }
    } catch (Exception ignored) {
    }
  }

  /** 启动时清掉上次崩溃留下的半成品，减少 AccessDenied / 脏缓存 */
  static void cleanupStaleCacheTemps(Path dir) {
    if (dir == null || !Files.isDirectory(dir)) return;
    int n = 0;
    String[] globs = {
      "*.absfixing", "*.converting", "*.sanitized", "*.part"
    };
    for (String g : globs) {
      try (DirectoryStream<Path> ds = Files.newDirectoryStream(dir, g)) {
        for (Path p : ds) {
          try {
            Files.deleteIfExists(p);
            n++;
          } catch (Exception ignored) {
          }
        }
      } catch (Exception ignored) {
      }
    }
    if (n > 0) {
      System.out.println("[tv-jar-host] cleaned " + n + " stale cache temp(s) in " + dir);
    }
  }

  /**
   * @param deltaOut deltaOut[0]=-1 cleared ABSTRACT; +1 restored; 0 unchanged
   */
  static byte[] reconcileAbstractFlag(byte[] cls, int[] deltaOut) {
    if (deltaOut != null && deltaOut.length > 0) deltaOut[0] = 0;
    if (cls == null || cls.length < 10) return cls;
    if ((cls[0] & 0xff) != 0xca
        || (cls[1] & 0xff) != 0xfe
        || (cls[2] & 0xff) != 0xba
        || (cls[3] & 0xff) != 0xbe) {
      return cls;
    }
    try {
      int cpCount = u2(cls, 8);
      int i = 10;
      int[] utf8At = new int[cpCount];
      Arrays.fill(utf8At, -1);
      for (int idx = 1; idx < cpCount; idx++) {
        int tag = cls[i] & 0xff;
        i++;
        switch (tag) {
          case 1:
            utf8At[idx] = i;
            int ln = u2(cls, i);
            i += 2 + ln;
            break;
          case 7:
          case 8:
          case 16:
          case 19:
          case 20:
            i += 2;
            break;
          case 3:
          case 4:
          case 9:
          case 10:
          case 11:
          case 12:
          case 17:
          case 18:
            i += 4;
            break;
          case 5:
          case 6:
            i += 8;
            idx++;
            break;
          case 15:
            i += 3;
            break;
          default:
            return cls;
        }
      }
      if (i + 6 > cls.length) return cls;
      int flagsOff = i;
      int flags = u2(cls, flagsOff);
      final int ACC_INTERFACE = 0x0200;
      final int ACC_ABSTRACT = 0x0400;
      if ((flags & ACC_INTERFACE) != 0) return cls;
      i += 6;
      int ifcCount = u2(cls, i);
      i += 2 + ifcCount * 2;
      int fieldCount = u2(cls, i);
      i += 2;
      for (int f = 0; f < fieldCount; f++) {
        i += 6;
        int attrCount = u2(cls, i);
        i += 2;
        for (int a = 0; a < attrCount; a++) {
          i += 2;
          int alen = u4(cls, i);
          i += 4 + alen;
        }
      }
      int methodCount = u2(cls, i);
      i += 2;
      boolean hasInstanceInit = false;
      boolean hasAbstractMethod = false;
      for (int m = 0; m < methodCount; m++) {
        int mflags = u2(cls, i);
        int nameIdx = u2(cls, i + 2);
        i += 6;
        if ((mflags & 0x0008) == 0 && isUtf8Equal(cls, utf8At, nameIdx, "<init>")) {
          hasInstanceInit = true;
        }
        // 抽象实例方法（非 static）
        if ((mflags & ACC_ABSTRACT) != 0 && (mflags & 0x0008) == 0) {
          hasAbstractMethod = true;
        }
        int attrCount = u2(cls, i);
        i += 2;
        for (int a = 0; a < attrCount; a++) {
          i += 2;
          int alen = u4(cls, i);
          i += 4 + alen;
        }
      }
      int nf = flags;
      if (hasAbstractMethod) {
        if ((flags & ACC_ABSTRACT) == 0) {
          nf = flags | ACC_ABSTRACT;
          if (deltaOut != null && deltaOut.length > 0) deltaOut[0] = 1;
        }
      } else if (hasInstanceInit && (flags & ACC_ABSTRACT) != 0) {
        nf = flags & ~ACC_ABSTRACT;
        if (deltaOut != null && deltaOut.length > 0) deltaOut[0] = -1;
      }
      if (nf == flags) return cls;
      cls[flagsOff] = (byte) ((nf >> 8) & 0xff);
      cls[flagsOff + 1] = (byte) (nf & 0xff);
      return cls;
    } catch (Exception e) {
      return cls;
    }
  }

  static boolean isUtf8Equal(byte[] cls, int[] utf8At, int cpIndex, String expect) {
    if (cpIndex <= 0 || cpIndex >= utf8At.length) return false;
    int off = utf8At[cpIndex];
    if (off < 0) return false;
    int ln = u2(cls, off);
    if (ln != expect.length()) return false;
    for (int k = 0; k < ln; k++) {
      if ((cls[off + 2 + k] & 0xff) != (expect.charAt(k) & 0xff)) return false;
    }
    return true;
  }

  static int u2(byte[] b, int i) {
    return ((b[i] & 0xff) << 8) | (b[i + 1] & 0xff);
  }

  static int u4(byte[] b, int i) {
    return ((b[i] & 0xff) << 24)
        | ((b[i + 1] & 0xff) << 16)
        | ((b[i + 2] & 0xff) << 8)
        | (b[i + 3] & 0xff);
  }

  /** dex2jar 成功产物应远大于空壳，且含 .class。 */
  static boolean isValidDex2JarOutput(Path out) {
    try {
      if (out == null || !Files.exists(out) || Files.size(out) < 10_000) return false;
      if (!isZipMagic(out)) return false;
      return hasClassFiles(out);
    } catch (Exception e) {
      return false;
    }
  }

  static boolean jarContainsClass(Path jarFile, String className) {
    if (jarFile == null || className == null || className.isBlank()) return false;
    String entry = className.replace('.', '/') + ".class";
    try (JarFile jf = new JarFile(jarFile.toFile())) {
      return jf.getEntry(entry) != null;
    } catch (Exception e) {
      return false;
    }
  }

  /** 缺类时列出 JAR 内相近的 csp 类名，便于发现 api/jar 配错 */
  static String suggestSimilarSpiderClasses(Path jarFile, String wantedClass) {
    String simple = wantedClass;
    int dot = wantedClass.lastIndexOf('.');
    if (dot >= 0) simple = wantedClass.substring(dot + 1);
    String prefix = "com/github/catvod/spider/";
    List<String> hits = new ArrayList<>();
    try (JarFile jf = new JarFile(jarFile.toFile())) {
      Enumeration<JarEntry> en = jf.entries();
      while (en.hasMoreElements()) {
        String n = en.nextElement().getName();
        if (!n.startsWith(prefix) || !n.endsWith(".class") || n.indexOf('$') >= 0) continue;
        if (n.substring(prefix.length()).contains("/")) continue; // skip merge/*
        String name = n.substring(prefix.length(), n.length() - 6);
        if (name.regionMatches(true, 0, simple, 0, Math.min(3, simple.length()))
            || (simple.startsWith("App") && name.startsWith("App"))) {
          hits.add(name);
        }
        if (hits.size() >= 12) break;
      }
    } catch (Exception ignored) {
    }
    if (hits.isEmpty()) return "";
    Collections.sort(hits);
    return String.join(", ", hits);
  }

  static boolean hasClassFiles(Path jarFile) throws IOException {
    try (JarFile jf = new JarFile(jarFile.toFile())) {
      Enumeration<JarEntry> en = jf.entries();
      while (en.hasMoreElements()) {
        String n = en.nextElement().getName();
        if (n.endsWith(".class") && n.contains("com/github/catvod")) return true;
        if (n.endsWith(".class")) return true;
      }
    }
    return false;
  }

  static boolean hasDex(Path jarFile) throws IOException {
    try (JarFile jf = new JarFile(jarFile.toFile())) {
      return jf.getEntry("classes.dex") != null;
    }
  }

  static void runDex2Jar(Path input, Path output) throws Exception {
    Path home = resolveDex2jarHome();
    // 先写到临时文件，校验通过再替换，避免并发/失败留下 22 字节空壳
    Path tmpOut =
        output.resolveSibling(
            output.getFileName().toString()
                + "."
                + UUID.randomUUID().toString().replace("-", "")
                + ".converting");
    List<String[]> commands = new ArrayList<>();
    if (home != null) {
      System.out.println("dex2jar home=" + home);
      Path bat = home.resolve("d2j-dex2jar.bat");
      Path sh = home.resolve("d2j-dex2jar.sh");
      Path cmdSh = home.resolve("d2j-dex2jar");
      if (isWindows() && Files.isRegularFile(bat)) {
        commands.add(new String[] {bat.toString(), "-f", "-o", tmpOut.toString(), input.toString()});
      }
      if (Files.isRegularFile(sh)) {
        commands.add(new String[] {sh.toString(), "-f", "-o", tmpOut.toString(), input.toString()});
      }
      if (Files.isRegularFile(cmdSh) && Files.isExecutable(cmdSh)) {
        commands.add(
            new String[] {cmdSh.toString(), "-f", "-o", tmpOut.toString(), input.toString()});
      }
      String cp = dex2jarClasspath(home);
      if (cp != null) {
        commands.add(
            new String[] {
              "java",
              "-Xms64m",
              "-Xmx1024m",
              "-cp",
              cp,
              "com.googlecode.dex2jar.tools.Dex2jarCmd",
              "-f",
              "-o",
              tmpOut.toString(),
              input.toString()
            });
      }
    }
    commands.add(new String[] {"d2j-dex2jar", "-f", "-o", tmpOut.toString(), input.toString()});
    commands.add(new String[] {"d2j-dex2jar.bat", "-f", "-o", tmpOut.toString(), input.toString()});
    commands.add(new String[] {"dex2jar", "-f", "-o", tmpOut.toString(), input.toString()});

    StringBuilder failures = new StringBuilder();
    try {
      for (String[] cmd : commands) {
        try {
          Files.deleteIfExists(tmpOut);
          ProcessBuilder pb = new ProcessBuilder(cmd);
          if (home != null) pb.directory(home.toFile());
          pb.redirectErrorStream(true);
          Process p = pb.start();
          String log = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
          int code = p.waitFor();
          if (code == 0 && isValidDex2JarOutput(tmpOut)) {
            try {
              Files.move(
                  tmpOut, output, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
              Files.move(tmpOut, output, StandardCopyOption.REPLACE_EXISTING);
            }
            System.out.println("dex2jar ok via " + String.join(" ", cmd) + " size=" + Files.size(output));
            return;
          }
          failures
              .append(String.join(" ", cmd))
              .append(" exit=")
              .append(code)
              .append(" size=")
              .append(Files.exists(tmpOut) ? Files.size(tmpOut) : -1)
              .append(' ')
              .append(log)
              .append('\n');
          System.err.println(
              "dex2jar via " + String.join(" ", cmd) + " exit=" + code + " " + log);
        } catch (IOException e) {
          failures.append(String.join(" ", cmd)).append(" err=").append(e.getMessage()).append('\n');
        }
      }
    } finally {
      try {
        Files.deleteIfExists(tmpOut);
      } catch (Exception ignored) {
      }
    }
    if (failures.length() > 0) {
      System.err.println("dex2jar all attempts failed:\n" + failures);
    }
  }

  static boolean isWindows() {
    String os = System.getProperty("os.name", "");
    return os.toLowerCase(Locale.ROOT).contains("win");
  }

  /** 解析捆绑的 dex2jar 根目录（含 d2j-dex2jar.bat / lib/） */
  static Path resolveDex2jarHome() {
    String env = System.getenv("READER_DEX2JAR_HOME");
    if (env != null && !env.isBlank()) {
      Path p = Paths.get(env.trim());
      if (isDex2jarHome(p)) return p.toAbsolutePath().normalize();
    }
    LinkedHashSet<Path> candidates = new LinkedHashSet<>();
    Path hostDir = hostJarDir();
    if (hostDir != null) {
      candidates.add(hostDir.resolve("dex2jar"));
      Path walk = hostDir;
      for (int i = 0; i < 8 && walk != null; i++) {
        candidates.add(walk.resolve("dex2jar"));
        candidates.add(walk.resolve("tools").resolve("dex2jar"));
        walk = walk.getParent();
      }
    }
    try {
      Path cwd = Paths.get("").toAbsolutePath().normalize();
      candidates.add(cwd.resolve("dex2jar"));
      candidates.add(cwd.resolve("tools").resolve("dex2jar"));
      candidates.add(cwd.resolve("..").resolve("tools").resolve("dex2jar").normalize());
      candidates.add(cwd.resolve("..").resolve("..").resolve("tools").resolve("dex2jar").normalize());
    } catch (Exception ignored) {
    }
    for (Path c : candidates) {
      if (isDex2jarHome(c)) return c.toAbsolutePath().normalize();
      // zip 解压常多一层 dex-tools-v2.4/
      try (DirectoryStream<Path> ds = Files.newDirectoryStream(c)) {
        for (Path child : ds) {
          if (Files.isDirectory(child) && isDex2jarHome(child)) {
            return child.toAbsolutePath().normalize();
          }
        }
      } catch (Exception ignored) {
      }
    }
    return null;
  }

  static boolean isDex2jarHome(Path home) {
    if (home == null || !Files.isDirectory(home)) return false;
    if (Files.isRegularFile(home.resolve("d2j-dex2jar.bat"))) return true;
    if (Files.isRegularFile(home.resolve("d2j-dex2jar.sh"))) return true;
    if (Files.isRegularFile(home.resolve("d2j-dex2jar"))) return true;
    Path lib = home.resolve("lib");
    if (!Files.isDirectory(lib)) return false;
    try (DirectoryStream<Path> ds = Files.newDirectoryStream(lib, "*.jar")) {
      return ds.iterator().hasNext();
    } catch (Exception e) {
      return false;
    }
  }

  static String dex2jarClasspath(Path home) {
    Path lib = home.resolve("lib");
    if (!Files.isDirectory(lib)) return null;
    try (DirectoryStream<Path> ds = Files.newDirectoryStream(lib, "*.jar")) {
      List<String> jars = new ArrayList<>();
      for (Path j : ds) jars.add(j.toAbsolutePath().toString());
      if (jars.isEmpty()) return null;
      return String.join(File.pathSeparator, jars);
    } catch (Exception e) {
      return null;
    }
  }

  /** tv-jar-host.jar 所在目录；开发时 class 目录则取其上级 */
  static Path hostJarDir() {
    try {
      URL loc = Main.class.getProtectionDomain().getCodeSource().getLocation();
      Path p = Paths.get(loc.toURI());
      if (Files.isRegularFile(p)) return p.getParent();
      if (Files.isDirectory(p)) return p;
    } catch (Exception ignored) {
    }
    return null;
  }

  static void download(String url, Path dest) throws Exception {
    System.out.println("download " + url + " -> " + dest);
    Exception last = null;
    for (int attempt = 1; attempt <= 3; attempt++) {
      try {
        HttpURLConnection conn = openGet(url);
        int code = conn.getResponseCode();
        if (code >= 400) {
          throw new IllegalStateException("HTTP " + code + " downloading " + url);
        }
        long declared = conn.getContentLengthLong();
        try (InputStream in = conn.getInputStream()) {
          long n = Files.copy(in, dest, StandardCopyOption.REPLACE_EXISTING);
          if (n <= 0) {
            throw new IllegalStateException("empty body from " + url);
          }
          if (declared > 0 && n != declared) {
            throw new IllegalStateException(
                "truncated download: got " + n + " expect " + declared + " url=" + url);
          }
        }
        return;
      } catch (Exception e) {
        last = e;
        System.err.println("[tv-jar-host] download attempt " + attempt + " failed: " + e.getMessage());
        try {
          Files.deleteIfExists(dest);
        } catch (Exception ignored) {
        }
        try {
          Thread.sleep(300L * attempt);
        } catch (InterruptedException ie) {
          Thread.currentThread().interrupt();
          break;
        }
      }
    }
    throw last != null ? last : new IllegalStateException("download failed: " + url);
  }

  static Method findMethod(Class<?> clz, String name) {
    Method best = null;
    for (Method m : clz.getMethods()) {
      if (m.getName().equals(name)) {
        if (best == null || m.getParameterCount() > best.getParameterCount()) best = m;
      }
    }
    return best;
  }

  static Object coerce(Object raw, Class<?> type) {
    if (raw == null) {
      if (type == boolean.class || type == Boolean.class) return false;
      if (type == int.class || type == Integer.class) return 0;
      if (List.class.isAssignableFrom(type)) return new ArrayList<>();
      if (Map.class.isAssignableFrom(type)) return new HashMap<>();
      return null;
    }
    if (type == String.class) return String.valueOf(raw);
    if (type == boolean.class || type == Boolean.class) {
      if (raw instanceof Boolean) return raw;
      return Boolean.parseBoolean(String.valueOf(raw));
    }
    if (List.class.isAssignableFrom(type)) {
      if (raw instanceof List) {
        List<String> out = new ArrayList<>();
        for (Object o : (List<?>) raw) out.add(String.valueOf(o));
        return out;
      }
      return Collections.singletonList(String.valueOf(raw));
    }
    if (Map.class.isAssignableFrom(type)) {
      Map<String, String> map = new HashMap<>();
      if (raw instanceof Map) {
        for (Map.Entry<?, ?> e : ((Map<?, ?>) raw).entrySet()) {
          map.put(String.valueOf(e.getKey()), e.getValue() == null ? "" : String.valueOf(e.getValue()));
        }
      }
      return map;
    }
    return raw;
  }

  static String str(Map<String, Object> p, String k) {
    Object v = p.get(k);
    return v == null ? "" : String.valueOf(v);
  }

  static double num(Object v, double def) {
    if (v instanceof Number) return ((Number) v).doubleValue();
    try {
      return Double.parseDouble(String.valueOf(v));
    } catch (Exception e) {
      return def;
    }
  }

  static String md5(String s) throws Exception {
    MessageDigest md = MessageDigest.getInstance("MD5");
    byte[] dig = md.digest(s.getBytes(StandardCharsets.UTF_8));
    StringBuilder sb = new StringBuilder();
    for (byte b : dig) sb.append(String.format("%02x", b));
    return sb.toString();
  }

  static String fileMd5(Path p) throws Exception {
    MessageDigest md = MessageDigest.getInstance("MD5");
    md.update(Files.readAllBytes(p));
    byte[] dig = md.digest();
    StringBuilder sb = new StringBuilder();
    for (byte b : dig) sb.append(String.format("%02x", b));
    return sb.toString();
  }

  /** Minimal JSON encode/decode for RPC (no external deps). */
  static class Json {
    static String ok(Object id, Object result) {
      return "{\"jsonrpc\":\"2.0\",\"id\":" + idJson(id) + ",\"result\":" + value(result) + "}";
    }

    static String error(Object id, String message) {
      return "{\"jsonrpc\":\"2.0\",\"id\":" + idJson(id) + ",\"error\":{\"message\":" + quote(message) + "}}";
    }

    static String idJson(Object id) {
      if (id instanceof Number) return String.valueOf(id);
      return quote(String.valueOf(id));
    }

    static String value(Object v) {
      if (v == null) return "null";
      if (v instanceof String) return quote((String) v);
      if (v instanceof Number || v instanceof Boolean) return String.valueOf(v);
      if (v instanceof Map) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<?, ?> e : ((Map<?, ?>) v).entrySet()) {
          if (!first) sb.append(',');
          first = false;
          sb.append(quote(String.valueOf(e.getKey()))).append(':').append(value(e.getValue()));
        }
        return sb.append('}').toString();
      }
      if (v instanceof List) {
        StringBuilder sb = new StringBuilder("[");
        boolean first = true;
        for (Object o : (List<?>) v) {
          if (!first) sb.append(',');
          first = false;
          sb.append(value(o));
        }
        return sb.append(']').toString();
      }
      return quote(String.valueOf(v));
    }

    static String quote(String s) {
      StringBuilder sb = new StringBuilder("\"");
      for (int i = 0; i < s.length(); i++) {
        char c = s.charAt(i);
        switch (c) {
          case '"': sb.append("\\\""); break;
          case '\\': sb.append("\\\\"); break;
          case '\n': sb.append("\\n"); break;
          case '\r': sb.append("\\r"); break;
          case '\t': sb.append("\\t"); break;
          default:
            if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
            else sb.append(c);
        }
      }
      return sb.append('"').toString();
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> object(String json) {
      Object v = parse(json.trim(), new int[]{0});
      if (v instanceof Map) return (Map<String, Object>) v;
      throw new IllegalArgumentException("expected object");
    }

    static Object parse(String s, int[] i) {
      skip(s, i);
      char c = s.charAt(i[0]);
      if (c == '{') return parseObj(s, i);
      if (c == '[') return parseArr(s, i);
      if (c == '"') return parseStr(s, i);
      if (c == 't' || c == 'f') return parseBool(s, i);
      if (c == 'n') { i[0] += 4; return null; }
      return parseNum(s, i);
    }

    static Map<String, Object> parseObj(String s, int[] i) {
      Map<String, Object> m = new LinkedHashMap<>();
      i[0]++; // {
      skip(s, i);
      if (s.charAt(i[0]) == '}') { i[0]++; return m; }
      while (true) {
        skip(s, i);
        String key = parseStr(s, i);
        skip(s, i);
        if (s.charAt(i[0]) != ':') throw new IllegalArgumentException(":");
        i[0]++;
        Object val = parse(s, i);
        m.put(key, val);
        skip(s, i);
        char c = s.charAt(i[0]);
        if (c == '}') { i[0]++; break; }
        if (c != ',') throw new IllegalArgumentException(",");
        i[0]++;
      }
      return m;
    }

    static List<Object> parseArr(String s, int[] i) {
      List<Object> list = new ArrayList<>();
      i[0]++;
      skip(s, i);
      if (s.charAt(i[0]) == ']') { i[0]++; return list; }
      while (true) {
        list.add(parse(s, i));
        skip(s, i);
        char c = s.charAt(i[0]);
        if (c == ']') { i[0]++; break; }
        if (c != ',') throw new IllegalArgumentException(",");
        i[0]++;
      }
      return list;
    }

    static String parseStr(String s, int[] i) {
      i[0]++;
      StringBuilder sb = new StringBuilder();
      while (i[0] < s.length()) {
        char c = s.charAt(i[0]++);
        if (c == '"') break;
        if (c == '\\') {
          char e = s.charAt(i[0]++);
          switch (e) {
            case '"': case '\\': case '/': sb.append(e); break;
            case 'n': sb.append('\n'); break;
            case 'r': sb.append('\r'); break;
            case 't': sb.append('\t'); break;
            case 'u':
              int cp = Integer.parseInt(s.substring(i[0], i[0] + 4), 16);
              sb.append((char) cp);
              i[0] += 4;
              break;
            default: sb.append(e);
          }
        } else sb.append(c);
      }
      return sb.toString();
    }

    static Boolean parseBool(String s, int[] i) {
      if (s.startsWith("true", i[0])) { i[0] += 4; return true; }
      i[0] += 5;
      return false;
    }

    static Number parseNum(String s, int[] i) {
      int start = i[0];
      while (i[0] < s.length()) {
        char c = s.charAt(i[0]);
        if ((c >= '0' && c <= '9') || c == '-' || c == '+' || c == '.' || c == 'e' || c == 'E') i[0]++;
        else break;
      }
      String n = s.substring(start, i[0]);
      if (n.contains(".") || n.contains("e") || n.contains("E")) return Double.parseDouble(n);
      try {
        return Long.parseLong(n);
      } catch (Exception e) {
        return Double.parseDouble(n);
      }
    }

    static void skip(String s, int[] i) {
      while (i[0] < s.length() && Character.isWhitespace(s.charAt(i[0]))) i[0]++;
    }
  }
}
