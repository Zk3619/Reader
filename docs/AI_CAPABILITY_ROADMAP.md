# AI 能力路线图（主程序级 · 跨模块）

> 日期：2026-07-22  
> 状态：**规划稿，未立项实现**  
> 原则：AI 是 **MediaBox / Reader 主壳能力**，不是「阅读模块插件」；首期不做阅读域孤立接入。  
> 对照参考：阅读 R（`legado-own`）的 AI 助手 + 工具调用，仅作能力清单参考，**不复制其信息架构与云依赖**。

---

## 1. 为什么单独成文

当前阅读补齐见 [READING_PRIORITY_BACKLOG.md](./READING_PRIORITY_BACKLOG.md)，刻意 **不包含** AI。

原因：

1. 书源兼容、本地格式、漫画滤镜等是存量体验缺口，应先收敛。  
2. AI 一旦只挂在阅读页，后续音乐/影视会被迫各做一套 Provider/权限/历史，债更高。  
3. 项目明确 **不接云账号体系**；AI 必须是「用户自备 Key / 本地或兼容 OpenAI 的端点」，与主题云同步同理——能力归本地。

本文把 AI 定义为：**后续主程序规划**，覆盖壳层、阅读、音乐、影视（及可扩展的 RSS/设置）。

---

## 2. 产品定位

| 维度 | 约定 |
|------|------|
| 形态 | 主壳「助手」面板（侧栏/快捷键/选区菜单可唤起），各模块注册 **Tools** |
| 模型 | 用户配置的 OpenAI 兼容 API（baseUrl + apiKey + model）；可多 Profile |
| 数据 | 对话/工具审计本地存储；不上传到项目方服务器 |
| 权限 | 工具分级：只读默认开；写入/外网搜索需确认或白名单 |
| 非目标 | 内置唯一模型供应商；强制账号登录；阅读 R 式主导航永久占一 Tab（可选，不默认） |

---

## 3. 架构草图

```text
┌─────────────────────────────────────────────────────────┐
│  Shell：AiHost（会话、流式输出、工具确认 UI、快捷键）      │
├─────────────────────────────────────────────────────────┤
│  AiToolRegistry（按模块注册，可启用/禁用）                 │
│  ├─ shell.*     设置读写、主题切换、导航、备份触发         │
│  ├─ reader.*    书源/书架/章节/正文/替换/校源              │
│  ├─ audio.*     搜歌/歌单/播放队列/歌词（只读优先）        │
│  ├─ video.*     搜片/详情/播放列表（只读优先）             │
│  └─ websearch.* 可选：用户配置的搜索 API（如 Tavily）      │
├─────────────────────────────────────────────────────────┤
│  Providers：OpenAI-compatible ·（预留）本地 llama.cpp 等   │
└─────────────────────────────────────────────────────────┘
```

实现落点建议（立项时再拆 PR）：

- `src/lib/ai/`：provider、session、tool types、权限策略  
- `src/components/ai/`：面板、确认卡片、划词浮层  
- 各模块 `*/ai-tools.ts`：**只注册工具，不拥有 Host**

---

## 4. 能力分期

### Phase A — 主壳地基（必须先于模块炫技）

| 能力 | 说明 |
|------|------|
| Provider 配置 | 多 Profile；测连；密钥走安全存储（Tauri）/ 本地加密（Web 降级说明） |
| 会话 | 多会话、流式、停止生成、导出 Markdown |
| Tool 协议 | 名称/描述/JSON Schema/危险等级；统一确认弹窗 |
| 审计 | 工具调用日志（可关）；便于排障，不含完整密钥 |
| 入口 | 设置页 + 全局快捷键；**不**先占主导航 Tab |

**验收**：无任何业务工具时，助手仍可纯聊天；配置错误有明确提示。

### Phase B — 阅读域工具（对标阅读 R 的「有用子集」）

只读优先：

| 工具 | 用途 |
|------|------|
| `reader.list_sources` / `search_sources` | 查书源 |
| `reader.search_books` | 多源搜索（尊重限速） |
| `reader.bookshelf_*` | 列表/分组查询 |
| `reader.list_chapters` / `read_chapter` | 目录与正文（可截断） |
| `reader.get_read_progress` / `read_records_summary` | 进度与统计摘要 |

