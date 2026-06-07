### 1. Prepare（测量层）— 保留 DOM，但**只用于测量**

**现状**：测量与渲染共用 live `ReaderContent` + `columns-2`。

**改法**：

- 独立 **隐藏测量根**（`visibility:hidden; position:fixed; left:-9999px`）
- 宽度 = **spread 全宽**，仅在此处使用 `columns-2` + **`column-fill: auto`**（先填满左栏再进右栏，对齐 Legado）
- 产出并 **写入 layout 缓存**：
  - `segments[]`：含 `column: 0|1`、`blockIndex`
  - 可选 `blockMetrics[]`：块顶/底（按栏归一化 Y，见下）
- **不再**在 live 渲染树里依赖 `columns-2`

关键修复：**每栏独立 Y 坐标系**

```typescript
// 测量后归一化：左栏 Y' = top - minTop(column 0)
// 右栏同理。分页、displayHeight、clip 全用 Y'
```

这能消掉「坐标系混用、缓存缺 column、rightPageStarts 算成 1px」一类问题。

---

### 2. Layout（分页层）— 纯算术，**禁止读 live DOM**

**保留**现有 `computeDualSpreadPageStarts` 思路（左右栏各自 `computePageStartsFromSegments`，再按 spread 合并），但：

| 规则 | 说明 |
|------|------|
| 输入 | 仅 segments + clipHeight + column |
| 输出 | `pageStarts` / `rightPageStarts` / `pages[].displayHeight` |
| 禁止 | 翻页、resize 时读 `getBoundingClientRect` |
| displayHeight | 只用 **该栏 segments**，不用全栏 `pages[]` 缓存 |

Legado 语义（与你们测试一致）：**同一 spread 上，左栏页 N 与右栏页 N 独立分页**，允许左 2 行、右 1 行。

---

### 3. Render（渲染层）— **去掉 CSS 双栏，只做视口切片**

**删除或弃用**：

- live 上的 `columns-2`
- 双份完整 `ReaderContent`
- `shift 200%` + `margin-left: -50%`
- 用 pane 高度绑 column span（已导致「双页变单页」）

**改为 Pretext 式「固定宽度 + 游标窗口」**：

```
┌─────────────┬─────────────┐
│ 左 pane 50% │ 右 pane 50% │
│ column-count: 1           │
│ width: columnWidth        │
│ overflow: hidden          │
│ translateY(-leftY)        │
│ clipH: leftDisplayH       │
└─────────────┴─────────────┘
```

两种实现路径（推荐 B）：

| 方案 | 做法 | 优点 | 缺点 |
|------|------|------|------|
| A. 单 DOM + 双 clip | 一份内容，两 pane 裁切 | DOM 节点少 | 仍依赖全宽排版，易回退到 columns 问题 |
| **B. 双单栏 DOM** | 每 pane **单栏宽**、`column-count:1`，`translateY` 进该栏页界 | 与 Layout 一致，WebView clip 可靠 | 两份 DOM（可右栏 `measureBlocks={false}`） |

方案 B 的优化：右栏不重复测量，只跟左栏同一 layout 偏移；内容 HTML 相同，**排版宽度不同**（单栏宽），与 Pretext「同一 prepared text、不同 maxWidth 做 layout」同构。

已有 **`visibleBlockIndices`** 可作为后续优化（按 block 裁剪），第一版用 **单栏宽 + translateY + clip** 即可。

---

## `layoutReaderChapter` 怎么调整

不必强制「双页 = 纯 DOM 且与 Canvas 互斥」。可拆成：

```typescript
layoutReaderChapter(input) {
  // 1. Prepare：始终 DOM（复杂 HTML 需要）
  const measured = measureChapterDom({ dualPage, columnFill: 'auto', ... });

  // 2. Layout：纯 TS
  const spreadLayout = input.dualPage
    ? layoutDualSpreadFromSegments(measured)
    : layoutSingleColumnFromSegments(measured);

  // 3. 纯文本可选：Canvas/Pretext 与 DOM 对比（仅当 !dualPage 或作校验）
  if (!input.dualPage && canUseCanvasLayout) { ... }
}
```

双页 **不再禁用 Canvas 作参照**；Canvas 仅用于单栏校验或纯文本加速，**不参与双页 render**。

---
