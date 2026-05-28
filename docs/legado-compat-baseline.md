# Reader × Legado 兼容基线（2026-05-28）

本文件用于记录本轮“语法与解析对齐”后的兼容基线，作为后续回归与新增书源准入依据。

## 已落地修复

- 模板 XPath 路由修复：`{{//...}}` 在模板展开后按编译后规则重新判定模式，避免误走 CSS。
- QuickJS 注入修复：`result` 通过安全 JSON 字符串注入，避免 HTML 字符串触发解析异常。
- 混排链路修复：`default -> <js>` 支持列表对象与 JSON 数组字符串输入。
- AnalyzeUrl 增强：
  - 增加 URL 本体 `{{}}` / `@js:` / `<js>` 执行链。
  - 增加 URL 统一绝对化处理。
- Tauri WebJs RPC 增强：
  - `connectAwait` 返回真实状态码；
  - `headAwait` 返回真实响应头；
  - `getStringAwait` 在 Tauri 下回退到前端规则引擎执行。
- 宽松兼容增强：
  - `@put` 支持宽松对象解析（严格 JSON 失败后回退宽松表达式解析）。
  - UrlOption 支持宽松 JSON 解析。
- `@get/@put` 增强：
  - `@get` 支持 `variables -> chapter/book/source` 回退链；
  - `@put` 支持 `book./chapter./source.` 前缀写回对应上下文。

## 本轮回归用例（规则级）

位于 `src/lib/rule-engine/rule-engine.compat.test.ts`：

- `$N` 缺失分组保留原 token。
- `@js/<js>` 混排后再执行 `##` 替换。
- `bookList + <js>` 链路返回列表对象。
- HTML 字符串 `result` 在 `<js>` 中可执行。
- `{{//...}}` 模板 XPath 路由回归用例。

## 黄金书源验证建议

建议至少覆盖以下场景（纯 Web + Tauri 各一轮）：

1. 八叉书库：搜索（bookList + `<js>`）。
2. 八叉书库：详情（作者/标签/简介归位）。
3. 目录分页书源：`nextTocUrl` 多页拼接与安全阈值。
4. 正文多页书源：`nextContentUrl` 拼接与替换规则。
5. 需要登录书源：inner-web + backstage cookie 双向同步。

## 待持续推进项

- `replaceFirst` 与 Legado 极端正则边界的更细节行为对齐。
- Tauri 侧更多 `java.request` 函数的语义等价（加解密签名细节）。
- 解析器细分边界（CSS/XPath/JSONPath/Regex）的增量样本回归库。

## 本轮全量兼容实施结果（2026-05-28）

### P0 执行链路补齐

- 搜索前置 `checkKeyWord` 已接入：`searchBook` 在请求前执行校验，失败时拒绝发起搜索请求。
- 目录 `preUpdateJs/formatJs` 已接入：目录页抓取后先执行 `preUpdateJs`，章节列表完成后执行 `formatJs` 二次整形。
- 正文 `payAction` 已接入：正文为空且配置了 `payAction` 时先执行动作，再进行一次正文重试解析。

### P1 一致性改造

- `{{...}}` 规则表达式判定已统一到 `isRuleExpression`，`analyze-rule` 与 `source-rule` 复用同一逻辑。
- QuickJS fallback 的 `java` 最小语义增强：
  - `put/get` 支持同次脚本内 KV；
  - `getString` 增加 `@get:{k}` 与基础 `$.` 路径读取；
  - 保留 `ajax/getResponse` 占位函数，避免脚本直接崩溃。

### 回归覆盖扩展

- 新增基线样本冻结：`src/lib/rule-engine/legado-compat-baseline.ts`。
- 扩展测试：`src/lib/rule-engine/rule-engine.compat.test.ts`
  - `###` 首次替换语义覆盖
  - 规则表达式一致性覆盖
  - UrlOption 分割与宽松解析覆盖
  - 基线样本冻结断言

### 发布门禁检查

- `ReadLints`：本轮改动文件无新增 lint/ts 报错。
- `pnpm exec tsc --noEmit`：仓库存在多处历史类型错误（非本轮引入），尚未满足“全仓类型全绿”门禁。
- `pnpm vitest run ...`：当前测试环境缺少浏览器相关依赖（`window/jsdom`），规则兼容测试在当前环境无法直接完整执行。

### 当前兼容矩阵结论

- 已支持（本轮完成）：`checkKeyWord`、`preUpdateJs`、`formatJs`、`payAction`、模板判定一致性、UrlOption 宽松解析回归。
- 部分支持：QuickJS fallback `java.*`（已补最小能力，尚未等价 Legado 完整 API）。
- 待补：流程级集成回归自动化（搜索→目录→正文）与浏览器环境测试依赖完善。

## 二期增量兼容结果（2026-05-28）

### 语义纠偏

- `checkKeyWord` 已改为 Legado 对齐语义：仅在校验流程中用于覆盖默认关键词，不再作为搜索前置门禁规则。
- 已移除非 Legado 字段 `searchGuardRule`，避免引入兼容分叉。

### java.* fallback（P0）

- `put/get` 升级为按书源作用域共享存储（非单次脚本内临时变量）。
- `ajax/get/post/head/connect/getResponse` 已从占位改为最小可用网络实现（浏览器同步 XHR 路径）。
- `getString` 保留现有最小语义（`@get` + 简单 JSON 路径），作为后续 P1 扩展点。

### 全链路缺口补齐

- 新增 `loginCheckJs` 执行钩子：搜索、发现、目录、正文、详情在关键请求后统一校验，避免静默空结果。
- 正文分页新增防环与页数上限（默认 20 页），避免 `nextContentUrl` 规则异常造成无限递归。
- 正文清洗支持 normal/light 两级策略；当清洗后长度骤降时自动降级 light 清洗。

### Web/Tauri RPC 一致性

- `connectAwait/headAwait` 在 Web 端改为 HEAD 语义，与 Tauri 端保持一致。
- Tauri `webjs_java_rpc` 补齐 `ajax/get/post/head/connect` 超时参数读取，统一请求超时行为。

### 回归门禁补充

- 新增 `src/lib/book-source/search.compat.test.ts`：
  - 覆盖 `checkKeyWord` 静态覆盖语义；
  - 覆盖非法模式回退默认关键词语义。
