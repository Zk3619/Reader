# 阅读能力补齐 Backlog（酌情取舍版）

> 日期：2026-07-22  
> 对照：`legados-main`（阅读 Max）/ `legado-own`（阅读 R）  
> 原则：**Max 的「增强」不等于 Reader 必须移植**；只补与书源生态兼容、本地阅读完整度、可调试性相关的项。  
> 相关盘点 Canvas：工作区 `canvases/reader-vs-legado-reading-gaps.canvas.tsx`（侧栏打开即可）

---

## 0. 总览

| # | 能力 | 代码现状（2026-07） | 决策 | 优先级 |
|---|------|---------------------|------|--------|
| 1 | `@webjs` / `customButton` / `eventListener` / `nextPageLazyLoad` | ✅ 已接线（SourceCallBack / 懒加载 / 回归测） | **做**（兼容必需） | P0 ✅ |
| 2 | 批量校源 CheckSource | ✅ 结果筛选/重试/禁用/并发 | **打磨**（非从零） | P1 ✅ |
| 3 | 本地 MOBI / UMD / PDF | ✅ PDF；✅ MOBI→EPUB；UMD 暂不支持 | **分阶段做** | P1–P2 ✅ |
| 4 | 页眉页脚字号 / 翻页速度 / 波浪虚线下划线 | 页眉页脚✅；翻页速度✅；划线样式不做 | **部分做** | P1 ✅ / 可砍 |
| 5 | TTS 调试台（非豆包特供） | ✅ HttpTtsEditDialog 试听调试 | **做轻量调试台** | P1 ✅ |
| 6 | 内置局域网 Web 管理 | ✅ 默认 **1122**、鉴权默认开；文档已对齐 | **维持/补文档** | P2 ✅ |
| 7 | 漫画条漫/滤镜/E-Ink/纸感 | ✅ CSS 滤镜（滚动+分页）；无独立入口 | **做效果层，不做入口** | P1 ✅ |
| 8 | 主题预设（无云同步） | ✅ 8 个阅读向 builtin 包（日/夜成对） | **补阅读向预设包** | P2 ✅ |

---

## 1. 书源引擎：`@webjs` / `customButton` / `eventListener` / `nextPageLazyLoad`

### 现状

| 子项 | 状态 | 证据 |
|------|------|------|
| `@webjs:` 规则类型 | ✅ 运行时 | `lib/rule-engine/webjs-runner.ts`、`legado-source-rule.ts`；TV sniff 亦复用 |
| 字段入库/导入/编辑开关 | ✅ | `types/book-source.ts`、`sources.ts`、`book-source-edit-config.ts` |
| `callBackJs` 编辑字段 | ✅ 表单有 | `book-source-edit-config.ts` `callBackJs` |
| `eventListener` 触发链 | ❌ | Max：`SourceCallBack.kt`（加架/开读/自定义按钮点击等）；Reader 无等价调度 |
| `customButton` UI + 回调 | ❌ | Max：详情/阅读菜单按开关显示按钮 → `CLICK_CUSTOM_BUTTON`；Reader 开关存了但无按钮 |
| `nextPageLazyLoad` 正文翻页语义 | ❌ | Max：`BookContent`/`ReadBook`/`CacheBook` 在开关开启时按页懒取；Reader 正文分页逻辑未读该标志 |

### Max 增强是否值得搬？

| 子项 | 判断 |
|------|------|
| `@webjs` | **必须**。现代书源反爬/动态 DOM 依赖；已有实现则保兼容回归即可。 |
| `nextPageLazyLoad` | **应做**。影响正文完整性与流量；是规则语义，不是「炫技」。 |
| `eventListener` + `callBackJs` | **应做精简子集**。完整事件表很长（作者点击、标签长按、清缓存…）；Reader 先接：加架/删架、开始/结束阅读、自定义按钮点击。其余可按书源实际使用率再加。 |
| `customButton` | **应做**。书源侧交互入口；不做则开关形同虚设，导入 Max 源会「有开关无按钮」。 |

### 建议范围（P0）

1. 实现 `SourceCallBack` 精简版（事件常量 + `callBackJs` 执行 + `eventListener` 门闩）。  
2. 书籍详情 / 文本阅读菜单：在 `customButton` 为真时展示按钮，走 `clickCustomButton`。  
3. `getContent` / 正文下一页：尊重 `nextPageLazyLoad`（对齐 Max：懒加载时不预拉整链 nextUrl）。  
4. 补兼容测试：至少 1 个含 `@webjs` + 1 个 `nextPageLazyLoad` 夹具。

### 明确不做（本阶段）

- Max 全量事件表一次性移植。  
- 「智能导入」书源生成（与本项无关，且质量参差）。

