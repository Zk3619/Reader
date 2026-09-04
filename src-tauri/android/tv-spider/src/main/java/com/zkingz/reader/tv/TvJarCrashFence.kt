package com.zkingz.reader.tv

import java.io.File
import java.io.FileOutputStream
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/**
 * 主进程加载加固 JAR 时无法 catch SIGSEGV。
 * 加载前把哨兵 fsync 落盘；下次启动若哨兵仍在，视为上次崩溃，隔离该 JAR。
 */
class TvJarCrashFence(private val dir: File) {

  data class Record(
    val jarKey: String,
    val jar: String,
    val siteKey: String,
    val api: String,
    val phase: String,
    val at: Long,
  )

  fun absorbIfCrashed(): Record? {
    val sentinel = readSentinel() ?: return null
    clearSentinel()
    addQuarantine(sentinel)
    return sentinel
  }

  fun isQuarantined(jarKey: String): Boolean {
    if (jarKey.isBlank()) return false
    return listQuarantine().any { it.jarKey == jarKey }
  }

  fun isQuarantinedJar(jarSpec: String): Boolean {
    val url = jarUrlKey(jarSpec)
    if (url.isEmpty()) return false
    return listQuarantine().any { jarUrlKey(it.jar) == url || it.jarKey == jarSpec }
  }

  fun begin(jarKey: String, jar: String, siteKey: String, api: String, phase: String) {
    dir.mkdirs()
    val rec =
      Record(
        jarKey = jarKey,
        jar = jar,
        siteKey = siteKey,
        api = api,
        phase = phase,
        at = System.currentTimeMillis(),
      )
    writeAtomic(sentinelFile(), encode(rec))
  }

  fun succeed() {
    clearSentinel()
  }

  fun listQuarantine(): List<Record> {
    val f = quarantineFile()
    if (!f.isFile) return emptyList()
    return f.readText(StandardCharsets.UTF_8)
      .split(ENTRY_SEP)
      .mapNotNull { decode(it) }
  }

  fun clearQuarantine(jarKey: String? = null) {
    if (jarKey.isNullOrBlank()) {
      val f = quarantineFile()
      if (f.exists()) f.delete()
      clearSentinel()
      return
    }
    val keep = listQuarantine().filter { it.jarKey != jarKey }
    if (keep.isEmpty()) {
      val f = quarantineFile()
      if (f.exists()) f.delete()
    } else {
      writeAtomic(quarantineFile(), keep.joinToString(ENTRY_SEP) { encode(it) })
    }
  }

  fun quarantinedMessage(): String = QUARANTINED_MESSAGE

  private fun addQuarantine(rec: Record) {
    val existing = listQuarantine()
    if (existing.any { it.jarKey == rec.jarKey }) return
    val next = existing + rec
    dir.mkdirs()
    writeAtomic(quarantineFile(), next.joinToString(ENTRY_SEP) { encode(it) })
  }

  private fun readSentinel(): Record? {
    val f = sentinelFile()
    if (!f.isFile || f.length() == 0L) return null
    return decode(f.readText(StandardCharsets.UTF_8))
  }

  private fun clearSentinel() {
    val f = sentinelFile()
    if (f.exists()) f.delete()
  }

  private fun sentinelFile(): File = File(dir, "sentinel.v1")

  private fun quarantineFile(): File = File(dir, "quarantine.v1")

  companion object {
    const val QUARANTINED_MESSAGE =
      "影视 JAR 上次加载导致应用崩溃，已暂时禁用该加固源"

    private const val ENTRY_SEP = "\n---\n"

    fun jarUrlKey(jarSpec: String): String {
      val s = jarSpec.trim()
      if (s.isEmpty()) return ""
      val cut = s.indexOf(";md5;")
      return (if (cut >= 0) s.substring(0, cut) else s).trim().lowercase()
    }

    fun encode(rec: Record): String {
      return listOf(
        "v1",
        enc(rec.jarKey),
        enc(rec.jar),
        enc(rec.siteKey),
        enc(rec.api),
        enc(rec.phase),
        rec.at.toString(),
      ).joinToString("\n")
    }

    fun decode(raw: String): Record? {
      val lines = raw.trim().replace("\r\n", "\n").split('\n')
      if (lines.size < 7 || lines[0] != "v1") return null
      val at = lines[6].toLongOrNull() ?: return null
      return Record(
        jarKey = dec(lines[1]),
        jar = dec(lines[2]),
        siteKey = dec(lines[3]),
        api = dec(lines[4]),
        phase = dec(lines[5]),
        at = at,
      )
    }

    private fun enc(value: String): String =
      URLEncoder.encode(value, StandardCharsets.UTF_8.name()) ?: ""

    private fun dec(value: String): String =
      URLDecoder.decode(value, StandardCharsets.UTF_8.name()) ?: ""

    fun writeAtomic(file: File, text: String) {
      file.parentFile?.mkdirs()
      val part = File(file.parentFile, "${file.name}.tmp")
      FileOutputStream(part).use { out ->
        out.write(text.toByteArray(StandardCharsets.UTF_8))
        out.flush()
        try {
          out.fd.sync()
        } catch (_: Exception) {
        }
      }
      if (file.exists()) file.delete()
      if (!part.renameTo(file)) {
        part.copyTo(file, overwrite = true)
        part.delete()
      }
    }
  }
}
