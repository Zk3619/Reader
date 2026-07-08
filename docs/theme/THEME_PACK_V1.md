# Reader Theme Pack v1

商业级自定义主题包规范（`.reader-theme.json` / `.reader-theme.zip`）。

## 顶层结构

| 字段 | 类型 | 说明 |
|------|------|------|
| `schemaVersion` | `1` | 固定为 1 |
| `id` | string | UUID |
| `name` | string | 显示名称 |
| `scopes.app` | boolean | 是否包含主程序壳层 |
| `scopes.viewer` | boolean | 是否包含阅读器 |
| `app` | AppThemeSection | 壳层语义色、组件覆盖 |
| `viewer` | ViewerThemeSection | 各阅读器分轨 |
| `advanced` | AdvancedThemeSection | CSS / HTML / 特效 |
| `assets` | ThemeAssetManifest | ZIP 内资源索引 |

## App 段

- `mode`: `light` | `dark` | `dual`
- `tokens`: 对齐 `AppThemeDefinition`（`light` / `dark` 语义色 + `layout`）
- `components`: 按 `AppComponentId` 的 `ComponentStyleOverride`
- `typography` / `motion`: 全局排版与动效 token

## Viewer 段

- `shared`: MediaViewer chrome token
- `text` / `image` / `audio` / `video` / `file`: 分阅读器类型
- `text.paletteId`: 0–8 或 `custom`
- `text.surfaceAppearance`: content / chrome / pageTip / brightness
- `contentBackground` / `chromeBackground`: `ContainerBackgroundConfig`

## 容器背景 ContainerBackgroundConfig

```json
{ "type": "solid", "color": "#ffffff" }
{ "type": "gradient", "stops": [{ "color": "#fff", "at": "0%" }], "angle": 180 }
{ "type": "asset", "assetId": "bg-main", "fit": "cover", "opacity": 80, "blurPx": 4 }
{ "type": "none" }
```

## Advanced 段

### tsParticles 背景层 (`advanced.threeJs`)

Schema 字段名保留 `threeJs` 以兼容；运行时由 **@tsparticles/slim** 驱动。

预设：`particles` | `stars` | `snow` | `firefly` | `links` | `bubbles` | `aurora`

可选 `optionsJson` 覆盖 tsparticles 配置。

### 鼠标特效

| type | 引擎 | 说明 |
|------|------|------|
| `mouseTrail` | 自研 Canvas | 容器内拖尾（预览沙盒） |
| `mouseGlow` | 自研 CSS | 光标光晕 |
| `clickParticles` | mouse-animations | 点击粒子（应用主题后全局） |
| `clickRipple` | mouse-animations | 点击涟漪 |
| `customCursor` | mouse-animations Image/CustomCursor | 图片指针或多状态指针 |

### 组件容器背景 (`app.components.*.background`)

**App 壳层：** `appShell` · `pageContent` · `sidebar` · `sidebarNav` · `sidebarRecent` · `sidebarHeader` · `sidebarFooter`

**卡片：** `bookshelfCard` · `settingsCard` · `recordCard` · `surfaceCard`

**浮层：** `dialog` · `drawer` · `dropdown` · `select` · `combobox` · `contextMenu` · `toast`

**阅读器 Chrome：** `toolbarHeader` · `footerChrome`（`viewer.components.*`）

Studio「背景」页支持上传 + 不透明度 / 模糊 / fit 微调；布局 token 带格式校验与 px 预览标尺。

ZIP 导入时 `assets/` 写入 `{appData}/themes/{presetId}/assets/`（Tauri）或 OPFS `reader-themes/`（Web）。

### ThemeEffectConfig（内置）

| type | 说明 |
|------|------|
| `mouseTrail` | Canvas 鼠标拖尾（容器内） |
| `mouseGlow` | 光标 radial-gradient 光晕 |
| `backgroundParallax` | 背景随指针微移 |
| `backgroundRipple` | 点击涟漪（预留） |
| `noiseOverlay` | 颗粒层（预留） |

### 安全约束

- `customCss` 禁止 `@import`、全屏 `position: fixed`
- `customHtml` 经 DOMPurify，禁止 `<script>`
- z-index 栈：`background < content < chrome < effects < modal`

## ZIP 布局

```
theme.json
assets/
  bg-main.webp
preview.png   (可选)
```

## Legado 导入

`themeConfig.json` 数组可通过 `legado-theme-adapter.ts` 转为 `ReaderThemePackV1`（app 段）。

## 运行时

- `applyThemePackToElement(el, pack, { preview: true })` — 沙盒预览
- `applyActiveThemePackToDocument(pack)` — 激活应用壳层
- 解析优先级：Studio draft > 激活预设 > 书籍 override > 内置默认
