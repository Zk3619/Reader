# 番剧模块对齐 Kazumi

> 参考仓：`VideoPlayer/Kazumi-main`（[Predidit/Kazumi](https://github.com/Predidit/Kazumi)）  
> Reader 入口：影视 Hub section `bangumi`（`TvBangumiPane`）  
> **禁止**写入 FongMi `sites[]` / Spider CONFIG（`BANGUMI_ISOLATION_NOTE`）  
> 播放：[VIDEO_PLAYBACK_KERNEL.md](./VIDEO_PLAYBACK_KERNEL.md)；总排期：[VIDEO_CAPABILITY_ROADMAP.md](./VIDEO_CAPABILITY_ROADMAP.md)

---

## 1. 定位差异

| | Kazumi | Reader 影视 Hub | Reader 番剧（本模块） |
|--|--------|-----------------|------------------------|
| 内容模型 | XPath 自定义规则 | FongMi Spider/CONFIG | **独立** XPath 规则（Kazumi 思路） |
| UI | Flutter 全应用 | Solid Hub 分区之一 | 同壳 `bangumi` section，不新开 PageType |
| 播放 | media_kit（mpv） | Artplayer + libmpv/外置 | **复用 PlaybackRouter** |
| 超分 | Anime4K | 影视增强核 | 不在规则层重复；走 libmpv/外置 |

---

## 2. 能力映射与优先级

| Kazumi 能力 | Reader 目标 | 优先级 | 阶段 |
|-------------|-------------|--------|------|
| 规则编辑器（XPath 五行级） | 规则编辑 UI：search/list/name/cover/chapter/play 等字段 | P0 | **E6.1** |
| 规则导入 / 分享 | JSON 导入导出（自有 schema，**非** sites） | P0 | **E6.1** |
| 番剧搜索 | 按启用规则并行搜索 → 结果列表 | P0 | **E6.1** |
| 详情 + 分集播放 | 详情页 + 分集 → `PlaybackRouter` | P0 | **E6.1** |
| 追番列表 | follow 网格可进详情 / 续看 | P0 | **E6.1** |
| 番剧目录 / 时间表 | 时间表 Tab（可先占位） | P1 | E6.2 |
| 历史记录 | `bangumi_*` 历史或复用 `video_play_record` | P1 | E6.2 |
| 番剧弹幕 | 接弹弹 / 现有 danmaku 管线 | P1 | E6.2 |
| 超分辨率 | libmpv / 外置 Anime4K | P1 | 随 E2.1 |
| 外置播放 | 已有 external | 已有 | — |
| 多视频源 | 用户手动切规则（简化） | P2 | 后 |
| 下载 | 延期（统一下载模块） | skip | — |
| 一起看 | 不做 | skip | — |
| 无线投屏 DLNA | 与影视一致：Blocked/降级 push | skip | — |
| 跨设备同步 | 可复用 LOCAL sync 思路 | P2 | 后 |
| 鸿蒙 / iOS 侧载专线 | 不跟 | skip | — |

---

## 3. UI 信息架构（E6.1）

在现有 `bangumi` section 内用 Tab / 子路由（不新增壳 `PageType`）：

```text
追番 Hub
├─ 追番（follow 网格 → 详情）
├─ 搜索（关键词 → 多规则结果）
├─ 时间表（E6.2；E6.1 可灰显占位）
├─ 规则管理（列表 + 编辑器 + 导入/导出）
└─ 详情/选集（分集 → Artplayer / 增强 / 外置）
```

现状（**E6.2**）：[`TvBangumiPane.tsx`](../src/components/media/viewer/video/tv/panes/TvBangumiPane.tsx) Tab：追番 / 搜索 / **时间表** / **历史** / 规则 / 详情；时间表按追番 `updatedAt` 归组；历史见 `bangumi/history.ts`；弹幕复用影视 E3 匹配。

---

## 4. 规则 Schema（E6.1 目标）

扩展 [`bangumi/rules.ts`](../src/lib/media/video/bangumi/rules.ts) 中已有字段，定稿建议：

```ts
type BangumiRuleV2 = {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  userAgent?: string;
  /** 搜索 */
  searchPath?: string;   // 含 {keyword} 占位
  searchList?: string;   // XPath/CSS：结果节点
  searchName?: string;
  searchCover?: string;
  searchLink?: string;
  /** 详情 / 分集 */
  chapterList?: string;
  chapterName?: string;
  chapterLink?: string;
  /** 播放页取链 */
  playUrl?: string;      // 从分集页解析出的媒体 URL 选择器或模板
  version: 2;
};
```

- 持久化键可升为 `reader.bangumi.rules.v2`，读时兼容 v1（仅 name/baseUrl）。  
- **导入/导出**：整包 JSON `{ version, rules: BangumiRuleV2[] }`；**不得**导出为 FongMi `sites` 数组。  
- 落库时表前缀建议 `bangumi_*`（与 `video_*` 影视 Spider 域分离）。

---

## 5. 与 Spider / CONFIG 隔离

| 允许 | 禁止 |
|------|------|
| 独立 localStorage / 未来 `bangumi_*` 表 | 写入 `vod` CONFIG 的 `sites[]` / `spider` |
| 播放走同一 PlaybackRouter | 把 JAR `csp_*` 当番剧规则执行 |
| 文档与设置中标明「追番规则 ≠ 影视源」 | 一键「同步到影视源」类混用入口 |

常量：`BANGUMI_ISOLATION_NOTE`（代码内已有）。

---

## 6. E6 分期与验收

| 子阶段 | 内容 | 验收 |
|--------|------|------|
| **E6.0** | 薄页：添加规则名/URL、追番 toggle | ✅ |
| **E6.1** | 编辑器全字段；导入导出；搜索列表；详情分集；点播走 Router（可先 Artplayer/外置） | ✅（`rules` v2 + `engine` + Tab UI） |
| **E6.2** | 时间表、历史、弹幕 | 时间表有数据或明确空态；历史可续播 |

编码顺序建议：schema + 导入导出 → 搜索引擎（HTTP + 选择器）→ 详情/分集 → UI Tab 化 → 再接弹幕/时间表。

### 示例规则 JSON（结构验收；选择器虚构）

```json
{
  "version": 2,
  "rules": [
    {
      "id": "bg_example_demo",
      "name": "Demo Static",
      "baseUrl": "https://example.com",
      "enabled": true,
      "userAgent": "Mozilla/5.0 ReaderBangumi/1.0",
      "searchPath": "/search?q={keyword}",
      "searchList": ".result-item",
      "searchName": ".title",
      "searchCover": "img@src",
      "searchLink": "a@href",
      "chapterList": ".episode-item",
      "chapterName": ".ep-title",
      "chapterLink": "a@href",
      "playUrl": "video@src",
      "version": 2
    }
  ]
}
```

---

## 7. 参考实现路径（只读）

- 规则与 UI：`VideoPlayer/Kazumi-main`（Flutter；只借鉴模型与交互，不移植 Dart）  
- 超分/播控：与影视增强核共用，勿在番剧模块再嵌一套播放器栈  

---

## 8. 明确不做

- 一起看、完整 Cling DLNA、Kazumi 下载器复刻  
- 番剧规则混入 TVBox/FongMi 源  
- 为番剧单独引入 Flutter / media_kit  
