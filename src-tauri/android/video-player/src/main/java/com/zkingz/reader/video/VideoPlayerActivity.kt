package com.zkingz.reader.video

import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.io.FileInputStream

/**
 * E2.E–G 全屏播放页：Media3 / libmpv + 手势/轨/章节/弹幕双路径。
 */
class VideoPlayerActivity : AppCompatActivity() {
  private var exo: ExoPlayer? = null
  private var mpvHost: ReaderMpvHost? = null
  private var danmakuHost: DanmakuOverlayHost? = null
  private var cfg = PlayerLaunchConfig()
  private var anime4kMode: String = "off"
  private var frameInterpOn: Boolean = false
  private var listenOnly: Boolean = false
  private var statusTv: TextView? = null
  private var previewTv: TextView? = null
  private var seekAccum = 0f
  private var savedSpeed = 1.0
  private val handler = Handler(Looper.getMainLooper())
  private var syncRunnable: Runnable? = null
  private var openingApplied = false
  private var endingArmed = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    cfg = readConfig(intent)
    anime4kMode = if (cfg.frameInterpEnabled) "off" else cfg.anime4kMode
    frameInterpOn = cfg.frameInterpEnabled
    listenOnly = cfg.listenOnly
    title = cfg.title.ifBlank { "Video" }

