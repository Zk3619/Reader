# 数据库策略：兼容、补缺与优化（阅读域）

> **范围**：本文仅描述 **阅读子模块 ↔ Legado / Max** 的字段语义与兼容注意点。  
> **整 App 库结构总纲**（拆 `media_groups`、全量模块前缀 `reader_`/`audio_`/`video_`/`shell_`、`mediabox.db`、M1–M4）以 [SHELL_MODULE_MIGRATION.md](./SHELL_MODULE_MIGRATION.md) **§3.0** 为准。
>
> **目标表名（已拍板）**：阅读域 `reader_*`；音频域 `audio_*`（模块 ID `audio`，含音乐及未来其它音频）；视频域 `video_*`（由现状 `tv_*` 迁入，模块 ID `video`）。  
> 与官方库互导：`books` ↔ `reader_books`、`book_groups` ↔ `reader_book_groups`。  
> 现状 `media_groups` 为过渡形态，**M2** 拆为 `reader_book_groups` + `audio_groups` + shell 表。
>
> 回答：改造阅读能力时**要不要**考虑 Legado Max 的数据库重构与优化？  
> 结论：**要考虑，但方式不是照搬 Max 的 96 次 Room 迁移，而是「兼容导入 + 按需增量 + Reader 侧优化」。**

---

## 1. 三者的关系

| 对象 | 角色 |
|------|------|
| **legados-main / Legado Max** | 参考**表结构、字段语义、备份格式**；**不修改**其 Android 工程内的 DB |
| **MediaBox `reader.db`（将改 `mediabox.db`）** | 独立演进：全局 `schema_version`（待拆 `schema_modules`）；阅读域对齐 Legado，并扩展音频/视频 |
| **用户已有库** | 可能来自官方 Legado / Max 备份，需**导入适配**（含 `book_groups`→`media_groups`） |

---

## 2. 当前差异（MediaBox 阅读域 vs Legado / Max）

### 2.1 已对齐的核心表（阅读）

语义与 Legado 3.x 主路径一致。**目标物理表名**带 `reader_` 前缀（见壳文档 §3.2）；**现状**仍多为无前缀或 `media_groups`。

| Legado 原名 | 目标 MediaBox | 备注 |
|-------------|---------------|------|
| `books` | `reader_books` | |
| `book_groups` | `reader_book_groups` | 现状多为 `media_groups`(shelf)；M2 拆分 |
| `chapters` / `book_sources` / … | `reader_chapters` / `reader_book_sources` / … | M3 加前缀 |

### 2.2 Reader 尚未建表（Max 已有）

| 表 | Max 用途 | 建议引入时机 |
|----|----------|--------------|
| `httpTTS` | 在线朗读引擎 | 阶段 5 TTS |
| `txtTocRules` | 本地 TXT 目录规则 | 本地书增强 |
| `dictRules` | 字典 | 字典功能 |
| `ruleSubs` | 规则订阅 | 低优 |
| `keyboardAssists` | 键盘辅助 | 低优 |
| `servers` | WebDAV/服务器配置 | 阶段 4 WebDAV 增强 |
| `readRecordDetail` / `readRecordSession` | 阅读统计明细/会话 | 阶段 2 阅读记录 |
| `url_records` | Max URL 记录 | Max 特性，可选 |
| `direct_link_upload_rules` / `upload_histories` | 直链上传 | Max 特性，可选 |

> 注：上表「尚未建表」以早期文档为准；若代码中已存在对应迁移，以 `migrations.ts` 为准。目标命名加 `reader_` 前缀。

### 2.3 结构不一致（需迁移脚本，非忽略）

| 项 | Legado / Max | MediaBox 目标 | 处理 |
|----|--------------|---------------|------|
| 分组表 | `book_groups` | `reader_book_groups` | 适配器映射；中间态 `media_groups` 由 M2 拆掉 |
| 分组成员 | `books."group"` 位掩码 | `reader_book_group_items` | 导入后展开 |
| 系统分组 `-3`/`-6` | `IdAudio` / `IdVideo` | 不建行 | 备份可识别即可 |
| 章节正文缓存 | 文件 `book_cache/*.nb` | `reader_chapter_cache` 或文件 | 见 §4 |
| 版本号 | Room 96 等 | `schema_modules` | 见壳文档 |

