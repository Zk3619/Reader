package com.zkingz.reader.video

/**
 * 开播参数（Intent / 插件透传）。
 */
data class PlayerLaunchConfig(
  val engine: String = "media3",
  val url: String = "",
  val title: String = "",
  val anime4kMode: String = "off",
  val anime4kQuality: String = "balanced",
  val anime4kDeblur: Boolean = false,
  val subFont: String = "",
  val subFontSize: Double = 0.0,
  val subScale: Double = 1.0,
  val subPos: Double = 100.0,
  val subDelay: Double = 0.0,
  val subColor: String = "",
  val hwdec: String = "mediacodec,mediacodec-copy,no",
  val videoOutput: String = "gpu",
  val mpvProfile: String = "default",
  val volume: Double = 100.0,
  val volumeMax: Double = 300.0,
  val muted: Boolean = false,
  val listenOnly: Boolean = false,
  val startSec: Double = 0.0,
  val httpHeaders: String = "",
  val preferredSubtitlePath: String = "",
  val openingSkipSec: Double = 0.0,
  val endingSkipSec: Double = 0.0,
  /** fixed | chapter */
  val skipMode: String = "fixed",
  val hdrToneMapping: String = "mobius",
  val hdrTargetColorspaceHint: Boolean = true,
  val audioEqPreset: String = "off",
  val danmakuPath: String = "",
  /** overlay | ass | off */
  val danmakuMode: String = "overlay",
  val danmakuAssPath: String = "",
  /** RIFE / soft fallback（Android 仅 ncnn 或非 AI） */
  val frameInterpEnabled: Boolean = false,
  val frameInterpFactor: Int = 2,
  val frameInterpLightweightFallback: Boolean = false,
) {
  companion object {
    fun eqAf(preset: String): String? = when (preset.lowercase()) {
      "bass" -> "lavfi=[equalizer=f=100:width_type=h:width=200:g=6]"
      "treble" -> "lavfi=[equalizer=f=3000:width_type=h:width=2000:g=4]"
      "voice" -> "lavfi=[equalizer=f=1000:width_type=h:width=800:g=5]"
      else -> null
    }
  }
}
