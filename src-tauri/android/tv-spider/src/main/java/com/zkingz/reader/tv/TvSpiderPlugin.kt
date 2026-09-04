package com.zkingz.reader.tv

import android.app.Activity
import android.os.Looper
import android.util.Log
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * 主进程 Tauri 插件：对齐 FongMi，在本进程 DexClassLoader 加载 JAR。
 * 崩溃靠 TvJarCrashFence 哨兵在下次启动隔离，而不是子进程。
 *
 * Tauri 2 的 `@Command` 只能是 `(invoke: Invoke)`，参数必须 `invoke.parseArgs`。
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

@InvokeArg
class TvUnquarantineArgs {
  var jarKey: String = ""
}

@TauriPlugin
class TvSpiderPlugin(private val activity: Activity) : Plugin(activity) {

  private val host = TvSpiderHost(activity.application)

  private val ioExecutor = Executors.newCachedThreadPool { r ->
    Thread({
      if (Looper.myLooper() == null) {
        try {
          Looper.prepare()
        } catch (_: Throwable) {
        }
      }
      r.run()
    }, "tv-spider-io").apply { isDaemon = true }
  }

  companion object {
    private const val TAG = "TvSpider"
  }

  private fun runIo(invoke: Invoke, block: () -> Unit) {
    ioExecutor.execute {
      try {
        block()
      } catch (e: Throwable) {
        Log.w(TAG, "command failed: ${e.message}")
        invoke.reject(e.message ?: e.toString())
      }
    }
  }

  @Command
  fun callSpider(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(TvSpiderCallArgs::class.java)
    } catch (e: Throwable) {
      invoke.reject(e.message ?: e.toString())
      return
    }
    runIo(invoke) {
      val result = host.callSpider(
        args.siteKey,
        args.api,
        args.ext,
        args.jarPath,
        args.method,
        args.argsJson,
      )
      val out = JSObject()
      out.put("result", result)
      invoke.resolve(out)
    }
  }

  @Command
  fun prefetchJar(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(TvPrefetchArgs::class.java)
    } catch (e: Throwable) {
      invoke.reject(e.message ?: e.toString())
      return
    }
    runIo(invoke) {
      val raw = host.prefetchJar(args.jar)
      val json = JSONObject(raw)
      val out = JSObject()
      out.put("ok", json.optBoolean("ok", true))
      out.put("path", json.optString("path"))
      out.put("key", json.optString("key"))
      out.put("reason", json.optString("reason"))
      invoke.resolve(out)
    }
  }

  @Command
  fun engineKind(invoke: Invoke) {
    val out = JSObject()
    out.put("kind", "dex-native")
    invoke.resolve(out)
  }

  @Command
  fun crashFenceBoot(invoke: Invoke) {
    runIo(invoke) {
      val out = JSObject()
      out.put("json", host.crashFenceBootJson())
      invoke.resolve(out)
    }
  }

  @Command
  fun unquarantineJar(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(TvUnquarantineArgs::class.java)
    } catch (e: Throwable) {
      invoke.reject(e.message ?: e.toString())
      return
    }
    runIo(invoke) {
      val out = JSObject()
      out.put("json", host.unquarantine(args.jarKey))
      invoke.resolve(out)
    }
  }

  @Command
  fun setProxyPort(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(TvProxyPortArgs::class.java)
    } catch (e: Throwable) {
      invoke.reject(e.message ?: e.toString())
      return
    }
    runIo(invoke) {
      host.setProxyPort(args.port)
      val out = JSObject()
      out.put("ok", true)
      out.put("port", args.port)
      invoke.resolve(out)
    }
  }

  @Command
  fun jsonExt(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(TvJsonExtArgs::class.java)
    } catch (e: Throwable) {
      invoke.reject(e.message ?: e.toString())
      return
    }
    runIo(invoke) {
      val result = host.jsonExt(args.parseType, args.name, args.url, args.flag)
      val out = JSObject()
      out.put("result", result)
      invoke.resolve(out)
    }
  }

  @Command
  fun proxy(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(TvProxyArgs::class.java)
    } catch (e: Throwable) {
      invoke.reject(e.message ?: e.toString())
      return
    }
    runIo(invoke) {
      val json = JSONObject(host.proxy(args.paramsJson))
      val headers = JSObject()
      val hdr = json.optJSONObject("headers")
      if (hdr != null) {
        val keys = hdr.keys()
        while (keys.hasNext()) {
          val k = keys.next()
          headers.put(k, hdr.optString(k))
        }
      }
      val out = JSObject()
      out.put("code", json.optInt("code", 500))
      out.put("mime", json.optString("mime", "application/octet-stream"))
      out.put("bodyBase64", json.optString("bodyBase64"))
      out.put("headers", headers)
      invoke.resolve(out)
    }
  }

  @Command
  fun clearCache(invoke: Invoke) {
    runIo(invoke) {
      val path = host.clearCache()
      val out = JSObject()
      out.put("ok", true)
      out.put("path", path)
      invoke.resolve(out)
    }
  }
}
