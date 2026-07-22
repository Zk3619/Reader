package com.zkingz.reader.tv

import android.app.Activity
import android.content.Context
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
 * 关键：远程 jar URL 需先下载到本地缓存再 DexClassLoader（与桌面 tv-jar-host prefetchJar 对齐）。
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

@TauriPlugin
class TvSpiderPlugin(private val activity: Activity) : Plugin(activity) {

  private val loaders = ConcurrentHashMap<String, DexClassLoader>()
  private val spiders = ConcurrentHashMap<String, Any>()
  private val jarLocks = ConcurrentHashMap<String, Any>()

  private fun appContext(): Context = activity.applicationContext

  private fun dexKey(jar: String): String = md5Hex(jar)

  private fun jarCacheDir(): File =
    File(appContext().filesDir, "tv-jar-cache").apply { mkdirs() }

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
        val md5Ok =
          md5Expect.isEmpty() ||
            (dest.exists() && dest.length() > 0 && md5Expect.equals(fileMd5(dest), ignoreCase = true))
        if (dest.exists() && dest.length() > 0 && isZipMagic(dest) && md5Ok) {
          return dest
        }
        val hadValid = dest.exists() && dest.length() > 0 && isZipMagic(dest)
        try {
          downloadAtomic(jar, dest)
        } catch (e: Exception) {
          if (hadValid) return dest
          throw e
        }
        return dest
      }
    }
    val local = File(jar.removePrefix("file://"))
    if (!local.exists()) {
      throw IllegalStateException("无法加载 JAR: $jarSpec")
    }
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

  private fun loadDex(jarSpec: String): DexClassLoader? {
    val key = dexKey(jarSpec)
    loaders[key]?.let { return it }
    val file = try {
      resolveJarFile(jarSpec)
    } catch (e: Exception) {
      throw e
    }
    ensureSpiderConfigJson()
    val cache = File(appContext().codeCacheDir, "tv-jar").apply { mkdirs() }
    val loader = DexClassLoader(
      file.absolutePath,
      cache.absolutePath,
      cache.absolutePath,
      appContext().classLoader,
    )
    try {
      val initClz = loader.loadClass("com.github.catvod.spider.Init")
      val init = initClz.getMethod("init", Context::class.java)
      init.invoke(null, appContext())
    } catch (_: Throwable) {
      // optional Init
    }
    loaders[key] = loader
    return loader
  }

  private fun getSpider(siteKey: String, api: String, ext: String, jarPath: String): Any? {
    val spKey = dexKey(jarPath) + siteKey
    spiders[spKey]?.let { return it }
    val loader = loadDex(jarPath) ?: return null
    val className = "com.github.catvod.spider." + api.removePrefix("csp_")
    val clz = loader.loadClass(className)
    val instance = clz.getDeclaredConstructor().newInstance()
    try {
      val siteKeyField = clz.superclass?.getField("siteKey")
      siteKeyField?.set(instance, siteKey)
    } catch (_: Throwable) {
    }
    try {
      val init = clz.methods.firstOrNull { it.name == "init" && it.parameterTypes.size == 2 }
      init?.invoke(instance, appContext(), ext)
    } catch (_: Throwable) {
    }
    spiders[spKey] = instance
    return instance
  }

  @Command
  fun callSpider(invoke: Invoke, args: TvSpiderCallArgs) {
    try {
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
      val methods = spider.javaClass.methods.filter { it.name == methodName }
      val method: Method = methods.firstOrNull()
        ?: throw NoSuchMethodException(methodName)
      val params = method.parameterTypes
      val callArgs = Array(params.size) { i ->
        val raw = if (i < jsonArgs.length()) jsonArgs.get(i) else null
        coerce(raw, params[i])
      }
      val result = method.invoke(spider, *callArgs)
      val out = JSObject()
      out.put("result", result?.toString() ?: "")
      invoke.resolve(out)
    } catch (e: Exception) {
      invoke.reject(e.message ?: "callSpider failed")
    }
  }

  /** 预热：下载远程 JAR 并建立 DexClassLoader（对齐桌面 prefetchJar） */
  @Command
  fun prefetchJar(invoke: Invoke, args: TvPrefetchArgs) {
    try {
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
    } catch (e: Exception) {
      invoke.reject(e.message ?: "prefetchJar failed")
    }
  }

  @Command
  fun engineKind(invoke: Invoke) {
    val out = JSObject()
    out.put("kind", "dex-native")
    invoke.resolve(out)
  }

  @Command
  fun jsonExt(invoke: Invoke, args: TvJsonExtArgs) {
    try {
      val loader = loaders.values.firstOrNull()
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
    } catch (e: Exception) {
      invoke.reject(e.message ?: "jsonExt failed")
    }
  }

  @Command
  fun proxy(invoke: Invoke, args: TvProxyArgs) {
    try {
      val paramsObj = JSONObject(args.paramsJson.ifEmpty { "{}" })
      val params = HashMap<String, String>()
      val keys = paramsObj.keys()
      while (keys.hasNext()) {
        val k = keys.next()
        params[k] = paramsObj.optString(k)
      }
      // 对齐 JarLoader：com.github.catvod.spider.Proxy.proxy(Map)
      val loader = loaders.values.firstOrNull()
        ?: throw IllegalStateException("尚未加载任何 JAR，无法 proxy")
      val clz = loader.loadClass("com.github.catvod.spider.Proxy")
      val method = clz.getMethod("proxy", Map::class.java)
      val result = method.invoke(null, params) as? Array<*>
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
    } catch (e: Exception) {
      invoke.reject(e.message ?: "proxy failed")
    }
  }

  @Command
  fun clearCache(invoke: Invoke) {
    try {
      spiders.clear()
      loaders.clear()
      val cache = File(appContext().codeCacheDir, "tv-jar")
      if (cache.exists()) {
        cache.deleteRecursively()
      }
      cache.mkdirs()
      val jarCache = jarCacheDir()
      if (jarCache.exists()) {
        jarCache.deleteRecursively()
      }
      jarCache.mkdirs()
      val out = JSObject()
      out.put("ok", true)
      out.put("path", cache.absolutePath)
      invoke.resolve(out)
    } catch (e: Exception) {
      invoke.reject(e.message ?: "clearCache failed")
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