---

## 3. 推荐策略（分三层）

### 3.1 兼容层（必须）

**目标**：用户从 Max/Legado **备份 zip 或复制 `legado.db`** 后，书架、书源、进度可恢复。

- 实现 `lib/backup/legado-db-import.ts`：
  - 检测来源 DB 的 `user_version` / 表是否存在；
  - 对**共有表**做 `INSERT OR REPLACE` 或字段映射；
  - 对**缺失表**忽略或写入 Reader 新表（空表）。
- **不要**在 Reader 复刻 Max 的 `DatabaseMigrations` 1→96 链（维护成本极高、无收益）。

### 3.2 增量层（按功能加迁移）

每做一个功能，在 `migrations.ts` 增加 **v2、v3…**：

```text
v2  readRecord 增加 bookAuthor + readRecordDetail/Session
v3  httpTTS, servers
v4  txtTocRules, dictRules
…
```

原则：**只为 Reader 已实现的功能建表**，避免空表堆积。

### 3.3 优化层（Reader 特有，可选）

在兼容稳定后再做，见 §4。

---

## 4. 是否「重构」— 建议项与不建议项

### 4.1 建议做的优化

| 优化 | 原因 |
|------|------|
| **正文缓存改文件制**（对齐 Max `BookHelp`） | 大段正文进 SQLite 会膨胀 DB、拖慢备份；应用 `book_cache/{书名_作者}/*.nb` + fs 插件 |
| **保留 `chapter_cache` 作小缓存或元数据** | 可仅存 hash/路径，或迁移后废弃该表 |
| **SQLite PRAGMA**（桌面） | `journal_mode=WAL`、`synchronous=NORMAL`、适当 `cache_size` |
| **索引补全** | `rssArticles(origin, read)`、`books("group")`、`books(order)` 等列表查询字段 |
| **分页查询** | 书架、RSS 文章、搜索历史禁止一次 `SELECT *` 无上限 |
| **分离「冷数据」** | 搜索缓存 `searchBooks` 定期清理；`caches` 按 deadline 清扫 |
| **导入时 VACUUM** | 备份恢复后对过大 DB 可选压缩 |

### 4.2 不建议做的「重构」

| 做法 | 原因 |
|------|------|
| 重写为全新第三范式 schema | 与 Legado 书源/备份生态断裂 |
| 同步维护 version=96 | Reader 与 Android 发布周期不同 |
| 把所有 JSON 规则拆成多表 | Legado 书源设计就是宽表 + JSON 列 |
| 为 Max 专用表（url_records 等）提前全建 | 无 UI 则浪费迁移复杂度 |

---

## 5. 与 ROADMAP 的衔接

| 阶段 | 数据库工作 |
|------|------------|
| 0 | 文档化差异表（本文）；`readRecord` PK 差异记入技术债 |
| 1 | 书源编辑不强制改表；确保 `book_sources` 字段与 `BookSource.kt` diff |
| 2 | v2：`readRecord*` 三表；书签/记录 UI 接现有表 |
| 3 | RSS 表已有，仅需索引与分页查询优化 |
| 4 | `servers` 表 + Legado zip 导入器 |
| 5 | `httpTTS`；章节文件缓存落地 |
| 6 | 移动端 sql.js / plugin-sql 行为一致测试 |

---

## 6. 决策摘要

| 问题 | 答案 |
|------|------|
| 要不要考虑 Max 的数据库？ | **要**，作为**兼容与字段对照标准** |
| 要不要复制 Max 的「重构/96 次迁移」？ | **不要** |
| 要不要为 Reader 做优化？ | **要**，尤其是**正文缓存出库**、**增量迁移**、**导入适配** |
| 优先级 | 兼容导入 > 功能缺表 > 性能优化 > Max 专属表 |

---

## 7. 参考路径

- Max：`Legado_Max-main/app/.../data/AppDatabase.kt`（version 96）
- Max 文档：`Legado_Max-main/Structure/数据库架构.md`（版本号可能滞后）
- Reader：`Reader/src/lib/database/migrations.ts`
- 缓存语义：`Legado_Max-main/Structure/书籍缓存机制.md`
