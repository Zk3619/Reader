# 下载模块

MediaBox（Reader）独立壳模块，入口位于侧栏 **订阅** 与 **设置** 之间。

## 架构原则

**进程内移植 Gopeed / yt-dlp 能力**，不通过调用外部 `yt-dlp` / `aria2c` 等二进制冒充完整引擎。

| 层 | 路径 | 职责 |
|----|------|------|
| UI | `src/pages/media/download/` | 任务 / **哔哩** / 新建 / 扩展 / 设置 |
| B 站域 | `src/lib/download/bili/` | 12 MediaType 解析、WBI/Gaia、选质、弹幕/字幕/NFO/AI、入队 |
| 门面 | `src/lib/download/service.ts` | probe / create / pause / 引擎路由 |
| Gopeed 核 | `src/lib/download/gopeed/` | 队列、resolve、Webhook、脚本、解压、扩展宿主、`engine-bridge` |
| yt-dlp 核 | `src/lib/download/ytdlp/` | YoutubeDL、**全量转译 IE** + 手写覆盖、ejs、WebPO、utils |
| Rust 引擎 | `src-tauri/src/download_engine/` | HTTP（slow-start/steal、**.part 续传子集**）、BT（librqbit + **seedKeep/seedRatio**）、ED2K 询源+分片、归档（**ZIP GBK**）、扩展 eval |

可选 remux：见 `docs/REMUX_BUILTIN.md`（内置 libav 优先、外部 ffmpeg CLI 兜底；与外置 mpv 同构）。

## P4 整模块体验（2026-08-07）

| 能力 | 落点 |
|------|------|
| 同名自动重命名 | Rust `resolve_dest_path` + TS `gopeed/unique-path.ts`（engine-bridge 旁路） |
| ZIP 中文文件名 | `archive.rs` GBK 回退 |
| 多分卷解压 | `archive.ts` 主卷解析 + `queue` 等齐卷再解压 |
| BT 做种 | `seedKeep` 真保持；`seedRatio` 达阈结束 |
| HTTP 续传子集 | 已有 `.part` 时强制单连接 Range |
| ytdlp 编排 | `process_ie_result`（url / url_transparent）；侧车 write*；ignoreerrors / age_limit |
| B 站 ytdlp | dolby/flac、seg.so 弹幕入口、ugc_season、enqueue `embedMetadata` |

## 全量 IE（一次落地）

对照钉扎上游：`Download/yt-dlp-master`。

| 产物 | 说明 |
|------|------|
| `extractors/generated/**` | 机械转译的全部 `*IE` 类（~940 模块 / ~2034 类） |
| `extractors/generated-registry.ts` | 对齐 `_extractors.py` 顺序；`implemented: true`；**无 StubIE 主路径** |
| `HAND_OVERRIDES` | 手写精品（含 `hand-a/`…`hand-t/`）；清单见 [`YTDLP_SITE_FAMILIES.md`](./YTDLP_SITE_FAMILIES.md) |
| `utils/` + `common.ts` | yt-dlp utils / InfoExtractor 同构表面；转译 IE 经 `_ported_real_extract` 落地 |

### 重新生成

```powershell
python src/lib/download/ytdlp/port/transpile_extractors.py --yt-dlp d:\Projects\Rust\Reader\Download\yt-dlp-master
# 或
node src/lib/download/ytdlp/port/transpile-extractors.mjs --yt-dlp d:\Projects\Rust\Reader\Download\yt-dlp-master

node src/lib/download/ytdlp/port/check-supportedsites.mjs --yt-dlp d:\Projects\Rust\Reader\Download\yt-dlp-master
```

验收：registry 相对 `_extractors.py` 覆盖 ≥95%、无 Stub 主路径、`tsc --noEmit` 通过。

全站族对齐清单（自动生成）：

```powershell
node src/lib/download/ytdlp/port/gen-site-family-list.mjs --yt-dlp d:\Projects\Download\yt-dlp-master
# 输出 docs/YTDLP_SITE_FAMILIES.md
```

参见 [`YTDLP_SITE_FAMILIES.md`](./YTDLP_SITE_FAMILIES.md)。

