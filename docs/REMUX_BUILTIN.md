# Remux 内置优先 / 外部兜底

对齐影视内核（内嵌 libmpv 优先、外置 mpv 兜底）：下载后处理以进程内 libav 为主路，系统 `ffmpeg` CLI 仅作兜底。

## 分层

| 构建 | 内置（主路） | 外部（兜底） |
|------|--------------|--------------|
| **enhanced**（`pnpm tauri:dev:enhanced`） | `media-ffmpeg` → ffmpeg-next / libav | PATH 上的 `ffmpeg` |
| **lite**（默认） | 未编译 `media-ffmpeg` | 仅外部 `ffmpeg`；皆无则友好跳过 |

调用方（`remux.ts` 后处理）**只调** `media_convert_*`，不直接 spawn 外部 ffmpeg；主路/兜底由 Rust 决定。

## 启用进程内 libav

enhanced 桌面构建已由 [`scripts/tauri-cli.mjs`](../scripts/tauri-cli.mjs) 自动注入 `--features video-libmpv,media-ffmpeg,…`。

lite 手动：

```powershell
cargo build --features media-ffmpeg
# 或
pnpm tauri dev -- --features media-ffmpeg
```

需本机可链接的 FFmpeg 开发库（见 `ffmpeg-next` / `ffmpeg-sys-next` 文档；crate 启用了 `static` feature）。

Windows 常见需求：安装 [pkg-config](https://github.com/pkgconf/pkgconf) 与 FFmpeg（或 vcpkg `ffmpeg`），并配置 `PKG_CONFIG_PATH` / `FFMPEG_DIR`；缺库时 `cargo build --features media-ffmpeg` 会在 `ffmpeg-sys-next` 的 build.rs 失败。

## 行为

| 命令 | 主路 | 兜底 |
|------|------|------|
| `media_convert_merge_files` | libav 多输入 stream-copy | `ffmpeg -i … -map … -c copy` |
| `media_convert_embed_metadata` | libav 单文件 copy + metadata | `ffmpeg -i … -c copy -metadata …` |
| `media_convert_remux_copy` | libav 单文件 copy（fixup/remux） | `ffmpeg -i … -c copy`（可选 genpts） |

日志关键字：`libav ok` / `cli-fallback`，便于对照外置 mpv 降级可观测性。

重编码类后处理（`video_convert` / `fixup_stretched`）本轮仍只走外部 CLI，不扩 libav 转码范围。

## 产品策略

继续内置移植提取/下载能力；remux **优先进程内 libav**（enhanced 默认），**保留外部 ffmpeg 兜底**。不把「必须安装 ffmpeg」当成站点提取捷径；lite 无内置时依赖外置工具或跳过可选后处理（成片仍可播）。
