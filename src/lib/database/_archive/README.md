# 归档：压扁前的增量迁移链

开发期已将原 `v1 → v96 → … → v129` 迁移链压扁为仓库内 [`../schema-v1.sql`](../schema-v1.sql) + [`../migration-v1.ts`](../migration-v1.ts)。

本目录仅供对照历史演进与排错，**运行时不再 import**。首个对外测试版/正式版发布后，新的 schema 变更请从全局 `schema_version = 2` 起新增增量迁移，勿再复活本目录脚本。
