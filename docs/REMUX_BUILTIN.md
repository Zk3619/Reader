# Remux 内置可行性

## 结论（2026-07）

| 方案 | 可行性 | 说明 |
|------|--------|------|
| 系统 `ffmpeg` CLI | **回退默认** | 与上游 yt-dlp 相同依赖模型；merge / HLS / embed |
| `ffmpeg-next`（feature `media-ffmpeg`） | **多路 stream-copy 已落地** | 进程内 libav：多输入 `-map` 等价 remux；失败自动回退 CLI |
| 纯 Rust（无 libav） | **暂不作为默认** | 生态可做有限 ISO-BMFF/MP3；无法稳定覆盖 B 站 dash（hevc/avc+aac）任意组合 |

**产品策略：** 继续内置移植提取/下载能力；remux 优先进程内 libav（可选 feature），保留 CLI 回退。不把「必须安装 ffmpeg」当成站点提取捷径。

## 启用进程内 libav

```powershell
cargo build --features media-ffmpeg
```

需本机可链接的 FFmpeg 开发库（见 `ffmpeg-next` 文档）。

## 行为

`media_convert_merge_files`：若启用 `media-ffmpeg`，先走 `merge_with_ffmpeg_next`（打开各输入 → 复制 A/V/S 流 → `rescale_ts` → `write_interleaved`）；失败再 `ffmpeg -i … -map … -c copy`。
