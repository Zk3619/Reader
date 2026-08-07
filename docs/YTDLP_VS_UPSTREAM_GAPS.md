# Reader yt-dlp 移植 vs 上游能力差异

对照路径：

- Reader：`src/lib/download/ytdlp`
- 上游：`Download/yt-dlp-master`

基准文档日期：2026-08-05  
状态刷新：2026-08-07（**P0–P4 已落地**）  
侧重架构与能力面，非逐站冒烟。

交互版：[reader-ytdlp-vs-upstream-gaps.canvas.tsx](file:///C:/Users/ZKingZ/.cursor/projects/d-Projects/canvases/reader-ytdlp-vs-upstream-gaps.canvas.tsx)

---

## 当前判断

HAND 注册 100% 仍 ≠ 行为对等，但 P0–P4 已补齐：

- P0–P3：编排 / cookie / fragments / WS / 裁剪 / Tab 等
- **P4**：`process_ie_result`、侧车落盘、Utils/Generic 加深、B 站 dolby·弹幕·ugc·元数据接线、整下载模块重命名/ZIP/BT/分卷/HTTP 续传子集

下一阶段：桌面金样 URL 冒烟复验与长尾 hand 行为。

| 指标 | 估值 |
|------|------|
| YoutubeDL 编排 | ~55% |
| IE common / 后处理 | ~70% |
| 协议 / 下载器 | ~78% |
| Utils 面 | ~45% |
| IE className 注册 | **100%** |
| 计划项 | **P0–P4 完成** |

---

## 各层完整度（粗估 · 刷新后）

| 层 | 约完整度 | 备注 |
|----|----------|------|
| YoutubeDL 编排 | 55% | process_ie_result · ignoreerrors · age_limit · 侧车 |
| IE common 方法 | 60% | JW / Akamai / Wowza / chapters 已补 |
| 协议 / 下载器 | 78% | SOCKS · FD · WS · continuedl · HTTP 续传子集 |
| 后处理行为 | 70% | SB · 裁剪 · Fixup · Embed · infojson · write* 侧车 |
| Utils 面 | 45% | js_to_json · get_first · jsinterp · webvtt |
| IE 注册覆盖 | 100% | className 100%；Generic RSS/XSPF |

---

## 架构对照

| 层 | Reader | 上游 yt-dlp | 差距 |
|----|--------|-------------|------|
| 产品路径 | `extract_info(false)` → engine-bridge 落盘 | YoutubeDL 内建 FileDownloader 全家桶 | 外置代理 |
| 提取器注册 | HAND_OVERRIDES ~2034；generated 被跳过 | `_extractors.py` ~1751 IE | 对齐 |
| 提取深度 | 主路径可用；中位 hand ~81 LOC | 全量站点逻辑 + 长尾细节 | 部分 |
| 下载编排 | Gopeed + ffmpeg + hls/f4m-native + External/专用 FD + WS | 17 个 FD 模块 | 部分 |
| JS 运行时 | YouTube ejs/sig + 通用 jsinterp 子集 | jsinterp.py + jsc 生态 | 部分 |
| CLI / 插件 / 自更新 | 无（随 App 发版） | options / plugins / update | 缺失（产品不需要） |

### 数据流（Reader）

1. `DownloadService.probe`
2. `YoutubeDL.extract_info(url, false)`
3. 格式选择 / archive / match_filter / `prepare_filename`
4. `startYtdlpEngineTask`（engine-bridge）
5. Gopeed · ffmpeg · hls/f4m-native · ExternalFD · special-protocols · **websocket_frag**

> `download=true` 仅 `processing`；不伪造成功（除非 `allow_stub_download`）。

### 数据流（上游）

1. `YoutubeDL.extract_info`
2. `process_ie_result` / `process_video_result`
3. FileDownloader 按 protocol 选 FD
4. Http / HLS / DASH / F4M / RTMP / WS / External…
5. PostProcessor 链（Fixup / Embed / Chapters…）

编排、落盘、后处理均在同一 YoutubeDL 进程内。

---

## 下载器映射（刷新）

| 上游 FD | Reader | 说明 |
|---------|--------|------|
| HttpFD | 外置代理 | Gopeed `createEngineDownload` |
| HlsFD | 部分 | hls-native AES-128 → ffmpeg HLS；分片重试/并发 |
| DashSegmentsFD | 外置代理 | ffmpeg DASH / fragments concat |
| F4mFD | 部分 | f4m-native mdat + fragment |
| IsmFD | 部分 | IE 可抽；无完整 ISM FD |
| RtmpFD / rtmp_ffmpeg | 部分 | 默认拒绝；`allowRtmpFfmpeg` / `allow_rtmp_ffmpeg` → ffmpeg |
| rtmpe / rtmpt | 缺失 | protocol-policy 明确拒绝（不做） |
| WebSocketFragmentFD | **部分** | `media_convert_fetch_websocket_frag` → ffmpeg stdin |
| ExternalFD (aria2c/curl/wget) | 部分 | `meta.external_downloader` → `run_shell_pp` |
| NiconicoLive / FC2Live / BunnyCdn / Mhtml | 部分 | special-protocols + engine-bridge 尽力路径 |
| YoutubeLiveChat | 缺失 | 专用 FD 未移植；明确 fail-fast |

---

## 后处理（刷新）

| 上游 PP | Reader | 说明 |
|---------|--------|------|
| FFmpegMerger | 部分 | 真实合并多在 engine-bridge |
| ExtractAudio / EmbedSubtitle / Metadata | 部分 | remux → Tauri |
| SponsorBlock | 部分 | 真 API → chapters；**物理裁剪**经 concat demuxer（无 force_keyframes） |
| XAttr / MoveFiles / Exec | 部分 | 有模块，桌面受限 |
| EmbedThumbnail | 部分 | EmbedThumbnailPP 已接线 |
| FFmpegFixupM3u8 / M4a | 部分 | Fixup PP 已实现 |
| Split Chapters / Concat / WriteInfoJson | 部分 | 元数据/infojson 真写；**split 物理切分**已接线 |
| MetadataParser / VideoConvertor | 缺失 | 长尾 PP（未做） |

---

## 高价值站点深度

**HAND 100% 含义：** 每个上游 IE 类名有手写 TS 并注册，generated 通用刮取壳不参与匹配。不是 `_real_extract` 行级对等；中位 hand 文件约 81 LOC。

| 站点 | 深度 | 说明 |
|------|------|------|
| YouTube 单视频 | 部分 | nsig/ejs + po_token + age-gate 多 client 重试；SABR 警告 |
| YouTube Tab / Playlist | 部分 | playlist + 频道 videos/shorts/streams；**裸频道展开三 tab**；continuation / lockup 加深 |
| Bilibili | 部分→加深 | WBI/多 P；**ytdlp dolby/flac**；seg.so 弹幕入口；ugc_season；enqueue embedMetadata（无密码短信登录） |
| TikTok / Douyin 单条 | 部分 | 网页/aweme 有；app 签名/深度列表弱 |
| Twitch VOD/Stream | 部分 | GQL + usher HLS 主路径 |
| Twitter/X 公开 | 部分 | syndication + TweetResultByRestId GraphQL 回退 |
| Instagram | 部分 | 强依赖 session cookie |
| Vimeo / Soundcloud | 部分 | 中等深度移植 |
| GenericIE | 部分 | JWPlayer / twitter:player / mpd·f4m·smil 发现已扩；仍短于上游 |
| Netflix | 缺失 | 双方皆无 |

---

## P0–P3 已交付

| 领域 | 要点 | 波次 |
|------|------|------|
| 落盘编排 | outtmpl / `prepare_filename`；`download=true` 不再伪造成功 | P0 |
| Cookie / Geo | cookie-jar；geo bypass XFF / `geo_verification_proxy` | P0 |
| jsinterp | 通用 JS 子集（named-fn / evaluate） | P0 |
| RTMP 策略 | 默认 fail-fast；opt-in `allow_rtmp_ffmpeg` | P0 |
| IE common | JWPlayer / Akamai / Wowza / chapters helpers | P1 |
| Fragments | 重试（默认 2）+ 并发上限 16 | P1 |
| PP / filter | EmbedThumbnail、FixupM3u8/M4a、`match_filter` `*=` `!=` `=` | P1 |
| YouTube / Twitter | age-gate 客户端重试；GraphQL TweetResultByRestId | P1 |
| Networking | SOCKS 归一 + reqwest socks；JA3 lite/enhanced 统一 | P1-5 |
| 专用 / 外部 FD | mhtml·bunnycdn·niconico/fc2 live；aria2c/curl/wget | P2 |
| SponsorBlock / Chapters | 真 API chapters；Split/Concat/WriteInfoJson；webvtt/cache | P2 |
| GenericIE | JW / twitter:player / mpd·f4m·smil 发现与 expand | P2 |
| websocket_frag | WS → ffmpeg stdin（TwitCasting llfmp4 等） | P3 |
| continuedl | `{out}.ytdl/frag-NNNNN.part` 文件级 resume | P3 |
| 物理裁剪 | `media_convert_cut_by_ranges` concat demuxer | P3 |
| YoutubeTab 加深 | 裸频道多 tab · lockup · continuation · entries 字段 | P3 |
| 金样回归 | live-smoke P0 站族 + `ytdlp-p3-surface` 离线 | P3 |

### 编排已接线（节选）

`outtmpl` / `prepare_filename` · cookie jar · `geo_bypass` · proxy/SOCKS · `concurrent_fragment` · `match_filter` 字符串/数值 · `writeinfojson` · `external_downloader` · `allow_rtmp_ffmpeg` · impersonate/JA3 · `extractor_args` · `download_archive` · **`continuedl`** · **`websocket_frag`**

---

## 远期 / 仍缺

| 项 | 说明 |
|----|------|
| `rtmpe` / `rtmpt` | 明确不支持（产品不做） |
| force_keyframes 重编码裁剪 | 当前 `-c copy`；切点可能非关键帧 |
| YouTube Tab 全量上游对等 | playlists/posts/Music/Invidious 等长尾未做 |
| CLI / 插件 / 自更新 | 产品形态不需要 |
| 长尾 hand 行为回归 | 不以 HAND 100% 代替样例冒烟 |
| youtube_live_chat FD | 明确 fail-fast |

---

## 补齐计划状态

| ID | 内容 | 状态 |
|----|------|------|
| p0-1 | 落盘编排：outtmpl→`_filename`；禁止假 finished | completed |
| p0-2 | Cookie jar + Geo bypass | completed |
| p0-3 | 通用 jsinterp 子集 | completed |
| p0-4 | `rtmp_ffmpeg` opt-in / websocket 产品取舍 | completed |
| p1-1 | IE common：jwplayer / akamai / wowza / chapters | completed |
| p1-2 | fragment 重试 / `concurrent_fragment_downloads` | completed |
| p1-3 | EmbedThumbnail + Fixup* + `match_filter` | completed |
| p1-4 | YouTube age-gate；Twitter GraphQL 主路径 | completed |
| p1-5 | SOCKS + JA3 lite/enhanced 统一 | completed |
| p2-1 | 专用 FD 子集（Niconico/FC2/Bunny/Mhtml） | completed |
| p2-2 | ExternalFD、SponsorBlock、Chapters/Concat、webvtt/cache/infojson | completed |
| p2-3 | GenericIE 扩容 | completed |
| p3-1 | websocket_frag FD | completed |
| p3-2 | fragment continuedl | completed |
| p3-3 | SponsorBlock / chapters 物理裁剪 | completed |
| p3-4 | YoutubeTab 加深 | completed |
| p3-5 | 金样 smoke + P3 surface | completed |
| p4-a1 | process_ie_result url/url_transparent | completed |
| p4-a2 | writesubtitles / thumbnail / description | completed |
| p4-a3 | js_to_json / get_first / Generic RSS·XSPF | completed |
| p4-a4 | ignoreerrors + age_limit | completed |
| p4-b | Bili dolby/flac · seg · ugc · addMetadata | completed |
| p4-c | 整模块重命名/ZIP GBK/BT 做种/分卷/HTTP 续传 | completed |

---

## 验收口径建议

1. 不以 SITE_FAMILIES「手写精品」计数当质量门；按站族样例 URL extract + 落盘冒烟。
2. 保留 `gen-ie-method-surface` / `scan-hand-gaps`；用 PROTOCOL_POLICY 与 FD/PP 矩阵验收。
3. YouTube / Bilibili / TikTok / Twitch 为 P0 行为回归金样；长尾 hand：best-effort + 明确错误。
4. 参考文档：
   - [YTDLP_PROTOCOL_POLICY.md](./YTDLP_PROTOCOL_POLICY.md)
   - [YTDLP_IE_METHOD_SURFACE.md](./YTDLP_IE_METHOD_SURFACE.md)
   - [YTDLP_HAND_REGRESSION_GAPS.md](./YTDLP_HAND_REGRESSION_GAPS.md)
   - [YTDLP_LIVE_SMOKE_RESULTS.md](./YTDLP_LIVE_SMOKE_RESULTS.md)
   - 本文 `YTDLP_VS_UPSTREAM_GAPS.md`
