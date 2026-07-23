package com.zkingz.reader.video

import android.content.Context
import android.database.Cursor
import android.os.Build
import android.provider.MediaStore
import java.io.File

/**
 * MediaStore 视频扫描（黑名单目录名 + .nomedia 跳过）。
 */
object MediaStoreVideoScanner {
  data class Item(
    val path: String,
    val name: String,
    val size: Long,
    val dateAdded: Long,
  )

  fun scan(context: Context, blacklist: Set<String> = defaultBlacklist): List<Item> {
    val out = mutableListOf<Item>()
    val collection = if (Build.VERSION.SDK_INT >= 29) {
      MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
    } else {
      MediaStore.Video.Media.EXTERNAL_CONTENT_URI
    }
    val projection = arrayOf(
      MediaStore.Video.Media.DATA,
      MediaStore.Video.Media.DISPLAY_NAME,
      MediaStore.Video.Media.SIZE,
      MediaStore.Video.Media.DATE_ADDED,
    )
    val cursor: Cursor? = try {
      context.contentResolver.query(
        collection,
        projection,
        null,
        null,
        "${MediaStore.Video.Media.DATE_ADDED} DESC",
      )
    } catch (_: SecurityException) {
      null
    }
    cursor?.use { c ->
      val iPath = c.getColumnIndexOrThrow(MediaStore.Video.Media.DATA)
      val iName = c.getColumnIndexOrThrow(MediaStore.Video.Media.DISPLAY_NAME)
      val iSize = c.getColumnIndexOrThrow(MediaStore.Video.Media.SIZE)
      val iDate = c.getColumnIndexOrThrow(MediaStore.Video.Media.DATE_ADDED)
      while (c.moveToNext()) {
        val path = c.getString(iPath) ?: continue
        val file = File(path)
        if (!file.isFile) continue
        if (isBlocked(file, blacklist)) continue
        out.add(
          Item(
            path = path,
            name = c.getString(iName) ?: file.name,
            size = c.getLong(iSize),
            dateAdded = c.getLong(iDate),
          ),
        )
      }
    }
    return out
  }

  private fun isBlocked(file: File, blacklist: Set<String>): Boolean {
    var cur: File? = file.parentFile
    while (cur != null) {
      val name = cur.name.lowercase()
      if (name in blacklist) return true
      if (File(cur, ".nomedia").exists()) return true
      cur = cur.parentFile
    }
    return false
  }

  private val defaultBlacklist = setOf(
    "android", "cache", "thumbnails", ".thumbnails", "tencent", "whatsapp",
  )
}
