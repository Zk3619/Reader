package com.zkingz.reader.tv

import android.app.Application
import android.content.Context
import android.os.Build
import android.util.Log
import dalvik.system.DexClassLoader
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.lang.reflect.InvocationTargetException
import java.lang.reflect.Method
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.LinkedHashMap
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * DexClassLoader Spider 宿主（对齐 FongMi JarLoader）。
 * 在主进程加载加固 so；加载前 fsync 哨兵，崩溃后下次启动隔离该 JAR，避免闪退循环。
 */
class TvSpiderHost(context: Context) {

  private val ctx: Context = context.applicationContext
  private val fence = TvJarCrashFence(File(ctx.filesDir, "tv-jar-fence"))
  private val loaders = ConcurrentHashMap<String, DexClassLoader>()
  private val spiders = ConcurrentHashMap<String, Any>()
  private val jarLocks = ConcurrentHashMap<String, Any>()
  private val proxyMethods = ConcurrentHashMap<String, Method>()
  @Volatile private var recentKey: String? = null
  @Volatile private var proxyPort: Int = 0
  @Volatile private var lastAbsorbed: TvJarCrashFence.Record? = null

  companion object {
    private const val TAG = "TvSpiderHost"
  }

  init {
    com.github.catvod.Init.set(app())
    lastAbsorbed = fence.absorbIfCrashed()
    if (lastAbsorbed != null) {
      Log.w(TAG, "quarantined jar after crash ${lastAbsorbed!!.jarKey} site=${lastAbsorbed!!.siteKey}")
    }
  }

  private fun appContext(): Context = ctx

  private fun app(): Application {
    val c = ctx.applicationContext
    if (c is Application) return c
    throw IllegalStateException("application context missing")
  }

  private fun fongMiSoDir(): File = File(appContext().filesDir, "so").apply { mkdirs() }

  /** 对齐 FongMi `Path.jar()`：Init / MultiDex 扫的是 cacheDir/jar。 */
  private fun fongMiJarDir(): File =
    File(appContext().cacheDir, "jar").apply { mkdirs() }

  private fun nativeLibDir(jarKey: String): File =
    File(appContext().filesDir, "tv-jar-native/$jarKey").apply { mkdirs() }

  private fun dexKey(jar: String): String = md5Hex(jar)

  private fun jarCacheDir(): File = fongMiJarDir()

  private fun legacyJarCacheDir(): File = File(appContext().filesDir, "tv-jar-cache")

  private fun md5Hex(input: String): String {
    val digest = MessageDigest.getInstance("MD5").digest(input.toByteArray(Charsets.UTF_8))
    return digest.joinToString("") { "%02x".format(it) }
  }

  private fun fileMd5(file: File): String {
    val md = MessageDigest.getInstance("MD5")
    FileInputStream(file).use { input ->
      val buf = ByteArray(8192)
      while (true) {
        val n = input.read(buf)
        if (n <= 0) break
        md.update(buf, 0, n)
      }
    }
    return md.digest().joinToString("") { "%02x".format(it) }
  }

  private fun isZipMagic(file: File): Boolean {
    return try {
      FileInputStream(file).use { input ->
        val b0 = input.read()
        val b1 = input.read()
        b0 == 'P'.code && b1 == 'K'.code
      }
    } catch (_: Throwable) {
      false
    }
  }

  private fun fetchText(url: String): String {
    val conn = (URL(url).openConnection() as HttpURLConnection).apply {
      connectTimeout = 20_000
      readTimeout = 20_000
      instanceFollowRedirects = true
      requestMethod = "GET"
      setRequestProperty(
        "User-Agent",
        "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      )
    }
    try {
      val code = conn.responseCode
      val stream = if (code in 200..299) conn.inputStream else conn.errorStream
      return stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }?.trim().orEmpty()
    } finally {
      conn.disconnect()
    }
  }

