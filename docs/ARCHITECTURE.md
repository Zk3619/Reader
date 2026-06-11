# Reader 架构：前端优先分层

对标 **Legado_Max-main** 的能力，在 **Tauri 2 + SolidJS** 上采用「**TypeScript 承载业务，Rust 承载平台**」架构。与 `legado/docs/architecture-analysis.md` 一致：**排版、手势、主题、翻页动画不得下沉到 Rust**。

---

## 1. 分层总览

```
┌────────────────────────────────────────────────────────────────────┐
│  Presentation（SolidJS + Tailwind v4 + lucide-solid + Kobalte）   │
│  pages/* · components/* · stores/*                                 │
│  排版 · 翻页 · 主题 · 手势 · 阅读器 UI · 书源/书架管理界面          │
├────────────────────────────────────────────────────────────────────┤
│  Application（TypeScript）                                         │
│  lib/book-source · lib/rule-engine · lib/local-book · lib/http    │
│  lib/remote-book · stores · types                                  │
│  QuickJS 沙箱 · cheerio/fontoxpath/jsonpath · 正文净化/替换        │
├────────────────────────────────────────────────────────────────────┤
│  Platform Adapter（TypeScript）                                    │
│  lib/platform/{database,fs,config,storage}.ts                      │
│  分支：Tauri invoke / plugin-* · Web sql.js / fetch                │
├────────────────────────────────────────────────────────────────────┤
│  Tauri Plugins（优先官方）                                          │
│  sql · http · fs · store · dialog · notification · shell · …      │
├────────────────────────────────────────────────────────────────────┤
│  Rust Shell（src-tauri，尽量薄）                                    │
│  数据根/便携 config · 二进制下载 · GBK · 登录脚本(Boa) · 协议开窗     │
│  单实例 · 托盘(可选) · 未来：自定义 legado:// 协议                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## 2. 决策矩阵：放哪一层？

| 能力 | 首选 | 次选 | 说明 |
|------|------|------|------|
| 书源搜索/发现/目录/正文 | **TS** `lib/book-source` | — | 与 Max `WebBook` 对齐 |
| 规则 XPath/CSS/JSON/正则 | **TS** `rule-engine` | — | fontoxpath + cheerio |
| 书源 `@js` / loginCheckJs | **TS** QuickJS | Rust Boa | 登录复杂场景可用现有 Boa |
| 正文替换 ReplaceRule | **TS** | — | 阅读前 pipeline |
| 章节缓存 `.nb` 语义 | **TS** + fs 插件 | — | 路径规则对齐 `BookHelp` |
| EPUB/TXT 阅读 | **TS** epubjs/txt | Rust 解析 | MOBI/UMD/PDF 后期评估 |
| SQLite / DAO | **TS** + sql 插件 | — | schema 已对齐 Legado |
| HTTP 请求/Cookie | **plugin-http** + TS 封装 | Rust reqwest | 仅当插件不足（证书、代理） |
| WebDAV | **TS** | — | 已有 `remote-book` |
| 阅读排版/分页 | **TS** DOM/CSS | — | 禁止 Rust layout |
| TTS 朗读 | **Web Speech** / 平台 API | Tauri 插件 | Max 有 HttpTTS 表 |
| 系统通知/后台 | 插件 notification | — | 移动端再强化 |
| 文件选择/保存 | plugin-dialog + fs | — | |
| 深链 `legado://import` | Rust 注册协议 | TS 解析 URI | 参考 Yeader protocol |
| 内置 Web 管理页 | 可选 Solid 路由 | 不嵌入 Vue | Max 的 modules/web 作 **API/字段** 参考 |
| Cronet/HTTP3 | 不做 | — | 桌面用系统网络栈即可 |

---

## 3. 前端目录约定（目标态）

```
src/
├── pages/                    # 与 Max 主 Tab + 独立页面对齐
│   ├── bookshelf/
│   ├── sources/              # 书源 + 编辑 + 调试
│   ├── rss/                  # RSS 订阅（主列表、源管理、编辑、文章、阅读、规则订阅、收藏）
│   ├── bookmark/
│   ├── record/               # 阅读记录
│   ├── discover/
│   ├── book-info/
│   ├── reader/
│   ├── settings/
│   └── debug/                # Max 调试台（规划）
├── components/
│   ├── layout/               # Navigation, SideBar, BottomBar
│   ├── reader/
│   ├── sources/
│   ├── rss/
│   └── ui/                   # shadcn 风格基元
├── stores/                   # 与 Max ViewModel 职责对应
├── lib/
│   ├── book-source/          # WebBook 等价
│   ├── rule-engine/          # AnalyzeRule 等价
│   ├── local-book/
│   ├── database/             # Room 等价
│   ├── http/
│   ├── remote-book/          # WebDAV
│   ├── backup/               # Legado 备份 zip（规划）
│   ├── import/               # legado:// 与文件导入
│   ├── rss/                  # 订阅列表筛选、分组
│   ├── rss-source/           # sortUrl、刷新文章、规则订阅更新、调试
│   └── platform/
└── types/                    # Book, BookSource, RssSource…
```

