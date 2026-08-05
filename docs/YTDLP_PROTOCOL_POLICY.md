# yt-dlp 协议支持策略

## 原生支持（TS/Rust）

| 协议 | 实现 |
|------|------|
| `https` / `http` | Gopeed 引擎 / `download_binary` |
| `m3u8` / `m3u8_native` | ffmpeg `media_convert_fetch_hls` 或 `hls-native` AES-128 |
| `dash` / `http_dash_segments` | ffmpeg `media_convert_fetch_dash` |
| `ism` / `f4m_fragments` | `fragment-downloader` + `f4m-native` mdat |
| `m3u8_frag_urls` | 预解析 fragments + 原生解密 |

## Impersonate / JA3（全平台 wreq）

出站 HTTP 与 in-process JA3 已统一为 **wreq**（见 [`HTTP_CLIENT.md`](./HTTP_CLIENT.md)）。不再要求高级构建 Cargo feature。

| 构建 | JA3 / wreq | 依赖 impersonate 的站点 |
|------|------------|-------------------------|
| **默认** `tauri:dev:lite` | ✅ 默认启用 | 支持（可 `VITE_YTDLP_TLS_IMPERSONATE=0` 关闭） |
| **高级** `tauri:dev:enhanced` | ✅ + libmpv | 支持 |

### 关闭 JA3 前端门控

```powershell
$env:READER_SKIP_TLS_IMPERSONATE='1'
# 或 VITE_YTDLP_TLS_IMPERSONATE=0
pnpm run tauri:dev:lite
```

Windows 编 BoringSSL：NASM≥2.16.03、`CMAKE_GENERATOR=Ninja`、VsDevCmd（详见 HTTP_CLIENT.md）。

请求优先级：`http_fetch_rquest` → `curl-impersonate`（桌面）→ Client-Hints + wreq Plain。

## 明确不支持（立即报错）

见 `src/lib/download/ytdlp/protocol-policy.ts`：

- `rtmp` / `rtmpe` / `rtmpt` — 无内置 RTMP 客户端
- `websocket` / `websocket_frag` — 无 WebSocket 分片下载器

`engine-bridge` 在 HTTP 下载前调用 `unsupportedProtocolMessage()` 抛出可读错误。

## 远期引擎（P2）

| 协议 | 计划路径 | 依赖 |
|------|----------|------|
| `rtmp_ffmpeg` | `ffmpeg -i rtmp://… -c copy` 落盘 | 系统 PATH 上 ffmpeg |
| `rtmp` | 同上或 librtmp 绑定 | 待评估维护成本 |
| `websocket_frag` | WS 客户端 + 分片拼接 | 新 downloader 模块 |

当前：**不伪造成功**；extractor 可产出 `rtmp_ffmpeg` format，下载阶段需显式启用远期路径（未默认开启）。

## 参考

- 上游：`yt_dlp/downloader/`（RtmpFD、WebSocketFD 等）
- Reader Canvas：`canvases/ytdlp-port-gap-analysis.canvas.tsx`
- wreq（原 rquest）：https://github.com/0x676e67/wreq
