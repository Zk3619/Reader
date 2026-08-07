# yt-dlp 协议支持策略

## 整模块落盘（P4 · 与协议无关）

经 `createEngineDownload` 的 HTTP / BT / ED2K / ytdlp 直链：同名重命名、完成解压（ZIP GBK、多分卷等齐）、BT `seedKeep`/`seedRatio`、HTTP `.part` 单连接 Range 续传子集。旁路（HLS/ffmpeg/fragment）复用 TS `unique-path`。

## 原生支持（TS/Rust）

| 协议 | 实现 |
|------|------|
| `https` / `http` | Gopeed 引擎 / `download_binary`（含 `.part` 续传子集） |
| `m3u8` / `m3u8_native` | ffmpeg `media_convert_fetch_hls` 或 `hls-native` AES-128 |
| `dash` / `http_dash_segments` | ffmpeg `media_convert_fetch_dash` |
| `ism` / `f4m_fragments` | `fragment-downloader` + `f4m-native` mdat |
| `m3u8_frag_urls` | 预解析 fragments + 原生解密 |
| `rtmp_ffmpeg` / `rtmp`（**opt-in**） | `media_convert_fetch_url`（`ffmpeg -i rtmp://… -c copy`） |
| `websocket_frag` / `websocket` | `media_convert_fetch_websocket_frag`（WS → ffmpeg stdin） |
| `mhtml` / `bunnycdn` / `soop_vod` | HTTP 二进制落盘 |
| `niconico_live` / `fc2_live` | ffmpeg 尽力拉流 |

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

```powershell
# lite 单独开 JA3（会编 BoringSSL）
$env:READER_TLS_IMPERSONATE='1'
pnpm run tauri:dev:lite

# enhanced 关 JA3
$env:READER_SKIP_TLS_IMPERSONATE='1'
pnpm run tauri:dev:enhanced
```

Windows 编 BoringSSL：NASM≥2.16.03、`CMAKE_GENERATOR=Ninja`、VsDevCmd（详见 HTTP_CLIENT.md）。

请求优先级：`http_fetch_rquest` → `curl-impersonate`（桌面）→ Client-Hints + Plain HTTP。

## 明确不支持（立即报错）

见 `src/lib/download/ytdlp/protocol-policy.ts`：

- `rtmp` / `rtmp_ffmpeg` — **默认**拒绝；设置 `ytdlp.allowRtmpFfmpeg=true` 或任务 meta `allowRtmpFfmpeg` 后走 ffmpeg
- `rtmpe` / `rtmpt` — 无支持（产品不做）
- `youtube_live_chat` — 专用 FD 未移植（明确报错）

`engine-bridge` 在 HTTP 下载前调用 `unsupportedProtocolMessage()` 抛出可读错误。

## 启用 RTMP（ffmpeg）

```ts
await setDownloadConfig({ ytdlp: { allowRtmpFfmpeg: true } });
task.meta.allowRtmpFfmpeg = true;
```

## 外部下载器

任务 meta `external_downloader: 'aria2c'|'curl'|'wget'`（需系统 PATH 有对应二进制，经 `run_shell_pp`）。

## 分片 continuedl

`media_convert_fetch_fragments` 默认 `continuedl=true`：分片写入 `{output}.ytdl/frag-NNNNN.part`，已存在非空 part 则跳过；全部就绪后拼接并删除 `.ytdl` 目录。失败保留 part 供下次 resume（非 HTTP Range 字节级）。

## SponsorBlock / chapters 物理裁剪

`media_convert_cut_by_ranges`：ffmpeg concat demuxer + `inpoint`/`outpoint` + `-c copy`（**无** `force_keyframes` 重编码；切点可能落在非关键帧）。  
`SponsorBlockPP(remove=true)` / `FFmpegSplitChaptersPP` 经 `remux.ts` 接线。

## 编排边界

- `YoutubeDL.extract_info(url, false)`：解析 + 格式选择 + `prepare_filename` → `_filename`
- 媒体落盘：`DownloadService` / `engine-bridge`
- `download=true` 默认不伪造成功；仅 `allow_stub_download` 恢复旧桩
- `writeinfojson` / SponsorBlock / EmbedThumbnail 等走 postprocessors

## 远期

| 协议 | 计划路径 |
|------|----------|
| `rtmpe` | 明确不做 |
| force_keyframes 裁剪 | 可选重编码路径 |

## 参考

- 上游：`yt_dlp/downloader/`（RtmpFD、WebSocketFD 等）
- wreq：https://github.com/0x676e67/wreq
