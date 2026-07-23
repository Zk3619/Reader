# 影视增强核：Anime4K × 小喵player × Reader 差异与补强可行性

> 状态：调研定稿；**桌面 E2.1–E2.5 / Android E2.A–E2.D 已落地**；影视 ROADMAP 已收口。路线图外候选项见 §7。  
> 日期：2026-07-24  
> 关联：  
> - [VIDEO_PLAYBACK_KERNEL.md](./VIDEO_PLAYBACK_KERNEL.md) — 多核协议与路由  
> - [VIDEO_CAPABILITY_ROADMAP.md](./VIDEO_CAPABILITY_ROADMAP.md) — 能力分期  
> - [VIDEO_LIBMPV_LICENSE.md](./VIDEO_LIBMPV_LICENSE.md) — GPL / libmpv 许可  

**参考仓（工作区路径，只读）：**

| 仓 | 路径 | 角色 |
|----|------|------|
| Anime4K（bloc97）上游 | `Video/Anime4K-master` | 官方 v4 GLSL 算法与 Mode 定义 |
| 小喵player（FAM4K007） | `Video/mpv-android-anime4k-master` | Android 产品化：libmpv AAR + Anime4K UI + 播控 |
| Reader 影视模块 | `Reader/` | TVBox/FongMi Hub + 多核播放 |

---

## 0. 结论摘要

1. **产品定位不同**：Reader 是跨端「内容壳 + 多核播放」；小喵是 Android「原生动漫播放器」；Anime4K 是 **GLSL 算法库**（非播放器）。
2. **补强原则**：向小喵借 **引擎配置 / 超分产品化 / 原生播控**；向 Anime4K 借 **官方 Mode 链与 GLSL 资产**；**不**整仓移植小喵架构，**不**用 mpv 取代 Artplayer 主路。
3. **桌面**：P0–E2.5 ✅（EQ / 章节 / 封面 / softvol）。  
4. **Android**：E2.A–E2.G ✅（Media3；MPVView；FlameMaster+ASS；Anime4K 17）。hdr-toys / B站登录下载为**路线图外候选项**。

```text
Anime4K-master          小喵player                 Reader 影视
(GLSL / Mode 定义)      (Android 产品化落地)         (多核 + Hub)
      │                        │                         │
      │  官方 A/B/C 链          │  Anime4KManager         │  anime4k.ts（需校正）
      │  Restore/Upscale/…     │  CustomMPVView          │  桌面 libmpv2 ✅
      │  Clamp / AutoDownscale │  mpvlib.aar 可播         │  Android E2.D AAR 直引 ✅
      └──────────┬─────────────┴────────────┬────────────┘
                 │  应抽取                    │  应保留
                 ▼                            ▼
         shaders + Mode 表 + hwdec 子集    Spider / LOCAL / Kazumi / Artplayer
```

---

## 1. 三方定位对照

| 维度 | Anime4K-master | 小喵player | Reader 影视 |
|------|----------------|------------|-------------|
| 形态 | 算法 + mpv 安装说明 | 独立 Android App | Tauri 2 内影视 Hub |
| 主价值 | 实时动漫超分/去伪影 | 本地/流媒体高质量播放 | 源站 CONFIG / Spider / 追番 |
| 播放引擎 | 无（依赖宿主 mpv） | 预编译 `mpvlib.aar` | Artplayer 主路 + libmpv/外置 |
| UI | 无产品 UI | Compose + XML 播放器 | SolidJS Hub |
| 超分 | 权威 Mode / GLSL 源 | 完整 Mode UI + assets | 设置项有；链/资源不完整 |
| 许可 | 上游开源（随仓库） | GPL-3.0-or-later | 目标 GPL-3.0-or-later |
| 与本仓关系 | GLSL 真源 | 体验/接线参考 | 实现落点 |

---

## 2. Anime4K 上游要点（权威）

来源：`Video/Anime4K-master`（README + `md/GLSL_Instructions_Advanced.md`）。

### 2.1 设计目标

