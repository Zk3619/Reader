package com.zkingz.reader.tv

import java.io.File
import java.io.FilterInputStream
import java.io.InputStream
import java.util.zip.ZipFile

/**
 * Guard / DexNative 加固 JAR 的纯 JDK 辅助：选 ABI、解压 .so、解析 csp_* 类名。
 * 不依赖 Android API，便于 JVM 单测。
 */
object TvJarGuardSupport {
  val proxyClassNames: Array<String> =
    arrayOf("com.github.catvod.Proxy", "com.github.catvod.crawler.Proxy")

  val dexNativeClassNames: Array<String> =
    arrayOf(
      "com.github.catvod.spider.DexNative",
      "com.github.catvod.spider.FtyGuard",
    )

  fun resolveSpiderClassName(api: String): String {
    var name = api.trim()
    if (name.startsWith("csp_")) name = name.substring(4)
    if (name.contains('.')) return name
    return "com.github.catvod.spider.$name"
  }

  /**
   * 饭太硬 DexNative.&lt;clinit&gt; 走 ClassLoader.getResourceAsStream("assets/ftyguard_v8.so")。
   * 安卓 DexClassLoader 经常找不到 JAR 内非 class 条目，必须自己打开 ZIP。
   */
  fun openJarEntry(jar: File, name: String): InputStream? {
    if (!jar.isFile) return null
    val wanted = name.trim().trimStart('/')
    if (wanted.isEmpty()) return null
    val zip = ZipFile(jar)
    try {
      val entry =
        zip.getEntry(wanted)
          ?: zip.getEntry("assets/$wanted")
          ?: zip.entries().asSequence().firstOrNull { it.name.replace('\\', '/') == wanted }
      if (entry == null || entry.isDirectory) {
        zip.close()
        return null
      }
      val inner = zip.getInputStream(entry)
      return object : FilterInputStream(inner) {
        override fun close() {
          try {
            super.close()
          } finally {
            zip.close()
          }
        }
      }
    } catch (e: Exception) {
      try {
        zip.close()
      } catch (_: Exception) {
      }
      throw e
    }
  }

  fun hasJarEntry(jar: File, name: String): Boolean {
    if (!jar.isFile) return false
    val wanted = name.trim().trimStart('/')
    if (wanted.isEmpty()) return false
    return try {
      ZipFile(jar).use { zip ->
        zip.getEntry(wanted) != null || zip.getEntry("assets/$wanted") != null
      }
    } catch (_: Exception) {
      false
    }
  }

  fun looksLikeGuardJar(entryNames: Iterable<String>): Boolean {
    for (name in entryNames) {
      val lower = name.lowercase()
      if (lower.endsWith(".so") || lower.endsWith(".guard")) return true
      if (name == "com/github/catvod/spider/DexNative.class") return true
      if (lower.contains("ftyguard") || lower.contains("dexnative")) return true
    }
    return false
  }

  fun selectNativeZipEntries(entryNames: Iterable<String>, abis: List<String>): List<String> {
    val soEntries =
      entryNames
        .map { it.replace('\\', '/') }
        .filter { it.endsWith(".so", ignoreCase = true) && !it.endsWith("/") }
    if (soEntries.isEmpty()) return emptyList()
    for (prefixRoot in listOf("lib/", "jni/")) {
      for (abi in abis) {
        if (abi.isBlank()) continue
        val prefix = "$prefixRoot$abi/"
        val matched = soEntries.filter { it.startsWith(prefix) }
        if (matched.isNotEmpty()) return matched
      }
    }
    for (abi in abis) {
      val matched = soEntries.filter { entryMatchesFtyAbi(it, abi) }
      if (matched.isNotEmpty()) return matched
    }
    return soEntries.filter { name ->
      val slash = name.count { it == '/' }
      slash == 0 || (name.startsWith("lib/") && slash == 1)
    }
  }

  /** 饭太硬 fan.txt：assets/ftyguard_v8.so / assets/ftyguard_v7.so，不是 lib/<abi>/ */
  fun entryMatchesFtyAbi(entry: String, abi: String): Boolean {
    val base = nativeFileName(entry).lowercase()
    val a = abi.lowercase()
    return when {
      a.contains("arm64") || a == "aarch64" ->
        base.contains("v8") || base.contains("arm64") || base.contains("aarch64")
      a.contains("armeabi") || a.contains("armv7") ->
        (base.contains("v7") || base.contains("armv7") || base.contains("armeabi")) &&
          !base.contains("v8")
      a.contains("x86_64") -> base.contains("x86_64") || base.contains("x64")
      a == "x86" -> base.contains("x86") && !base.contains("64")
      else -> false
    }
  }

  fun selectGuardPayloadEntries(entryNames: Iterable<String>): List<String> {
    return entryNames
      .map { it.replace('\\', '/') }
      .filter { it.endsWith(".guard", ignoreCase = true) && !it.endsWith("/") }
  }

  fun nativeFileName(entry: String): String {
    val norm = entry.replace('\\', '/')
    val base = norm.substringAfterLast('/')
    return base.ifEmpty { norm }
  }

  /** System.loadLibrary("ftyguard_v8") 找 libftyguard_v8.so */
  fun nativeLoadNames(fileName: String): List<String> {
    if (!fileName.endsWith(".so", ignoreCase = true)) return listOf(fileName)
    val names = ArrayList<String>(2)
    names.add(fileName)
    if (!fileName.startsWith("lib")) names.add("lib$fileName")
    return names
  }

  fun extractNativeLibraries(jar: File, destDir: File, abis: List<String>): List<File> {
    destDir.mkdirs()
    if (!jar.isFile) return emptyList()
    ZipFile(jar).use { zip ->
      val names = zip.entries().asSequence().map { it.name }.toList()
      if (!looksLikeGuardJar(names)) return emptyList()
      val selected = selectNativeZipEntries(names, abis) + selectGuardPayloadEntries(names)
      val out = ArrayList<File>()
      val seen = HashSet<String>()
      for (name in selected) {
        val entry = zip.getEntry(name) ?: continue
        if (entry.isDirectory) continue
        val original = nativeFileName(name)
        val aliases =
          if (original.endsWith(".so", ignoreCase = true)) nativeLoadNames(original)
          else listOf(original)
        val bytes = zip.getInputStream(entry).use { it.readBytes() }
        for (alias in aliases) {
          if (!seen.add(alias)) continue
          val dest = File(destDir, alias)
          if (dest.exists()) dest.setWritable(true)
          dest.writeBytes(bytes)
          dest.setReadOnly()
          out.add(dest)
        }
      }
      return out
    }
  }

  fun looksLikeGuardJar(jar: File): Boolean {
    if (!jar.isFile) return false
    return try {
      ZipFile(jar).use { zip ->
        looksLikeGuardJar(zip.entries().asSequence().map { it.name }.asIterable())
      }
    } catch (_: Exception) {
      false
    }
  }

  fun librarySearchPath(vararg dirs: File): String {
    return dirs
      .map { it.absolutePath }
      .filter { it.isNotBlank() }
      .distinct()
      .joinToString(File.pathSeparator)
  }
}
