# ADR: 下载模块独立哔哩页

## 状态

已采纳（2026-08）

## 背景

Reader 下载模块已有 Gopeed + yt-dlp 双引擎与通用「新建」页，但 B 站能力分散且画质/Cookie 不完善。BiliTools 1.4.7 提供完整 B 站解析、选质、附加资源与登录风控参考。

## 决策

1. **壳层**：在下载模块增加 section `bili`（非独立 Shell 模块）。
2. **领域层**：新建 `src/lib/download/bili/`，对照 BiliTools 1.4.7 用 Solid/TS 重写 12 种 `MediaType`、playurl、弹幕/字幕/NFO/AI/图文、命名与 PCDN。
3. **登录（2A）**：扫码 + Cookie 粘贴 + Cookie 刷新 + WBI + Gaia(-352) + buvid/ticket；不做密码/短信登录。
4. **执行**：`enqueue` 写入 `meta.requestedFormats` + `skipExtract`，经现有 `DownloadService` / Rust HTTP / ffmpeg 合并；不移植 aria2c。
5. **弹幕 ASS**：TS 侧 XML→ASS，不引入 DanmakuFactory sidecar。
6. **通用「新建」页**：保留；IE 同步接入 Cookie Hub + WBI playurl。

## 明确不做

- 直播录制
- 密码/短信登录
- BiliTools Scheduler 四级队列 UI

## 后果

- 哔哩页与音乐模块共享 Cookie Hub / 扫码实现，账号态一致。
- 附加资源（弹幕/字幕/NFO）在入队时写盘或旁路 HTTP 任务，进度主要在「任务」页观察媒体流。
