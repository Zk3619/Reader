# yt-dlp 协议支持策略

## 整模块落盘（P4 · 与协议无关）

经 `createEngineDownload` 的 HTTP / BT / ED2K / ytdlp 直链：同名重命名、完成解压（ZIP GBK、多分卷等齐）、BT `seedKeep`/`seedRatio`、HTTP `.part` 单连接 Range 续传子集。旁路（HLS/ffmpeg/fragment）复用 TS `unique-path`。

## 原生支持（TS/Rust）

| 协议 | 实现 |
|------|------|
| `https` / `http` | Gopeed 引擎 / `download_binary`（含 `.part` 续传子集） |
| `m3u8` / `m3u8_native` | `hls-native` AES-128；失败 / SAMPLE-AES / live → ffmpeg `media_convert_fetch_hls` |
| `dash` / `http_dash_segments` | ffmpeg `media_convert_fetch_dash` 或预解析 fragments |
| `ism` | `ism-native` PIFF（`write_piff_header`）+ fragment concat → `ismv`/`isma` |
| `f4m` / `f4m_fragments` | `f4m-native` mdat + FLV header |
| `m3u8_frag_urls` | 预解析 fragments + 原生解密 |
| `rtmp_ffmpeg` / `rtmp`（**opt-in**） | `media_convert_fetch_url`（ffmpeg）或 `rtmpdump` |
| `rtmpe` / `rtmpt`（**opt-in**） | 系统 **rtmpdump**（`ytdlp.allowRtmpDump=true`） |
| `websocket_frag` / `websocket` | `media_convert_fetch_websocket_frag`（WS → ffmpeg stdin） |
| `mhtml` | multipart MHTML 包装或透传 |
| `bunnycdn` | HTTP/HLS + `_bunnycdn_ping_data` MD5 ping |
| `soop_vod` / `soopvod` | HTTP 二进制（别名对齐上游） |
| `niconico_live` / `fc2_live` | ffmpeg 拉流 + 可选 heartbeat URL 头 |
| `youtube_live_chat` / `_replay` | Innertube continuation → JSONL（`youtube-live-chat.ts`） |

## Impersonate / JA3（可选 `tls-impersonate`）

默认出站 HTTP 为 **reqwest**（无 BoringSSL）。进程内 JA3 需 Cargo feature **`tls-impersonate`**（wreq），见 [`HTTP_CLIENT.md`](./HTTP_CLIENT.md)。

| 构建 | TLS / JA3 | 依赖 impersonate 的站点 |
|------|-----------|-------------------------|
| **默认** `tauri:dev:lite` | reqwest；**无** JA3 | 不支持（可用 `READER_TLS_IMPERSONATE=1` + `VITE_YTDLP_TLS_IMPERSONATE=1`） |
| **高级** `tauri:dev:enhanced` | + libmpv + `tls-impersonate`；`VITE_VIDEO_PROFILE=enhanced` 时 JA3 **默认开** | 支持（可 `VITE_YTDLP_TLS_IMPERSONATE=0` / `READER_SKIP_TLS_IMPERSONATE=1` 关闭） |

`isTlsImpersonateBuild()`：`VITE_YTDLP_TLS_IMPERSONATE=1` 强制开；`=0` 强制关；未设置时 enhanced profile 默认开。

## SOCKS / 代理

`params.proxy` 支持 `socks5://` / `socks5h://` / `http://`；裸 `host:port` 归一为 `socks5h://`。  
Rust `reqwest` 已启用 `socks` feature，经 `download_binary` / http 客户端生效。

## 默认拒绝（需 opt-in）

见 `src/lib/download/ytdlp/protocol-policy.ts`：

| 协议 | 开启方式 |
|------|----------|
| `rtmp` / `rtmp_ffmpeg` | `ytdlp.allowRtmpFfmpeg=true` 或 meta `allowRtmpFfmpeg` |
| `rtmpe` / `rtmpt` / `rtmp`（dump） | `ytdlp.allowRtmpDump=true` 且 PATH 有 `rtmpdump` |

`engine-bridge` 在 HTTP 下载前调用 `unsupportedProtocolMessage()`。

## 启用 RTMP / RTMPE

```ts
await setDownloadConfig({ ytdlp: { allowRtmpFfmpeg: true } });
await setDownloadConfig({ ytdlp: { allowRtmpDump: true } }); // needs rtmpdump on PATH
task.meta.allowRtmpFfmpeg = true;
task.meta.allowRtmpDump = true;
```

## 外部下载器

任务 meta `external_downloader: 'aria2c'|'curl'|'wget'|'axel'|'httpie'|'rtmpdump'`（需系统 PATH；经 `run_shell_pp`）。支持 ratelimit / retries 参数透传。

## 分片 continuedl

`media_convert_fetch_fragments` 默认 `continuedl=true`：分片写入 `{output}.ytdl/frag-NNNNN.part`，已存在非空 part 则跳过；全部就绪后拼接并删除 `.ytdl` 目录。

## SponsorBlock / chapters 物理裁剪

`media_convert_cut_by_ranges`：ffmpeg concat demuxer + `inpoint`/`outpoint` + `-c copy`。  
`SponsorBlockPP(remove=true)` / `FFmpegSplitChaptersPP` 经 `remux.ts` 接线。

## 能力验收（协议 / 下载器 = 100%）

相对上游 FileDownloader 用户可见能力齐套；HttpFD/Dash/FFmpegFD 允许 Gopeed/ffmpeg 等价路径。  
微 OUT 仍仅交互登录（密码/短信/人工 2FA），与协议层无关。
