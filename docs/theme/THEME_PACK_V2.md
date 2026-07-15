# Reader Theme Pack v2 — 社区分享指南

Theme System v2 在 v1 规范（`.reader-theme.json` / `.reader-theme.zip`）基础上，增加了快速生成、质量门禁、性能预算与社区分发工作流。

## 包格式（与 v1 兼容）

| 文件 | 说明 |
|------|------|
| `theme.json` | 主题包清单（`schemaVersion: 1`） |
| `preview.png` | 可选缩略图，ZIP 导出时由主题工作室自动生成 |
| `assets/` | 图片、视频、指针图等资源 |

推荐扩展名：`.reader-theme.json`、`.reader-theme.zip`

## 分享前检查清单

1. **填写元信息**：`meta.author`、`meta.description`（建议）
2. **对比度**：`accessibility.targetContrast` 默认 AA；导出时可启用 `enforceOnExport`
3. **性能**：高级模式中查看性能徽章；避免同时启用过多模糊层与 tsParticles
4. **预览图**：从主题工作室导出 ZIP 会自动附带 `preview.png`
5. **作用域**：在 `scopes` 中明确包含 `app` / `viewer`

## 质量门禁（导出时）

主题工作室高级模式会运行 `runThemePackQualityGate`，检查项包括：

- 浅色/深色语义色关键前景/背景对比度
- 模糊层数量（超过 3 层警告）
- 自定义 CSS 禁止模式（`@import`、`position: fixed`、`javascript:`）
- 资产体积（默认上限 15MB）
- 是否包含 `preview.png`

## 性能预算

`evaluateThemePackPerformanceBudget` 根据以下指标给出绿/黄/红评级：

- 已启用鼠标/背景特效数量
- tsParticles 是否开启
- backdrop-filter 模糊层数
- 自定义 CSS / HTML 块数量
- 资产总体积

## 导入与合并策略

批量导入（主题管理页 / 本地目录扫描）按 `pack.id` 去重合并：

| 选项 | 行为 |
|------|------|
| 保留名称 | 已存在预设时保留本地显示名 |
| 保留激活预设 | 当前激活的应用/阅读器预设不被覆盖 |
| 覆盖 ZIP 资产 | `false` 时保留本地已有 `assets` 清单 |

默认勾选：新增主题，或 incoming `updatedAt` 晚于本地的更新项。

## 备份与迁移

全量备份 ZIP 可包含 `themePresets.json`（用户与导入预设，不含内置默认）。恢复时写入 Themes 目录并触发预设列表刷新。

## Legado 适配

仍支持 Legado `themeConfig.json` 导入；工作室与适配器会映射到 Reader Theme Pack v1 结构。

## 社区分发建议

1. 在 README 或帖子中注明：主程序 / 阅读器作用域、依赖资产列表、推荐设备性能档位
2. 附带 `preview.png` 与简短变更说明（对比度、阅读配色编号等）
3. 大体积视频背景建议单独托管或提供轻量替代包
4. 使用主题管理页「导出所选」批量分享多个 JSON

## 相关路径

- 用户预设目录：`{appData}/Themes/*.json`（Tauri）或 OPFS `reader-themes/`（Web）
- 主题资产：`{appData}/themes/{presetId}/assets/`
- 文档：[`THEME_PACK_V1.md`](./THEME_PACK_V1.md)
- 模块独立主题与继承：[`THEME_PACK_V3.md`](./THEME_PACK_V3.md)
