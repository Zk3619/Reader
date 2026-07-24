# 番剧模块对齐 Kazumi + Bangumi.tv

> 参考仓：`VideoPlayer/Kazumi-main`（[Predidit/Kazumi](https://github.com/Predidit/Kazumi)）  
> Reader 入口：影视 Hub section `bangumi`（浏览页 + 详情）  
> **禁止**写入 FongMi `sites[]` / Spider CONFIG（`BANGUMI_ISOLATION_NOTE`）  
> 播放：[VIDEO_PLAYBACK_KERNEL.md](./VIDEO_PLAYBACK_KERNEL.md)；总排期：[VIDEO_CAPABILITY_ROADMAP.md](./VIDEO_CAPABILITY_ROADMAP.md)

---

## 1. 定位

| | Kazumi | Reader 番剧 |
|--|--------|-------------|
| 元数据 | Bangumi.tv | `bangumi/meta`（api.bgm.tv + 可配镜像） |
| 规则 | XPath / API + WebView 抽流 | 同思路；适配器兼容 Kazumi JSON |
| 追番/历史 | Hive + 可选 BGM OAuth | **影视 keep/history**（`kind: bangumi`） |
| 播放 | media_kit | `PlaybackRouter` |
| 设置 | 应用内设置 | `TvSettingsPane`「番剧」分区 |
| 持久化 | Hive 等 | **SQLite `video_bangumi_*`** + `video_tracks` / `video_play_record` |

---

## 2. UI 信息架构

```text
番剧 Hub
├─ 页头：BGM 搜索 / 更多（以图搜番、刷新）
├─ 上：放送时间表（BGM calendar）
├─ 下：可筛选列表（热门/当季/标签…）
└─ 点击 → 番剧详情（简介/短评/选源播放）

影视收藏 / 历史：kind=bangumi 打开详情或续播
设置 → 番剧：规则 CRUD、Kazumi 导入、仓库订阅、镜像、抽流偏好、弹幕过滤、缓存导出
```

---

## 3. 数据表与隔离（schema v122 / video 模块 v9）

| 表 | 用途 |
|----|------|
| `video_bangumi_rules` | Kazumi / 自有规则（整规则 `payload_json`） |
| `video_bangumi_rule_subs` | 规则仓库订阅 URL |
| `video_bangumi_subjects` | BGM 条目弱缓存 |
| `video_bangumi_prefs` | 模块 / meta 偏好 KV |
| `video_tracks`（`library=1`） | 追番收藏；系统组「番剧」`VideoBangumi=-44` 按 `kind='bangumi'` 过滤 |
| `video_play_record` | 观看历史；写入保留 `kind` / `flag` |

**隔离**：`video_sources` / Spider CONFIG **禁止**混入 Kazumi 规则。规则 CRUD 只走 `video_bangumi_rules`。

一次性迁移：`ensureBangumiSqliteMigrated` 将 localStorage `reader.bangumi.rules.v2` / prefs / meta prefs 迁入 SQLite，成功后写 `reader.bangumi.sqlite_migrated.v122`，并保留 `.bak` 只读备份键。同步入口读内存缓存（hydrate 后）。

---

## 4. 分期（E7）

| 阶段 | 内容 | 验收 |
|------|------|------|
| **E7.0** | meta 模型 + BGM 客户端；keep/history `bangumi`；LS 迁移 | 文档与类型就绪 |
| **E7.1** | 浏览页 + 详情 UI；侧栏「番剧」；规则进设置 | 时间表/列表可点进详情 |
| **E7.2** | Kazumi 适配器；API/JSONPath；规则订阅 + apiLevel | 可导入 DM84 类 JSON |
| **E7.3** | 静态→文本嗅探→WebView 抽流；反爬会话 | 官方规则可搜可播（桌面） |
| **E7.4** | 选源播放；弹幕过滤/可选发送；trace.moe | 详情选源开播 |
| **E7.5** | 剧集磁盘缓存+导出；LOCAL sync bangumi；WebDAV 快照 | 多机 keep/history 含番剧 |
| **E7.6** | 规则/订阅/prefs/subjects → SQLite；修 kind/flag | 冷启动无 LS 仍可读规则 |

---

## 5. 规则 Schema

自有 v2 字段见 `bangumi/rules.ts`。Kazumi 插件经 `kazumi-adapter` 映射：

- `searchURL` → `searchPath`（`@keyword` ↔ `{keyword}`）
- `searchResult` → `searchLink`；`chapterRoads`/`chapterResult` → `chapterList` 等
- 保留 `api` / `referer` / `searchMode` / `chapterMode` / API 配置 / 反爬配置
- 客户端 `BANGUMI_RULE_API_LEVEL`；更高 `api` 跳过并提示

订阅：MusicFree 式 `ruleSubscribeUrls`（表 `video_bangumi_rule_subs`）+ 清单 JSON。

---

## 6. 明确不做

- SyncPlay / 一起看  
- Cling DLNA（保持 cast→push）  
- Kazumi 完整 M3U8 广告过滤下载器（仅磁盘缓存+导出）  
- Bangumi OAuth 五态同步  
- Flutter / media_kit  
- 规则写入 Spider `sites[]`  
- 独立 schema module `bangumi`（版本挂在 video v9）  