  private fun downloadAtomic(url: String, dest: File) {
    dest.parentFile?.mkdirs()
    val part = File(
      dest.parentFile,
      "${dest.name}.${UUID.randomUUID().toString().replace("-", "")}.part",
    )
    try {
      val conn = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = 30_000
        readTimeout = 120_000
        instanceFollowRedirects = true
        requestMethod = "GET"
        setRequestProperty(
          "User-Agent",
          "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        )
      }
      try {
        val code = conn.responseCode
        if (code !in 200..299) {
          throw IllegalStateException("下载 JAR HTTP $code: $url")
        }
        conn.inputStream.use { input ->
          FileOutputStream(part).use { output ->
            input.copyTo(output)
          }
        }
      } finally {
        conn.disconnect()
      }
      if (!part.exists() || part.length() == 0L) {
        throw IllegalStateException("downloaded empty jar: $url")
      }
      if (!isZipMagic(part)) {
        part.delete()
        throw IllegalStateException("downloaded file is not a jar/zip: $url")
      }
      if (dest.exists()) dest.delete()
      if (!part.renameTo(dest)) {
        part.copyTo(dest, overwrite = true)
        part.delete()
      }
    } catch (e: Exception) {
      part.delete()
      throw e
    }
  }

  /**
   * 对齐 FongMi JarLoader.parseJar / 桌面 resolveJar：
   * - `http(s)://...` → 下载到 filesDir/tv-jar-cache/{md5}.jar
   * - `;md5;` 校验（后段可为远程 md5 文本 URL）
   * - 本地 / file:// 路径直接使用
   */
  private fun resolveJarFile(jarSpec: String): File {
    var jar = jarSpec.trim()
    if (jar.isEmpty()) throw IllegalStateException("empty jar")
    var md5Expect = ""
    val sep = jar.indexOf(";md5;")
    if (sep >= 0) {
      md5Expect = jar.substring(sep + 5).trim()
      jar = jar.substring(0, sep).trim()
      if (md5Expect.startsWith("http://") || md5Expect.startsWith("https://")) {
        md5Expect = fetchText(md5Expect)
      }
    }
    if (jar.startsWith("http://") || jar.startsWith("https://")) {
      val name = md5Hex(jar) + ".jar"
      val dest = File(jarCacheDir(), name)
      val lock = jarLocks.computeIfAbsent(name) { Any() }
      synchronized(lock) {
        migrateLegacyJarIfNeeded(name, dest)
        val md5Ok =
          md5Expect.isEmpty() ||
            (dest.exists() && dest.length() > 0 && md5Expect.equals(fileMd5(dest), ignoreCase = true))
        if (dest.exists() && dest.length() > 0 && isZipMagic(dest) && md5Ok) {
          dest.setReadOnly()
          return dest
        }
        val hadValid = dest.exists() && dest.length() > 0 && isZipMagic(dest)
        try {
          if (dest.exists()) {
            dest.setWritable(true)
          }
          downloadAtomic(jar, dest)
        } catch (e: Exception) {
          if (hadValid) {
            dest.setReadOnly()
            return dest
          }
          throw e
        }
        dest.setReadOnly()
        return dest
      }
    }
    val local = File(jar.removePrefix("file://"))
    if (!local.exists()) {
      throw IllegalStateException("无法加载 JAR: $jarSpec")
    }
    if (local.canWrite()) local.setReadOnly()
    return local
  }

  /**
   * 豆瓣等 Spider 读取 filesDir/config.json；缺失时 `new JSONObject("")` 会直接失败。
   */
  private fun ensureSpiderConfigJson() {
    try {
      val cfg = File(appContext().filesDir, "config.json")
      if (!cfg.exists() || cfg.length() == 0L) {
        cfg.writeText("{}")
      }
    } catch (_: Throwable) {
      // best-effort
    }
  }

  private fun migrateLegacyJarIfNeeded(name: String, dest: File) {
    if (dest.exists() && dest.length() > 0 && isZipMagic(dest)) return
    val legacy = File(legacyJarCacheDir(), name)
    if (!legacy.exists() || legacy.length() == 0L || !isZipMagic(legacy)) return
    try {
      dest.parentFile?.mkdirs()
      if (dest.exists()) dest.setWritable(true)
      legacy.copyTo(dest, overwrite = true)
      Log.i(TAG, "migrated legacy jar $name -> ${dest.parent}")
    } catch (e: Throwable) {
      Log.w(TAG, "legacy jar migrate skipped: ${errorMessage(e)}")
    }
  }