    when (cfg.engine.lowercase()) {
      "libmpv" -> setupLibmpv()
      else -> setupMedia3()
    }
  }

  private fun setupMedia3() {
    val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    setContentView(root)
    root.addView(buildTopBar(cfg.title) {
      exo?.stop()
      finish()
    })
    val playerView = PlayerView(this)
    playerView.layoutParams = LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f,
    )
    root.addView(playerView)
    val errBar = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; visibility = View.GONE }
    val errTv = TextView(this).apply {
      layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
    }
    val retry = Button(this).apply { text = "重试" }
    errBar.addView(errTv)
    errBar.addView(retry)
    root.addView(errBar)

    val player = ExoPlayer.Builder(this).build()
    exo = player
    playerView.player = player
    val vol = if (cfg.muted) 0f else (cfg.volume / 100.0).toFloat().coerceIn(0f, 1f)
    player.volume = vol
    player.addListener(object : Player.Listener {
      override fun onPlayerError(error: PlaybackException) {
        errBar.visibility = View.VISIBLE
        errTv.text = "Media3 失败: ${error.errorCodeName}"
      }

      override fun onPlaybackStateChanged(playbackState: Int) {
        if (playbackState == Player.STATE_READY) errBar.visibility = View.GONE
      }
    })
    retry.setOnClickListener { prepareMedia3(player) }
    if (cfg.url.isBlank()) {
      errBar.visibility = View.VISIBLE
      errTv.text = "无播放地址"
      return
    }
    prepareMedia3(player)
  }

  private fun prepareMedia3(player: ExoPlayer) {
    val builder = MediaItem.Builder().setUri(Uri.parse(cfg.url))
    player.setMediaItem(builder.build())
    player.prepare()
    val start = resolveStartSec()
    if (start > 0) player.seekTo((start * 1000).toLong())
    player.playWhenReady = true
  }

  private fun setupLibmpv() {
    val probe = LibmpvAvailability.probe()
    val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    setContentView(root)
    root.addView(buildTopBar(cfg.title) { finish() })

    if (!probe.available) {
      root.addView(TextView(this).apply {
        setPadding(48, 48, 48, 48)
        text = "libmpv 不可用\n\n${probe.detail}"
      })
      return
    }

    val stage = FrameLayout(this)
    stage.layoutParams = LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f,
    )
    root.addView(stage)

    val host = ReaderMpvHost(this)
    mpvHost = host
    stage.addView(host, FrameLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT,
    ))

    val danmaku = DanmakuOverlayHost(this)
    danmakuHost = danmaku
    stage.addView(danmaku, FrameLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT,
    ))

    val preview = TextView(this).apply {
      setPadding(24, 16, 24, 16)
      gravity = Gravity.CENTER
      visibility = View.GONE
      setBackgroundColor(0x88000000.toInt())
      setTextColor(0xFFFFFFFF.toInt())
    }
    previewTv = preview
    stage.addView(preview, FrameLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.WRAP_CONTENT,
      Gravity.CENTER,
    ))

    val gesture = PlayerGestureOverlay(this, object : PlayerGestureOverlay.Callbacks {
      override fun onTogglePause() {
        host.togglePause()
        syncDanmakuPause()
      }

      override fun onSeekDelta(deltaSec: Float) {
        host.seekRelative(deltaSec.toDouble())
      }

      override fun onVolumeDelta(delta: Float) {
        val am = getSystemService(AUDIO_SERVICE) as AudioManager
        val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val cur = am.getStreamVolume(AudioManager.STREAM_MUSIC)
        val next = (cur + delta * max).toInt().coerceIn(0, max)
        am.setStreamVolume(AudioManager.STREAM_MUSIC, next, 0)
        val mpvVol = host.getPropDouble("volume") + delta * 30
        host.setProp("volume", mpvVol.coerceIn(0.0, cfg.volumeMax).toInt().toString())
        showPreview("音量 ${mpvVol.toInt()}")
      }

      override fun onBrightnessDelta(delta: Float) {
        val lp = window.attributes
        val cur = if (lp.screenBrightness < 0) 0.5f else lp.screenBrightness
        val next = (cur + delta).coerceIn(0.01f, 1f)
        lp.screenBrightness = next
        window.attributes = lp
        showPreview("亮度 ${(next * 100).toInt()}%")
      }

      override fun onLongPressSpeed(active: Boolean) {
        if (active) {
          savedSpeed = host.getPropDouble("speed").takeIf { it > 0 } ?: 1.0
          host.setSpeed(2.0)
          showPreview("×2")
        } else {
          host.setSpeed(savedSpeed)
          hidePreview()
        }
      }

      override fun onSeekPreview(deltaSec: Float, ended: Boolean) {
        if (!ended) {
          seekAccum += deltaSec
          val pos = host.getPropDouble("time-pos") + seekAccum
          showPreview(formatTime(pos))
        } else {
          if (kotlin.math.abs(seekAccum) > 0.3f) {
            host.seekRelative(seekAccum.toDouble())
          }
          seekAccum = 0f
          hidePreview()
        }
      }
    })
    stage.addView(gesture, FrameLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT,
    ))

    root.addView(buildControlBar(host))
    val st = TextView(this).apply {
      setPadding(24, 8, 24, 8)
      text = statusLine()
    }
    statusTv = st
    root.addView(st)

    try {
      host.attachOrThrow()
      host.applyLaunchOpts(cfg)
      val start = resolveStartSec()
      if (cfg.url.isNotBlank()) host.loadfile(cfg.url, start)
      if (cfg.preferredSubtitlePath.isNotBlank()) {
        handler.postDelayed({ host.subAdd(cfg.preferredSubtitlePath) }, 800)
      }
      setupDanmaku(host)
      handler.postDelayed({
        host.detectHdrHint()?.let {
          Toast.makeText(this, "检测到 $it", Toast.LENGTH_SHORT).show()
        }
      }, 1500)
      startSyncLoop(host)
    } catch (e: Throwable) {
      Log.e(TAG, "libmpv setup", e)
      st.text = "libmpv 启动失败: ${e.message}"
      Toast.makeText(this, st.text, Toast.LENGTH_LONG).show()
    }
  }

  private fun setupDanmaku(host: ReaderMpvHost) {
    val mode = cfg.danmakuMode.lowercase()
    when (mode) {
      "ass" -> {
        if (cfg.danmakuAssPath.isNotBlank()) {
          handler.postDelayed({ host.subAdd(cfg.danmakuAssPath) }, 1000)
        }
      }
      "overlay" -> {
        val d = danmakuHost ?: return
        if (!d.isAvailable()) {
          // fallback ASS
          if (cfg.danmakuAssPath.isNotBlank()) {
            handler.postDelayed({ host.subAdd(cfg.danmakuAssPath) }, 1000)
            statusTv?.text = (statusTv?.text ?: "") + " · ASS回退"
          }
          return
        }
        d.attach()
        val path = cfg.danmakuPath.ifBlank { cfg.danmakuAssPath }
        if (path.isNotBlank()) {
          handler.postDelayed({
            if (d.loadFile(path)) {
              Toast.makeText(this, "弹幕已挂载", Toast.LENGTH_SHORT).show()
            }
          }, 600)
        }
      }
      else -> {}
    }
  }

  private fun buildControlBar(host: ReaderMpvHost): View {
    val scroll = HorizontalScrollView(this)
    val controls = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
    fun addBtn(label: String, onClick: () -> Unit) {
      controls.addView(Button(this).apply {
        text = label
        textSize = 12f
        setOnClickListener { onClick() }
      })
    }
    addBtn("音轨") { showTrackPicker(host, "audio") }
    addBtn("字幕") { showTrackPicker(host, "sub") }
    addBtn("RIFE") {
      frameInterpOn = !frameInterpOn
      if (frameInterpOn) {
        anime4kMode = "off"
        host.setAnime4kMode("off")
        cfg = cfg.copy(frameInterpEnabled = true, anime4kMode = "off")
        val ok = host.applyFrameInterp(cfg)
        if (!ok) {
          frameInterpOn = false
          cfg = cfg.copy(frameInterpEnabled = false)
          val probe = RifeAvailability.probe(this)
          Toast.makeText(
            this,
            "RIFE 不可用：${probe.detail}（可开「非 AI 平滑」prefs）",
            Toast.LENGTH_LONG,
          ).show()
        } else {
          Toast.makeText(this, "RIFE on ×${cfg.frameInterpFactor}", Toast.LENGTH_SHORT).show()
        }
      } else {
        cfg = cfg.copy(frameInterpEnabled = false)
        host.clearFrameInterp()
        Toast.makeText(this, "RIFE off", Toast.LENGTH_SHORT).show()
      }
      statusTv?.text = statusLine()
    }
    addBtn("A4K") {
      if (frameInterpOn) {
        frameInterpOn = false
        cfg = cfg.copy(frameInterpEnabled = false)
        host.clearFrameInterp()
        Toast.makeText(this, "已关 RIFE（与 Anime4K 互斥）", Toast.LENGTH_SHORT).show()
      }
      anime4kMode = Anime4KChain.nextMode(anime4kMode)
      host.setAnime4kMode(anime4kMode, cfg.anime4kQuality, cfg.anime4kDeblur)
      statusTv?.text = statusLine()
      Toast.makeText(this, "Anime4K: $anime4kMode", Toast.LENGTH_SHORT).show()
    }
    addBtn("倍速") { showSpeedPicker(host) }
    addBtn("比例") { showAspectPicker(host) }
    addBtn("章节") { showChapterPicker(host) }
    addBtn("EQ") { showEqPicker(host) }
    addBtn("听视频") {
      listenOnly = !listenOnly
      host.setProp("vid", if (listenOnly) "no" else "auto")
      if (listenOnly) startBgService() else stopBgService()
      statusTv?.text = if (listenOnly) "听视频中" else "有画面"
    }
    addBtn("截图") { takeScreenshot(host) }
    addBtn("下一集") { playNextSibling() }
    addBtn("弹幕") {
      val d = danmakuHost
      if (d != null && d.isAvailable()) {
        d.setVisible(true)
        Toast.makeText(this, "弹幕显示", Toast.LENGTH_SHORT).show()
      } else if (cfg.danmakuAssPath.isNotBlank()) {
        host.subAdd(cfg.danmakuAssPath)
      }
    }
    addBtn("字幕+") {
      triggerWyzieRequest()
    }
    scroll.addView(controls)
    return scroll
  }

  private fun showTrackPicker(host: ReaderMpvHost, type: String) {
    val tracks = host.listTracks(type)
    if (tracks.isEmpty()) {
      Toast.makeText(this, "无${if (type == "audio") "音" else "字"}轨", Toast.LENGTH_SHORT).show()
      return
    }
    val labels = tracks.map { "${it.id}: ${it.title} ${it.lang}" }.toTypedArray()
    AlertDialog.Builder(this)
      .setTitle(if (type == "audio") "音轨" else "字幕")
      .setItems(labels) { _, which ->
        val id = tracks[which].id
        if (type == "audio") host.setAid(id) else host.setSid(id)
      }
      .setNeutralButton("关闭字幕") { _, _ -> host.setSid("no") }
      .show()
  }

  private fun showSpeedPicker(host: ReaderMpvHost) {
    val speeds = arrayOf("0.5", "0.75", "1.0", "1.25", "1.5", "2.0", "3.0", "4.0")
    AlertDialog.Builder(this)
      .setTitle("倍速")
      .setItems(speeds) { _, i ->
        host.setSpeed(speeds[i].toDouble())
        showPreview("×${speeds[i]}")
      }
      .show()
  }

  private fun showAspectPicker(host: ReaderMpvHost) {
    val modes = arrayOf("fit", "stretch", "crop")
    AlertDialog.Builder(this)
      .setTitle("画面比例")
      .setItems(arrayOf("适应", "拉伸", "裁剪")) { _, i ->
        host.setAspect(modes[i])
      }
      .show()
  }

  private fun showChapterPicker(host: ReaderMpvHost) {
    val chapters = host.listChapters()
    if (chapters.isEmpty()) {
      Toast.makeText(this, "无章节", Toast.LENGTH_SHORT).show()
      return
    }
    val labels = chapters.map { "${formatTime(it.time)} ${it.title}" }.toTypedArray()
    AlertDialog.Builder(this)
      .setTitle("章节")
      .setItems(labels) { _, i -> host.seekAbsolute(chapters[i].time) }
      .show()
  }

  private fun showEqPicker(host: ReaderMpvHost) {
    val presets = arrayOf("off", "bass", "treble", "voice")
    AlertDialog.Builder(this)
      .setTitle("均衡器")
      .setItems(arrayOf("Off", "Bass", "Treble", "Voice")) { _, i ->
        host.setAudioEq(presets[i])
      }
      .show()
  }

  private fun takeScreenshot(host: ReaderMpvHost) {
    try {
      val tmp = File(cacheDir, "shot-${System.currentTimeMillis()}.jpg")
      host.screenshotTo(tmp.absolutePath)
      handler.postDelayed({
        if (!tmp.isFile) {
          Toast.makeText(this, "截图失败", Toast.LENGTH_SHORT).show()
          return@postDelayed
        }
        val values = ContentValues().apply {
          put(MediaStore.Images.Media.DISPLAY_NAME, tmp.name)
          put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
          if (Build.VERSION.SDK_INT >= 29) {
            put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Reader")
          }
        }
        val uri = contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
        if (uri != null) {
          contentResolver.openOutputStream(uri)?.use { out ->
            FileInputStream(tmp).use { it.copyTo(out) }
          }
          Toast.makeText(this, "已保存截图", Toast.LENGTH_SHORT).show()
        }
        tmp.delete()
      }, 500)
    } catch (e: Throwable) {
      Toast.makeText(this, "截图异常: ${e.message}", Toast.LENGTH_SHORT).show()
    }
  }

  private fun playNextSibling() {
    val url = cfg.url
    if (!url.startsWith("file://") && !url.startsWith("/")) {
      Toast.makeText(this, "仅本地支持下一集", Toast.LENGTH_SHORT).show()
      return
    }
    val path = if (url.startsWith("file://")) Uri.parse(url).path ?: url else url
    val file = File(path)
    val dir = file.parentFile ?: return
    val videos = dir.listFiles()?.filter {
      it.isFile && it.extension.lowercase() in listOf("mp4", "mkv", "avi", "webm", "ts", "m2ts")
    }?.sortedBy { it.name.lowercase() } ?: return
    val idx = videos.indexOfFirst { it.absolutePath == file.absolutePath }
    if (idx < 0 || idx >= videos.lastIndex) {
      Toast.makeText(this, "已是最后一集", Toast.LENGTH_SHORT).show()
      return
    }
    val next = videos[idx + 1]
    val i = Intent(this, VideoPlayerActivity::class.java)
    intent.extras?.let { i.putExtras(it) }
    i.putExtra(EXTRA_URL, next.absolutePath)
    i.putExtra(EXTRA_TITLE, next.nameWithoutExtension)
    startActivity(i)
    finish()
  }

  private fun triggerWyzieRequest() {
    // 经插件事件回 Web 壳：发广播/Intent extra 占位；Toast 提示用户在 Hub 选字幕
    Toast.makeText(this, "请在影视 Hub 用 Wyzie 选字幕后重开增强窗，或设置 preferredSubtitlePath", Toast.LENGTH_LONG).show()
    try {
      val pluginIntent = Intent("com.zkingz.reader.video.REQUEST_WYZIE")
      pluginIntent.putExtra("title", cfg.title)
      pluginIntent.putExtra("url", cfg.url)
      sendBroadcast(pluginIntent)
    } catch (_: Throwable) {
    }
  }

  private fun resolveStartSec(): Double {
    var start = cfg.startSec.coerceAtLeast(0.0)
    if (cfg.skipMode == "fixed" && cfg.openingSkipSec > 0) {
      start = maxOf(start, cfg.openingSkipSec)
    }
    val remembered = PlaybackProgressStore.load(this, cfg.url)
    if (remembered > start + 5) start = remembered
    return start
  }

  private fun startSyncLoop(host: ReaderMpvHost) {
    syncRunnable = object : Runnable {
      override fun run() {
        try {
          val pos = host.getPropDouble("time-pos")
          val dur = host.getPropDouble("duration")
          danmakuHost?.seekTo((pos * 1000).toLong())
          PlaybackProgressStore.save(this@VideoPlayerActivity, cfg.url, pos)
          applySkipLogic(host, pos, dur)
        } catch (_: Throwable) {
        }
        handler.postDelayed(this, 500)
      }
    }
    handler.post(syncRunnable!!)
  }

  private fun applySkipLogic(host: ReaderMpvHost, pos: Double, dur: Double) {
    if (cfg.skipMode == "chapter" && !openingApplied) {
      val chapters = host.listChapters()
      val intro = chapters.firstOrNull {
        val t = it.title.uppercase()
        t.contains("INTRO") || t.contains("OP") || t.contains("OPENING") ||
          t.contains("片头") || t.contains("RECAP")
      }
      if (intro != null && pos < intro.time + 1) {
        val next = chapters.getOrNull(intro.index + 1)
        if (next != null && next.time > intro.time) {
          host.seekAbsolute(next.time)
          openingApplied = true
          Toast.makeText(this, "已跳过片头章节", Toast.LENGTH_SHORT).show()
        }
      } else if (pos > 2) {
        openingApplied = true
      }
    }
    if (cfg.endingSkipSec > 0 && dur > 0 && !endingArmed) {
      if (pos >= dur - cfg.endingSkipSec) {
        endingArmed = true
        playNextSibling()
      }
    }
    if (cfg.skipMode == "chapter" && dur > 0) {
      val chapters = host.listChapters()
      val outro = chapters.firstOrNull {
        val t = it.title.uppercase()
        t.contains("OUTRO") || t.contains("ED") || t.contains("ENDING") ||
          t.contains("CREDITS") || t.contains("片尾")
      }
      if (outro != null && pos >= outro.time && !endingArmed) {
        endingArmed = true
        playNextSibling()
      }
    }
  }

  private fun syncDanmakuPause() {
    val paused = mpvHost?.getProp("pause") == "yes"
    if (paused) danmakuHost?.pause() else danmakuHost?.resume()
  }

  private fun startBgService() {
    val i = Intent(this, BackgroundPlaybackService::class.java)
    i.putExtra(BackgroundPlaybackService.EXTRA_TITLE, cfg.title)
    if (Build.VERSION.SDK_INT >= 26) startForegroundService(i) else startService(i)
  }

  private fun stopBgService() {
    stopService(Intent(this, BackgroundPlaybackService::class.java))
  }

  private fun showPreview(text: String) {
    previewTv?.text = text
    previewTv?.visibility = View.VISIBLE
  }

  private fun hidePreview() {
    previewTv?.visibility = View.GONE
  }

  private fun formatTime(sec: Double): String {
    val s = sec.toInt().coerceAtLeast(0)
    val m = s / 60
    val r = s % 60
    return "%d:%02d".format(m, r)
  }

  private fun buildTopBar(titleText: String, onBack: () -> Unit): LinearLayout {
    val bar = LinearLayout(this)
    bar.orientation = LinearLayout.HORIZONTAL
    bar.gravity = Gravity.CENTER_VERTICAL
    bar.setPadding(16, 16, 16, 16)
    bar.addView(Button(this).apply {
      text = "返回"
      setOnClickListener { onBack() }
    })
    bar.addView(TextView(this).apply {
      text = titleText
      layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
    })
    return bar
  }

  override fun onStop() {
    super.onStop()
    exo?.playWhenReady = false
    mpvHost?.let {
      PlaybackProgressStore.save(this, cfg.url, it.getPropDouble("time-pos"))
    }
  }

  override fun onDestroy() {
    syncRunnable?.let { handler.removeCallbacks(it) }
    stopBgService()
    exo?.release()
    exo = null
    danmakuHost?.release()
    danmakuHost = null
    mpvHost?.destroyHost()
    mpvHost = null
    super.onDestroy()
  }

  private fun statusLine(): String {
    val rife = if (frameInterpOn) "RIFE×${cfg.frameInterpFactor}" else "RIFE=off"
    return "Anime4K=$anime4kMode · $rife · ${cfg.danmakuMode}"
  }

  companion object {
    private const val TAG = "VideoPlayerActivity"
    const val EXTRA_ENGINE = "engine"
    const val EXTRA_URL = "url"
    const val EXTRA_TITLE = "title"
    const val EXTRA_A4K_MODE = "anime4kMode"
    const val EXTRA_A4K_QUALITY = "anime4kQuality"
    const val EXTRA_A4K_DEBLUR = "anime4kDeblur"
    const val EXTRA_SUB_FONT = "subFont"
    const val EXTRA_SUB_FONT_SIZE = "subFontSize"
    const val EXTRA_SUB_SCALE = "subScale"
    const val EXTRA_SUB_POS = "subPos"
    const val EXTRA_SUB_DELAY = "subDelay"
    const val EXTRA_SUB_COLOR = "subColor"
    const val EXTRA_HWDEC = "hwdec"
    const val EXTRA_VO = "videoOutput"
    const val EXTRA_PROFILE = "mpvProfile"
    const val EXTRA_VOLUME = "volume"
    const val EXTRA_VOLUME_MAX = "volumeMax"
    const val EXTRA_MUTED = "muted"
    const val EXTRA_LISTEN_ONLY = "listenOnly"
    const val EXTRA_START_SEC = "startSec"
    const val EXTRA_HEADERS = "httpHeaders"
    const val EXTRA_SUB_PATH = "preferredSubtitlePath"
    const val EXTRA_OPENING_SKIP = "openingSkipSec"
    const val EXTRA_ENDING_SKIP = "endingSkipSec"
    const val EXTRA_SKIP_MODE = "skipMode"
    const val EXTRA_HDR_TM = "hdrToneMapping"
    const val EXTRA_HDR_HINT = "hdrTargetColorspaceHint"
    const val EXTRA_EQ = "audioEqPreset"
    const val EXTRA_DANMAKU_PATH = "danmakuPath"
    const val EXTRA_DANMAKU_MODE = "danmakuMode"
    const val EXTRA_DANMAKU_ASS = "danmakuAssPath"
    const val EXTRA_FRAME_INTERP = "frameInterpEnabled"
    const val EXTRA_FRAME_FACTOR = "frameInterpFactor"
    const val EXTRA_FRAME_SOFT = "frameInterpLightweightFallback"

    fun readConfig(intent: Intent): PlayerLaunchConfig = PlayerLaunchConfig(
      engine = intent.getStringExtra(EXTRA_ENGINE) ?: "media3",
      url = intent.getStringExtra(EXTRA_URL) ?: "",
      title = intent.getStringExtra(EXTRA_TITLE) ?: "",
      anime4kMode = intent.getStringExtra(EXTRA_A4K_MODE) ?: "off",
      anime4kQuality = intent.getStringExtra(EXTRA_A4K_QUALITY) ?: "balanced",
      anime4kDeblur = intent.getBooleanExtra(EXTRA_A4K_DEBLUR, false),
      subFont = intent.getStringExtra(EXTRA_SUB_FONT) ?: "",
      subFontSize = intent.getDoubleExtra(EXTRA_SUB_FONT_SIZE, 0.0),
      subScale = intent.getDoubleExtra(EXTRA_SUB_SCALE, 1.0),
      subPos = intent.getDoubleExtra(EXTRA_SUB_POS, 100.0),
      subDelay = intent.getDoubleExtra(EXTRA_SUB_DELAY, 0.0),
      subColor = intent.getStringExtra(EXTRA_SUB_COLOR) ?: "",
      hwdec = intent.getStringExtra(EXTRA_HWDEC) ?: "mediacodec,mediacodec-copy,no",
      videoOutput = intent.getStringExtra(EXTRA_VO) ?: "gpu",
      mpvProfile = intent.getStringExtra(EXTRA_PROFILE) ?: "default",
      volume = intent.getDoubleExtra(EXTRA_VOLUME, 100.0),
      volumeMax = intent.getDoubleExtra(EXTRA_VOLUME_MAX, 300.0),
      muted = intent.getBooleanExtra(EXTRA_MUTED, false),
      listenOnly = intent.getBooleanExtra(EXTRA_LISTEN_ONLY, false),
      startSec = intent.getDoubleExtra(EXTRA_START_SEC, 0.0),
      httpHeaders = intent.getStringExtra(EXTRA_HEADERS) ?: "",
      preferredSubtitlePath = intent.getStringExtra(EXTRA_SUB_PATH) ?: "",
      openingSkipSec = intent.getDoubleExtra(EXTRA_OPENING_SKIP, 0.0),
      endingSkipSec = intent.getDoubleExtra(EXTRA_ENDING_SKIP, 0.0),
      skipMode = intent.getStringExtra(EXTRA_SKIP_MODE) ?: "fixed",
      hdrToneMapping = intent.getStringExtra(EXTRA_HDR_TM) ?: "mobius",
      hdrTargetColorspaceHint = intent.getBooleanExtra(EXTRA_HDR_HINT, true),
      audioEqPreset = intent.getStringExtra(EXTRA_EQ) ?: "off",
      danmakuPath = intent.getStringExtra(EXTRA_DANMAKU_PATH) ?: "",
      danmakuMode = intent.getStringExtra(EXTRA_DANMAKU_MODE) ?: "overlay",
      danmakuAssPath = intent.getStringExtra(EXTRA_DANMAKU_ASS) ?: "",
      frameInterpEnabled = intent.getBooleanExtra(EXTRA_FRAME_INTERP, false),
      frameInterpFactor = intent.getIntExtra(EXTRA_FRAME_FACTOR, 2).coerceIn(2, 4),
      frameInterpLightweightFallback = intent.getBooleanExtra(EXTRA_FRAME_SOFT, false),
    )

    fun open(activity: Activity, cfg: PlayerLaunchConfig) {
      val i = Intent(activity, VideoPlayerActivity::class.java)
      i.putExtra(EXTRA_ENGINE, cfg.engine)
      i.putExtra(EXTRA_URL, cfg.url)
      i.putExtra(EXTRA_TITLE, cfg.title)
      i.putExtra(EXTRA_A4K_MODE, cfg.anime4kMode)
      i.putExtra(EXTRA_A4K_QUALITY, cfg.anime4kQuality)
      i.putExtra(EXTRA_A4K_DEBLUR, cfg.anime4kDeblur)
      i.putExtra(EXTRA_SUB_FONT, cfg.subFont)
      i.putExtra(EXTRA_SUB_FONT_SIZE, cfg.subFontSize)
      i.putExtra(EXTRA_SUB_SCALE, cfg.subScale)
      i.putExtra(EXTRA_SUB_POS, cfg.subPos)
      i.putExtra(EXTRA_SUB_DELAY, cfg.subDelay)
      i.putExtra(EXTRA_SUB_COLOR, cfg.subColor)
      i.putExtra(EXTRA_HWDEC, cfg.hwdec)
      i.putExtra(EXTRA_VO, cfg.videoOutput)
      i.putExtra(EXTRA_PROFILE, cfg.mpvProfile)
      i.putExtra(EXTRA_VOLUME, cfg.volume)
      i.putExtra(EXTRA_VOLUME_MAX, cfg.volumeMax)
      i.putExtra(EXTRA_MUTED, cfg.muted)
      i.putExtra(EXTRA_LISTEN_ONLY, cfg.listenOnly)
      i.putExtra(EXTRA_START_SEC, cfg.startSec)
      i.putExtra(EXTRA_HEADERS, cfg.httpHeaders)
      i.putExtra(EXTRA_SUB_PATH, cfg.preferredSubtitlePath)
      i.putExtra(EXTRA_OPENING_SKIP, cfg.openingSkipSec)
      i.putExtra(EXTRA_ENDING_SKIP, cfg.endingSkipSec)
      i.putExtra(EXTRA_SKIP_MODE, cfg.skipMode)
      i.putExtra(EXTRA_HDR_TM, cfg.hdrToneMapping)
      i.putExtra(EXTRA_HDR_HINT, cfg.hdrTargetColorspaceHint)
      i.putExtra(EXTRA_EQ, cfg.audioEqPreset)
      i.putExtra(EXTRA_DANMAKU_PATH, cfg.danmakuPath)
      i.putExtra(EXTRA_DANMAKU_MODE, cfg.danmakuMode)
      i.putExtra(EXTRA_DANMAKU_ASS, cfg.danmakuAssPath)
      i.putExtra(EXTRA_FRAME_INTERP, cfg.frameInterpEnabled)
      i.putExtra(EXTRA_FRAME_FACTOR, cfg.frameInterpFactor)
      i.putExtra(EXTRA_FRAME_SOFT, cfg.frameInterpLightweightFallback)
      activity.startActivity(i)
    }
  }
}

