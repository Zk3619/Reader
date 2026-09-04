package com.zkingz.reader.tv

import dalvik.system.DexClassLoader
import java.io.File
import java.io.InputStream

/**
 * DexNative.&lt;clinit&gt; 用 ClassLoader.getResourceAsStream("assets/ftyguard_*.so")
 * 抽出并 System.load。标准 DexClassLoader 对 JAR 内非 class 条目经常返回 null。
 *
 * 不要 override findResource 返回 jar: URL：部分机型打开加密 so 的 jar 连接会 native 崩溃。
 * findLibrary 必须拒绝非 ELF，否则 loadLibrary 会把加密 blob dlopen 掉进程。
 */
class TvJarDexClassLoader(
  dexPath: String,
  optimizedDirectory: String,
  librarySearchPath: String?,
  parent: ClassLoader,
  private val jarFile: File,
) : DexClassLoader(dexPath, optimizedDirectory, librarySearchPath, parent) {

  override fun getResourceAsStream(name: String?): InputStream? {
    if (!name.isNullOrBlank()) {
      TvJarGuardSupport.openJarEntry(jarFile, name)?.let { return it }
    }
    return super.getResourceAsStream(name)
  }

  override fun findLibrary(name: String?): String? {
    return TvJarGuardSupport.resolveLoadableLibrary(super.findLibrary(name))
  }
}
