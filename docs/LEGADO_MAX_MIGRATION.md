# Legado Max → Reader 改造主文档

将 **Reader** 打造成对标 **Legado_Max-main（阅读 Max）** 的跨平台阅读器：**Tauri 2.0 + SolidJS + lucide-solid + Tailwind CSS v4**。  
本文是实施时的**单一事实来源**（与 [ARCHITECTURE.md](./ARCHITECTURE.md)、[FEATURE_MATRIX.md](./FEATURE_MATRIX.md) 配套）。

---

## 1. 改造目标

### 1.1 产品目标

| 维度 | 目标 |
|------|------|
| 功能 | 覆盖 Max 核心路径：书源 → 搜索/发现 → 书架 → 阅读 → 备份/WebDAV |
| 兼容 | Legado 3.x 书源 JSON、备份包、`legado://import/` 协议 |
| 体验 | Max 级阅读配置 + Reader 已有响应式壳（见 UI.md） |
| 平台 | 桌面优先交付，架构预留 iOS/Android（Tauri mobile） |

### 1.2 非目标（第一期不做）

- 复刻 Android Compose/View 实现
- 内置 NanoHTTPD 局域网服务（可第三期按需）
- 轻阅读（read-main）完整账号云
- 100% Max 调试台 UI 像素级一致

### 1.3 技术约束（用户要求）

1. **逻辑前端优先**：书源、规则、排版、状态机在 TypeScript。  
2. **Rust 次之**：配置路径、编码、登录脚本、插件无法覆盖的网络/协议。  
3. **Tauri 插件最后**：官方 `sql`/`http`/`fs`/`dialog` 等先用足，再写自定义插件。

---

## 2. Legado Max 核心架构摘要

> 详见 `Legado_Max-main/Structure/` 与 [PROJECT_COMPARISON.md](./PROJECT_COMPARISON.md)

```
UI (ui/) ──► ViewModel 状态
     │
model/  WebBook · AnalyzeRule · ReadBook · LocalBook · CacheBook
     │
data/   Room legado.db v96
     │
help/   BookHelp · ContentProcessor · AppWebDav · Backup
     │
modules/rhino (JS) · modules/book (EPUB/UMD) · modules/web (Vue3 管理页)
     │
web/    HttpServer :1234 · WebSocket :1235
```

**阅读数据流**（网络书）：

`BookSource` → `WebBook.getContent` → `AnalyzeRule` → `ContentProcessor(ReplaceRule)` → `ReadBook` 三章节缓冲 → 阅读 UI 排版。

---

## 3. Reader 现状摘要

| 已有 | 缺失/弱 |
|------|---------|
| TS 书源引擎（搜索/发现/目录/正文） | 书源**编辑**、**WS 调试** |
| 书架分组与布局 | RSS/书签/阅读记录 **页面** |
| 阅读器主题/目录/进度 | 替换规则管理、批量缓存、换源 |
| SQLite schema 对齐 | @webjs、HttpTTS、漫画 |
| WebDAV 远程书 | lucide-solid、@solidjs/router |
| 便携模式、DB 备份 | Max 调试台 |

---

## 4. 模块级映射与实施要点

### 4.1 书源（P0）

**Max 参考**

- `app/.../data/entities/BookSource.kt` — JSON 字段
- `app/.../model/webBook/WebBook.kt`
- `app/.../model/analyzeRule/AnalyzeRule.kt`、`AnalyzeUrl.kt`
- `api.md` — WebSocket `bookSourceDebug`

**Reader 目标**

| 文件/目录 | 动作 |
|-----------|------|
| `src/lib/book-source/` | 保持为 WebBook 唯一实现；补全与 Max 差异 API 列表 |
| `src/lib/rule-engine/` | 登记 `@webjs`、loginCheckJs 兼容矩阵 |
| `src/pages/sources/` | **新增** `SourceEditPage`：表单字段对齐 `modules/web/src/config/bookSourceEditConfig.ts` |
| `src/lib/debug/` | **新增** WebSocket 客户端，对接本地或未来嵌入式服务；MVP 可先 **进程内模拟调试**（不启 1234 端口） |
| `src/components/SourceQrImport.tsx` | 二维码扫描/粘贴导入 |

**原则**：规则执行**不迁 Rust**；Yeader 的 `yeader-rules` 仅作对照测试，不引入第二引擎。

**JS 运行时**

| 场景 | 引擎 |
|------|------|
| 书源规则 `@js` | quickjs-emscripten（主） |
| loginCheckJs / 复杂 ajax | 现有 Boa（`run_login_script_rust`）可保留 |
| Max `@webjs` | 需在 TS 实现或文档声明不支持项 |

### 4.2 书架（P1）

**Max 参考**：`ui/main/bookshelf`、`help/book/BookHelp.kt`