@InvokeArg
class VideoOpenArgs {
  var engine: String = "media3"
  var url: String = ""
  var title: String = ""
  var anime4kMode: String = "off"
  var anime4kQuality: String = "balanced"
  var anime4kDeblur: Boolean = false
  var subFont: String = ""
  var subFontSize: Double = 0.0
  var subScale: Double = 1.0
  var subPos: Double = 100.0
  var subDelay: Double = 0.0
  var subColor: String = ""
  var hwdec: String = "mediacodec,mediacodec-copy,no"
  var videoOutput: String = "gpu"
  var mpvProfile: String = "default"
  var volume: Double = 100.0
  var volumeMax: Double = 300.0
  var muted: Boolean = false
  var listenOnly: Boolean = false
  var startSec: Double = 0.0
  var httpHeaders: String = ""
  var preferredSubtitlePath: String = ""
  var openingSkipSec: Double = 0.0
  var endingSkipSec: Double = 0.0
  var skipMode: String = "fixed"
  var hdrToneMapping: String = "mobius"
  var hdrTargetColorspaceHint: Boolean = true
  var audioEqPreset: String = "off"
  var danmakuPath: String = ""
  var danmakuMode: String = "overlay"
  var danmakuAssPath: String = ""
  var frameInterpEnabled: Boolean = false
  var frameInterpFactor: Double = 2.0
  var frameInterpLightweightFallback: Boolean = false
}

