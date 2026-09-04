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
  const val HOST_PROCESS_DIED_MESSAGE =
    "影视加固库进程已退出（DexNative/ftyguard）。该源可能与当前系统不兼容，请换源或清除 JAR 缓存后重试"

  const val HOST_PROCESS_NAME_SUFFIX = "tvspider"

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

  fun isElfMagic(bytes: ByteArray): Boolean {
    return bytes.size >= 4 &&
      bytes[0] == 0x7f.toByte() &&
      bytes[1] == 'E'.code.toByte() &&
      bytes[2] == 'L'.code.toByte() &&
      bytes[3] == 'F'.code.toByte()
  }

  fun isElfFile(file: File): Boolean {
    if (!file.isFile || file.length() < 4L) return false
    return try {
      file.inputStream().use { input ->
        val magic = ByteArray(4)
        if (input.read(magic) != 4) return false
        isElfMagic(magic)
      }
    } catch (_: Exception) {
      false
    }
  }

  /**
   * 删掉目录里非 ELF 的 .so（加密 blob / 截断文件）。
   * 否则 DexClassLoader 可能按 librarySearchPath 去 dlopen，下次启动直接 native 崩溃。
   */
  fun removeInvalidNativeLibraries(dir: File): Int {
    if (!dir.isDirectory) return 0
    var removed = 0
    val listed = dir.listFiles() ?: return 0
    for (f in listed) {
      if (!f.isFile) continue
      if (!f.name.endsWith(".so", ignoreCase = true)) continue
      if (isElfFile(f)) continue
      try {
        f.setWritable(true)
        if (f.delete()) removed++
      } catch (_: Exception) {
      }
    }
    return removed
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

  /**
   * 仅 lib/&lt;abi&gt;、jni/&lt;abi&gt; 布局可放入 librarySearchPath。
   * 饭太硬 assets/ftyguard_*.so 可能是加密 payload，DexNative 经 getResourceAsStream 解密后再 System.load；
   * 若提前当 ELF 抽出，下次启动会 SIGSEGV。
   */
  fun selectLoadableNativeZipEntries(entryNames: Iterable<String>, abis: List<String>): List<String> {
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
    return emptyList()
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
      val selected = selectLoadableNativeZipEntries(names, abis) + selectGuardPayloadEntries(names)
      val out = ArrayList<File>()
      val seen = HashSet<String>()
      for (name in selected) {
        val entry = zip.getEntry(name) ?: continue
        if (entry.isDirectory) continue
        val original = nativeFileName(name)
        val bytes = zip.getInputStream(entry).use { it.readBytes() }
        if (original.endsWith(".so", ignoreCase = true) && !isElfMagic(bytes)) continue
        val aliases =
          if (original.endsWith(".so", ignoreCase = true)) nativeLoadNames(original)
          else listOf(original)
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

  /**
   * 仅当确实抽出了 ELF .so 时才交给 DexClassLoader。
   * 饭太硬 fan.txt 的 so 在 assets 里、可能加密：传 directory 会让 loadLibrary 直接 dlopen 闪退。
   */
  fun nativeLibrarySearchPath(extractedSos: List<File>, soDir: File): String? {
    val hasElf =
      extractedSos.any { f ->
        f.isFile && f.name.endsWith(".so", ignoreCase = true) && isElfFile(f)
      }
    if (!hasElf) return null
    val path = soDir.absolutePath
    return path.ifBlank { null }
  }

  fun resolveLoadableLibrary(path: String?): String? {
    if (path.isNullOrBlank()) return null
    val file = File(path)
    return if (isElfFile(file)) path else null
  }

  /**
   * 饭太硬打包 so 常带 ELF 头，但必须由 JAR 内 Init.init / DexNative 解密后再 dlopen。
   * 残留文件即使 isElfFile=true 也不能留给 librarySearchPath。
   */
  fun looksLikeGuardNativeResidue(fileName: String): Boolean {
    val n = fileName.lowercase()
    if (!(n.endsWith(".so") || n.endsWith(".guard"))) return false
    return n.contains("ftyguard") ||
      n.contains("ftyfnw") ||
      n.contains("ftyshinidie") ||
      n.contains("dexnative") ||
      n.startsWith("fty") ||
      n.startsWith("libfty")
  }

  fun removeGuardNativeResidues(dir: File): Int {
    if (!dir.isDirectory) return 0
    var removed = 0
    val listed = dir.listFiles() ?: return 0
    for (f in listed) {
      if (!f.isFile) continue
      if (!looksLikeGuardNativeResidue(f.name)) continue
      try {
        f.setWritable(true)
        if (f.delete()) removed++
      } catch (_: Exception) {
      }
    }
    return removed
  }

  /**
   * 对齐 FongMi `DexClassLoader(..., Path.jar(), Path.jar(), ...)`：
   * 无 lib/<abi> ELF 时仍把 cacheDir/jar 交给 loadLibrary，供 Init.init 写入解密 so。
   */
  fun dexNativeLibrarySearchPath(extractedElfSos: List<File>, soDir: File, jarDir: File): String? {
    nativeLibrarySearchPath(extractedElfSos, soDir)?.let { return it }
    val path = jarDir.absolutePath
    return path.ifBlank { null }
  }

  /** FongMi 先 `loadClass(csp_*)`，不先碰 DexNative.&lt;clinit&gt;。 */
  fun shouldTryDexNativeBeforeJavaClass(): Boolean = false

  /** FongMi 不把 JAR ClassLoader 塞进 host Init；DexNative 用自己的 loader 读 assets。 */
  fun shouldSetHostJarClassLoader(): Boolean = false

  /**
   * 饭太硬 Guard 必须用系统 [dalvik.system.DexClassLoader]，不要 overlay getResourceAsStream / findLibrary。
   * 自定义 loader 会让壳把加密 blob 当已解密 so 去 dlopen。
   */
  fun shouldUseStockDexClassLoader(guardJar: Boolean): Boolean = guardJar

  fun nativePageIncompatibleHint(sdkInt: Int): String {
    return if (sdkInt >= 35) "；Android 15+ 的 16KB 内存页可能导致加固库无法加载" else ""
  }
}
