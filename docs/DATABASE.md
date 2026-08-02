# 数据库策略：兼容、补缺与优化（阅读域）

> **范围**：本文仅描述 **阅读子模块 ↔ Legado / Max** 的字段语义与兼容注意点。  
> **整 App 库结构总纲**（拆 `media_groups`、全量模块前缀 `reader_`/`audio_`/`video_`/`shell_`、`mediabox.db`、M1–M4）以 [SHELL_MODULE_MIGRATION.md](./SHELL_MODULE_MIGRATION.md) **§3.0** 为准。
>
> **目标表名（已拍板）**：阅读域 `reader_*`；音频域 `audio_*`（含 `audio_sources` / `audio_search_keywords`）；视频域 `video_*`（由 `tv_*` 迁入，含 `video_search_keywords`）；订阅域 `sub_*` 骨架；壳 `shell_*`。  
> 库文件：`mediabox.db`；模块版本：`schema_modules`。  
> 与官方库互导：`books` ↔ `reader_books`、`book_groups` ↔ `reader_book_groups`（见 `lib/database/core/legado-table-map.ts`）。  
> 现状：分组已为 `reader_book_groups` + `audio_groups` + `shell_favorites`；整库 DDL 见开发期基线 `schema-v1.sql`。
>
> 回答：改造阅读能力时**要不要**考虑 Legado Max 的数据库重构与优化？  
> 结论：**要考虑，但方式不是照搬 Max 的 96 次 Room 迁移，而是「兼容导入 + 按需增量 + Reader 侧优化」。**

---

## 1. 三者的关系

| 对象 | 角色 |
|------|------|
| **legados-main / Legado Max** | 参考**表结构、字段语义、备份格式**；**不修改**其 Android 工程内的 DB |
| **MediaBox `mediabox.db`（旧名 `reader.db`）** | 独立演进：`schema_modules` 分模块版本 + 全局 `schema_version`；**开发期基线为 v1**（`schema-v1.sql`，由原 v1…v129 链压扁）；阅读域对齐 Legado，并扩展音频/视频/订阅 |
| **用户已有库** | 可能来自官方 Legado / Max 备份，需**导入适配**（`book_groups`→`reader_book_groups` 等，见 `legado-table-map`） |

---

## 2. 当前差异（MediaBox 阅读域 vs Legado / Max）

### 2.1 已对齐的核心表（阅读）

语义与 Legado 3.x 主路径一致。**物理表名**一律 `reader_*` 前缀（见壳文档 §3.2）；基线 v1 已落盘为目标态。

| Legado 原名 | MediaBox 物理表 | 备注 |
|-------------|-----------------|------|
| `books` | `reader_books` | |
| `book_groups` | `reader_book_groups` | 导入映射；不再经 `media_groups` |
| `chapters` / `book_sources` / … | `reader_chapters` / `reader_book_sources` / … | |

### 2.2 Max 专属表（按需再建，当前不建空表）

| 表 | Max 用途 | MediaBox 策略 |
|----|----------|---------------|
| `url_records` | Max URL 记录 | 基线不建；实现对应功能时再建 `reader_*` |
| `direct_link_upload_rules` / `upload_histories` | 直链上传 | 同上 |
| 其余（`httpTTS`、`txtTocRules`…） | 已对齐为 `reader_*` | 见 `schema-v1.sql` |

> 原则：无 UI / 无调用方不保留空表。目标命名加 `reader_` 前缀。
### 2.3 结构不一致（需迁移脚本，非忽略）

| 项 | Legado / Max | MediaBox 目标 | 处理 |
|----|--------------|---------------|------|
| 分组表 | `book_groups` | `reader_book_groups` | 适配器映射（`legado-table-map`） |
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

### 3.2 基线与增量迁移

- **开发期（未对外发版）**：新装 / 清库只跑 **全局 `schema_version = 1`**，DDL 真源为 `src/lib/database/schema-v1.sql`（由 `migration-v1.ts` 执行），并 `seedSchemaModules`（各模块版本同为 `1`）。原 `v96…v129` 链已归档至 `src/lib/database/_archive/`。
- **DEV 旧库**：若检测到压扁前 schema（`MAX(schema_version) > 1` 或残留无前缀表），自动删除 `mediabox.db` 并重建；生产构建则报错提示手删。
- **首个测试版/正式版之后**：功能变更在 `migrations.ts` 追加 **v2、v3…**，并按需 bump 对应 `schema_modules`；**不要**再改写 v1 基线 SQL 来「假装」升级已有用户库。

原则：**只为已实现的功能建表**，避免空表堆积；结构变更只走正式迁移，不靠运行时 `ensure*` 隐式补丁。

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