| 功能 | Reader 落点 |
|------|-------------|
| 更新目录 | `bookshelf` store 调 `WebBook.getChapterList` + 写 chapters 表 |
| 缓存/导出 | `lib/cache/chapter-cache.ts` + fs 插件，路径同 Max `.nb` |
| 导出书单 | 导出 JSON 数组（books 表筛选） |
| 顶栏「更多」菜单 | 绑定 `Navigation.tsx` 各 `onSelect` |

### 4.3 阅读器（P1）

**Max 参考**：`model/ReadBook.kt`、`ui/book/read/*`

| 功能 | Reader 落点 |
|------|-------------|
| 排版 | `ReaderContent.tsx` + CSS 变量（**禁止** Rust layout） |
| 替换规则 | `ContentProcessor` 等价 TS 模块 + 设置页 CRUD |
| 书签 | `bookmarks` DAO + 阅读页长按/菜单 |
| 双页 | `reader` 布局模式（bugs.txt） |
| 预加载 | `readerStore` 上一章/下一章与 Max `preDownload` 对齐 |

### 4.4 订阅 RSS（P1）

**Max 参考**：`model/rss/`、`ui/rss/`

**Reader 现状**（`pages/rss/` + `components/rss/` + `lib/rss-source/`）：

| 步骤 | 动作 | 状态 |
|------|------|------|
| 1 | `pages/rss/` 源列表 CRUD、导入、拖拽排序、分组筛选 | ✅ |
| 2 | 文章列表 + 阅读页 + 收藏 | ✅ |
| 3 | RSS 规则解析与源调试面板 | 🟡（无 WebSocket 调试台） |
| 4 | 规则订阅 `RuleSubPage` | 🟡 |

`PageType` 为 `"rss"`（界面文案仍为「订阅」）；持久化偏好兼容旧键 `subscription_page_prefs`。

### 4.5 阅读记录与书签（P1）

- `pages/bookmark/`、`pages/record/` 接 `bookmarks`、`readRecord` 表  
- 阅读时长：前端计时器 + 会话写入（对齐 Max `ReadRecordSession` 语义）

### 4.6 备份与 WebDAV（P1）

**Max 参考**：`help/storage/Backup.kt`、`help/AppWebDav.kt`

| 功能 | Reader |
|------|--------|
| 本地 zip 备份 | 扩展 `DatabaseBackup`：包含书源 JSON + config |
| 恢复 | 解析 Legado zip（参考 Yeader `fixtures/legado/backups/`） |
| WebDAV | 完善 `lib/remote-book`，进度文件路径与 Max 一致 |

### 4.7 发现（已基本完成）

保持 `DiscoverPage` + `exploreUrl` / explore 规则；与 Max `ExploreFragment` 行为对照测试即可。

### 4.8 本地书（P2）

| 格式 | Max | Reader 计划 |
|------|-----|-------------|
| TXT | TextFile | ✅ |
| EPUB | modules/book | ✅ epubjs |
| UMD | modules/book | 评估 JS 移植或 Rust 薄封装 |
| MOBI/PDF | MobiFile/PdfFile | P2：Rust 或 wasm 解码 |

### 4.9 朗读 TTS（P2）

**Max**：系统 TTS + `httpTTS` 表 + `TTSReadAloudService`

**Reader**：

1. 桌面：`speechSynthesis` 或系统 API  
2. HttpTTS：TS 请求音频 URL 播放  
3. 移动端：再引入 Tauri 音频/后台插件  

### 4.10 内置 Web 管理（P3，可选）

Max 的 `modules/web` 为 **Vue3 三入口**（书架/源编辑/备份），构建进 assets。  
Reader **不引入 Vue**；可选方案：

- Solid 路由 `/web-admin/*` 复刻 API 消费端；或  
- 仅实现 `api.md` 同款 REST 供外部浏览器访问（需 Rust/插件起服务，优先级低）

---

## 5. 数据模型与 API

### 5.1 书源 JSON 关键字段（与 Max 一致）

```typescript
// 逻辑类型见 src/types/book-source.ts，须与 BookSource.kt 同步
interface BookSource {
  bookSourceUrl: string;
  bookSourceName: string;
  bookSourceGroup?: string;
  enabled: boolean;
  enabledExplore: boolean;
  searchUrl?: string;
  exploreUrl?: string;
  ruleSearch?: RuleSearch;
  ruleExplore?: RuleExplore;
  ruleBookInfo?: RuleBookInfo;
  ruleToc?: RuleToc;
  ruleContent?: RuleContent;
  loginUrl?: string;
  loginCheckJs?: string;
  header?: string;
  // … 以 Max BookSource.kt 为准补全
}
```

维护方式：从 `Legado_Max-main/app/.../entities/BookSource.kt` 生成 TS 类型或手写对照表，**每次 Max schema 变更时 diff**。

### 5.2 Web API（参考实现用）