**路由**：建议引入 `@solidjs/router`，将 `App.tsx` 的 `PageType` 信号逐步改为 URL 路由（利于 Web 版与深链）。

---

## 4. Rust 边界（当前与规划）

### 4.1 当前已实现（保持精简）

| 命令/模块 | 职责 |
|-----------|------|
| `get_app_data_root` / `get_config` / `set_config` | 便携模式、数据目录 |
| `download_binary` / `fetch_url_text` | 绕 CORS、大图、证书 |
| `decode_gbk` | 编码 |
| `run_login_script_rust` | Legado 登录脚本（java.ajax） |
| `prepare_login_open` / `open_url_with_cookies` | 登录 WebView |
| 单实例、prevent-default | 桌面体验 |

### 4.2 仅当出现明确缺口时扩展

- `legado://` 系统协议注册（桌面）
- 大文件 MOBI/PDF 解析（性能）
- 系统级 TTS（移动端）
- 与 Max 对等的**本地** HTTP 服务（一般 **不推荐** 第一期；可用纯前端或后续插件）

### 4.3 禁止膨胀的方向

- 在 Rust 复刻 `AnalyzeRule` / `WebBook`（已与 TS 重复）
- 在 Rust 做 `ChapterProvider` 式排版
- 为每个书源 API 写独立 command（应统一走 TS 引擎 + http 插件）

---

## 5. 数据与缓存

### 5.1 数据库

- 名称语义：`legado.db`（或 Reader 统一 data 目录下 sqlite）
- 表：与 Max `AppDatabase` 对齐（`books`、`book_sources`、`chapters`、`rss*`、`replace_rules`、`readRecord*`…）
- 迁移：版本号独立维护，参考 Max schema JSON：`Legado_Max-main/app/schemas/`

### 5.2 章节缓存

Max 路径：`{externalFiles}/book_cache/{书名_作者}/{序号-标题MD5}.nb`

Reader：在 `lib/platform/fs` 实现相同命名规则，**逻辑在 TS**，读写走 fs 插件。

### 5.3 备份

Max：`Backup.kt` 导出 DB + 配置 + 书源等（通常 **不含** `book_cache`）。

Reader 规划：`lib/backup/` 读 Legado zip 结构（可参考 Yeader `fixtures/legado/backups/`）。

---

## 6. 书源引擎（前端）流水线

与 `Legado_Max-main/Structure/书源解析流程.md` 对齐：

```
BookSource JSON
  → AnalyzeUrl（模板变量 {{page}}、Header、Cookie）
  → HTTP（plugin-http / fetch）
  → loginCheckJs?（QuickJS / Boa）
  → AnalyzeRule（css | xpath | json | regex | @js）
  → SearchBook | Book | BookChapter | content
  → ContentProcessor（ReplaceRule）
  → Reader 排版渲染
```

**Max 特有**：`@webjs`、智能导入 — 需在 `rule-engine` 单独登记兼容表与测试用例。

---

## 7. 跨平台（桌面 + 移动）

| 能力 | 桌面 | 移动 | 手段 |
|------|------|------|------|
| 存储 | ✅ | ✅ | plugin-sql + fs |
| 网络 | ✅ | ✅ | plugin-http |
| 文件导入 | 对话框 | SAF/URI | dialog + 平台分支 |
| 窗口/托盘 | ✅ | — | 仅桌面 |
| 安全区/手势 | 响应式 CSS | 触摸翻页 | 前端 |
| 后台朗读 | 可选 | 需插件 | 后期 |

`lib/platform/*` 是所有 `#cfg(mobile)` 的 **TS 等价物**，避免业务页直接 `import { invoke }`。

---

## 8. UI 技术栈统一

| 项 | 目标 |
|----|------|
| 组件 | Kobalte + `components/ui/*`（cva + tailwind-merge） |
| 图标 | **lucide-solid**（替换 `components/icons.tsx`） |
| 样式 | Tailwind v4 `@import "tailwindcss"` |
| 主题 | CSS 变量 + `stores/settings`（对齐 Max 日/夜间） |

布局规范见 [UI.md](./UI.md)。

---

## 9. 测试策略

1. **夹具驱动**：从 Yeader `fixtures/legado` 或自建 `Reader/fixtures/legado` 复制书源/备份样例。  
2. **规则单测**：对 `rule-engine` 做 Vitest，输入 HTML/JSON 快照。  
3. **对比基准**：同一书源在 Max Android 与 Reader 搜索/目录/正文 diff（人工+脚本）。  
4. **禁止**：未迁移的双引擎（Rust+TS 各跑一套规则）长期并存。
