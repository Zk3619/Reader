# 文本阅读器（text-viewer）已实现但未启用的能力

> 说明 `Reader/src/components/viewer/text-viewer` 与 `TextViewerPage` 中**代码已存在、当前产品路径未使用或未接数据**的部分，便于后续接入时少踩坑。

## 1. 段评数字气泡 + 宽屏分栏占位面板

### 行为（保留）

| 环节 | 位置 | 说明 |
|------|------|------|
| 气泡 UI | `ReaderContent.tsx` | `getSegmentCommentCount > 0` 时在章节标题（`segmentIndex=0`）或段落旁渲染 `reader-comment-bubble` |
| 点击回调 | `TextViewerPage.openComments` | 设置 `commentsSegment` 并 `setCommentsOpen(true)` |
| 宽屏布局 | `TextViewerPage` `Show when={isWideScreen() && (commentsOpen() \|\| panelClosing())}` | 正文区与右侧 `reader-comments-panel`（固定 `w-80`）并排；**非** `@/components/ui/resizable` 拖拽分栏，而是打开面板时正文自动变窄 |
| 窄屏 | `ReaderCommentsDrawer` + `AppDrawer` | 底部抽屉展示同一块占位内容 |
| 列表数据 | `ReaderCommentsDrawer.getSegmentComments` | 恒返回 `[]`，面板显示「暂无段评」占位文案 |

### 当前状态（2025-06）

- **`getSegmentCommentCount` 恒返回 `0`**：已移除章节标题、首段的演示气泡（此前 `segmentIndex <= 1` 固定返回 `3`）。
- 接入真实段评后，在 `TextViewerPage` 实现计数即可重新显示气泡；**无需改** `openComments` / 宽屏分栏 / Drawer 逻辑。

### 接入提示

```ts
// TextViewerPage.tsx — 示例
const getSegmentCommentCount = (chapterIndex: number, segmentIndex: number) =>
  commentCountStore.get(chapterIndex, segmentIndex) ?? 0;
```

段落索引约定（与 `ReaderContent` 注释一致）：

- `0`：章节标题行  
- `1` 起：正文块索引 + 1（`blockIndex + 1`）

Legado `para` 与 Reader `segmentIndex` 的换算见 `segmentIndexFromReviewUrl`（`legado-image-options.ts`：`para + 1`）。

---

## 2. Legado 内联段评图（showCmt）— **已启用，与上一节不同路径**

| 能力 | 位置 | 状态 |
|------|------|------|
| 正文内段评 SVG/图 | `ReaderInlineImg` + `paragraphHasLegadoCommentImg` | ✅ 点击走 `openParagraphReviewFromClick` → **InnerWeb** 抽屉 |
| 隐藏重复数字气泡 | `ParagraphWithParts` 中 `hideMockBubble` | ✅ 段内已有 Legado 段评图时不显示 `reader-comment-bubble` |

**未接线**：`segmentIndexFromReviewUrl` 未用于在宽屏下同时打开 `ReaderCommentsDrawer`；若希望「点 Legado 气泡也打开右侧占位面板」，可在 `ReaderContent` 的 `onLegadoCommentClick` 中解析 URL 后调用 `onOpenComments(chapterIndex, segmentIndex)`。

书源 `ruleReview`（`ReviewRule`）已入库（`sources.ruleReview`），**尚无规则引擎执行**；与 Max 的段评规则解析未对接。

---

## 3. `hideCommentBubbles`（沉浸 / 无气泡模式）

- **定义**：`ReaderContentProps.hideCommentBubbles`  
- **用途**：为 true 时隐藏所有 `reader-comment-bubble`（注释写明「沉浸模式下不显示气泡」）。  
- **现状**：`TextViewerPage` **未传入**；沉浸模式若需隐藏气泡，在渲染 `ReaderContent` 时绑定 `hideCommentBubbles={() => immersiveMode()}` 即可。

---

## 4. 宽屏段评面板动画状态机

| Signal | 作用 |
|--------|------|
| `panelEntering` | 打开时先 `w-0`，双 `rAF` 后展开，避免首帧闪烁 |
| `panelClosing` | 关闭时先收宽度， `transitionEnd` 后再 `setCommentsOpen(false)` |

窄屏 Drawer 无此动画，直接 `setCommentsOpen`。

---

## 5. 与 SourceEdit 不同的「可调整分栏」

- 书源编辑页使用 `@corvu/resizable`（`SourceEditPage`）。  
- 阅读器段评侧栏为 **CSS `transition-[width]` + 固定 `w-80`**，未复用 `Resizable` 组件。  
- 若需用户拖拽调整段评区宽度，可在此处分栏外包 `Resizable` / `ResizablePanel`，并保留 `panelClosing` 与 `scrollContainer` 宽度联动。

---

## 6. 其它 text-viewer 相关、易忽略项

| 项 | 说明 |
|----|------|
| `onLegadoCommentClick` 覆盖 | `ReaderContent` 支持自定义；未传时默认 `openParagraphReviewFromClick` |
| `getSegmentComments` / `SegmentCommentItem` | 类型与列表 UI 已写好，等 API |
| `ReaderContent` `applyReadWidth` | 窄屏正文 `applyReadWidth={() => false}` 占满宽；宽屏双页时仍受 `dualPage` 影响 |
| 段评 InnerWeb preset | `INNER_WEB_PRESETS.paragraphReview`、`inner-web-document-html` 的 `get_para_review` base 处理 | ✅ Legado 段评页在用 |
| `FEATURE_MATRIX.md` §5 段评 | 标记为 🟡 UI 无数据 — 与本文件一致 |

---

## 7. 建议实施顺序

1. 段评列表 API + `getSegmentComments`  
2. 段评计数 API + `getSegmentCommentCount`（气泡按需显示）  
3. （可选）`ruleReview` 规则引擎或与 Legado 聚合 API 统一  
4. （可选）Legado 点击 ↔ `openComments` 统一入口；或继续 InnerWeb 专用于 H5 段评页  
5. （可选）`Resizable` 侧栏、`hideCommentBubbles` 与沉浸模式联动  

---

## 相关文件

- `src/pages/viewer/TextViewerPage.tsx` — `openComments`、`getSegmentCommentCount`、宽屏分栏  
- `src/components/viewer/text-viewer/ReaderContent.tsx` — 气泡渲染、`segmentIndex`  
- `src/components/viewer/text-viewer/ReaderCommentsDrawer.tsx` — 占位面板  
- `src/lib/book-source/legado-paragraph-review.ts` — Legado showCmt → InnerWeb  
- `src/lib/js-engine/legado/legado-image-options.ts` — `segmentIndexFromReviewUrl`  
- `src/types/rule/review-rule.ts` — `ReviewRule` 类型（库表已有字段）
