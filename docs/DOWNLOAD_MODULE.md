# 下载模块

MediaBox（Reader）独立壳模块，入口位于侧栏 **订阅** 与 **设置** 之间。

## 架构原则

**进程内移植 Gopeed / yt-dlp 能力**，不通过调用外部 `yt-dlp` / `aria2c` 等二进制冒充完整引擎。

| 层 | 路径 | 职责 |
|----|------|------|
| UI | `src/pages/media/download/` | 任务 / 新建 / 扩展 / 设置 |
| 门面 | `src/lib/download/service.ts` | probe / create / pause / 引擎路由 |
| Gopeed 核 | `src/lib/download/gopeed/` | 队列、resolve、Webhook、脚本、解压、扩展宿主、`engine-bridge` |
| yt-dlp 核 | `src/lib/download/ytdlp/` | YoutubeDL、**全量转译 IE** + 手写覆盖、ejs、WebPO、utils |
| Rust 引擎 | `src-tauri/src/download_engine/` | HTTP（slow-start/steal）、BT（librqbit）、ED2K 询源+分片、归档、扩展 eval |

可选 remux：见 `docs/REMUX_BUILTIN.md`（`media-ffmpeg` 多路 stream-copy；失败回退 CLI）。

## 全量 IE（一次落地）

对照钉扎上游：`Download/yt-dlp-master`。

| 产物 | 说明 |
|------|------|
| `extractors/generated/**` | 机械转译的全部 `*IE` 类（~940 模块 / ~2034 类） |
| `extractors/generated-registry.ts` | 对齐 `_extractors.py` 顺序；`implemented: true`；**无 StubIE 主路径** |
| `HAND_OVERRIDES` | 手写精品覆盖：Youtube / BiliBili / Twitter / TikTok / Vimeo / TwitchVod / Soundcloud / Douyin / BiliBiliBangumi / Instagram / Reddit / Niconico / Generic |
| `utils/` + `common.ts` | yt-dlp utils / InfoExtractor 同构表面；转译 IE 经 `_ported_real_extract` 落地 |

### 重新生成

```powershell
python src/lib/download/ytdlp/port/transpile_extractors.py --yt-dlp d:\Projects\Rust\Reader\Download\yt-dlp-master
# 或
node src/lib/download/ytdlp/port/transpile-extractors.mjs --yt-dlp d:\Projects\Rust\Reader\Download\yt-dlp-master

node src/lib/download/ytdlp/port/check-supportedsites.mjs --yt-dlp d:\Projects\Rust\Reader\Download\yt-dlp-master
```

验收：registry 相对 `_extractors.py` 覆盖 ≥95%、无 Stub 主路径、`tsc --noEmit` 通过。

## 冒烟清单

1. HTTP 多连接（慢启动 + 偷工作）
2. YouTube → ejs + WebPO（手写覆盖）
3. 手写站：B 站 / Douyin / Bangumi / Instagram / Reddit / Niconico …
4. 任意其它 supportedsites URL → 命中转译 IE（非 `[stub]`）
5. ED2K 分片 / magnet→librqbit / remux

## 许可证

不链接 Gopeed 引擎；yt-dlp Unlicense；ejs vendor 随 yt-dlp/ejs（Unlicense）。
