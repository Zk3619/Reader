# 缓存导出与媒体格式转换

本文说明书架「离线缓存」页的导出能力，以及文本 / 图片 / 音频的**平台探测与自动降级**策略。

## 设计原则

1. **核心能力优先**：默认构建聚焦阅读、缓存、导出；不强制捆绑 FFmpeg。
2. **音频 / 视频转码为可选**：仅显式启用 `media-ffmpeg` feature（或 Web 端 `ffmpeg.wasm`）后才提供格式转换 UI。
3. **默认原样导出**：音频导出保持缓存时的字节与 MIME，**不**做转码，**不**根据目标格式重命名扩展名。
4. **图片转换轻量保留**：`image` crate 为纯 Rust、体积可控，仍编入默认构建；图片导出默认亦为「保持原格式」。

---

## 功能概览

### 导出入口

- 书架 → **离线缓存** → 书籍卡片 **导出缓存** 按钮
- 打开 `BookshelfCacheExportDialog` 配置选项后开始导出
- 导出过程中显示进度弹窗，并同步 `AppToasts` 持久化进度 Toast

### 导出选项（默认行为）

| 类型 | 可配置项 | 默认 |
|------|----------|------|
| **文本** | TXT / EPUB；单文件 / 按章拆分 / ZIP | TXT 单文件 |
| **图片** | ZIP / 文件夹；JPEG / PNG / WebP；按章目录 | 原格式、ZIP、按章分级 |
| **音频** | ZIP / 文件夹；合并单文件 | **原格式**、ZIP；无转码 |

音频 **MP3 / M4A 转换选项** 仅在可选转码能力探测通过后才显示（见下文）。

所有导出均支持章节范围，且默认仅导出**已缓存**内容。

---

## 格式转换架构

```
┌─────────────────────────────────────────────────────────┐
│  默认构建（Tauri / Web）                                 │
│    · 图片：可选转换（Rust image / Canvas），默认原格式   │
│    · 音频：不转码，保持缓存 MIME 与扩展名                │
└───────────────────────┬─────────────────────────────────┘
                        │ 显式启用可选能力
                        ▼
┌─────────────────────────────────────────────────────────┐
│  可选：Tauri --features media-ffmpeg                     │
│    · 音频：ffmpeg-next 转 MP3 / M4A                      │
│  可选：Web VITE_ENABLE_FFMPEG_WASM=true                  │
│    · 音频：ffmpeg.wasm                                   │
└───────────────────────┬─────────────────────────────────┘
                        │ 转码失败
                        ▼
┌─────────────────────────────────────────────────────────┐
│  回退原字节与原 MIME（不阻断导出）                       │
└─────────────────────────────────────────────────────────┘
```

前端通过 `resolveMediaConvertCapabilities()` 探测；导出弹窗**隐藏**不可用的音频格式选项；确认时强制不可选项回退为 `original`。

---

## 音频导出：扩展名规则

默认路径下文件名扩展名**仅由源 MIME 推导**，例如：

| MIME | 扩展名 |
|------|--------|
| `audio/mpeg` | `.mp3` |
| `audio/mp4` / `m4a` | `.m4a` |
| `audio/ogg` | `.ogg` |
| 未知 | `.audio`（不再默认写成 `.mp3`） |

合并为单文件时：仅在**同 MIME 且均为 MP3 编码**时可字节拼接；合并文件扩展名跟随源 MIME，不因用户曾选择的目标格式而改名。

---

## 可选构建：media-ffmpeg

### 为何默认不启用

| 因素 | 说明 |
|------|------|
| 包体积 | `ffmpeg-next` + `static` 可显著增加安装包（数十 MB 量级） |
| 编译时间 | 首次构建需下载 / 编译 FFmpeg 静态库 |
| 能力边界 | 阅读器核心为书源与缓存，转码属于增强能力而非必需 |
| 移动端 | Android / iOS 交叉编译 FFmpeg 成本高，尚未纳入默认流水线 |

### 如何启用（开发者）

```bash
cd src-tauri
cargo build --features media-ffmpeg
# 或
cargo tauri build -- --features media-ffmpeg
```

`src-tauri/Cargo.toml`：

```toml
[features]
default = []
media-ffmpeg = ["dep:ffmpeg-next"]
```

启用后 `media_convert_probe` 在 `ffmpeg::init()` 成功时返回 `audioBackend: "rust"`，导出弹窗显示 MP3 / M4A 选项。

### 移动端

- **图片** Rust 转换：默认可用（`image` crate）
- **音频** 转码：与桌面相同，需显式 `--features media-ffmpeg` 并完成对应架构 FFmpeg 集成；默认构建保持原样导出

---

## Web 端可选 ffmpeg.wasm

默认 **不** 打包 wasm。若需浏览器内音频转码：

```bash
pnpm add @ffmpeg/ffmpeg @ffmpeg/util
# public/ffmpeg/ 放置 ffmpeg-core.js / ffmpeg-core.wasm
```

```env
VITE_ENABLE_FFMPEG_WASM=true
```

未启用时 Web 端音频与默认 Tauri 构建行为一致：原样导出。

---

## 代码结构

### Rust（`src-tauri`）

| 命令 | 说明 |
|------|------|
| `media_convert_probe` | 探测图片 / 音频后端 |
| `convert_image_bytes` | 图片转码（默认构建可用） |
| `convert_audio_bytes` | 音频转码（**仅 `media-ffmpeg`**） |

### 前端

| 文件 | 说明 |
|------|------|
| `src/lib/media/media-convert-capabilities.ts` | 能力探测 |
| `src/lib/media/media-convert.ts` | 统一门面 |
| `src/lib/export/export-audio.ts` | 音频导出；`shouldTranscode` 为 false 时跳过转换 |
| `src/lib/export/cache-export-types.ts` | `audioTargetFormat` 默认 `'original'` |
| `src/components/bookshelf/BookshelfCacheExportDialog.tsx` | 按探测结果显示选项 |

---

## 平台能力矩阵（默认构建）

| 平台 | 图片转换 | 音频转码 | 音频导出 |
|------|----------|----------|----------|
| Tauri 桌面 / 移动 | Rust `image`（可选使用） | ❌ | 原格式 |
| Tauri + `media-ffmpeg` | Rust `image` | ✅ ffmpeg-next | 可选 MP3 / M4A |
| Web | Canvas（可选） | ❌（除非 wasm） | 原格式 |

视频转码：**未实现**，`videoBackend` 恒为 `none`。

---

## 构建与测试

```bash
# 默认（无 FFmpeg）
cd src-tauri && cargo build

# 可选音频转码
cd src-tauri && cargo build --features media-ffmpeg

npx tsc --noEmit
npx vitest run src/test/lib/media src/test/lib/export
```

---

## 相关测试

- `src/test/lib/media/media-convert-capabilities.test.ts`
- `src/test/lib/export/cache-export-types.test.ts`