  /**
   * 旧逻辑把 ftyguard*.so / *.guard 以只读方式提前写进 filesDir，
   * 会挡住 JAR 内 Init.init 自己解包/解密。卸载后目录是空的；未卸载则这里清掉。
   */
  private fun cleanupLegacyReadOnlyNativeSeeds() {
    val files = appContext().filesDir
    val listed = files.listFiles() ?: return
    for (f in listed) {
      if (!f.isFile) continue
      val n = f.name.lowercase()
      val seed =
        n.endsWith(".guard") ||
          n.endsWith(".ftyfnw") ||
          (n.endsWith(".so") && (n.contains("ftyguard") || n.contains("fty")))
      if (!seed) continue
      try {
        f.setWritable(true)
        if (f.delete()) Log.i(TAG, "removed legacy native seed ${f.name}")
      } catch (e: Throwable) {
        Log.w(TAG, "remove legacy native seed ${f.name}: ${errorMessage(e)}")
      }
    }
  }

  private fun loadDex(jarSpec: String, siteKey: String = "", api: String = ""): DexClassLoader? {
    val key = dexKey(jarSpec)
    if (fence.isQuarantined(key) || fence.isQuarantinedJar(jarSpec)) {
      throw IllegalStateException(fence.quarantinedMessage())
    }
    loaders[key]?.let { loader ->
      recentKey = key
      syncHostProxyPort(loader)
      return loader
    }
    val lock = jarLocks.computeIfAbsent("loader:$key") { Any() }
    synchronized(lock) {
      loaders[key]?.let { loader ->
        recentKey = key
        syncHostProxyPort(loader)
        return loader
      }
      val file = resolveJarFile(jarSpec)
      ensureSpiderConfigJson()
      cleanupLegacyReadOnlyNativeSeeds()
      val jarDir = fongMiJarDir()
      if (file.canWrite() && !file.setReadOnly()) {
        Log.w(TAG, "setReadOnly failed path=${file.absolutePath}")
      }
      val guardJar = TvJarGuardSupport.looksLikeGuardJar(file)
      val soDir = nativeLibDir(key)
      TvJarGuardSupport.removeGuardNativeResidues(jarDir)
      TvJarGuardSupport.removeGuardNativeResidues(soDir)
      TvJarGuardSupport.removeGuardNativeResidues(fongMiSoDir())
      TvJarGuardSupport.removeInvalidNativeLibraries(jarDir)
      val extracted =
        if (guardJar) {
          emptyList()
        } else {
          val abis =
            Build.SUPPORTED_ABIS?.toList().orEmpty().ifEmpty { listOf("arm64-v8a", "armeabi-v7a") }
          TvJarGuardSupport.extractNativeLibraries(file, soDir, abis)
        }
      val elfSos = extracted.filter { it.name.endsWith(".so", ignoreCase = true) && it.exists() }
      val libPath =
        if (guardJar) jarDir.absolutePath
        else TvJarGuardSupport.dexNativeLibrarySearchPath(elfSos, soDir, jarDir)
      fence.begin(key, jarSpec, siteKey, api, "loadDex")
      val loader =
        try {
          if (TvJarGuardSupport.shouldUseStockDexClassLoader(guardJar)) {
            DexClassLoader(
              file.absolutePath,
              jarDir.absolutePath,
              libPath,
              appContext().classLoader,
            )
          } else {
            TvJarDexClassLoader(
              file.absolutePath,
              jarDir.absolutePath,
              libPath,
              appContext().classLoader,
              file,
            )
          }
        } catch (e: Throwable) {
          fence.succeed()
          throw e
        }
      com.github.catvod.Init.set(app())
      try {
        invokeJarInit(loader)
        if (!guardJar) {
          invokeDexNative(loader, file)
        }
        rememberProxyMethod(key, loader)
        syncHostProxyPort(loader)
        loaders[key] = loader
        recentKey = key
        fence.succeed()
        return loader
      } catch (e: Throwable) {
        fence.succeed()
        throw e
      }
    }
  }

