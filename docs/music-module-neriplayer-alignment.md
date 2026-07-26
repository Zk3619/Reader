# Reader 音乐模块 × NeriPlayer 对齐报告

> 基线：`NeriPlayer-master`（Compose + Media3，Android 9+，GPL-3.0）  
> Reader：Hub 嵌入（LX 五源 + 平台源 + UserApi + MusicFree）；Tauri / Web / Android  
> 定案日期：2026-07-23 · **平台源完整接入：2026-07-25**  
> 工作流：本文档与代码同步更新

配套对照画布：`reader-vs-neriplayer-music.canvas.tsx`  
LX 对齐见 [`music-module-lx-alignment.md`](./music-module-lx-alignment.md)

---

## 1. 结论摘要

NeriPlayer 是 **Android 原生深度一体机**（网易云 / B 站 / YTM 硬编码 + USB / 悬浮词幕 / 一起听）。  
Reader 是 **可扩展嵌入式 Hub**。对齐重点是**产品规则与状态机**，不移植 Kotlin/Media3/USB；协议面**自行重写**。

| 决策 | 内容 |
|------|------|
| 平台源 | **`netease` / `bili` / `ytm` 一等源**：搜 / 播 / 词 + Hub 源列表，与 LX 五源、MF 辅源并列 |
| 与 `wy` | **并存**：`wy` = LX 五源数据面（生产不取流）；`netease` = 账号平台源（可搜可播） |
| YTM 取流 | 前端自研 InnerTube（WEB_REMIX）+ QuickJS 解签；**不做** NewPipe / poToken WebView |
| 账号 | 跨模块平台凭证壳（Cookie/Headers）；网易云扫码为主 + WebView/Cookie 兜底；不做红心同步 |
| 元数据 | LRCLIB / QQ **互补外挂**；与 findMusic / link-lyric **无冲突** |

---

## 2. 能力关系（换源 vs 补全 vs 平台直连）

```text
播放 URL：
  平台曲(netease|bili|ytm) → platform stream（Header / RequestForwarder）
    └─ 试听(freeTrialInfo)：降音质重试 → 跨源 UserApi → MF → B站 → 末位试听提示
  MF 曲 → getMediaSource
  LX 五源曲 → UserApi musicUrl → findMusic 换源
歌词：link-lyric → 源站/平台 → LRCLIB → QQ 仅补 → findMusic 他源
凭证：平台 Cookie 壳 ──兼用──► 平台 API /（预留）yt-dlp cookies
```

---

## 3. 十五项对照与落地状态

| # | 能力 | 决策 | 状态 | 入口 / 验收 |
|---|------|------|------|-------------|
| 1 | 账号 Cookie 壳 | 跨模块凭证；网易/B站扫码 + WebView/Cookie；不做红心 | ✅ | `platform/auth/`；`netease-qr-login` / `bili-qr-login`；`checkAuthHealth` 认 MUSIC_U / SESSDATA / SAPISID |
| 2 | 平台源内容 | 一等源完整接入 | ✅ | `platform/api/{netease,bili,ytm}`；`PLATFORM_SOURCES`；`resolveTrackPlaybackUrls` 平台分支 |
| 3 | 跨源打分 | 增强 findMusic | ✅ | `find-music.ts` + `findMusicScoredMatch` |
| 4 | LRCLIB / QQ 元数据 | 互补外挂 | ✅ | `online/meta-enrich/` |
| 5 | 本地扫描后台补全 | 快入库→后台补 | ✅ | `library/local-sidecar-enrich.ts` |
| 6 | 歌手/专辑列表页 | LX 发现列表 | ✅ | Hub `artist`/`album`；**仅 wy/kg** |
| 7 | crossfade 微调 | 缓动+默认时长 | ✅ | `engine/music-crossfade.ts` |
| 8 | 蜂窝强制低音质 | 与拦截正交 | ✅ | 播放设置「移动网络」 |
| 9 | 流缓存 LRU | 上限+只清可再生 | ✅ | `MAX_MUSIC_AUTO_CACHE_BYTES` |
| 10 | 悬浮歌词细节 | 前台自动隐藏等 | ✅ | `android-desktop-lyric.ts` |
| 11 | 厂商/SuperLyric | 延后 | ⏸ | — |
| 12–13 | 下载续传 | Range/半成品 | ✅ | `audio-download.ts` |
| 14 | 同步三路合并 | merge+debounce | ✅ | `sync/remote-snapshot.ts` |
| 15 | 迷你窗横滑 | 切歌手势 | ✅ | `MusicMiniPlayerPage` |

图例：✅ 已落地 · 🔄 本轮实现中 · ⏸ 延后 · ○ 规格

---

## 4. 平台源验收清单

| 源 | 搜索 | 取流 | 歌词 | Hub 浏览 |
|----|------|------|------|----------|
| `netease` | cloudsearch / weapi | 音质降级链；`freeTrialInfo` 试听识别 + 跨源兜底 | yrc + 译/罗 | 推荐/我的/精品歌单（无「全部」）；推荐页：热力飙升→热搜、私人雷达→推荐歌曲、为你推荐→推荐歌单 |
| `bili` | WBI search | WBI playurl + DASH 选轨 | LRCLIB / findMusic | **不进**歌单/推荐下拉（无公开发现流；收藏夹走账号「我的列表」） |
| `ytm` | InnerTube search | player + QuickJS 解签 | InnerTube / LRCLIB | Home 推荐 + 曲库歌单；推荐页仅歌单区 |

**已知限制（YTM）**：无 poToken / NewPipe；极限风控场景可能需重新登录 Cookie。

---

## 5. Backlog

### 已完成（含平台源）

平台凭证壳、findMusic 打分、LRCLIB/QQ、蜂窝低音质、crossfade、歌手专辑页、本地补全、缓存 LRU、下载续传、同步合并、悬浮词/迷你窗、**三平台一等源**。

### 延后

厂商状态栏 / SuperLyric、USB DAC、AGSL、YTM poToken、网易云红心。

---

## 6. 许可证

NeriPlayer 为 GPL-3.0。本仓库仅参考协议与 UX 规则，**自行重写**实现，不复制其源码。

---

## 7. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-23 | 定案 15 项；落地 P0/P1 并回写状态与入口路径 |
| 2026-07-25 | 推翻「B站/YTM 内容延后」；`netease`/`bili`/`ytm` 升为一等平台源 |
| 2026-07-25 | 网易云扫码登录（对齐 NeriPlayer）；WebView 强制 panel / 文档代理，避免 XFO |
| 2026-07-26 | 网易云试听识别（`freeTrialInfo`）；跨源顺序 UserApi → MF → B站；试听不缓存、末位提示 |
| 2026-07-26 | 补回 B 站扫码登录入口（对齐 NeriPlayer `BiliQrLoginClient`） |
| 2026-07-26 | 对齐 Neri Home：修 `personalized/playlist` 读 `result`；YTM `FEmusic_home`；推荐页纳入三平台源；歌单页标签分流 |
| 2026-07-26 | 推荐页统一四区；bili 移出推荐/歌单下拉；网易推荐/精品 weapi→明文回退；平台标签隐藏「全部」 |
| 2026-07-26 | LX 歌单分类：酷我 digests 优先 getTagPlayList + mobile 单页兜底；网易 406 退避；咪咕解析 contentItemList；空分类降权隐藏 |
