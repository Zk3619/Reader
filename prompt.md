# 提示词

你在完全没有实现Legado的功能时就添加兼容，这不是正确做法！因为legado本身是能正常识别的，如果你一比一复刻它的功能逻辑，应该不会出问题才对！而你反而依靠强制兼容来实现对应功能！







## 1. 目录正倒序：已与 Legado 对齐（已实现）

Legado 在 `BookChapterList` 里的逻辑是：

1. `chapterList` 以 `-` 开头 → `reverse=true`，去掉前缀；`+` 只去掉前缀  
2. 多页章节合并后：若 `!reverse` 则 **整表 reverse**  
3. `LinkedHashSet` 按 **url** 去重（实现上等价于先 reverse 再去重）  
4. 若 `!book.getReverseToc()` 再 **reverse** 一次  
5. 重排 `index`  
6. 最后跑 `formatJs`（全书目录）

Reader 原先注释写「倒序在阅读配置里处理」，实际未做上述步骤。

**本次改动**（`chapters.ts`）：

- 新增 `parseTocChapterListRule`、`finalizeTocChapterOrder`  
- `getChapterList(source, tocUrl, { reverseToc })` 在全部页抓完后统一排序  
- `formatJs` 移到排序之后（与 Legado 一致）  
- `update-toc` / `reader` 补拉目录 / `save-book-to-shelf` 传入 `book.readConfig?.reverseToc`

八叉书库 `chapterList: "dl dd,dt"` 无 `-` 前缀、默认 `reverseToc=false` 时，与 Legado 一样：**两次 reverse 抵消，保持「第 1 页章节 + 第 2 页章节 + …」的拼接顺序**。

---

## 2. 渐进加载：Legado 有，Reader 目前没有

| 维度 | Legado_Max | Reader |
|------|------------|--------|
| 开关 | `AppConfig.isTocPartialLoad` | **无** |
| API | `WebBook.getChapterListFlow` → `PartialChapterList` | 仅 `getChapterList` 一次性返回 |
| 详情页 | `BookInfoViewModel` 边收 Flow 边刷新列表、写库 | `BookInfoPage` 等整表 `getChapterList` 完成 |
| 阅读页 | `ReadBookViewModel.loadChapterListProgressive`：目录覆盖到 `durChapterIndex` 即可进正文，后台继续拉 | `readerStore.openBook` 先读 DB；无章节再 **整表** `fetchChapterList` |
| 多页请求 | 多 URL 时 `mapAsync` 并发（渐进模式降为 1 线程 + 页间 delay） | `pendingTocPages` **串行** |
| 中间态 | `isComplete=false` 时增量写库、`onChapterListUpdated(loadContent=false)` | 无中间 emit |
| 事件 | `TOC_PARTIAL_LOADED` / `TOC_LOAD_COMPLETE` | 无 |

**差异影响（以八叉 15 页目录为例）：**

- Legado 开渐进：第一页出来就能看目录/可能提前开读；Reader 必须等全部页抓完（串行更慢）。  
- Legado 关渐进 + 多 URL：并发拉页；Reader 仍串行。  
- Reader **没有**「边加载边进入正文」——这是产品能力差距，不是规则解析差距。

若要补齐，需要：`getChapterListFlow`（或回调/onProgress）、详情/阅读页订阅增量、DB 增量写入，并决定是否做并发与 `concurrentRate` 页间间隔。

---

## 3. 安全阈值是否有必要？

**有必要保留，建议默认开启。**

| 理由 | 说明 |
|------|------|
| Legado 无硬上限 | 八叉靠 JS 返回有限 URL；异常 `nextTocUrl`（死循环、错误规则）可能无限 `pending` |
| Reader 串行也更危险 | 虽比并发温和，坏规则仍会长时间阻塞 |
| 八叉 15 页 | 远低于默认 **80 页**，正常不受影响 |
| 可配置 | 设置里可关或调到 2000；专八叉可关，通用客户端建议开 |

**与 Legado 的关系：** 不是 Legado 行为复刻，而是 Reader（Web/无原生线程池）的 **防御性设计**。Legado 靠用户自觉 + 站点规则；Reader 多一层兜底合理。

**可选优化：** 默认 80 对超大书偏紧；可改为「仅当 `pendingTocPages` 循环/重复 URL 时熔断」，或按书源 `concurrentRate` 动态上限——那是增强，不否定当前阈值价值。

---

**总结：** 正倒序已与 Legado 对齐；渐进加载 Reader 尚未实现，大目录体验会弱于 Legado；安全阈值建议保留，对八叉无影响，对异常书源有必要。若你接下来要做渐进加载，可以从 `getChapterList` 拆出按页回调 + `update-toc`/阅读页增量写库开始。