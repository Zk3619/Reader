# Reader 音乐模块 × NeriPlayer 对齐报告

> 基线：`NeriPlayer-master`（Compose + Media3，Android 9+，GPL-3.0）  
> Reader：Hub 嵌入（LX 五源 + UserApi + MusicFree）；Tauri / Web / Android  
> 定案日期：2026-07-23  
> 工作流：本文档与代码同步更新

配套对照画布：`reader-vs-neriplayer-music.canvas.tsx`  
LX 对齐见 [`music-module-lx-alignment.md`](./music-module-lx-alignment.md)

---

## 1. 结论摘要

NeriPlayer 是 **Android 原生深度一体机**（网易云 / B 站 / YTM 硬编码 + USB / 悬浮词幕 / 一起听）。  
Reader 是 **可扩展嵌入式 Hub**。对齐重点是**产品规则与状态机**，不移植 Kotlin/Media3/USB。

| 决策 | 内容 |
|------|------|
| 音视频站内容 | 留给后续 **yt-dlp + 影视模块**；音乐不扩 B 站转音频 / YTM PoToken |
| 账号 | **跨模块平台凭证壳**（Cookie/Headers）；不做红心同步 |
| 元数据 | LRCLIB / QQ **互补外挂**；与 findMusic / link-lyric **无冲突** |
| 发现 | **LX 歌手/专辑独立列表页** 优先于本地歌手聚合 |
| 厂商词幕 | **延后** |

---

## 2. 能力关系（换源 vs 补全 vs yt-dlp）

```text
播放 URL：源站取链 → 降质 → findMusic 打分换源
歌词：link-lyric → 源站 → LRCLIB → QQ 仅补 → findMusic 他源
封面：源站 / QQ 仅补 → findMusic
凭证：平台 Cookie 壳 ──预留──► yt-dlp cookies/headers（影视/后续）
```

---

## 3. 十五项对照与落地状态

| # | 能力 | 决策 | 状态 | 入口 / 验收 |
|---|------|------|------|-------------|
| 1 | 账号 Cookie 壳 | 跨模块凭证；不做红心 | ✅ | `src/lib/media/auth/`：`getPlatformCredential` / `toRequestHeaders` / `toYtDlpCookiesFile`；账号面板走 `setPlatformCredential` |
| 2 | B站/YTM 内容 | 延后 yt-dlp | ⏸ | — |
| 3 | 跨源打分 | 增强 findMusic | ✅ | `find-music.ts` + 设置「跨源匹配多级打分排序」`findMusicScoredMatch` |
| 4 | LRCLIB / QQ 元数据 | 互补外挂 | ✅ | `online/meta-enrich/`；`lyric-resolver` / `resolveOnlinePic` 接入 |
| 5 | 本地扫描后台补全 | 快入库→后台补 | ✅ | `library/local-sidecar-enrich.ts`；扫描后 `scheduleLocalSidecarEnrich` |
| 6 | 歌手/专辑列表页 | LX 发现列表 | ✅ | Hub `artist`/`album`；**仅 wy/kg** 正式发现列表（对齐歌单页源切换） |
| 7 | crossfade 微调 | 缓动+默认时长 | ✅ | `engine/music-crossfade.ts` easeInOutCubic；默认 `crossfadeMs=1200` |
| 8 | 蜂窝强制低音质 | 与拦截正交 | ✅ | 播放设置「移动网络」仅 `isMobile()\|\|isAndroid()` 显示 |
| 9 | 流缓存 LRU | 上限+只清可再生 | ✅ | `MAX_MUSIC_AUTO_CACHE_BYTES` + `evictAutoMusicTrackCachesIfNeeded`；`clearAutoMusicTrackCaches` |
| 10 | 悬浮歌词细节 | 前台自动隐藏等 | ✅ | `android-desktop-lyric.ts`：前台 hide、后台 show |
| 11 | 厂商/SuperLyric | 延后 | ⏸ | — |
| 12–13 | 下载续传 | Range/半成品 | ✅ | `audio-download.ts`：Range / pause / resume / delete 清 `.part` |
| 14 | 同步三路合并 | merge+debounce | ✅ | `sync/remote-snapshot.ts`：base+local+remote；`scheduleDebouncedLibrarySync` |
| 15 | 迷你窗横滑 | 切歌手势 | ✅ | `MusicMiniPlayerPage` 标题区横滑 prev/next |

图例：✅ 已落地 · 🔄 本轮实现中 · ⏸ 延后 · ○ 规格

---

## 4. Backlog

### P0（本轮）— 已完成

1. 平台凭证壳 + yt-dlp 导出预留  
2. findMusic 多级打分排序  
3. LRCLIB + QQ 元数据补全  
4. 蜂窝强制低音质  
5. crossfade 曲线/默认时长微调  

### P1（本轮）— 已完成

6. LX 歌手/专辑独立列表页  
7. 本地扫描后台补全  
8. 缓存 LRU / 只清可再生  
9. 下载断点续传（既有能力核对保留）  
10. GitHub/WebDAV 三路合并 + debounce  
11. 悬浮歌词细节 + 迷你窗横滑  

### 延后

厂商状态栏 / SuperLyric、B 站转音频、YTM PoToken、USB DAC、AGSL、yt-dlp 内容层、网易云红心。

---

## 5. 许可证

NeriPlayer 为 GPL-3.0。本仓库仅参考协议与 UX 规则，**自行重写**实现，不复制其源码。

---

## 6. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-23 | 定案 15 项；落地 P0/P1 并回写状态与入口路径 |