- 面向 **原生 1080p 动漫**（h.264 / h.265 / VC-1）实时上屏超分，避免不可逆 4K 重编码。
- **不是** SRGAN / Real-ESRGAN / waifu2x 的离线替代品；低清老片、胶片噪点、烂反交错等非其最优域。
- v4 核心：用 **Restore（线重建）** 纠正野生片源分布偏移，再接传统 MSE 上采样。

### 2.2 仓库结构（与集成相关）

```text
Anime4K-master/
├── glsl/
│   ├── Restore/          # Restore / Restore_Soft / Clamp_Highlights / GAN…
│   ├── Upscale/          # Upscale_CNN_x2_* / AutoDownscalePre_x2|x4 / …
│   ├── Upscale+Denoise/  # Upscale_Denoise_CNN_x2_*
│   ├── Deblur/           # Deblur_DoG / Original
│   ├── Denoise/          # Bilateral 等
│   └── Experimental-Effects/  # Thin / Darken（主观线增强，非默认 Mode）
├── md/                   # Windows/Linux/Mac mpv / Plex 安装与高级说明
└── tensorflow/           # 训练侧（App 集成一般不需要）
```

### 2.3 官方 Mode 语义（v4.x）

| Mode | 优化对象（摘要） | 管线（省略 Clamp / AutoDownscale） |
|------|------------------|-------------------------------------|
| **A** | 多数 1080p；高模糊 / 重采样伪影 / 压缩涂抹 | `Restore → Upscale → Upscale` |
| **B** | 多数 720p；低模糊 / 下采样振铃 | `Restore_Soft → Upscale → Upscale` |
| **C** | 强下采样或几乎无劣化素材；偏高 PSNR | `Upscale_Denoise → Upscale` |
| **A+A** | 同 A，更高感知质量（易过锐） | `Restore → Upscale → Restore → Upscale` |
| **B+B** | 同 B | `Restore_Soft → Upscale → Restore_Soft → Upscale` |
| **C+A** | 同 C，略增感知质量 | `Upscale_Denoise → Restore → Upscale` |

次级 Mode 仅建议在 **≥2× 超分需求** 时使用；1080p 片源在 1080p 屏上开 A+A 常会过锐。

### 2.4 关键组件说明

| 组件 | 作用 |
|------|------|
| `Clamp_Highlights` | 放在链首统计、链尾钳制高光，防振铃；官方建议常开 |
| `Restore` / `Restore_Soft` | 超分前修复；前者偏上采样伪影/模糊，后者偏下采样/锯齿 |
| `Upscale_CNN_x2_*` | ×2 上采样（假定输入已较干净） |
| `Upscale_Denoise_CNN_x2_*` | ×2 + 降噪（Mode C 起点） |
| `AutoDownscalePre_x2` / `x4` | 两级 Upscale 之间按屏尺寸降采样，避免超屏中间缓冲 |
| CNN 变体 | **S / M / L / VL / UL**：每升一档约 ×2 耗时；后级常用降一档抵消 4× 像素量 |

### 2.5 官方 Fast（M）Mode A 示例（mpv）

与 `md/GLSL_Instructions_Mac.md` 等模板一致（路径前缀 `~~/shaders/`）：

```text
Clamp_Highlights
→ Restore_CNN_M
→ Upscale_CNN_x2_M
→ AutoDownscalePre_x2
→ AutoDownscalePre_x4
→ Upscale_CNN_x2_S
```

属性：`glsl-shaders`，多路径用 `:` 分隔（Windows 亦常见 `;`，实现层需规范化）。

### 2.6 性能预算（官方）

| 帧率 | 单帧 GPU 预算（约） |
|------|---------------------|
| 24 fps | ~41 ms |
| 30 fps | ~33 ms |
| 60 fps | ~16 ms |

掉帧时降 Quality（L→M→S）或关次级 Mode；可用 mpv profiler（Shift+I → 2）验证。

---

## 3. 小喵player 落地方式（产品化参考）

路径：`Video/mpv-android-anime4k-master`（`com.fam4k007.videoplayer`）。

### 3.1 架构要点