  /** 对齐 FongMi：只调 `Init.init(Context)`，Context 为 Application。 */
  private fun invokeJarInit(loader: DexClassLoader) {
    try {
      val clz = loader.loadClass("com.github.catvod.spider.Init")
      clz.getMethod("init", Context::class.java).invoke(null, app())
      Log.i(TAG, "JAR Init.init ok")
    } catch (_: ClassNotFoundException) {
    } catch (e: Throwable) {
      Log.w(TAG, "JAR Init.init failed: ${errorMessage(e)}")
    }
  }

  private fun invokeDexNative(loader: DexClassLoader, jarFile: File) {
    for (name in TvJarGuardSupport.dexNativeClassNames) {
      val clz = try {
        loader.loadClass(name)
      } catch (_: ClassNotFoundException) {
        continue
      } catch (e: Throwable) {
        Log.w(TAG, "load $name failed: ${errorMessage(e)}")
        continue
      }
      Log.i(TAG, "加固接口 $name loaded from ${jarFile.name}")
      for (m in clz.methods) {
        if (m.name != "init" && m.name != "load") continue
        try {
          val ps = m.parameterTypes
          when {
            ps.isEmpty() -> m.invoke(null)
            ps.size == 1 && Context::class.java.isAssignableFrom(ps[0]) -> m.invoke(null, app())
            ps.size == 1 && ps[0] == String::class.java -> m.invoke(null, jarFile.absolutePath)
            ps.size == 2 &&
              Context::class.java.isAssignableFrom(ps[0]) &&
              ps[1] == String::class.java -> m.invoke(null, app(), jarFile.absolutePath)
          }
        } catch (e: Throwable) {
          Log.w(TAG, "$name.${m.name} failed: ${errorMessage(e)}")
        }
      }
    }
  }

  private fun rememberProxyMethod(key: String, loader: DexClassLoader) {
    try {
      val clz = loader.loadClass("com.github.catvod.spider.Proxy")
      proxyMethods[key] = clz.getMethod("proxy", Map::class.java)
    } catch (_: Throwable) {
    }
  }

  private fun syncHostProxyPort(loader: ClassLoader? = null) {
    val port = proxyPort
    if (port <= 0) return
    com.github.catvod.Proxy.set(port)
    if (loader == null) return
    for (name in TvJarGuardSupport.proxyClassNames) {
      try {
        val clz = loader.loadClass(name)
        clz.getMethod("set", Integer.TYPE).invoke(null, port)
      } catch (_: Throwable) {
      }
    }
  }

  private fun tryDexNativeGetSpider(loader: DexClassLoader, api: String): Any? {
    for (name in TvJarGuardSupport.dexNativeClassNames) {
      val clz = try {
        loader.loadClass(name)
      } catch (_: ClassNotFoundException) {
        continue
      }
      for (m in clz.methods) {
        if (m.parameterTypes.size != 1 || m.parameterTypes[0] != String::class.java) continue
        if (m.name != "getSpider" && m.name != "create" && m.name != "load") continue
        try {
          val out = m.invoke(null, api)
          if (out != null) {
            Log.i(TAG, "加固接口 $name.${m.name}($api) ok")
            return out
          }
        } catch (e: Throwable) {
          Log.w(TAG, "$name.${m.name}($api) failed: ${errorMessage(e)}")
        }
      }
    }
    return null
  }

  private fun setSiteKey(instance: Any, siteKey: String) {
    var clz: Class<*>? = instance.javaClass
    while (clz != null) {
      try {
        val field = clz.getField("siteKey")
        field.set(instance, siteKey)
        return
      } catch (_: Throwable) {
      }
      try {
        val field = clz.getDeclaredField("siteKey")
        field.isAccessible = true
        field.set(instance, siteKey)
        return
      } catch (_: Throwable) {
      }
      clz = clz.superclass
    }
  }

