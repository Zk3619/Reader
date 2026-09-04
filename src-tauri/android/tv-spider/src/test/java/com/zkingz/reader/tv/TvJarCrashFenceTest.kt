package com.zkingz.reader.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.file.Files

class TvJarCrashFenceTest {
  @Test
  fun absorbIfCrashed_promotesSentinelToQuarantine() {
    val dir = Files.createTempDirectory("tv-fence-").toFile()
    try {
      val fence = TvJarCrashFence(dir)
      fence.begin("k1", "https://cdn.example/fan.txt;md5;abc", "光影", "csp_T4Guard", "loadDex")
      val absorbed = fence.absorbIfCrashed()
      assertEquals("k1", absorbed!!.jarKey)
      assertEquals("光影", absorbed.siteKey)
      assertTrue(fence.isQuarantined("k1"))
      assertTrue(fence.isQuarantinedJar("https://cdn.example/fan.txt;md5;zzz"))
      assertFalse(fence.isQuarantined("other"))
      assertEquals(null, fence.absorbIfCrashed())
    } finally {
      dir.deleteRecursively()
    }
  }

  @Test
  fun succeed_clearsSentinelWithoutQuarantine() {
    val dir = Files.createTempDirectory("tv-fence-ok-").toFile()
    try {
      val fence = TvJarCrashFence(dir)
      fence.begin("k1", "https://cdn.example/fan.txt", "光影", "csp_T4Guard", "loadDex")
      fence.succeed()
      assertEquals(null, fence.absorbIfCrashed())
      assertFalse(fence.isQuarantined("k1"))
    } finally {
      dir.deleteRecursively()
    }
  }

  @Test
  fun jarUrlKey_stripsMd5Suffix() {
    assertEquals(
      "https://cdn.example/fan.txt",
      TvJarCrashFence.jarUrlKey("https://cdn.example/fan.txt;md5;deadbeef"),
    )
  }

  @Test
  fun clearQuarantine_canRetrySingleJar() {
    val dir = Files.createTempDirectory("tv-fence-clear-").toFile()
    try {
      val fence = TvJarCrashFence(dir)
      fence.begin("k1", "jar-a", "s1", "csp_A", "loadDex")
      fence.absorbIfCrashed()
      fence.begin("k2", "jar-b", "s2", "csp_B", "loadDex")
      fence.absorbIfCrashed()
      fence.clearQuarantine("k1")
      assertFalse(fence.isQuarantined("k1"))
      assertTrue(fence.isQuarantined("k2"))
    } finally {
      dir.deleteRecursively()
    }
  }
}