写入（需确认）：

| 工具 | 用途 |
|------|------|
| `reader.add_bookshelf` / `remove_bookshelf` | 加架/移出 |
| `reader.debug_source` | 触发已有调试管线（复用 SourceDebug，不新造引擎） |
| `reader.apply_replace_preview` | 替换规则试运行（先预览再写库） |

划词：

| 能力 | 说明 |
|------|------|
| 阅读选区 → 助手 | 解释/翻译/续写提示；**默认不改正文** |
| 与字典并存 | 字典规则走原路径；AI 为可选增强 |

**不对齐阅读 R 的部分**：一键「AI 创建完整书源并启用」过于危险，若做必须强制人工审阅 diff。

### Phase C — 音乐域工具

| 工具 | 用途 |
|------|------|
| `audio.search_tracks` / `search_songlists` | 搜索 |
| `audio.queue_*` | 查看/追加队列（写入确认） |
| `audio.now_playing` | 当前曲目与进度 |
| `audio.lyrics_get` | 取歌词（只读） |

非目标（首期）：用 AI 批量改音质策略、乱动 User API 脚本。

### Phase D — 影视域工具

| 工具 | 用途 |
|------|------|
| `video.search` / `video.get_detail` | 搜片与详情 |
| `video.list_playing` / `open_play` | 进度与打开播放（打开需确认） |

非目标：AI 自动嗅探破解源站、绕过鉴权。

### Phase E — 可选增强

| 能力 | 说明 |
|------|------|
| MCP Client | 用户配置 MCP Server（参考阅读 R）；默认关闭 |
| Skills / 系统提示包 | 可导入本地 skill 文本；不绑定云市场 |
| 联网搜索工具 | 仅当用户配置第三方搜索 Key 后启用 |
| 主导航「助手」Tab | 可选，默认关；避免挤压书架/音乐 |

---

## 5. 与阅读 R AI 的差异（刻意）

| 阅读 R | Reader 规划 |
|--------|-------------|
| 主导航固定 AI Tab | 可选；默认快捷面板 |
| 工具可改设置/建书源面很宽 | 写入分级 + 书源变更要 diff 确认 |
| Tavily 等可深度集成 | 可选插件式，非内置品牌 |
| 与 Android 生命周期绑定 | 跟 Tauri/Web 会话模型；后台生成可取消 |
| 主题/图标云同步旁路 | **永不**把 AI 配置送到项目云；仅用户自备端点 |

---

## 6. 安全与隐私基线（立项硬约束）

1. 密钥不进 git、不进备份明文（备份若包含需独立加密段或排除）。  
2. 工具默认最小权限；`websearch` / `shell.set_setting` / 书源写入默认需确认。  
3. 正文/歌词送模前可开关「允许发送全文」；默认仅标题+选区。  
4. 不实现「代用户登录任意书源站点」的自动填表，除非走现有 SourceLogin 人工流。  
5. 局域网 Web API（1122）**不**默认暴露 AI 密钥相关端点。

---

## 7. 与其它文档的关系

| 文档 | 关系 |
|------|------|
| [READING_PRIORITY_BACKLOG.md](./READING_PRIORITY_BACKLOG.md) | 近端阅读补齐；**不含 AI** |
| [SHELL_MODULE_MIGRATION.md](./SHELL_MODULE_MIGRATION.md) | AI Host 归属主壳，工具按 `reader`/`audio`/`video` 前缀 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 立项时补「`lib/ai` 层」一小节 |
| [FEATURE_MATRIX.md](./FEATURE_MATRIX.md) | AI 行保持「主程序规划 / 未实现」，勿标进阅读 Max 对齐表冒充完成度 |

---

## 8. 建议触发条件（何时开始写代码）

同时满足再开 Phase A：

1. 阅读 P0（书源事件/按钮/懒加载）已合并。  
2. 壳层设置与安全存储方案已有可复用模式（主题密钥/WebDAV 密码同类）。  
3. 产品确认：助手入口形态（快捷键 vs Tab）与危险工具确认 UX。

未满足前：只更新本文，不在阅读页塞临时 ChatGPT iframe。