  private fun findMethod(clz: Class<*>, name: String): Method? {
    var best: Method? = null
    for (m in clz.methods) {
      if (m.name != name) continue
      if (best == null || m.parameterCount > best.parameterCount) best = m
    }
    return best
  }

  private fun getSpider(siteKey: String, api: String, ext: String, jarPath: String): Any? {
    val jaKey = dexKey(jarPath)
    if (fence.isQuarantined(jaKey) || fence.isQuarantinedJar(jarPath)) {
      throw IllegalStateException(fence.quarantinedMessage())
    }
    val spKey = jaKey + siteKey
    spiders[spKey]?.let { return it }
    val loader = loadDex(jarPath, siteKey, api) ?: return null
    val className = TvJarGuardSupport.resolveSpiderClassName(api)
    val simple = className.substringAfterLast('.')
    val prev = Thread.currentThread().contextClassLoader
    Thread.currentThread().contextClassLoader = loader
    fence.begin(jaKey, jarPath, siteKey, api, "spider")
    try {
      val instance =
        try {
          loader.loadClass(className).getDeclaredConstructor().newInstance()
        } catch (e: ClassNotFoundException) {
          if (simple.endsWith("Guard", ignoreCase = true)) throw e
          tryDexNativeGetSpider(loader, api)
            ?: tryDexNativeGetSpider(loader, simple)
            ?: throw e
        }
      setSiteKey(instance, siteKey)
      try {
        val init = instance.javaClass.methods.firstOrNull { it.name == "init" && it.parameterCount == 2 }
        init?.invoke(instance, app(), ext)
      } catch (e: Throwable) {
        val t = unwrap(e)
        if (simple.endsWith("Guard") &&
          (t is UnsatisfiedLinkError || t is NoClassDefFoundError || t is ExceptionInInitializerError)
        ) {
          throw IllegalStateException("Guard spider init failed: ${errorMessage(t)}")
        }
        Log.w(TAG, "spider.init skipped: ${errorMessage(e)}")
      }
      try {
        val initApi = findMethod(instance.javaClass, "initApi")
        if (initApi != null && initApi.parameterCount == 1) {
          initApi.invoke(instance, com.github.catvod.crawler.SpiderApi())
        }
      } catch (_: Throwable) {
      }
      spiders[spKey] = instance
      recentKey = jaKey
      fence.succeed()
      return instance
    } catch (e: Throwable) {
      fence.succeed()
      throw e
    } finally {
      Thread.currentThread().contextClassLoader = prev
    }
  }

  private fun unwrap(e: Throwable): Throwable {
    var t = e
    while (true) {
      val next = when {
        t is InvocationTargetException && t.cause != null -> t.cause
        t is ExceptionInInitializerError && t.cause != null -> t.cause
        else -> null
      } ?: break
      if (next === t) break
      t = next
    }
    return t
  }

  fun errorMessage(e: Throwable): String {
    val t = unwrap(e)
    val msg = t.message ?: t.toString()
    val cause = t.cause
    return if (cause != null && cause !== t && !cause.message.isNullOrBlank()) {
      "${t.javaClass.simpleName}: $msg; cause=${cause.javaClass.simpleName}: ${cause.message}"
    } else {
      "${t.javaClass.simpleName}: $msg"
    }
  }

