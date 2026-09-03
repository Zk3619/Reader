package com.zkingz.reader.tv

import android.app.Activity
import android.app.Application
import android.content.Context
import android.os.Build
import android.util.Log
import dalvik.system.DexClassLoader
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
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
 * Android 真 DexClassLoader Spider 宿主（对齐 FongMi JarLoader 语义）。
 * 通过 Tauri Plugin 供 Rust/前端调用。
 *
 * Tauri 2 的 `@Command` 只能是 `(invoke: Invoke)`，参数必须 `invoke.parseArgs`。
 * 写成 `(invoke, args)` 会在反射调用时立刻 IllegalArgumentException（wrong number of arguments）。
 */
@InvokeArg
class TvSpiderCallArgs {
  var siteKey: String = ""
  var api: String = ""
  var ext: String = ""
  var jarPath: String = ""
  var method: String = ""
  var argsJson: String = "[]"
}

@InvokeArg
class TvJsonExtArgs {
  var parseType: Int = 0
  var name: String = ""
  var url: String = ""
  var flag: String = ""
}

@InvokeArg
class TvProxyArgs {
  var paramsJson: String = "{}"
}

@InvokeArg
class TvPrefetchArgs {
  var jar: String = ""
}

@InvokeArg
class TvProxyPortArgs {
  var port: Int = 0
}

@TauriPlugin
class TvSpiderPlugin(private val activity: Activity) : Plugin(activity) {

  private val loaders = ConcurrentHashMap<String, DexClassLoader>()
  private val spiders = ConcurrentHashMap<String, Any>()
  private val jarLocks = ConcurrentHashMap<String, Any>()
  private val proxyMethods = ConcurrentHashMap<String, Method>()
  @Volatile private var recentKey: String? = null
  @Volatile private var proxyPort: Int = 0

  companion object {
    private const val TAG = "TvSpider"
  }

  private fun appContext(): Context = activity.applicationContext

  private fun app(): Application = activity.application

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

