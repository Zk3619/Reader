package com.zkingz.reader.video

import android.content.Context
import java.io.File

/**
 * Android RIFE 探测：标准小喵 AAR 通常无 VapourSynth/RIFE 滤镜。
 * 若发行提供 `librife_mpv.so`（或含 RIFE 的增强 AAR）+ 模型目录，则 available=true。
 */
object RifeAvailability {
  data class Status(
    val available: Boolean,
    val detail: String,
    val modelsDir: String = "",
  )

  fun probe(context: Context): Status {
    val nativeLib = tryFindNativeLib(context)
    val models = File(context.filesDir, "rife/models")
    val hasModels =
      models.isDirectory &&
        (models.listFiles()?.any { it.isFile || (it.isDirectory && (it.list()?.isNotEmpty() == true)) } == true)

    // 旁路 so：nativeLibraryDir / filesDir/rife
    val soCandidates = listOfNotNull(
      nativeLib,
      File(context.filesDir, "rife/librife_mpv.so").takeIf { it.isFile }?.absolutePath,
      File(context.applicationInfo.nativeLibraryDir, "librife_mpv.so").takeIf { it.isFile }?.absolutePath,
    )

    return when {
      soCandidates.isNotEmpty() && hasModels ->
        Status(true, "RIFE so + models ok", models.absolutePath)
      soCandidates.isNotEmpty() && !hasModels ->
        Status(false, "找到 RIFE so，但 filesDir/rife/models 为空", models.absolutePath)
      hasModels ->
        Status(
          false,
          "有模型目录但无 librife_mpv.so；标准 AAR 通常无 RIFE 滤镜（可用非 AI 平滑）",
          models.absolutePath,
        )
      else ->
        Status(
          false,
          "无 RIFE 增强包（需 librife_mpv.so + models）；见 docs/VIDEO_RIFE.md",
        )
    }
  }

  private fun tryFindNativeLib(context: Context): String? {
    return try {
      // 若增强 AAR 已把符号编进进程，System.loadLibrary 可成功
      System.loadLibrary("rife_mpv")
      "librife_mpv (loaded)"
    } catch (_: UnsatisfiedLinkError) {
      null
    } catch (_: Throwable) {
      null
    }
  }
}