---

## 2. 批量校源 / CheckSource

### 现状

**已实现主路径**：`lib/book-source/validate.ts`（搜索/发现/目录/正文）+ 书源管理页「校验所选」。

旧文档 `FEATURE_MATRIX.md` 标 ⬜ **已过时**。

### Max 增强是否值得搬？

Max「书源检测新界面」偏调试工作台。普通用户更需要：**可选校验项、并行度、结果可筛选、失败原因可复制**。不必复刻悬浮球式检测 UI。

### 建议范围（P1 · 打磨）

1. 结果面板：按失败类型筛选、一键禁用失败源、导出报告。  
2. 可选检查维度（跳过发现 / 仅测搜索）。  
3. 有限度并发（当前偏串行）+ 全局限速尊重 `concurrentRate`。  
4. 更新 `FEATURE_MATRIX.md` 本行状态为 ✅/🟡。

### 明确不做

- 独立「校源 App 内工作台」作为一级导航。

---

## 3. 本地书：MOBI / UMD / PDF

### 现状

`lib/local-book/`：TXT + EPUB（epubjs）。无 MOBI/UMD/PDF 解析器。

### Max 增强是否值得搬？

| 格式 | 判断 |
|------|------|
| PDF | **高价值**。桌面用户常见；可用系统/WebView/`pdf.js` 渲染，不必自研排版。 |
| MOBI/AZW | **中价值**。Kindle 用户存量；可 Rust/`mobi` crate 或转 EPUB 导入。 |
| UMD | **低价值**。几乎仅旧手机小说；工作量大、受众极小。 |

### 建议范围

| 阶段 | 内容 |
|------|------|
| P1 | PDF：导入为「本地书」→ 用 PDF 查看器（可复用/旁路现有 image/text 壳），进度按页；不强制进文本分页引擎 |
| P2 | MOBI：优先「转 EPUB 再入书架」降低双引擎成本 |
| 搁置 | UMD：文档标明「暂不支持」；有需求再议 |

### 明确不做

- 为 PDF 强行套用小说分页/替换规则（体验差且无必要）。

---

## 4. 阅读 UI：页眉页脚 / 翻页速度 / 波浪虚线下划线

### 现状

| 子项 | 状态 |
|------|------|
| `headerFontSize` / `footerFontSize` | ✅ `reader-ui-config` + `ReaderPageTipControls` |
| 翻页动画类型（仿真/覆盖/滑动…） | ✅ |
| 触摸/按键翻页动画时长（Max `touchPageAnimSpeed` / `keyPageAnimSpeed`） | ❌ |
| 自动翻页速度 `autoReadSpeed` | ✅（另一概念） |
| 波浪/虚线/实线下划线（Max HighlightRule / WaveUnderlineSpan） | ❌ |

### Max 增强是否值得搬？

| 子项 | 判断 |
|------|------|
| 页眉页脚独立字号 | **已有，保持** |
| 翻页动画速度 | **可做、低风险**。桌面体验实打实；配置项 1–2 个滑条即可 |
| 波浪/虚线下划线 | **谨慎**。Max 面向「划线标注党」；Reader **尚无高亮持久化模型**。单独做装饰 span 而无标注存储 = 半成品。建议：**等划线数据模型立项后再做样式**；或仅在选区菜单做临时样式预览 |

### 建议范围

1. **P1**：`pageAnimDurationMs`（或分 touch/key）接入仿真/覆盖/滑动动画。  
2. **P2 / 可砍**：下划线样式 → 挂到「标注」专题，不单独冲刺。

---

## 5. TTS 调试台（规则引擎接入，非豆包特供）

### 现状

HttpTTS 引擎管理/编辑/登录齐全；**无**「拼 URL → 试听 → 看请求/响应」调试台。全仓无豆包硬编码（保持即可）。

### Max 增强是否值得搬？

Max TTS 调试台对**写 HttpTTS 规则的人**有用，对普通朗读用户几乎无感。  
豆包等厂商 API：**一律走用户自建 HttpTTS 规则**，主程序不特供。

### 建议范围（P1）

轻量调试面板（可挂在 `HttpTtsEditDialog` 旁）：

1. 输入试读文本 → 按规则展开 URL/Header/Body。  
2. 发起请求 → 播放音频或展示错误。  
3. 展示最终 URL（脱敏）与状态码；支持复制。  
4. 复用现有 `http-tts-analyze` / `http-tts-speak`，不新开引擎。

### 明确不做

- 任何厂商 SDK / 内置豆包配置页。  
- Max 式独立「TTS 调试 Activity」一级入口（设置内二级足够）。

---

## 6. 内置局域网 Web 管理