- **单模块** `:app`；Manager 半 MVVM + Koin + Room。
- 播放：`CustomMPVView` ← `is.xyz.mpv.BaseMPVView`；业务页 Compose。
- **无**仓库内 mpv/FFmpeg 源码构建；依赖预编译 **`app/libs/mpvlib.aar`**。
- Anime4K：`Anime4KManager` 首次把 `assets/shaders/*.glsl` 拷到 `filesDir/shaders/`，再 `MPVLib.setPropertyString("glsl-shaders", …)`。

### 3.2 与上游对齐情况

小喵 Mode A/B/C/A+/B+/C+ 拼链 **对齐官方 v4 推荐**（含 Clamp、AutoDownscale、Restore_Soft、Upscale_Denoise、后级降档）。额外：

- 可选 **Deblur_DoG**
- **gpu-next 与 Anime4K 互斥**（开 GPU Next 时自动禁用超分）
- 捆绑子集约 **17** 个 GLSL（S/M/L；不含上游全部 VL/UL/GAN/实验效果）

### 3.3 播放相关增强（相对原版 mpv-android）

硬解 `mediacodec`、MPV profile、字幕样式/字体目录、多音轨、softvol、均衡器、弹弹/B 站弹幕、WebDAV、网页嗅探、片头片尾、缩略图、后台听视频等。

**明确弱项 / 不做：** Cast；PiP 仅 Manifest 声明、代码侧未见完整进入；无 FongMi Spider。

---

## 4. Reader 影视模块现状

### 4.1 多核架构（摘要）

| 引擎 | 平台 | 角色 | 状态 |
|------|------|------|------|
| **artplayer** | 全端 WebView/MSE | Hub 在线主路 | ✅ |
| **libmpv**（libmpv2） | 桌面独立 VO 窗 | 本地/ASS/超分 | ✅ E2.1（需 DLL） |
| **external** mpv/VLC | 桌面 shell | 深度参数交接 | ✅ E1 |
| **media3** | 仅 Android | 可选核 | ✅ E2.A–E2.B |
| **Android libmpv** | Activity | 增强核 | ✅ E2.B–E2.D（需本地 AAR） |

协议与路由见 [VIDEO_PLAYBACK_KERNEL.md](./VIDEO_PLAYBACK_KERNEL.md)。  
**不做**：主壳挖洞嵌 mpv、帧回灌 Canvas、Cast/Cling、IJK、应用内 BT。

### 4.2 内容侧相对小喵的优势

Spider/CONFIG、换源/type4、LOCAL API、多机 sync、Kazumi 式追番规则、直播等——**无需向小喵补齐**。

### 4.3 Anime4K 实现缺口（对照上游）

> **桌面 P0 已落地**：官方 Mode 链、`resources/shaders` 捆绑、`video_resolve_anime4k_shaders_dir` 多候选、开播/热切换 `glsl-shaders` 写回校验、VO=GPU 与 hwdec-copy 策略。下表仅保留相对上游的细项差异（非「未实现」）。

实现：`src/lib/media/video/playback/anime4k.ts` + Rust `video_libmpv_*`。

| 项 | 上游 / 小喵 | Reader 当前 |
|----|-------------|-------------|
| Mode A/B/C / A+/B+/C+ | 官方链 | **已对齐官方 v4 文件名与组合**（见 anime4k.ts） |
| Clamp / Deblur | 链首 Clamp；可选 Deblur | Clamp 按官方；Deblur 可选 prefs |
| 内置资源 | 小喵 assets / 上游 `glsl/` | **已捆绑** `src-tauri/resources/shaders` |
| gpu-next 互斥 | 小喵有 | **已处理**（Force GPU VO / 可用性探测） |
| 播中热切换 | 小喵有 | **E2.1a** `video_libmpv_set_glsl_shaders` |
| Android Activity | 小喵完整 | **E2.B–E2.D** MPVView + 轨/Anime4K UI |

### 4.4 Android 增强核（E2.A–E2.D）

- 模块：`src-tauri/android/video-player/`（Media3 + 反射 MPVView）
- AAR 源：`src-tauri/android/libmpv/mpv-android-lib-*.aar`（gitignore；见 README）
- 命令：`video_android_open_player` / `video_android_libmpv_status`
- 校验：`scripts/android-mpvlib-check.ps1`；真机清单见 KERNEL §6.1

