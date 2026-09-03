package com.zkingz.reader.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * 回归：安卓影视加固 JAR 必须抽出当前 ABI 的 .so，否则 DexNative 接口无法 loadLibrary。
 */
class TvJarGuardSupportTest {
  @Test
  fun resolveSpiderClassName_stripsCspPrefix() {
    assertEquals(
      "com.github.catvod.spider.AppYsV2",
      TvJarGuardSupport.resolveSpiderClassName("csp_AppYsV2"),
    )
    assertEquals(
      "com.github.catvod.spider.Foo",
      TvJarGuardSupport.resolveSpiderClassName("Foo"),
    )
    assertEquals(
      "org.example.Bar",
      TvJarGuardSupport.resolveSpiderClassName("org.example.Bar"),
    )
  }

  @Test
  fun looksLikeGuardJar_detectsDexNativeAndSo() {
    assertTrue(
      TvJarGuardSupport.looksLikeGuardJar(
        listOf("com/github/catvod/spider/DexNative.class", "lib/arm64-v8a/libftyguard.so"),
      ),
    )
    assertTrue(TvJarGuardSupport.looksLikeGuardJar(listOf("assets/foo.guard")))
    assertFalse(TvJarGuardSupport.looksLikeGuardJar(listOf("com/github/catvod/spider/AppYsV2.class")))
  }

  @Test
  fun selectNativeZipEntries_prefersFirstSupportedAbi() {
    val entries =
      listOf(
        "com/github/catvod/spider/DexNative.class",
        "lib/armeabi-v7a/libftyguard.so",
        "lib/arm64-v8a/libftyguard.so",
        "lib/x86/libftyguard.so",
      )
    assertEquals(
      listOf("lib/arm64-v8a/libftyguard.so"),
      TvJarGuardSupport.selectNativeZipEntries(entries, listOf("arm64-v8a", "armeabi-v7a")),
    )
    assertEquals(
      listOf("lib/armeabi-v7a/libftyguard.so"),
      TvJarGuardSupport.selectNativeZipEntries(entries, listOf("armeabi-v7a")),
    )
  }

  @Test
  fun extractNativeLibraries_writesPreferredAbiSo() {
    val dir = Files.createTempDirectory("tv-guard-").toFile()
    try {
      val jar = File(dir, "guard.jar")
      ZipOutputStream(jar.outputStream()).use { zip ->
        zip.putNextEntry(ZipEntry("com/github/catvod/spider/DexNative.class"))
        zip.write(byteArrayOf(0xCA.toByte(), 0xFE.toByte()))
        zip.closeEntry()
        zip.putNextEntry(ZipEntry("lib/armeabi-v7a/libftyguard.so"))
        zip.write("v7a".toByteArray())
        zip.closeEntry()
        zip.putNextEntry(ZipEntry("lib/arm64-v8a/libftyguard.so"))
        zip.write("arm64".toByteArray())
        zip.closeEntry()
      }
      val dest = File(dir, "so")
      val extracted =
        TvJarGuardSupport.extractNativeLibraries(jar, dest, listOf("arm64-v8a", "armeabi-v7a"))
      assertEquals(1, extracted.size)
      val so = extracted[0]
      assertEquals("libftyguard.so", so.name)
      assertEquals("arm64", so.readText())
      assertTrue(TvJarGuardSupport.looksLikeGuardJar(jar))
    } finally {
      dir.deleteRecursively()
    }
  }

  @Test
  fun extractNativeLibraries_skipsPlainJar() {
    val dir = Files.createTempDirectory("tv-plain-").toFile()
    try {
      val jar = File(dir, "plain.jar")
      ZipOutputStream(jar.outputStream()).use { zip ->
        zip.putNextEntry(ZipEntry("com/github/catvod/spider/AppYsV2.class"))
        zip.write(byteArrayOf(1))
        zip.closeEntry()
      }
      val dest = File(dir, "so").apply { mkdirs() }
      val extracted = TvJarGuardSupport.extractNativeLibraries(jar, dest, listOf("arm64-v8a"))
      assertTrue(extracted.isEmpty())
    } finally {
      dir.deleteRecursively()
    }
  }

  @Test
  fun selectNativeZipEntries_acceptsJniLayout() {
    val entries = listOf("jni/arm64-v8a/libdexnative.so", "classes.dex")
    assertEquals(
      listOf("jni/arm64-v8a/libdexnative.so"),
      TvJarGuardSupport.selectNativeZipEntries(entries, listOf("arm64-v8a")),
    )
  }

