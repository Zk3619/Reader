package com.zkingz.reader.video

import java.io.File

/**
 * 对齐桌面 anime4k.ts / 小喵 Anime4KManager：Mode A/B/C/AA/BB/CA + quality + deblur。
 */
object Anime4KChain {
  private fun letter(quality: String): String = when (quality.lowercase()) {
    "fast", "s" -> "S"
    "high", "l" -> "L"
    else -> "M"
  }

  private fun lowerLetter(quality: String): String =
    if (quality.lowercase() == "high" || quality.lowercase() == "l") "M" else "S"

  fun buildFileNames(
    mode: String,
    quality: String = "balanced",
    deblur: Boolean = false,
  ): List<String> {
    val m = mode.lowercase().trim()
    if (m.isEmpty() || m == "off") return emptyList()

    val q = quality
    val clamp = "Anime4K_Clamp_Highlights.glsl"
    val restore = "Anime4K_Restore_CNN_${letter(q)}.glsl"
    val restoreSoft = "Anime4K_Restore_CNN_Soft_${letter(q)}.glsl"
    val upscale = "Anime4K_Upscale_CNN_x2_${letter(q)}.glsl"
    val upscaleDenoise = "Anime4K_Upscale_Denoise_CNN_x2_${letter(q)}.glsl"
    val restoreLower = "Anime4K_Restore_CNN_${lowerLetter(q)}.glsl"
    val restoreSoftLower = "Anime4K_Restore_CNN_Soft_${lowerLetter(q)}.glsl"
    val upscaleLower = "Anime4K_Upscale_CNN_x2_${lowerLetter(q)}.glsl"
    val autoX2 = "Anime4K_AutoDownscalePre_x2.glsl"
    val autoX4 = "Anime4K_AutoDownscalePre_x4.glsl"
    val deblurDog = "Anime4K_Deblur_DoG.glsl"

    val shaders = mutableListOf(clamp)
    when (m) {
      "a" -> shaders.addAll(listOf(restore, upscale, autoX2, autoX4, upscaleLower))
      "b" -> shaders.addAll(listOf(restoreSoft, upscale, autoX2, autoX4, upscaleLower))
      "c" -> shaders.addAll(listOf(upscaleDenoise, autoX2, autoX4, upscaleLower))
      "aa" -> shaders.addAll(
        listOf(restore, upscale, autoX2, autoX4, restoreLower, upscaleLower),
      )
      "bb" -> shaders.addAll(
        listOf(restoreSoft, upscale, autoX2, autoX4, restoreSoftLower, upscaleLower),
      )
      "ca" -> shaders.addAll(
        listOf(upscaleDenoise, autoX2, autoX4, restoreLower, upscaleLower),
      )
      else -> return emptyList()
    }
    if (deblur) shaders.add(deblurDog)
    return shaders
  }

  fun buildChain(
    dir: File,
    mode: String,
    quality: String = "balanced",
    deblur: Boolean = false,
  ): String {
    val paths = buildFileNames(mode, quality, deblur)
      .map { File(dir, it) }
      .filter { it.isFile }
      .map { it.absolutePath }
    return paths.joinToString(":")
  }

  /** 循环切换：off → a → b → c → aa → bb → ca → off */
  fun nextMode(current: String): String = when (current.lowercase()) {
    "off", "" -> "a"
    "a" -> "b"
    "b" -> "c"
    "c" -> "aa"
    "aa" -> "bb"
    "bb" -> "ca"
    else -> "off"
  }
}
