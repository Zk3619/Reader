# 影视缩略图与缓存实现思路

## 0. 边播边缓存（cache-while-playing）

影视资源大，不像音乐可整包缓存后再播。采用**旁路缓存**：播放照旧走原 Artplayer URL，
另开后台任务落盘，二者互不阻塞。

| 源类型 | 播放 | 后台缓存 | seek 缩略图源 |
|--------|------|----------|----------------|
| 直链 MP4（经 proxy） | proxy URL（Range/ACAO） | `fetch().body` 流式写 `video.bin` | 起播即用 proxy URL；完成后切本地 `video.bin` |
| VOD m3u8（有 `#EXT-X-ENDLIST`） | proxy m3u8 | 下全部分片 → `hls/seg_*.ts` + 本地 `index.m3u8` | 完成前不供图；完成后本地文件（`.m3u8` 暂不 seek 抽帧） |
| 直播 m3u8（无 ENDLIST） | proxy m3u8 | 跳过（仅 meta） | — |
| 本地库文件 | asset 直达 | 不复制，仅记索引 | 本地路径 |

- 入口：`startVideoProgressiveCache()`（`video-progressive-cache.ts`），`TvPlayPane` 起播后调用。
- 中止：`tearDownPlayer` → `handle.abort()`（`AbortController`），换集/离开即停，不留孤儿下载。
- 完成写 `meta.hasMedia=true` + DB，并触发 `evictAutoVideoCachesIfNeeded`（auto 超 2GB LRU 淘汰）。
- 流式写盘用 `@tauri-apps/plugin-fs` 的 `open({write,create,truncate})`（已在 capabilities 加 `fs:allow-open`），不把整片读进内存。

### 音乐模块（已是边播边缓存，本轮小改）

- **proxy 可播路径**：直接播 proxy URL + `backgroundCacheMfMediaWithHeaders` 后台整曲落盘 → 天然边播边缓存。
  本轮加：后台任务先查磁盘缓存命中则跳过，避免重复下载。
- **WebAudio 路径**：跨域无 ACAO 时 `MediaElementSource` 会输出静音，必须整曲物化成同源 blob 才能出声；
  该 blob 的 buffer 同时写入 auto 缓存（单次下载既播放又落盘），无法真正流式边播——属协议约束，不改。

## 1. 已落地（本轮）

### 剧集磁盘缓存 + DB

| 项 | 说明 |
|----|------|
| 路径 | `{Media/Video}/video-cache/episodes/{id}/video.bin` + `meta.json` |
| 表 | `video_episode_cache`（迁移 v123） |
| 分级 | `auto`（播放写入，可淘汰）/ `manual`（用户保留） |
| HLS | VOD（有 ENDLIST）边播边下分片；直播仅 meta |
| UI | 设置 →「影视缓存」：占用预览、导出清单、清 auto / 全部、修索引、清缩略图 |

兼容旧扁平目录 `video-episode-cache/`：首次访问时迁移进新布局。

### 本地 SpriteStore

| 项 | 说明 |
|----|------|
| 路径 | `{Media/Video}/seek-thumbs/{fingerprint}/sprite_n.jpg` + `index.json` |
| 间隔 | 默认 10s 一帧，10×10 雪碧图 |
| 接线 | `getLocalSeekThumbnailDetailed` → 先读盘 → canvas/mpv 抽帧 → 异步落盘 |
| UI | `LocalSeekThumbOverlay` 支持 `background-position` 裁格 |

本地文件（`playLocalPath`）与**本机 proxy 直链 MP4**（`127.0.0.1`，非 m3u8）皆走此路径：
`isLocalSeekThumbSource` = `isLocalPath || isProxySeekThumbSource`。proxy URL 端口/签名会变，
落盘键传稳定的上游 `mediaUrl`（`spriteKey`），保证跨会话命中同一雪碧图目录。

---

## 2. 缩略图分层（推荐产品策略）

```
① 片源提供 thumbnail_vtt / preview_vtt
   → artplayer-plugin-vtt-thumbnail（零解码，体验最佳）

② 本地文件 / 已缓存的直链落盘文件
   → SpriteStore（WebView 硬解 + 雪碧图落盘）

③ 经 tv_proxy 的可 Range 直链 MP4（已落地，内置）
   → 展示：proxy / 本地 do=file（Range+ACAO）→ <video crossOrigin> seek 抽帧
   → 起播 warmup；悬停防抖 16ms；SpriteStore 与实时抽帧并行
   → video.bin 完成后切 do=file，并后台按间隔灌 SpriteStore（不整包进内存）
   → 缓存键 v2：优先剧集 URL；mediaUrl 去签名，扫盘复用旧目录避免重复缓存

④ 普通 HLS 点播
   → 有 ENDLIST：边播边下分片，完成后转本地文件（.m3u8 暂不 seek 抽帧）
   → 无 ENDLIST（直播）：无完整进度缩略图
   → v2 可选：Rust/ffmpeg 按秒抽帧（带 headers）+ LRU
   → 不做纯 WebCodecs/web-demuxer 喂 m3u8
```

B 站式体验来自 **服务端预生成雪碧图**，不是播放器实时抽全片。书源无 VTT 时，客户端只能「弱实时 + 本地缓存逐步变强」。

---

## 3. 后续可做

1. **起播命中缓存**：`getCachedVideoEpisodeByKeys` → `convertFileSrc(localPath)` 优先于网络（已有写路径，读路径未接播放）。  
2. **「缓存本集」按钮**：`cacheVideoEpisode(..., { tier: 'manual' })`。  
3. ~~**代理流 SpriteStore**~~：已落地（§0 / §2③）。  
4. **HLS 缩略图**：本地 index.m3u8 完成后用 mpv/`video_extract_thumbnail`，或 Rust 按秒抽帧。  
5. **容量设置**：UI 可调 `MAX_VIDEO_AUTO_CACHE_BYTES`（当前 2GB）。

---

## 4. 与音乐/阅读的对齐

| | 音乐 | 阅读 | 影视（现） |
|--|------|------|------------|
| 媒体落盘 | ✅ 边播边缓存（proxy 路径） | ✅ 章节/图 | ✅ 直链流式 + VOD HLS 分片 |
| DB 索引 | ✅ | ✅ | ✅ v123 |
| 设置占用/导出/清理 | ✅ | ✅ | ✅ |
| 离线完整回放 HLS | — | — | ✅（有 ENDLIST 时） |
