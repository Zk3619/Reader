# MediaBox / Reader 改造文档索引

本目录同时覆盖两层叙事：

1. **主壳 + 子模块**（MediaBox = 阅读 / 音频 / 视频 / 订阅…）——见 [SHELL_MODULE_MIGRATION.md](./SHELL_MODULE_MIGRATION.md)  
2. **阅读子模块对标 Legado Max**（历史主线）——见下方 LEGADO / DATABASE / ROADMAP 等

技术栈：**Tauri 2 + SolidJS + lucide-solid + Tailwind CSS v4**。

## 文档清单

| 文档 | 用途 |
|------|------|
| [SHELL_MODULE_MIGRATION.md](./SHELL_MODULE_MIGRATION.md) | **壳架构总纲**：拆分组、模块前缀、`audio`/`video` 命名、数据库目标结构 |
| [RENAME_CHECKLIST_AUDIO_VIDEO.md](./RENAME_CHECKLIST_AUDIO_VIDEO.md) | **重命名清单**：`music`→`audio`、`tv`→`video` 的目录/文件（不改代码） |
| [LEGADO_MAX_MIGRATION.md](./LEGADO_MAX_MIGRATION.md) | 阅读子模块：目标、原则、模块映射、书源引擎、数据层、UI 规范 |
| [PROJECT_COMPARISON.md](./PROJECT_COMPARISON.md) | 六仓库对比：legado / legado-main / Legado_Max / read-main / Yeader / Reader |
| [FEATURE_MATRIX.md](./FEATURE_MATRIX.md) | Legado Max 功能清单 vs Reader 完成度与优先级（部分行已滞后，以 Backlog 为准） |
| [READING_PRIORITY_BACKLOG.md](./READING_PRIORITY_BACKLOG.md) | **近端阅读补齐**：webjs/校源/本地格式/TTS调试/漫画滤镜等，含 Max 增强取舍 |
| [AI_CAPABILITY_ROADMAP.md](./AI_CAPABILITY_ROADMAP.md) | **主程序级 AI 规划**（跨阅读/音乐/影视）；未立项，勿在阅读域孤立接入 |
| [VIDEO_CAPABILITY_ROADMAP.md](./VIDEO_CAPABILITY_ROADMAP.md) | **影视域补齐**：FongMi/TVBox + 阶段 E；与小喵/Kazumi 差距矩阵 |
| [VIDEO_PLAYBACK_KERNEL.md](./VIDEO_PLAYBACK_KERNEL.md) | **播放多核**：Artplayer / libmpv2 / Media3 / 外置；E2.1 可播门槛 |
| [VIDEO_WEB_ENHANCE.md](./VIDEO_WEB_ENHANCE.md) | **Web/Rust 超分+补帧**：管线档位、MediaClock、门禁 A–C |
| [VIDEO_RIFE.md](./VIDEO_RIFE.md) | **实时补帧**：mpv VS + Web ORT 双栈 |
| [VIDEO_LIBMPV_LICENSE.md](./VIDEO_LIBMPV_LICENSE.md) | **GPL-3.0-or-later 开源定调** + libmpv 义务清单（非律师意见） |
| [VIDEO_BANGUMI_KAZUMI.md](./VIDEO_BANGUMI_KAZUMI.md) | **番剧对齐 Kazumi**：规则隔离、UI 架构、E6.1 验收 |
| [VIDEO_LOCAL_API.md](./VIDEO_LOCAL_API.md) | 影视本地 HTTP API（9978）子集：action/sync/device/cache |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 分层架构：前端优先 → Rust → Tauri 插件 |
| [DATABASE.md](./DATABASE.md) | **阅读域**数据库：兼容 Max、增量迁移、优化策略（整 App 策略以 SHELL_MODULE 为准） |
| [ROADMAP.md](./ROADMAP.md) | 阅读子模块分阶段实施路线与验收标准 |
| [UI.md](./UI.md) | 顶栏/侧栏/书架响应式 UI 规范（已有） |
| [text-viewer-latent-capabilities.md](./text-viewer-latent-capabilities.md) | 文本阅读器已实现但未启用/未接数据的段评与 UI 能力说明 |
| [PORTABLE.md](./PORTABLE.md) | 便携模式与数据目录（已有） |
| [cache-export-media-convert.md](./cache-export-media-convert.md) | 缓存导出选项、格式转换平台降级、移动端 ffmpeg 说明 |

## 参考仓库（工作区根目录）

```
D:\Projects\Rust\Reader\
├── Legado_Max-main/    ← 功能与体验的主要参考目标
├── legado/             ← 官方 Legado + 跨平台重构 docs/
├── legado-main/        ← 阅读 Sigma（与 legado 同源）
├── read-main/          ← 轻阅读服务端（同步/API 参考）
├── Yeader-main/        ← Tauri+Rust 模块化参考
└── Reader/             ← 本项目的实现载体
```

## 核心原则（摘要）

1. **对标 Legado Max**：功能清单、数据模型、Web API 语义以 Max 为准，不直接移植 Android/Compose 代码。
2. **逻辑前端优先**：书源规则、排版、状态机在 TypeScript；Rust 仅做平台能力与性能瓶颈。
3. **Tauri 插件最后**：文件、HTTP、SQL、通知等优先用官方插件；自定义插件留给跨端缺口。
4. **一套 UI 栈**：SolidJS + Tailwind v4 + lucide-solid + Kobalte/shadcn 风格组件。

## 建议阅读顺序

1. `SHELL_MODULE_MIGRATION.md` — **先读**：主壳边界、命名与数据库迁往何处  
2. `PROJECT_COMPARISON.md` — 了解各上游仓库角色  
3. `LEGADO_MAX_MIGRATION.md` — 阅读子模块与 Legado 映射  
4. `ARCHITECTURE.md` — 定分层边界  
5. `FEATURE_MATRIX.md` + `ROADMAP.md` — 阅读能力排期  
6. `UI.md` — 实现界面时对照  

外部补充：`legado/docs/cross-platform-guide.md`、`legado/docs/architecture-analysis.md`。
