package com.zkingz.reader.video

import android.content.Context
import android.util.AttributeSet
import android.util.Log
import android.view.View
import android.widget.FrameLayout
import java.io.File
import java.io.FileOutputStream
import org.json.JSONArray

/**
 * libmpv 宿主：优先直用 is.xyz.mpv.MPVView；配置对齐小喵 CustomMPVView 子集。
 * 无 AAR 时 attachOrThrow 失败，由 Activity 处理。
 */
class ReaderMpvHost @JvmOverloads constructor(
  context: Context,
  attrs: AttributeSet? = null,
) : FrameLayout(context, attrs) {
  private var mpvView: View? = null
  private var viewClass: Class<*>? = null
  private var launchQuality: String = "balanced"
  private var launchDeblur: Boolean = false

  fun isReady(): Boolean = mpvView != null

  fun attachOrThrow() {
    if (mpvView != null) return
    // 优先 Reader 一等公民子类（有 AAR 且编译进包时）
    val preferred = listOf(
      "com.zkingz.reader.video.ReaderMpvView",
      "is.xyz.mpv.MPVView",
    )
    var cls: Class<*>? = null
    for (name in preferred) {
      try {
        cls = Class.forName(name)
        break
      } catch (_: ClassNotFoundException) {
      }
    }
    if (cls == null) throw ClassNotFoundException("MPVView not found")
    viewClass = cls
    val ctor = try {
      cls.getConstructor(Context::class.java, AttributeSet::class.java)
    } catch (_: NoSuchMethodException) {
      null
    }
    val view = if (ctor != null) {
      ctor.newInstance(context, null) as View
    } else {
      cls.getConstructor(Context::class.java).newInstance(context) as View
    }
    mpvView = view
    addView(view, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    initialize(view, cls)
    ensureShadersCopied(context)
  }

  private fun initialize(view: View, cls: Class<*>) {
    val configDir = context.filesDir.absolutePath
    val cacheDir = context.cacheDir.absolutePath
    val init = cls.methods.firstOrNull { it.name == "initialize" }
    when (init?.parameterTypes?.size) {
      2 -> init.invoke(view, configDir, cacheDir)
      1 -> init.invoke(view, configDir)
      else -> cls.methods.firstOrNull { it.name == "create" }?.invoke(view)
    }
  }

  fun destroyHost() {
    val view = mpvView ?: return
    try {
      viewClass?.methods?.firstOrNull { it.name == "destroy" }?.invoke(view)
    } catch (e: Throwable) {
      Log.w(TAG, "destroy", e)
    }
    removeAllViews()
    mpvView = null
    viewClass = null
  }

  fun command(vararg args: String) {
    val view = mpvView ?: return
    val cls = viewClass ?: return
    val m = cls.methods.firstOrNull { it.name == "command" && it.parameterTypes.size == 1 }
    if (m != null) {
      m.invoke(view, args)
      return
    }
    try {
      val lib = Class.forName("is.xyz.mpv.MPVLib")
      lib.methods.firstOrNull { it.name == "command" }?.invoke(null, args)
    } catch (e: Throwable) {
      Log.w(TAG, "command failed: ${args.joinToString()}", e)
    }
  }

  fun setProp(name: String, value: String) {
    val view = mpvView ?: return
    val cls = viewClass ?: return
    val m = cls.methods.firstOrNull {
      (it.name == "setPropertyString" || it.name == "setProperty") && it.parameterTypes.size >= 2
    }
    if (m != null) {
      m.invoke(view, name, value)
    } else {
      command("set", name, value)
    }
  }

  fun getProp(name: String): String? {
    val view = mpvView ?: return null
    val cls = viewClass ?: return null
    val m = cls.methods.firstOrNull {
      it.name == "getPropertyString" && it.parameterTypes.size == 1
    } ?: return null
    return try {
      m.invoke(view, name) as? String
    } catch (_: Throwable) {
      null
    }
  }

  fun getPropDouble(name: String): Double {
    return getProp(name)?.toDoubleOrNull() ?: 0.0
  }

  fun applyBaseEngineOpts(cfg: PlayerLaunchConfig) {
    val a4kOn = cfg.anime4kMode.isNotBlank() && cfg.anime4kMode != "off"
    val rifeOn = cfg.frameInterpEnabled
    val profile = cfg.mpvProfile.ifBlank { "default" }
    setProp("profile", profile)

    val vo = when {
      a4kOn || rifeOn -> "gpu"
      cfg.videoOutput.equals("gpu-next", ignoreCase = true) -> "gpu-next"
      else -> "gpu"
    }
    setProp("vo", vo)
    if (vo == "gpu-next") {
      setProp("gpu-context", "android")
    } else {
      setProp("gpu-context", "android")
    }

    val hwdec = when {
      a4kOn || rifeOn -> "mediacodec-copy"
      cfg.hwdec.isBlank() -> "mediacodec,mediacodec-copy,no"
      else -> cfg.hwdec
    }
    setProp("hwdec", hwdec)
    setProp("hwdec-codecs", "all")
    setProp("ao", "audiotrack,opensles")

    // HDR
    val tm = cfg.hdrToneMapping.trim().ifBlank { "mobius" }
    if (tm != "auto" && tm != "no") {
      setProp("tone-mapping", tm)
    } else if (tm == "mobius" || tm == "auto") {
      setProp("tone-mapping", "mobius")
    }
    setProp("target-colorspace-hint", if (cfg.hdrTargetColorspaceHint) "yes" else "no")
    setProp("target-prim", "auto")
    setProp("target-trc", "auto")
    setProp("inverse-tone-mapping", "yes")
    setProp("hdr-compute-peak", "yes")
    setProp("hdr-reference-white", "203")

    // softvol
    val vmax = cfg.volumeMax.coerceIn(100.0, 300.0)
    setProp("volume-max", vmax.toInt().toString())
    setProp("softvol", "yes")
    setProp("keep-open", "yes")
    setProp("keepaspect", "yes")
    setProp("sub-auto", "fuzzy")
    setProp("sub-codepage", "auto")
    setProp("slang", "zh,chi,zho,chs,cht,zh-CN,zh-TW,en,eng")
  }

  fun applyLaunchOpts(cfg: PlayerLaunchConfig) {
    launchQuality = cfg.anime4kQuality
    launchDeblur = cfg.anime4kDeblur
    applyBaseEngineOpts(cfg)

    val a4k = cfg.anime4kMode
    val rifeOn = cfg.frameInterpEnabled
    // RIFE 与 Anime4K 互斥：开补帧时清 shaders
    if (rifeOn) {
      setProp("glsl-shaders", "")
      applyFrameInterp(cfg)
    } else if (a4k != "off" && a4k.isNotBlank()) {
      setProp("vo", "gpu")
      setProp("hwdec", "mediacodec-copy")
      val shaderDir = File(context.filesDir, "shaders")
      val chain = Anime4KChain.buildChain(shaderDir, a4k, cfg.anime4kQuality, cfg.anime4kDeblur)
      if (chain.isNotEmpty()) setProp("glsl-shaders", chain)
      clearFrameInterp()
    } else {
      setProp("glsl-shaders", "")
      clearFrameInterp()
    }

    if (cfg.subFont.isNotBlank()) setProp("sub-font", cfg.subFont)
    if (cfg.subFontSize > 0) setProp("sub-font-size", cfg.subFontSize.toInt().toString())
    if (cfg.subScale > 0) setProp("sub-scale", cfg.subScale.toString())
    setProp("sub-pos", cfg.subPos.coerceIn(0.0, 150.0).toInt().toString())
    if (cfg.subDelay != 0.0) setProp("sub-delay", cfg.subDelay.toString())
    if (cfg.subColor.isNotBlank()) setProp("sub-color", cfg.subColor)

    val vol = if (cfg.muted) 0 else cfg.volume.coerceIn(0.0, cfg.volumeMax).toInt()
    setProp("volume", vol.toString())
    setProp("mute", if (cfg.muted) "yes" else "no")
    setProp("vid", if (cfg.listenOnly) "no" else "auto")

    PlayerLaunchConfig.eqAf(cfg.audioEqPreset)?.let { setProp("af", it) }
      ?: setProp("af", "")

    if (cfg.httpHeaders.isNotBlank()) {
      setProp("http-header-fields", cfg.httpHeaders)
    }
    if (cfg.preferredSubtitlePath.isNotBlank()) {
      // load after loadfile via sub-add
    }
  }

  fun loadfile(url: String, startSec: Double = 0.0) {
    if (startSec > 0) {
      command("loadfile", url, "replace", "start=${startSec}")
    } else {
      command("loadfile", url)
    }
  }

  fun subAdd(path: String) {
    if (path.isBlank()) return
    command("sub-add", path, "select")
  }

  fun setSid(id: String) {
    setProp("sid", id)
  }

  fun setAid(id: String) {
    setProp("aid", id)
  }

  fun cycleAid() {
    command("cycle", "aid")
  }

  fun cycleSid() {
    command("cycle", "sid")
  }

  fun pause() {
    setProp("pause", "yes")
  }

  fun play() {
    setProp("pause", "no")
  }

  fun togglePause() {
    val p = getProp("pause")
    setProp("pause", if (p == "yes") "no" else "yes")
  }

  fun seekRelative(delta: Double) {
    command("seek", delta.toString(), "relative")
  }

  fun seekAbsolute(sec: Double) {
    command("seek", sec.toString(), "absolute")
  }

  fun setSpeed(speed: Double) {
    setProp("speed", speed.coerceIn(0.25, 4.0).toString())
  }

  fun setAspect(mode: String) {
    when (mode.lowercase()) {
      "stretch" -> {
        setProp("keepaspect", "no")
        setProp("panscan", "0")
        setProp("video-aspect-override", "-1")
      }
      "crop" -> {
        setProp("keepaspect", "yes")
        setProp("panscan", "1.0")
        setProp("video-aspect-override", "-1")
      }
      else -> {
        setProp("keepaspect", "yes")
        setProp("panscan", "0")
        setProp("video-aspect-override", "-1")
      }
    }
  }

  fun setAudioEq(preset: String) {
    val af = PlayerLaunchConfig.eqAf(preset)
    setProp("af", af ?: "")
  }

  fun setAnime4kMode(mode: String, quality: String = launchQuality, deblur: Boolean = launchDeblur) {
    launchQuality = quality
    launchDeblur = deblur
    val shaderDir = File(context.filesDir, "shaders")
    if (mode == "off" || mode.isBlank()) {
      setProp("glsl-shaders", "")
      return
    }
    clearFrameInterp()
    setProp("vo", "gpu")
    setProp("hwdec", "mediacodec-copy")
    setProp("glsl-shaders", Anime4KChain.buildChain(shaderDir, mode, quality, deblur))
  }

  /**
   * Android RIFE：优先挂增强滤镜名（需增强 AAR/so）；否则非 AI soft fallback。
   */
  fun applyFrameInterp(cfg: PlayerLaunchConfig): Boolean {
    if (!cfg.frameInterpEnabled) {
      clearFrameInterp()
      return false
    }
    setProp("vo", "gpu")
    setProp("hwdec", "mediacodec-copy")
    setProp("glsl-shaders", "")
    val st = RifeAvailability.probe(context)
    val factor = cfg.frameInterpFactor.coerceIn(2, 4)
    if (st.available) {
      // 增强包约定：vf=rife:factor=N（具体滤镜名随 AAR；失败则回退 soft）
      setProp("vf", "rife:factor=$factor")
      setProp("interpolation", "no")
      return true
    }
    if (cfg.frameInterpLightweightFallback) {
      setProp("vf", "")
      setProp("interpolation", "yes")
      setProp("video-sync", "display-resample")
      return true
    }
    clearFrameInterp()
    return false
  }

  fun clearFrameInterp() {
    setProp("vf", "")
    setProp("interpolation", "no")
  }

  fun screenshotTo(path: String) {
    command("screenshot-to-file", path, "video")
  }

  data class TrackItem(val id: String, val type: String, val title: String, val lang: String)

  fun listTracks(type: String): List<TrackItem> {
    val raw = getProp("track-list") ?: return emptyList()
    return try {
      val arr = JSONArray(raw)
      val out = mutableListOf<TrackItem>()
      for (i in 0 until arr.length()) {
        val o = arr.optJSONObject(i) ?: continue
        val t = o.optString("type")
        if (t != type) continue
        val id = o.opt("id")?.toString() ?: continue
        val title = o.optString("title").ifBlank { o.optString("lang").ifBlank { "Track $id" } }
        val lang = o.optString("lang")
        out.add(TrackItem(id, t, title, lang))
      }
      out
    } catch (e: Throwable) {
      Log.w(TAG, "listTracks", e)
      emptyList()
    }
  }

  data class ChapterItem(val index: Int, val title: String, val time: Double)

  fun listChapters(): List<ChapterItem> {
    val raw = getProp("chapter-list") ?: return emptyList()
    return try {
      val arr = JSONArray(raw)
      val out = mutableListOf<ChapterItem>()
      for (i in 0 until arr.length()) {
        val o = arr.optJSONObject(i) ?: continue
        val title = o.optString("title").ifBlank { "Chapter ${i + 1}" }
        val time = o.optDouble("time", 0.0)
        out.add(ChapterItem(i, title, time))
      }
      out
    } catch (e: Throwable) {
      Log.w(TAG, "listChapters", e)
      emptyList()
    }
  }

  fun detectHdrHint(): String? {
    val prim = getProp("video-params/primaries") ?: return null
    val trc = getProp("video-params/gamma") ?: getProp("video-params/transfer")
    val dv = getProp("video-params/dovi") ?: getProp("metadata/dovi")
    if (dv == "yes" || dv == "true" || (dv?.isNotBlank() == true && dv != "no")) {
      return "Dolby Vision"
    }
    if (prim.contains("bt.2020", true) || trc?.contains("pq", true) == true ||
      trc?.contains("hlg", true) == true
    ) {
      return "HDR"
    }
    return null
  }

  companion object {
    private const val TAG = "ReaderMpvHost"

    fun ensureShadersCopied(context: Context) {
      val dest = File(context.filesDir, "shaders")
      if (!dest.exists()) dest.mkdirs()
      try {
        val names = context.assets.list("shaders") ?: return
        for (name in names) {
          if (!name.endsWith(".glsl", ignoreCase = true)) continue
          val out = File(dest, name)
          if (out.exists() && out.length() > 0) continue
          context.assets.open("shaders/$name").use { input ->
            FileOutputStream(out).use { output -> input.copyTo(output) }
          }
        }
      } catch (e: Throwable) {
        Log.w(TAG, "copy shaders from assets", e)
      }
    }
  }
}
