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
import java.lang.reflect.Method
import java.util.LinkedHashMap
import java.util.concurrent.ConcurrentHashMap

/**
 * Android 真 DexClassLoader Spider 宿主（对齐 FongMi JarLoader 语义）。
 * 通过 Tauri Plugin 供 Rust/前端调用。
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

@TauriPlugin
class TvSpiderPlugin(private val activity: Activity) : Plugin(activity) {

  private val loaders = ConcurrentHashMap<String, DexClassLoader>()
  private val spiders = ConcurrentHashMap<String, Any>()

  private fun appContext(): Context = activity.applicationContext

  private fun dexKey(jar: String): String = jar.hashCode().toString()

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

  private fun loadDex(jarPath: String): DexClassLoader? {
    val key = dexKey(jarPath)
    loaders[key]?.let { return it }
    val file = File(jarPath)
    if (!file.exists()) return null
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
