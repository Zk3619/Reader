package com.zkingz.reader.tv

import dalvik.system.DexClassLoader
import java.io.File
import java.io.InputStream
import java.net.URL

/**
 * DexNative.&lt;clinit&gt; 用 Init.classLoader().getResourceAsStream("assets/ftyguard_*.so")
 * 抽出并 System.load。标准 DexClassLoader 对 JAR 内非 dex 资源经常返回 null，导致瞬间 NPE。
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

  override fun findResource(name: String?): URL? {
    if (!name.isNullOrBlank() && TvJarGuardSupport.hasJarEntry(jarFile, name)) {
      return URL("jar:${jarFile.toURI()}!/${name.trimStart('/')}")
    }
    return super.findResource(name)
  }
}
