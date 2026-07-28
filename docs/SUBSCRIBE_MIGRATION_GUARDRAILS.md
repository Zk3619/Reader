# Subscribe Migration Guardrails

本文件定义 Folo 迁移到 Reader 新订阅模块时的不可破坏契约。

## Legacy 契约（必须保持）

- `reader_rss_sources`
- `reader_rss_articles`
- `reader_rss_read_records`
- `reader_rss_stars`
- Legacy API 路由：`/getRssSources`、`/saveRssSource`、`/refreshRssArticles` 等保持原语义。
- Legacy 备份文件：`rssSources.json`、`rssStar.json` 保持兼容读取和写出。

## 新订阅边界

- 新模块仅写入 `sub_sources`、`sub_feeds`、`sub_entries`、`sub_search_keywords`。
- 所有新订阅 DAO 必须走 `SubTables` 常量，不允许硬编码 legacy 表名。
- 新订阅 API 统一使用 `/sub/*` 路由，避免与 legado 接口混名。
- 新订阅备份文件使用独立命名：`subSources.json`、`subFeeds.json`、`subEntries.json`。

## 回归检查

- 每次发布前执行：legacy API 响应对比 + legacy 表结构快照对比 + 备份恢复兼容性对比。