@TauriPlugin
class VideoPlayerPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun openPlayer(invoke: Invoke) {
    val args = invoke.parseArgs(VideoOpenArgs::class.java)
    if (args.url.isBlank()) {
      invoke.reject("url required")
      return
    }
    val eng = args.engine.lowercase()
    if (eng != "libmpv" && eng != "media3") {
      invoke.reject("engine must be libmpv or media3")
      return
    }
    if (eng == "libmpv") {
      val st = LibmpvAvailability.probe()
      if (!st.available) {
        invoke.reject(st.detail)
        return
      }
    }
    activity.runOnUiThread {
      VideoPlayerActivity.open(
        activity,
        PlayerLaunchConfig(
          engine = eng,
          url = args.url,
          title = args.title,
          anime4kMode = args.anime4kMode,
          anime4kQuality = args.anime4kQuality,
          anime4kDeblur = args.anime4kDeblur,
          subFont = args.subFont,
          subFontSize = args.subFontSize,
          subScale = args.subScale,
          subPos = args.subPos,
          subDelay = args.subDelay,
          subColor = args.subColor,
          hwdec = args.hwdec,
          videoOutput = args.videoOutput,
          mpvProfile = args.mpvProfile,
          volume = args.volume,
          volumeMax = args.volumeMax,
          muted = args.muted,
          listenOnly = args.listenOnly,
          startSec = args.startSec,
          httpHeaders = args.httpHeaders,
          preferredSubtitlePath = args.preferredSubtitlePath,
          openingSkipSec = args.openingSkipSec,
          endingSkipSec = args.endingSkipSec,
          skipMode = args.skipMode,
          hdrToneMapping = args.hdrToneMapping,
          hdrTargetColorspaceHint = args.hdrTargetColorspaceHint,
          audioEqPreset = args.audioEqPreset,
          danmakuPath = args.danmakuPath,
          danmakuMode = args.danmakuMode,
          danmakuAssPath = args.danmakuAssPath,
          frameInterpEnabled = args.frameInterpEnabled,
          frameInterpFactor = args.frameInterpFactor.toInt().coerceIn(2, 4),
          frameInterpLightweightFallback = args.frameInterpLightweightFallback,
        ),
      )
      val res = JSObject()
      res.put("ok", true)
      invoke.resolve(res)
    }
  }

  @Command
  fun probeLibmpv(invoke: Invoke) {
    val st = LibmpvAvailability.probe()
    val res = JSObject()
    res.put("available", st.available)
    res.put("detail", st.detail)
    invoke.resolve(res)
  }

  @Command
  fun probeRife(invoke: Invoke) {
    val st = RifeAvailability.probe(activity)
    val res = JSObject()
    res.put("available", st.available)
    res.put("detail", st.detail)
    res.put("backend", if (st.available) "ncnn" else null)
    res.put("modelsDir", st.modelsDir)
    invoke.resolve(res)
  }

  @Command
  fun applySubtitlePath(invoke: Invoke) {
    val args = invoke.parseArgs(VideoOpenArgs::class.java)
    val res = JSObject()
    res.put("ok", args.preferredSubtitlePath.isNotBlank())
    res.put("path", args.preferredSubtitlePath)
    invoke.resolve(res)
  }

  @Command
  fun scanMediaStore(invoke: Invoke) {
    activity.runOnUiThread {
      try {
        val items = MediaStoreVideoScanner.scan(activity)
        val arr = app.tauri.plugin.JSArray()
        for (it in items) {
          val o = JSObject()
          o.put("path", it.path)
          o.put("name", it.name)
          o.put("size", it.size)
          o.put("dateAdded", it.dateAdded)
          arr.put(o)
        }
        val res = JSObject()
        res.put("items", arr)
        res.put("count", items.size)
        invoke.resolve(res)
      } catch (e: Throwable) {
        invoke.reject(e.message ?: "scan failed")
      }
    }
  }
}