  @Test
  fun selectNativeZipEntries_picksFtyAssetsSoForCurrentAbi() {
    val entries =
      listOf(
        "classes.dex",
        "assets/ftyguard_v7.so",
        "assets/ftyguard_v8.so",
        "assets/ftyshinidie.guard",
      )
    assertEquals(
      listOf("assets/ftyguard_v8.so"),
      TvJarGuardSupport.selectNativeZipEntries(entries, listOf("arm64-v8a", "armeabi-v7a")),
    )
    assertEquals(
      listOf("assets/ftyguard_v7.so"),
      TvJarGuardSupport.selectNativeZipEntries(entries, listOf("armeabi-v7a")),
    )
  }

  @Test
  fun extractNativeLibraries_writesFtyAssetsSoAndGuardPayload() {
    val dir = Files.createTempDirectory("tv-fty-").toFile()
    try {
      val jar = File(dir, "fan.txt")
      ZipOutputStream(jar.outputStream()).use { zip ->
        zip.putNextEntry(ZipEntry("classes.dex"))
        zip.write("dex\n035\u0000".toByteArray())
        zip.closeEntry()
        zip.putNextEntry(ZipEntry("assets/ftyguard_v7.so"))
        zip.write("v7a".toByteArray())
        zip.closeEntry()
        zip.putNextEntry(ZipEntry("assets/ftyguard_v8.so"))
        zip.write("arm64".toByteArray())
        zip.closeEntry()
        zip.putNextEntry(ZipEntry("assets/ftyshinidie.guard"))
        zip.write("guard".toByteArray())
        zip.closeEntry()
      }
      val dest = File(dir, "so")
      val extracted =
        TvJarGuardSupport.extractNativeLibraries(jar, dest, listOf("arm64-v8a", "armeabi-v7a"))
      val names = extracted.map { it.name }.toSet()
      assertTrue(names.contains("ftyguard_v8.so"))
      assertTrue("loadLibrary 需要 lib 前缀", names.contains("libftyguard_v8.so"))
      assertTrue(names.contains("ftyshinidie.guard"))
      assertEquals("arm64", File(dest, "ftyguard_v8.so").readText())
      assertFalse(names.contains("ftyguard_v7.so"))
    } finally {
      dir.deleteRecursively()
    }
  }

  @Test
  fun proxyClassNames_matchFongMiHost() {
    assertTrue(TvJarGuardSupport.proxyClassNames.contains("com.github.catvod.Proxy"))
    assertTrue(TvJarGuardSupport.dexNativeClassNames.contains("com.github.catvod.spider.DexNative"))
  }

  @Test
  fun openJarEntry_readsDexNativeAssetPath() {
    val dir = Files.createTempDirectory("tv-asset-").toFile()
    try {
      val jar = File(dir, "fan.txt")
      ZipOutputStream(jar.outputStream()).use { zip ->
        zip.putNextEntry(ZipEntry("classes.dex"))
        zip.write("dex".toByteArray())
        zip.closeEntry()
        zip.putNextEntry(ZipEntry("assets/ftyguard_v8.so"))
        zip.write("native-v8".toByteArray())
        zip.closeEntry()
        zip.putNextEntry(ZipEntry("assets/ftyshinidie.guard"))
        zip.write("guard-payload".toByteArray())
        zip.closeEntry()
      }
      TvJarGuardSupport.openJarEntry(jar, "assets/ftyguard_v8.so")!!.use { input ->
        assertEquals("native-v8", input.readBytes().toString(Charsets.UTF_8))
      }
      TvJarGuardSupport.openJarEntry(jar, "assets/ftyshinidie.guard")!!.use { input ->
        assertEquals("guard-payload", input.readBytes().toString(Charsets.UTF_8))
      }
      assertTrue(TvJarGuardSupport.hasJarEntry(jar, "assets/ftyguard_v8.so"))
      assertTrue("标准 DexClassLoader 会漏掉该条目", TvJarGuardSupport.hasJarEntry(jar, "assets/ftyshinidie.guard"))
    } finally {
      dir.deleteRecursively()
    }
  }

  @Test
  fun librarySearchPath_prefersFongMiJarDirThenNativeDir() {
    val jarDir = File("/data/user/0/app/cache/jar")
    val nativeDir = File("/data/user/0/app/files/tv-jar-native/abc")
    val joined = TvJarGuardSupport.librarySearchPath(jarDir, nativeDir)
    val parts = joined.split(File.pathSeparator)
    assertEquals(jarDir.absolutePath, parts[0])
    assertEquals(nativeDir.absolutePath, parts[1])
  }

  @Test
  fun librarySearchPath_joinsDistinctDirs() {
    val a = File("/data/so-a")
    val b = File("/data/so-b")
    val joined = TvJarGuardSupport.librarySearchPath(a, a, b)
    assertTrue(joined.contains("so-a"))
    assertTrue(joined.contains("so-b"))
    assertEquals(1, joined.split(File.pathSeparator).count { it.endsWith("so-a") })
  }
}