  fun callSpider(
    siteKey: String,
    api: String,
    ext: String,
    jarPath: String,
    method: String,
    argsJson: String,
  ): String {
    Log.i(TAG, "callSpider method=$method api=$api jarLen=${jarPath.length}")
    if (fence.isQuarantined(dexKey(jarPath)) || fence.isQuarantinedJar(jarPath)) {
      throw IllegalStateException(fence.quarantinedMessage())
    }
    val spider = getSpider(siteKey, api, ext, jarPath)
      ?: throw IllegalStateException("无法加载 JAR: $jarPath")
    val jsonArgs = JSONArray(argsJson.ifEmpty { "[]" })
    val methodName = when (method) {
      "homeContent" -> "homeContent"
      "homeVideoContent" -> "homeVideoContent"
      "categoryContent" -> "categoryContent"
      "detailContent" -> "detailContent"
      "searchContent" -> "searchContent"
      "playerContent" -> "playerContent"
      "liveContent" -> "liveContent"
      else -> method
    }
    val m: Method = findMethod(spider.javaClass, methodName)
      ?: throw NoSuchMethodException(methodName)
    val params = m.parameterTypes
    val callArgs = Array(params.size) { i ->
      val raw = if (i < jsonArgs.length()) jsonArgs.get(i) else null
      coerce(raw, params[i])
    }
    val prev = Thread.currentThread().contextClassLoader
    Thread.currentThread().contextClassLoader = spider.javaClass.classLoader
    fence.begin(dexKey(jarPath), jarPath, siteKey, api, "invoke:$methodName")
    val result = try {
      val out = m.invoke(spider, *callArgs)
      fence.succeed()
      out
    } catch (e: Throwable) {
      fence.succeed()
      throw e
    } finally {
      Thread.currentThread().contextClassLoader = prev
    }
    return result?.toString() ?: ""
  }

  fun prefetchJar(jarSpec: String): String {
    val jar = jarSpec.trim()
    if (jar.isEmpty()) {
      return JSONObject().put("ok", false).put("reason", "empty jar").toString()
    }
    val file = resolveJarFile(jar)
    loadDex(jar) ?: throw IllegalStateException("无法加载 JAR: $jar")
    return JSONObject()
      .put("ok", true)
      .put("path", file.absolutePath)
      .put("key", dexKey(jar))
      .toString()
  }

  fun setProxyPort(port: Int) {
    proxyPort = port
    syncHostProxyPort(recentKey?.let { loaders[it] })
  }

  fun jsonExt(parseType: Int, name: String, url: String, flag: String): String {
    val loader = recentKey?.let { loaders[it] } ?: loaders.values.firstOrNull()
      ?: throw IllegalStateException("尚未加载任何 JAR，无法 jsonExt")
    val suffix = when (parseType) {
      2 -> "Parallel"
      3 -> "Vip"
      else -> "Basic"
    }
    val clz = loader.loadClass("com.github.catvod.parser.Json$suffix")
    val parse = clz.methods.firstOrNull { it.name == "parse" }
      ?: throw NoSuchMethodException("parse")
    val jxs = LinkedHashMap<String, String>()
    jxs[name] = name
    val result = when (parse.parameterTypes.size) {
      2 -> parse.invoke(null, jxs, url)
      3 -> parse.invoke(null, name, url, flag)
      else -> parse.invoke(null, jxs, url)
    }
    return result?.toString() ?: ""
  }

  fun proxy(paramsJson: String): String {
    val paramsObj = JSONObject(paramsJson.ifEmpty { "{}" })
    val params = HashMap<String, String>()
    val keys = paramsObj.keys()
    while (keys.hasNext()) {
      val k = keys.next()
      params[k] = paramsObj.optString(k)
    }
    val result = invokeRecentProxy(params)
      ?: throw IllegalStateException("proxy 返回空")
    val code = (result.getOrNull(0) as? Number)?.toInt() ?: 500
    val mime = result.getOrNull(1)?.toString() ?: "application/octet-stream"
    val bodyBytes = when (val body = result.getOrNull(2)) {
      is ByteArray -> body
      is java.io.InputStream -> body.readBytes()
      is String -> body.toByteArray(Charsets.UTF_8)
      else -> ByteArray(0)
    }
    val headers = JSONObject()
    val hdr = result.getOrNull(3)
    if (hdr is Map<*, *>) {
      for ((hk, hv) in hdr) {
        if (hk != null && hv != null) headers.put(hk.toString(), hv.toString())
      }
    }
    return JSONObject()
      .put("code", code)
      .put("mime", mime)
      .put("bodyBase64", android.util.Base64.encodeToString(bodyBytes, android.util.Base64.NO_WRAP))
      .put("headers", headers)
      .toString()
  }