---

## 5. 能力对照总表

| 能力 | Anime4K 上游 | 小喵 | Reader | 补强方向 |
|------|--------------|------|--------|----------|
| Mode 定义 / GLSL 真源 | ✅ | 子集落地 | ✅ 桌面官方链 | 已闭环 |
| Android 原生可播 | — | ✅ | ✅ 需本地 AAR | 真机自验 |
| 桌面 libmpv 可播 | — | — | ✅ | `tauri:build:enhanced` |
| 轨 / 字幕 / 热切 Mode | — | ✅ | ✅ E2.1a | — |
| 硬解 / profile / HDR | — | ✅ | ✅ 最小 HDR prefs | **已决策后置** hdr-toys |
| 弹幕闭环 | — | ✅ | API ✅ / 主路 ✅；E3.1 ASS；**E2.G FlameMaster** | B站登录下载 → yt-dlp |
| 片库 / WebDAV / 嗅探 | — | ✅ | ✅ E2.1c–E2.5 | 路线图内闭环 |
| Spider / LOCAL / 追番 | — | ❌ | ✅ | 保持 Reader |
| B 站登录/下载番剧 | — | ✅ | ❌ | **建议不做** |
| Cast / 挖洞嵌 mpv | — | ❌ | ❌ Blocked | 一致 |

---

## 6. 补强可行性

### 6.1 高可行（优先）

#### P0 — Anime4K 链与资源对齐上游

| 项 | 说明 |
|----|------|
| 做什么 | 以 `Anime4K-master` + 小喵 `Anime4KManager` 为真源，重写 `buildAnime4KShaderFiles`；去掉错误 `v` 后缀；Clamp 置首；补 Soft/Denoise/AutoDownscale；可选 Deblur |
| 资源 | 从 `Video/Anime4K-master/glsl/` 抽取小喵同款 S/M/L 子集（或直接对齐小喵 17 文件），打包到桌面 `resources/shaders` 与 Android assets |
| 受益面 | 外置 mpv、桌面 libmpv、未来 Android libmpv **同时**受益 |
| 风险 | 低；纯 TS + 资源；注意路径分隔符 `:` / `;` |
| 许可 | 遵循 Anime4K 上游与捆绑声明；应用目标 GPL 与 libmpv 一致见许可文档 |

#### P1 — Android libmpv 最小可播

| 项 | 说明 |
|----|------|
| 做什么 | 引入预编译 AAR → 真 `VideoPlayerActivity`（Surface + MPVView）→ Gradle include → Rust `openPlayer` |
| 参考 | 小喵 `CustomMPVView` / `PlaybackEngine` 配置子集；**不**搬 Compose 业务壳 |
| 风险 | 包体、仅 arm64、Tauri 生命周期、与 Media3 双核 |
| 可行性 | **高**（小喵已证明 AAR 路径） |

#### P2 — 弹幕/字幕接线（E3）

API 已有；对齐小喵「匹配 → 下载 → 渲染」闭环。Artplayer 用现有插件；原生核可后接 FlameMaster 或先 XML 外挂。

### 6.2 中等可行（增强核深化）

- `hwdec=mediacodec,…`、ao、MPV profile、gpu vs gpu-next（与 Anime4K 互斥）
- `listAudioTracks` / `listSubtitleTracks` 等协议补全
- 缩略图 / 章节 / softvol / 均衡器（后置）

### 6.3 低可行 / 不建议

| 项 | 原因 |
|----|------|
| 整仓移植小喵（Koin/Room/27 Screen） | 与 Tauri+Solid 冲突；片库/设置重复 |
| B 站登录 + 在线番剧 + 下载 | 风控与版权面；Reader 已有 Kazumi + Spider |
| 仓库内自建 mpv/FFmpeg | 小喵亦无；继续 AAR / 系统 libmpv |
| WebView 挖洞 / 帧回灌 | 内核文档明确拒绝 |
| 主路全面改 mpv | 破坏 Hub 在线流与跨端一致性 |
| 捆绑全部 VL/UL/GAN/实验 shader | 包体与维护成本高；S/M/L 足够产品默认 |

---

