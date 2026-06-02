# Reader 改造文档索引

本目录为将 **Reader** 改造成对标 **Legado_Max-main（阅读 Max）** 的跨平台阅读器（**Tauri 2 + SolidJS + lucide-solid + Tailwind CSS v4**）提供设计与实施依据。

## 文档清单

| 文档 | 用途 |
|------|------|
| [LEGADO_MAX_MIGRATION.md](./LEGADO_MAX_MIGRATION.md) | **主文档**：目标、原则、模块映射、书源引擎、数据层、UI 规范 |
| [PROJECT_COMPARISON.md](./PROJECT_COMPARISON.md) | 六仓库对比：legado / legado-main / Legado_Max / read-main / Yeader / Reader |
| [FEATURE_MATRIX.md](./FEATURE_MATRIX.md) | Legado Max 功能清单 vs Reader 完成度与优先级 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 分层架构：前端优先 → Rust → Tauri 插件 |
| [DATABASE.md](./DATABASE.md) | 数据库：兼容 Max、增量迁移、优化策略 |
| [ROADMAP.md](./ROADMAP.md) | 分阶段实施路线与验收标准 |
| [UI.md](./UI.md) | 顶栏/侧栏/书架响应式 UI 规范（已有） |
| [text-viewer-latent-capabilities.md](./text-viewer-latent-capabilities.md) | 文本阅读器已实现但未启用/未接数据的段评与 UI 能力说明 |
| [PORTABLE.md](./PORTABLE.md) | 便携模式与数据目录（已有） |

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

1. `PROJECT_COMPARISON.md` — 了解各仓库角色  
2. `LEGADO_MAX_MIGRATION.md` — 理解映射关系  
3. `ARCHITECTURE.md` — 定分层边界  
4. `FEATURE_MATRIX.md` + `ROADMAP.md` — 排期开发  
5. `UI.md` — 实现界面时对照  

外部补充：`legado/docs/cross-platform-guide.md`、`legado/docs/architecture-analysis.md`。