### 现状

**已落地**，不是「低优先级空想」：

- Tauri：`web_service.rs` + 设置页 `WebServiceSetting.tsx`  
- 默认端口 **1122**（非 Legado 1234）  
- `web-service-ui` + `lib/web-api/paths.ts` 对齐大量 Legado API  
- 纯 Web：`vite-plugins/legado-web-api-server.ts`

旧 ROADMAP「可选低优」**滞后于代码**。

### Max 增强是否值得搬？

| 点 | 判断 |
|------|------|
| 改端口为 1234 | **不必**。1122 已用；文档写清兼容即可。可选「Legado 兼容预设 1234」。 |
| 零鉴权照搬 | **禁止**。Max 已知 P0 风险；Reader 已有 Token，保持强制/默认开鉴权。 |
| 功能对齐书架/书源/备份 | **按需补 API**，非重做服务。 |

### 建议范围（P2）

1. 文档：ROADMAP / FEATURE_MATRIX 改为 ✅，写明端口与鉴权。  
2. 设置页文案：说明与 Legado `:1234` 的差异与兼容方式。  
3. 缺口 API 按 `web-service-ui` 实际报错补齐（清单制，不喷式对齐）。

### 明确不做

- 为「像 Max」而强制默认 1234、关闭鉴权。

---

## 7. 漫画：条漫 / 滤镜 / E-Ink / 纸感（无独立入口）

### 现状

- 图片书 = `BookSourceType.image` / `BookType.image` → `ImageViewerPage`（**正确：无独立漫画 App 入口**）  
- `readingMode: scroll | paged` 已有  
- 色彩滤镜 / E-Ink 阈值 / 纸感：**无**

### Max 增强是否值得搬？

| 子项 | 判断 |
|------|------|
| 条漫连续滚动 | **已有滚动模式**；可打磨预载与手势 |
| 色彩滤镜 | **值得**（护眼/夜间漫画） |
| E-Ink 阈值 | **桌面次要**；电纸书/灰度屏用户有用，可做简单灰度+阈值 |
| 纸感 Epaper | **偏装饰**；低优先，可砍 |

### 建议范围（P1）

1. ImageViewer 设置：亮度/对比/灰度/暖色滤镜（CSS `filter` 或 canvas 一层即可）。  
2. 可选「E-Ink 模拟」：灰度 + 对比阈值滑条。  
3. **禁止**新增「漫画」一级导航或独立书架类型入口；书架 Tab「漫画」仅作类型筛选（现有约定）。

### 明确不做

- 独立 `ReadMangaActivity` 式信息架构。  
- 纸感纹理贴图（除非滤镜做完仍有强需求）。

---

## 8. 主题 / 皮肤：预设补强（无云同步）

### 现状

主题包 V1–V3、日夜、背景、导入导出、Theme Studio 已成熟。另有 **8 个阅读向 builtin 包**（青瓷/沙丘/松烟/素纸 × 日夜），仅本地导入导出，**无云同步**。

### Max / R 增强是否值得搬？

| 能力 | 判断 |
|------|------|
| 阅读 R 主题包云同步 | **明确不做** |
| Max HTML 封面模板引擎 | **低优先**（小众） |
| 多套开箱即用主题包 | **做**。降低 Theme Studio 门槛 |

### 建议范围（P2）

1. 内置 4–8 个**完整主题包**（日/夜成对）：阅读器背景、正文区、书架表面协调。  
2. 阅读页专用表面 token 若不足则小补 schema，避免只改壳不改阅读区。  
3. 文档写明：仅本地导入/导出，无 WebDAV 主题同步。

---

## 9. 实施顺序建议

```text
P0  书源：eventListener 精简 + customButton + nextPageLazyLoad 接线
     （@webjs 以回归测试加固）
P1  校源打磨 → TTS 轻量调试台 → 翻页动画速度
     → 漫画滤镜（无新入口）→ PDF 本地打开
P2  主题预设包 → Web 服务文档/API 补缺 → MOBI 转 EPUB
搁置 UMD；波浪虚线下划线挂「标注」专题；任何云同步
```

AI 助手（搜书/读章/MCP 等）**不在本 backlog**：见 [AI_CAPABILITY_ROADMAP.md](./AI_CAPABILITY_ROADMAP.md)，作为主程序级后续规划，避免现阶段只在阅读域打补丁式接入。

---

## 10. 文档同步待办

完成本 backlog 对应实现时，请同步：

- [x] `FEATURE_MATRIX.md`：校源、Web 服务、`@webjs`、多格式等行  
- [x] `ROADMAP.md`：删除「1234 低优未做」过时表述  
- [x] 本文件状态列随合并更新