  fun clearCache(): String {
    spiders.clear()
    loaders.clear()
    proxyMethods.clear()
    recentKey = null
    com.github.catvod.Init.setClassLoader(null)
    val cache = File(appContext().codeCacheDir, "tv-jar")
    if (cache.exists()) cache.deleteRecursively()
    cache.mkdirs()
    val jarCache = fongMiJarDir()
    if (jarCache.exists()) jarCache.deleteRecursively()
    jarCache.mkdirs()
    val legacyJar = legacyJarCacheDir()
    if (legacyJar.exists()) legacyJar.deleteRecursively()
    val nativeRoot = File(appContext().filesDir, "tv-jar-native")
    if (nativeRoot.exists()) nativeRoot.deleteRecursively()
    val fongMiSo = fongMiSoDir()
    if (fongMiSo.exists()) fongMiSo.deleteRecursively()
    fongMiSo.mkdirs()
    cleanupLegacyReadOnlyNativeSeeds()
    fence.clearQuarantine(null)
    lastAbsorbed = null
    return cache.absolutePath
  }

  fun crashFenceBootJson(): String {
    val absorbed = lastAbsorbed
    lastAbsorbed = null
    val o = JSONObject()
    o.put("newlyAbsorbed", absorbed != null)
    o.put("siteKey", absorbed?.siteKey ?: "")
    o.put("api", absorbed?.api ?: "")
    o.put("jar", absorbed?.jar ?: "")
    o.put("jarKey", absorbed?.jarKey ?: "")
    o.put("phase", absorbed?.phase ?: "")
    val arr = JSONArray()
    for (e in fence.listQuarantine()) {
      arr.put(
        JSONObject()
          .put("jarKey", e.jarKey)
          .put("jar", e.jar)
          .put("siteKey", e.siteKey)
          .put("api", e.api),
      )
    }
    o.put("entries", arr)
    return o.toString()
  }

  fun unquarantine(jarKey: String): String {
    fence.clearQuarantine(jarKey.ifBlank { null })
    lastAbsorbed = null
    spiders.clear()
    loaders.clear()
    proxyMethods.clear()
    recentKey = null
    return crashFenceBootJson()
  }

  private fun invokeRecentProxy(params: Map<String, String>): Array<*>? {
    val recent = recentKey?.let { proxyMethods[it] }
    invokeProxy(recent, params)?.let { return it }
    for ((key, method) in proxyMethods) {
      if (key == recentKey) continue
      invokeProxy(method, params)?.let { return it }
    }
    return null
  }

  private fun invokeProxy(method: Method?, params: Map<String, String>): Array<*>? {
    if (method == null) return null
    return try {
      method.invoke(null, params) as? Array<*>
    } catch (e: Throwable) {
      Log.w(TAG, "spider.Proxy.proxy failed: ${errorMessage(e)}")
      null
    }
  }

  private fun coerce(raw: Any?, type: Class<*>): Any? {
    if (raw == null || raw == JSONObject.NULL) {
      return when {
        type == java.lang.Boolean.TYPE || type == Boolean::class.java -> false
        type == java.lang.Integer.TYPE -> 0
        List::class.java.isAssignableFrom(type) -> emptyList<Any>()
        Map::class.java.isAssignableFrom(type) -> HashMap<String, String>()
        else -> null
      }
    }
    return when {
      type == String::class.java -> raw.toString()
      type == java.lang.Boolean.TYPE || type == Boolean::class.java -> {
        when (raw) {
          is Boolean -> raw
          else -> raw.toString().toBoolean()
        }
      }
      List::class.java.isAssignableFrom(type) -> {
        if (raw is JSONArray) {
          (0 until raw.length()).map { raw.get(it).toString() }
        } else listOf(raw.toString())
      }
      Map::class.java.isAssignableFrom(type) -> {
        val map = HashMap<String, String>()
        if (raw is JSONObject) {
          val keys = raw.keys()
          while (keys.hasNext()) {
            val k = keys.next()
            map[k] = raw.optString(k)
          }
        }
        map
      }
      else -> raw
    }
  }
}
