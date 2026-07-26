# 影视 Web / Rust 增强管线（E-WEB / E-DEMUX / E-NATIVE）

> 状态：**门禁 A 已接真实 Anime4K-WebGPU CNN + RIFE ORT（vs-mlrt v2/v1 张量）**；门禁 B demux HTTP 骨架（需 `media-ffmpeg`）；门禁 C native status（feature 可砍）。  
> 计划：`EnhancePipelineId` 与 `PlaybackEngineId` 解耦——引擎管播，管线管画质。

## 1. 定稿决策

| 项 | 定稿 |
|----|------|
| 关系 | 四路并存：Web / RustDemux / RustNative / **现有 MpvEnhance** |
| Web 默认 | **显式 opt-in**（`enhanceBackend: 'web'`），不进 auto |
| 冲突 | `webEnhanceEnabled=false` **优先于** `enhanceBackend='web'` |
| HLS | **有意不进** rust-demux / WebCodecs demux；继续 Artplayer + hls.js；可叠 L2 超分 |
| 级联 | Web/Native：`decode → (MaxInputHeight 闸门) → ≤720 RIFE → Anime4K → blit`；mpv 路保持互斥 |
| lite | RIFE onnx + ORT wasm **随包**（约 5–10MB），不懒下载 |
| rust-native | v1 **软解上传 ≤1080p**；hwaccel↔wgpu 另开 spike；**可砍** |

## 2. Pipeline 档位

| Id | 依赖 | 超分 | 补帧 | 呈现 |
|----|------|------|------|------|
| `web-full` | WebCodecs + WebGPU + ORT 实探 | Anime4K WGSL | RIFE 级联前级 | canvas |
| `web-sr` | WebCodecs + WebGL2 | Anime4K GLSL ES | 关 | canvas |
| `video-overlay` | 隐藏 video + rVFC + WebGL | 仅超分 | 不可能 | canvas 唯一可见面（约落后 1 帧） |
| `rust-demux` | 本地 HTTP demux + web-full/sr | 同 Web | 同 Web | canvas |
| `rust-native` | wgpu + ort | 原生 | 原生 | 独立窗 |
| `mpv` | libmpv / 外置 mpv | GLSL | VapourSynth | 独立 VO |

## 3. 门禁

| 门禁 | 内容 | 规则 |
|------|------|------|
| **A** | skeleton-core → chrome → Anime4K → RIFE | 可独立上线；**core 子验收前不合 anime4k/rife** |
| **B** | rust-demux | 依赖 A |
| **C** | rust-native | **可砍** |

core 子验收：纯直通渲染下 100 次随机 seek，每次 AV 重同步 &lt; 80ms。

## 4. MediaClock / Seek / epoch

- 锚点：`(mediaTime ↔ audioCtx.currentTime)`；play/resume/seek/rate 必 `anchor`
- 弹幕调度读 **`MediaClock.mediaTimeNow()`**，禁止墙钟
- Seek：AbortController → **`epoch++`** → flush → 关键帧 + pre-roll → 重锚
- 在飞 ORT 回调落队前校验 `epoch`，不匹配则丢弃（防幽灵帧）
- 音频按**累计采样**调度；处理 AAC priming / edit list
- mp4box seek 依赖 **Range 206**：asset / tv_proxy / `video.bin` 须支持（core 第一周验证）

## 5. 级联与闸门

```
解码帧
  → codedHeight > frameInterpMaxInputHeight → 跳过 RIFE（a4kOnly）
  → 否则降采样 ≤720 → RIFE(epoch) → Anime4K → blit

源分辨率 ≥ 显示分辨率（如 4K→4K）：
  → restore-only 或关 SR（禁止完整 Upscale 链）
```

性能看门狗：连续 N 帧呈现延迟 → 降 Anime4K Mode → 关 RIFE → toast。阈值见 benchmark 页帧预算。

## 6. 路由（auto）

1. 强制 backend → 对应 pipeline（不可用则降级）
2. prefs 持久化为 `mpv` 且可用 → MpvEnhance
3. **容器需 demux（mkv）且 rustDemux**：auto 允许 L3（唯一可播路径）；mpv 可用则优先；首次 toast
4. 显式 `web` + caps + per-track（**含 AudioDecoder**）→ L0/L1/L2
5. 显式 `rust-native` → L4
6. 否则 Artplayer

## 7. L2 机制

`<video>` **隐藏但持续播放**；canvas 用 rVFC 帧画超分输出；恒定落后约 1 帧；不是「视频上叠滤镜」。

## 8. 字幕 / 弹幕 / 截图（v1）

| 能力 | v1 |
|------|-----|
| 弹幕 | 跟；吃 MediaClock |
| ASS | 砍；提示 mpv |
| 截图 | WebGPU：`convertToBlob`（同任务）；WebGL2：`preserveDrawingBuffer`+`toBlob` |
| 进度预览 | 跟 SpriteStore 思路 |

## 9. 实现期 checklist

1. per-track 含 **AudioDecoder.isConfigSupported**
2. 源 ≥ 显示分辨率 → **restore-only 或关 SR**
3. skeleton-core 先验证 **asset / proxy / video.bin Range 206**
4. **benchmark 页** 为 `settings-regression` 交付物（看门狗阈值）
5. `webEnhanceEnabled=false` **优先于** `enhanceBackend='web'`

## 10. 验收摘要

- Win L0；macOS 以 ort 实探为准 L0/L1；Linux L2 或 L3+L1
- Seek 100 次；无幽灵帧（epoch）；4K 源只 SR 不插值
- mkv 未 opt-in web 时 auto→L3（或 mpv）非死胡同
- 人为加压可观察看门狗降级

## 12. 代码入口（落地）

| 路径 | 角色 |
|------|------|
| `src/lib/media/video/enhance/` | caps / router / MediaClock / web-engine / anime4k-webgl / rife-web / demux-client / watchdog |
| `src/components/.../TvWebEnhancePane.tsx` | Web 增强 HUD |
| `src/components/.../WebEnhanceBenchmarkPanel.tsx` | 帧预算 benchmark |
| `src-tauri/src/video_demux.rs` | 拆封装 HTTP（feature media-ffmpeg / video-demux） |
| `src-tauri/src/video_native_enhance.rs` | 原生增强 status（feature video-native-enhance） |
| `resources/rife/web/` | Web ORT 模型（lite 随包位） |

prefs：`enhanceBackend` / `webEnhanceEnabled` / `frameInterpMaxInputHeight`