## 7. 落地顺序与路线图外候选项

```text
桌面 E2.2–E2.5 ∥ Android E2.A–E2.D（已完成，ROADMAP 已收口）
  ├─ 封面 / softvol / 章节 / 简易 EQ
  └─ Media3 → MPVView → android/libmpv AAR 直引
路线图外候选项（非未完成必做；需先改 KERNEL 延期条款再开里程碑）
  · hdr-toys 子集
  · B 站登录/下载（统一登录层 + yt-dlp）
  · 真机带 AAR 回归（清单见 KERNEL §6.1）
```

**原则：**

1. 内容壳继续用 Reader（Spider / 番剧 / LOCAL）。  
2. 超分真源用 **Anime4K-master**；产品拼链可对拍 **小喵 Anime4KManager**。  
3. 播放体验向小喵借配置与 Activity 模式；主路仍为 Artplayer。

---

## 8. 实现落点速查（Reader）

| 主题 | 路径 |
|------|------|
| Anime4K 拼链 | `src/lib/media/video/playback/anime4k.ts` |
| 播放偏好 | `src/lib/media/video/playback/prefs.ts` |
| libmpv 引擎 | `src/lib/media/video/playback/libmpv-engine.ts` |
| 外置 mpv | `src/lib/media/video/playback/external-mpv.ts` |
| Android TS 入口 | `src/lib/media/video/playback/android-player.ts` |
| Rust 命令 | `src-tauri/src/video_playback.rs` |
| Android 插件 | `src-tauri/android/video-player/` |
| 设置 UI | `TvSettingsPane.tsx` / 播控增强按钮 |

| 参考实现 | 路径 |
|----------|------|
| 官方 Mode / 高级说明 | `Video/Anime4K-master/md/GLSL_Instructions_Advanced.md` |
| 官方 GLSL | `Video/Anime4K-master/glsl/` |
| 小喵拼链 | `…/domain/player/Anime4KManager.kt` |
| 小喵 mpv 选项 | `…/player/CustomMPVView.kt` |
| 小喵 shader 资产 | `…/app/src/main/assets/shaders/` |

---

## 9. 风险与约束

1. **GPL / 动态库**：捆绑 libmpv 与衍生播控须遵守 GPL 发行义务；根 `package.json` / `LICENSE` 已标 **GPL-3.0-or-later**（见 VIDEO_LIBMPV_LICENSE.md；README / 关于页已互链）。  
2. **AAR 供应链**：锁定版本与 ABI；无源码构建时需自行审计更新渠道。  
3. **性能**：中端机 Anime4K + 硬解压力大；必须保留 quality 档位与 gpu-next 互斥。  
4. **双核进度**：独立窗/Activity 与 Hub 续播统一 `video_play_record`。  
5. **预期管理**：抄齐小喵 ≠ Android 影视完成；在线点播仍靠 Artplayer/Media3。

---

## 10. 验收建议（补强后）

| 项 | 通过标准 |
|----|----------|
| P0 Mode A（balanced） | 拼链文件名与官方/小喵一致；本地 mpv/libmpv 加载无缺文件；画面相对 off 有可见线重建 |
| P0 资源 | 安装包/开发目录含 Clamp、Restore(+Soft)、Upscale、Upscale_Denoise、AutoDownscale×2 |
| P1 Android | `video_android_open_player` 可打开 Activity，本地文件出画出声 |
| P2 | 设置切换 Anime4K Mode 运行时生效；gpu-next 开启时超分自动关或提示 |
| 回归 | Artplayer 主路 Hub 点播不受影响；外置 mpv 仍可带 `--glsl-shaders` |

---

## 11. 明确不做（本文范围）

- 移植小喵 B 站登录/下载/完整 Compose 壳  
- 将 Anime4K 做成 WebGPU/Canvas 主路（与「仅 libmpv」策略冲突；上游虽有 WebGPU 社区实现，本仓不采纳为主路径）  
- 承诺 Widevine L1、完整 DLNA、应用内 BT  
- 用停更的 ParadoxSpiral/libmpv-rs  

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-23 | 初稿：三方差异、官方 Mode、可行性与 P0–P5 |