  private fun loadDex(jarSpec: String): DexClassLoader? {
    val key = dexKey(jarSpec)
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
      val soDir = nativeLibDir(key)
      val abis = Build.SUPPORTED_ABIS?.toList().orEmpty().ifEmpty { listOf("arm64-v8a", "armeabi-v7a") }
      val extracted = TvJarGuardSupport.extractNativeLibraries(file, soDir, abis)
      if (extracted.isNotEmpty()) {
        Log.i(TAG, "extracted ${extracted.size} native/guard file(s) from ${file.name} abi=${abis.firstOrNull()}")
      }
      // 对齐 FongMi JarLoader：optimizedDirectory 与 librarySearchPath 都是 cacheDir/jar
      val libPath = TvJarGuardSupport.librarySearchPath(jarDir, soDir)
      val loader = TvJarDexClassLoader(
        file.absolutePath,
        jarDir.absolutePath,
        libPath,
        appContext().classLoader,
        file,
      )
      com.github.catvod.Init.set(app())
      syncHostProxyPort(loader)
      invokeJarInit(loader, file, TvJarGuardSupport.looksLikeGuardJar(file))
      invokeDexNative(loader, file)
      rememberProxyMethod(key, loader)
      loaders[key] = loader
      recentKey = key
      return loader
    }
  }

  private fun invokeJarInit(loader: DexClassLoader, jarFile: File, guardJar: Boolean) {
    try {
      val initClz = loader.loadClass("com.github.catvod.spider.Init")
      val ctx = app()
      var invoked = false
      val inits = initClz.methods.filter { it.name == "init" }.sortedByDescending { it.parameterCount }
      for (m in inits) {
        val ps = m.parameterTypes
        try {
          when {
            ps.size == 1 && Context::class.java.isAssignableFrom(ps[0]) -> {
              m.invoke(null, ctx)
              invoked = true
              break
            }
            ps.isEmpty() -> {
              m.invoke(null)
              invoked = true
            }
          }
        } catch (e: Throwable) {
          Log.w(TAG, "Init.init failed ${ps.contentToString()}: ${errorMessage(e)}")
          if (guardJar) throw unwrap(e)
        }
      }
      try {
        initClz.getMethod("set", Context::class.java).invoke(null, ctx)
      } catch (_: Throwable) {
      }
      if (!invoked) {
        Log.w(TAG, "JAR Init.init not invoked path=${jarFile.name}")
      } else {
        Log.i(TAG, "JAR Init.init ok path=${jarFile.name}")
      }
    } catch (e: ClassNotFoundException) {
      // 部分纯 Java JAR 无 Init
    } catch (e: Throwable) {
      if (guardJar) throw unwrap(e)
      Log.w(TAG, "JAR Init skipped: ${errorMessage(e)}")
    }
  }

  private fun invokeDexNative(loader: DexClassLoader, jarFile: File) {
    val guardJar = TvJarGuardSupport.looksLikeGuardJar(jarFile)
    for (name in TvJarGuardSupport.dexNativeClassNames) {
      val clz = try {
        loader.loadClass(name)
      } catch (_: ClassNotFoundException) {
        continue
      } catch (e: Throwable) {
        if (guardJar) throw unwrap(e)
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
          val t = unwrap(e)
          if (guardJar && (t is UnsatisfiedLinkError || t is ExceptionInInitializerError || t is NoClassDefFoundError)) {
            throw t
          }
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
    val spKey = jaKey + siteKey
    spiders[spKey]?.let { return it }
    val loader = loadDex(jarPath) ?: return null
    val className = TvJarGuardSupport.resolveSpiderClassName(api)
    val simple = className.substringAfterLast('.')
    val prev = Thread.currentThread().contextClassLoader
    Thread.currentThread().contextClassLoader = loader
    try {
      val instance =
        tryDexNativeGetSpider(loader, api)
          ?: tryDexNativeGetSpider(loader, simple)
          ?: tryDexNativeGetSpider(loader, simple.removeSuffix("Guard"))
          ?: loader.loadClass(className).getDeclaredConstructor().newInstance()
      setSiteKey(instance, siteKey)
      try {
        val init = instance.javaClass.methods.firstOrNull { it.name == "init" && it.parameterCount == 2 }
        init?.invoke(instance, app(), ext)
      } catch (e: Throwable) {
        val t = unwrap(e)
        if (simple.endsWith("Guard") &&
          (t is UnsatisfiedLinkError || t is NoClassDefFoundError || t is ExceptionInInitializerError)
        ) {
          throw t
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
      return instance
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

  private fun errorMessage(e: Throwable): String {
    val t = unwrap(e)
    val msg = t.message ?: t.toString()
    val cause = t.cause
    return if (cause != null && cause !== t && !cause.message.isNullOrBlank()) {
      "${t.javaClass.simpleName}: $msg; cause=${cause.javaClass.simpleName}: ${cause.message}"
    } else {
      "${t.javaClass.simpleName}: $msg"
    }
  }

  @Command
  fun callSpider(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(TvSpiderCallArgs::class.java)
      Log.i(TAG, "callSpider method=${args.method} api=${args.api} jarLen=${args.jarPath.length}")
      val spider = getSpider(args.siteKey, args.api, args.ext, args.jarPath)
        ?: throw IllegalStateException("无法加载 JAR: ${args.jarPath}")
      val jsonArgs = JSONArray(args.argsJson.ifEmpty { "[]" })
      val methodName = when (args.method) {
        "homeContent" -> "homeContent"
        "homeVideoContent" -> "homeVideoContent"
        "categoryContent" -> "categoryContent"
        "detailContent" -> "detailContent"
        "searchContent" -> "searchContent"
        "playerContent" -> "playerContent"
        "liveContent" -> "liveContent"
        else -> args.method
      }
      val method: Method = findMethod(spider.javaClass, methodName)
        ?: throw NoSuchMethodException(methodName)
      val params = method.parameterTypes
      val callArgs = Array(params.size) { i ->
        val raw = if (i < jsonArgs.length()) jsonArgs.get(i) else null
        coerce(raw, params[i])
      }
      val prev = Thread.currentThread().contextClassLoader
      Thread.currentThread().contextClassLoader = spider.javaClass.classLoader
      val result = try {
        method.invoke(spider, *callArgs)
      } finally {
        Thread.currentThread().contextClassLoader = prev
      }
      val out = JSObject()
      out.put("result", result?.toString() ?: "")
      invoke.resolve(out)
    } catch (e: Throwable) {
      invoke.reject(errorMessage(e))
    }
  }

  /** 预热：下载远程 JAR 并建立 DexClassLoader（对齐桌面 prefetchJar） */
  @Command
  fun prefetchJar(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(TvPrefetchArgs::class.java)
      val jar = args.jar.trim()
      if (jar.isEmpty()) {
        val out = JSObject()
        out.put("ok", false)
        out.put("reason", "empty jar")
        invoke.resolve(out)
        return
      }
      val file = resolveJarFile(jar)
      loadDex(jar)
        ?: throw IllegalStateException("无法加载 JAR: $jar")
      val out = JSObject()
      out.put("ok", true)
      out.put("path", file.absolutePath)
      out.put("key", dexKey(jar))
      invoke.resolve(out)
    } catch (e: Throwable) {
      invoke.reject(errorMessage(e))
    }
  }

  @Command
  fun engineKind(invoke: Invoke) {
    val out = JSObject()
    out.put("kind", "dex-native")
    invoke.resolve(out)
  }

  @Command
  fun setProxyPort(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(TvProxyPortArgs::class.java)
      proxyPort = args.port
      syncHostProxyPort(recentKey?.let { loaders[it] })
      val out = JSObject()
      out.put("ok", true)
      out.put("port", proxyPort)
      invoke.resolve(out)
    } catch (e: Throwable) {
      invoke.reject(errorMessage(e))
    }
  }

  @Command
  fun jsonExt(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(TvJsonExtArgs::class.java)
      val loader = recentKey?.let { loaders[it] } ?: loaders.values.firstOrNull()
        ?: throw IllegalStateException("尚未加载任何 JAR，无法 jsonExt")
      val suffix = when (args.parseType) {
        2 -> "Parallel"
        3 -> "Vip"
        else -> "Basic"
      }
      val clz = loader.loadClass("com.github.catvod.parser.Json$suffix")
      val parse = clz.methods.firstOrNull { it.name == "parse" }
        ?: throw NoSuchMethodException("parse")
      val jxs = LinkedHashMap<String, String>()
      jxs[args.name] = args.name
      val result = when (parse.parameterTypes.size) {
        2 -> parse.invoke(null, jxs, args.url)
        3 -> parse.invoke(null, args.name, args.url, args.flag)
        else -> parse.invoke(null, jxs, args.url)
      }
      val out = JSObject()
      out.put("result", result?.toString() ?: "")
      invoke.resolve(out)
    } catch (e: Throwable) {
      invoke.reject(errorMessage(e))
    }
  }

  @Command
  fun proxy(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(TvProxyArgs::class.java)
      val paramsObj = JSONObject(args.paramsJson.ifEmpty { "{}" })
      val params = HashMap<String, String>()
      val keys = paramsObj.keys()
      while (keys.hasNext()) {
        val k = keys.next()
        params[k] = paramsObj.optString(k)
      }
      // 对齐 FongMi：先 recent，再遍历其它 JAR 的 spider.Proxy
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
      val headers = JSObject()
      val hdr = result.getOrNull(3)
      if (hdr is Map<*, *>) {
        for ((hk, hv) in hdr) {
          if (hk != null && hv != null) headers.put(hk.toString(), hv.toString())
        }
      }
      val out = JSObject()
      out.put("code", code)
      out.put("mime", mime)
      out.put("bodyBase64", android.util.Base64.encodeToString(bodyBytes, android.util.Base64.NO_WRAP))
      out.put("headers", headers)
      invoke.resolve(out)
    } catch (e: Throwable) {
      invoke.reject(errorMessage(e))
    }
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

  @Command
  fun clearCache(invoke: Invoke) {
    try {
      spiders.clear()
      loaders.clear()
      proxyMethods.clear()
      recentKey = null
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
      val out = JSObject()
      out.put("ok", true)
      out.put("path", cache.absolutePath)
      invoke.resolve(out)
    } catch (e: Throwable) {
      invoke.reject(errorMessage(e))
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