若将来做局域网管理，路由与 `Legado_Max-main/api.md` 保持一致：

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/getBookshelf` | 书架 |
| GET | `/getChapterList?url=` | 目录 |
| GET | `/getBookContent?url=&index=` | 正文 |
| POST | `/saveBookSource(s)` | 保存书源 |
| WS | `/bookSourceDebug` | `{ key, tag }` |

前端调试器可先 **直接调 TS 引擎**，WS 为可选增强。

### 5.3 深链导入

```
legado://import/{path}?src={url}
```

`path`：`bookSource` | `rssSource` | `replaceRule` | `readConfig` | `addToBookshelf` | …

实现：`lib/import/legado-uri.ts`（TS 解析）+ 可选 Rust 注册系统协议。  
参考：`Yeader-main/crates/yeader-protocol/src/lib.rs`。

---

## 6. UI/UX 规范

### 6.1 技术栈落地

```bash
pnpm add lucide-solid
# 逐步替换 src/components/icons.tsx
```

引入 `@solidjs/router`，页面与 [UI.md](./UI.md) 顶栏 Tab 对齐：

| Tab | 路由建议 |
|-----|----------|
| 书架 | `/` 或 `/bookshelf` |
| 书源 | `/sources` |
| 订阅 | `/rss` |
| 书签 | `/bookmarks` |
| 记录 | `/records` |
| 设置 | `/settings` |
| 阅读 | `/read/:bookId`（独立布局） |

### 6.2 与 Max 界面对照

| Max 界面 | Reader 页面 |
|----------|-------------|
| MainActivity 书架 | `pages/bookshelf` |
| BookSourceActivity | `pages/sources` + **SourceEdit** |
| ReadBookActivity | `pages/reader` |
| ExploreShowActivity | `pages/discover` |
| BookInfoActivity | `pages/book-info` |
| Rss* | `pages/rss`（`RssPage`、`RssSourcesManagePage`、`RssArticleListPage`、`RssReadPage`、`RuleSubPage` 等） |
| ConfigActivity | `pages/settings` |
| DebugToolsActivity | `pages/debug`（待建） |

### 6.3 响应式

严格遵循 [UI.md](./UI.md)：宽屏顶栏+侧栏，窄屏底栏；Web 不显示窗口控制钮；分组名截断策略。

---

## 7. 平台适配清单

| 能力 | Web | 桌面 Tauri | 移动 Tauri |
|------|-----|------------|------------|
| 数据库 | sql.js | plugin-sql | plugin-sql |
| HTTP | fetch | plugin-http | plugin-http |
| 文件 | 受限 | plugin-fs | SAF 分支 |
| 登录 Cookie 窗 | 新窗口 | `open_url_with_cookies` | WebView 插件 |
| 托盘 | — | Tray.tsx | — |

所有分支收敛在 `lib/platform/`，业务代码禁止散落 `window.__TAURI__` 判断。

---

## 8. 测试与验收

### 8.1 夹具

建议复制并维护：

```
Reader/fixtures/legado/
├── sources/*.json
├── backups/sample-backup/
└── protocol/*.txt
```

来源：`Yeader-main/fixtures/legado/` 或社区样例书源。

### 8.2 验收场景（MVP）

1. 导入 3 个不同模板书源（CSS/XPath/JSON）→ 搜索 → 加书架 → 读 3 章  
2. 导出/恢复备份后书架与进度一致  
3. WebDAV 拉一本远程书加入书架  
4. 本地 epub + txt 各一本阅读  
5. 替换规则生效（去广告正则）  
6. 书源编辑保存后重启仍在  

### 8.3 回归对照

同一书源在 **Legado Max Android** 与 **Reader** 对比：搜索结果数、目录章数、正文前 500 字 hash。

---

## 9. 风险与对策

| 风险 | 对策 |
|------|------|
| QuickJS 与 Rhino API 差异 | 维护 `js-api-compat.md`  shim 层 |
| 大 EPUB/MOBI 性能 | 虚拟滚动、分章加载；后期 Rust |
| 双引擎行为不一致 | 禁止长期 Rust+TS 双规则；登录脚本例外 |
| Max 独有 @webjs | 明确支持表+降级提示 |
| 移动端后台/TTS | 单独立项，不阻塞桌面 MVP |

---

## 10. 相关仓库文档索引

| 文档 | 路径 |
|------|------|
| Max 架构总结 | `Legado_Max-main/Structure/架构总结.md` |
| 书源流程 | `Legado_Max-main/Structure/书源解析流程.md` |
| 阅读流程 | `Legado_Max-main/Structure/阅读核心流程.md` |
| 数据库 | `Legado_Max-main/Structure/数据库架构.md` |
| API | `Legado_Max-main/api.md` |
| 跨平台指南 | `legado/docs/cross-platform-guide.md` |
| 架构分析 | `legado/docs/architecture-analysis.md` |
| Reader 排期 | [ROADMAP.md](./ROADMAP.md) |

---

## 11. 文档维护

- Max 升级后：diff `AppDatabase` version、`BookSource.kt`、README 功能列表，更新 [FEATURE_MATRIX.md](./FEATURE_MATRIX.md)。  
- Reader 每完成一模块：更新矩阵状态与 ROADMAP 勾选。  
- UI 变更：同步 [UI.md](./UI.md)。
