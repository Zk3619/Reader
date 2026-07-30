# 下载模块

MediaBox（Reader）独立壳模块，入口位于侧栏 **订阅** 与 **设置** 之间。

## 架构

进程内重写，**不**侧载 `gopeed` / `yt-dlp` 二进制：

| 层 | 路径 | 职责 |
|----|------|------|
| UI | `src/pages/media/download/` | 任务 / 新建 / 扩展 / 设置 |
| 门面 | `src/lib/download/service.ts` | probe / create / pause / 引擎路由 |
| Gopeed 核 | `src/lib/download/gopeed/` | 队列、resolve、Webhook、脚本、解压、扩展宿主 |
| yt-dlp 核 | `src/lib/download/ytdlp/` | YoutubeDL 运行时、格式选择、全站 registry、后处理 |
| Rust 引擎 | `src-tauri/src/download_engine/` | HTTP 多连接、BT/Magnet、ED2K、Boa JS eval |

```
UI → DownloadService → ExtensionHost / YoutubeDL / TaskQueue
                              ↓                    ↓
                     download_engine_eval_js   download_engine_*
```

## 协议与媒体提取

- **通用下载（Gopeed）**：`http(s)`、`magnet`、`.torrent`、`ed2k://`
- **媒体提取（yt-dlp 兼容）**：全站 registry（`extractors/generated-registry.ts`，由 `port/generate-registry.mjs` 自上游扫描生成）；内置实现优先 YouTube / Bilibili / Generic，其余 stub 匹配 URL 后可回退 Generic

重生成 registry：

```powershell
node src/lib/download/ytdlp/port/generate-registry.mjs --yt-dlp d:\Projects\Download\yt-dlp-master
```

## 扩展

对齐 Gopeed：`manifest.json`、`onResolve` / `onStart` / `onError` / `onDone`、Chrome 风格 URL match、git 安装。JS 在 Rust **Boa** 中执行（`download_engine_eval_js`）。

## 落盘

默认 `MediaRoot/Download/Download`（`resolveModuleDownloadDirectory('download')`），可在模块设置中覆盖。

## 许可证说明

- 本模块为 **独立重写**，不链接 Gopeed（GPLv3）引擎代码；扩展 **API 行为兼容**。
- yt-dlp 上游为 Unlicense；本仓库仅保留 TS 移植实现与自动生成 registry，不 vendoring Python 源码树。
- BT 等 Rust 依赖请以 `Cargo.toml` / 第三方 crate 许可证为准。

## 播放路径

`src/lib/media/tv/play/extractors.ts` 已改为调用进程内 `YoutubeDL`，不再 `Command.create('yt-dlp')`。