行为回归清单（手写 IE 简化注释扫描）：

```powershell
node src/lib/download/ytdlp/port/scan-hand-gaps.mjs
# 输出 docs/YTDLP_HAND_REGRESSION_GAPS.md
```

## 独立哔哩页

- 导航：下载 → **哔哩**（`DownloadHubSection = 'bili'`）
- ADR：`docs/adr/download-bili-hub.md`
- 登录：扫码 / Cookie 粘贴 / 刷新（Cookie Hub）；不做密码短信
- 入队：`enqueueBiliItems` → `meta.requestedFormats` + 现有 ytdlp 引擎合并
- 设置：下载设置页「哔哩」分组（画质 / PCDN / 命名 / ASS）

### 哔哩冒烟

1. 未登录解析 BV → 可选清晰度入队 → 任务页合流
2. 扫码或粘贴 Cookie → 高画质 / 字幕 / AI / 历史弹幕可选
3. 番剧 ep、收藏夹、稍后再看、UP 空间、音频 au、图文 opus 均可解析列表
4. 多选 → Popup 勾选弹幕/封面 → 目标目录出现附加文件
5. 观看历史页载入稿件后下载

## 冒烟清单

1. HTTP 多连接（慢启动 + 偷工作）
2. YouTube 单视频 → ejs + WebPO；`playlist?list=` / `watch?v=&list=` / `@handle/videos` → YoutubeTab playlist entries
3. B 站：多 P → playlist entries；`ep` 单集；`ss` / `md` → 季番 entries；弹幕 XML + CC 字幕；`cheese/play/ep|ss` 课程
4. Douyin `/video|note/<id>` → aweme detail formats（需 s_v_web_id）
5. Twitch：VOD / Stream / Clips / Collection / channel Videos
6. 手写站：Twitter（含 t.co / i/status）/ TikTok / Instagram / Reddit / Niconico / Vimeo / Soundcloud
7. 国内：v.qq.com / xiaohongshu / weibo / acfun / youku / iqiyi（部分需 Cookie）
8. 全球 / CDN：facebook.com / pornhub / players.brightcove.net / Kaltura embed
9. **独立哔哩页**（见上）
10. 任意其它 supportedsites URL → 命中转译 IE（非 `[stub]`）；全表见 `YTDLP_SITE_FAMILIES.md`
11. ED2K 分片 / magnet→librqbit / remux

### 样例 URL（extract_info / 路由）

| 站 | 样例 | 期望 ie_key |
|----|------|-------------|
| Youtube | `https://www.youtube.com/watch?v=dQw4w9WgXcQ` | Youtube |
| YoutubeTab | `https://www.youtube.com/playlist?list=PLrAXtmRdnEQy6nuLMOV8u4Ex9VE8eaNY8` | YoutubeTab |
| YoutubeTab shorts | `https://www.youtube.com/@MrBeast/shorts` | YoutubeTab |
| BiliBili | `https://www.bilibili.com/video/BV1xx411c7mD` | BiliBili |
| Bangumi ep | `https://www.bilibili.com/bangumi/play/ep21495` | BiliBiliBangumi |
| Bangumi ss | `https://www.bilibili.com/bangumi/play/ss26801` | BiliBiliBangumiSeason |
| Cheese | `https://www.bilibili.com/cheese/play/ep229832` | BilibiliCheese |
| Douyin | `https://www.douyin.com/video/6961737553342991651` | Douyin |
| TwitchStream | `https://www.twitch.tv/monstercat` | TwitchStream |
| TwitchVideos | `https://www.twitch.tv/monstercat/videos` | TwitchVideos |
| VQQ | `https://v.qq.com/x/cover/...` / 单集页 | VQQVideo |
| XiaoHongShu | `https://www.xiaohongshu.com/explore/...` | XiaoHongShu |
| Facebook | `https://www.facebook.com/watch/?v=...` | Facebook |
| Brightcove | `https://players.brightcove.net/<account>/<player>_default/index.html?videoId=...` | BrightcoveNew |

## 许可证

不链接 Gopeed 引擎；yt-dlp Unlicense；ejs vendor 随 yt-dlp/ejs（Unlicense）。
