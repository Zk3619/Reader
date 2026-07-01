/**
 * 正文选区边界与游标位置（对标 Legado cursor_left / cursor_right 布局）
 */

import {
  caretRangeFromClientPoint,
  markReaderTextSelectionActive,
  queryReaderTextContentRoot,
  queryReaderTextContentRootAtPoint,
} from '@/lib/media/text/reader-text-selection-gesture';

export type SelectionHandleSide = 'start' | 'end';

/** Legado ic_cursor_* 为 24dp；游标锚点在字符行底 */
export const READER_SELECTION_CURSOR_SIZE_PX = 24;

export type SelectionHandleLayout = {
  side: SelectionHandleSide;
  /** 游标视图左上角 client 坐标 */
  x: number;
  y: number;
};

const DOM_ELEMENT_NODE = 1;
const DOM_TEXT_NODE = 3;

function isNodeWithinRoot(node: Node | null, root: Element | null | undefined): boolean {
  if (!node || !root) return true;
  const el = node.nodeType === DOM_ELEMENT_NODE ? (node as Element) : node.parentElement;
  return !!el && root.contains(el);
}

const INLINE_REPLACED_TAGS = new Set(['IMG', 'VIDEO', 'SVG', 'CANVAS', 'IFRAME']);

function hasVisualSize(rect: DOMRect): boolean {
  return rect.width > 0 || rect.height > 0;
}

function caretPointRect(left: number, top: number, height: number): DOMRect {
  if (typeof DOMRect !== 'undefined') {
    return new DOMRect(left, top, 0, height);
  }
  return {
    left,
    top,
    right: left,
    bottom: top + height,
    width: 0,
    height,
    x: left,
    y: top,
  } as DOMRect;
}

/** getBoundingClientRect 在元素边界折叠 caret 时常返回 (0,0,0,0)，不可当作有效锚点 */
function isEmptyOriginRect(rect: DOMRect): boolean {
  return rect.left === 0 && rect.top === 0 && rect.width === 0 && rect.height === 0;
}

function isUsableCaretRect(rect: DOMRect): boolean {
  return hasVisualSize(rect) || (!isEmptyOriginRect(rect) && (rect.left !== 0 || rect.top !== 0));
}

function visualInlineBlock(node: Node | null | undefined): Element | null {
  if (!node) return null;
  if (node.nodeType !== DOM_ELEMENT_NODE) return null;
  const el = node as Element;
  if (INLINE_REPLACED_TAGS.has(el.tagName)) return el;
  const nestedImg = el.querySelector('img');
  if (nestedImg) return nestedImg;
  if (el.classList.contains('reader-legado-cmt-img') && hasVisualSize(el.getBoundingClientRect())) {
    return el;
  }
  return null;
}

/** 边界折叠 caret 旁的内联替换元素（img 等），用于补全无效 client rect */
function inlineBlockAtBoundary(range: Range, atStart: boolean): Element | null {
  const container = atStart ? range.startContainer : range.endContainer;
  const offset = atStart ? range.startOffset : range.endOffset;

  if (container.nodeType === DOM_ELEMENT_NODE) {
    const el = container as Element;
    const self = visualInlineBlock(el);
    if (self) return self;
    const before = el.childNodes[offset - 1];
    const at = el.childNodes[offset];
    if (atStart) {
      return visualInlineBlock(at) ?? visualInlineBlock(before);
    }
    return visualInlineBlock(before) ?? visualInlineBlock(at);
  }

  if (container.nodeType === DOM_TEXT_NODE && !atStart && offset === 0) {
    return visualInlineBlock(container.previousSibling);
  }
  if (container.nodeType === DOM_TEXT_NODE && atStart) {
    return visualInlineBlock(container.parentElement);
  }

  return null;
}

function caretRectFromInlineBlock(el: Element, atStart: boolean): DOMRect {
  const rect = el.getBoundingClientRect();
  return caretPointRect(atStart ? rect.left : rect.right, rect.top, rect.height);
}

function pickRangeClientRect(range: Range, atStart: boolean): DOMRect | null {
  const rects = Array.from(range.getClientRects()).filter(hasVisualSize);
  if (rects.length === 0) return null;
  const sorted = rects.sort((a, b) => a.top - b.top || a.left - b.left);
  return atStart ? sorted[0]! : sorted[sorted.length - 1]!;
}

function boundaryCaretRect(range: Range, toStart: boolean): DOMRect {
  const probe = range.cloneRange();
  probe.collapse(toStart);
  const rects = probe.getClientRects();
  if (rects.length > 0) {
    const rect = toStart ? rects[0]! : rects[rects.length - 1]!;
    if (isUsableCaretRect(rect)) return rect;
  }
  const collapsed = probe.getBoundingClientRect();
  if (isUsableCaretRect(collapsed)) return collapsed;

  const inline = inlineBlockAtBoundary(probe, toStart);
  if (inline) {
    const blockRect = caretRectFromInlineBlock(inline, toStart);
    if (isUsableCaretRect(blockRect)) return blockRect;
  }

  const rangeRect = pickRangeClientRect(range, toStart);
  if (rangeRect) return rangeRect;

  const fallback = range.getBoundingClientRect();
  if (hasVisualSize(fallback)) {
    return toStart
      ? caretPointRect(fallback.left, fallback.top, fallback.height)
      : caretPointRect(fallback.right, fallback.top, fallback.height);
  }

  return collapsed;
}

/** 选区起止游标布局：各锚点位于对应行的行底（多行选区时 Y 独立） */
export function getSelectionHandleLayouts(): SelectionHandleLayout[] | null {
  if (typeof window === 'undefined') return null;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  const startRect = boundaryCaretRect(range, true);
  const endRect = boundaryCaretRect(range, false);
  const size = READER_SELECTION_CURSOR_SIZE_PX;
  const endAnchorX = endRect.width > 0 ? endRect.right : endRect.left;

  return [
    {
      side: 'start',
      x: startRect.left - size,
      y: startRect.bottom,
    },
    {
      side: 'end',
      x: endAnchorX,
      y: endRect.bottom,
    },
  ];
}

function layoutFromCaretRect(side: SelectionHandleSide, rect: DOMRect): SelectionHandleLayout {
  const size = READER_SELECTION_CURSOR_SIZE_PX;
  const endAnchorX = rect.width > 0 ? rect.right : rect.left;
  return side === 'start'
    ? { side: 'start', x: rect.left - size, y: rect.bottom }
    : { side: 'end', x: endAnchorX, y: rect.bottom };
}

/** 指针处游标布局（拖拽时即时跟手，不依赖整段选区 layout 重算） */
export function getSelectionHandleLayoutAtPoint(
  side: SelectionHandleSide,
  x: number,
  y: number,
  root?: Element | null,
): SelectionHandleLayout | null {
  if (typeof window === 'undefined') return null;
  const host =
    root instanceof HTMLElement
      ? root
      : typeof document !== 'undefined'
        ? document.body
        : null;
  const contentRoot =
    queryReaderTextContentRootAtPoint(host, x, y) ??
    (root instanceof HTMLElement ? queryReaderTextContentRoot(root) : null);
  const caret = resolveCaretForDrag(x, y, contentRoot);
  if (!caret || !isNodeWithinRoot(caret.startContainer, contentRoot)) return null;
  return layoutFromCaretRect(side, boundaryCaretRect(caret, side === 'start'));
}

function resolveCaretForDrag(
  x: number,
  y: number,
  root?: Element | null,
): Range | null {
  const offsets = [0, -8, -16, -24, -32, 8, 16];
  for (const dy of offsets) {
    const caret = caretRangeFromClientPoint(x, y + dy, root);
    if (caret && isNodeWithinRoot(caret.startContainer, root)) return caret;
  }
  return null;
}

function expandCollapsedRange(range: Range, side: SelectionHandleSide): Range | null {
  if (!range.collapsed) return range;
  const expanded = range.cloneRange();
  try {
    if (side === 'start') {
      expanded.setEnd(expanded.endContainer, expanded.endOffset + 1);
    } else {
      expanded.setStart(expanded.startContainer, Math.max(0, expanded.startOffset - 1));
    }
    if (!expanded.collapsed) return expanded;
  } catch {
    /* try reverse */
  }
  try {
    const fallback = range.cloneRange();
    if (side === 'start') {
      fallback.setStart(fallback.startContainer, Math.max(0, fallback.startOffset - 1));
    } else {
      fallback.setEnd(fallback.endContainer, fallback.endOffset + 1);
    }
    return fallback.collapsed ? null : fallback;
  } catch {
    return null;
  }
}

export type SetSelectionBoundaryOptions = {
  /** 拖拽帧内跳过合成 selectionchange，由调用方自行 sync */
  quiet?: boolean;
};

function normalizeRange(next: Range): Range {
  if (next.collapsed) return next;
  const backwards =
    next.startContainer === next.endContainer
      ? next.startOffset > next.endOffset
      : (next.startContainer.compareDocumentPosition(next.endContainer) &
          Node.DOCUMENT_POSITION_PRECEDING) !==
        0;
  if (!backwards) return next;
  const fixed = document.createRange();
  fixed.setStart(next.endContainer, next.endOffset);
  fixed.setEnd(next.startContainer, next.startOffset);
  return fixed;
}

export type SelectionFrozenAnchor = {
  container: Node;
  offset: number;
};

export type SelectionDragSession = {
  /** 用户按住的游标（start=左/end=右） */
  grabbedSide: SelectionHandleSide;
  /** 对侧锚点，整个拖拽过程不变 */
  frozen: SelectionFrozenAnchor;
  /** pointerdown 时锁定的正文根 */
  contentRoot: HTMLElement | null;
};

function boundaryPointRange(container: Node, offset: number): Range | null {
  if (typeof document === 'undefined') return null;
  const probe = document.createRange();
  try {
    probe.setStart(container, offset);
    probe.collapse(true);
    return probe;
  } catch {
    return null;
  }
}

function compareCaretToFrozen(frozen: SelectionFrozenAnchor, caret: Range): number {
  if (typeof document === 'undefined') return 0;
  const frozenPoint = boundaryPointRange(frozen.container, frozen.offset);
  const caretPoint = caret.cloneRange();
  if (!frozenPoint) return 0;
  try {
    caretPoint.collapse(true);
    return frozenPoint.compareBoundaryPoints(Range.START_TO_START, caretPoint);
  } catch {
    return 0;
  }
}

/** cmp===0 且折叠时，沿 grabbedSide 方向撑开 1 字符 */
function expandCollapsedAtMeeting(
  frozen: SelectionFrozenAnchor,
  grabbedSide: SelectionHandleSide,
): { range: Range; movingSide: SelectionHandleSide } | null {
  if (typeof document === 'undefined') return null;
  const next = document.createRange();
  const tryRange = (
    startContainer: Node,
    startOffset: number,
    endContainer: Node,
    endOffset: number,
    movingSide: SelectionHandleSide,
  ) => {
    try {
      next.setStart(startContainer, startOffset);
      next.setEnd(endContainer, endOffset);
      if (!next.collapsed) return { range: next, movingSide };
    } catch {
      /* next attempt */
    }
    return null;
  };

  const { container, offset } = frozen;
  const attempts: Array<{ start: number; end: number; movingSide: SelectionHandleSide }> =
    grabbedSide === 'start'
      ? [
          { start: Math.max(0, offset - 1), end: offset, movingSide: 'start' },
          { start: offset, end: offset + 1, movingSide: 'end' },
        ]
      : [
          { start: offset, end: offset + 1, movingSide: 'end' },
          { start: Math.max(0, offset - 1), end: offset, movingSide: 'start' },
        ];

  for (const attempt of attempts) {
    const result = tryRange(container, attempt.start, container, attempt.end, attempt.movingSide);
    if (result) return result;
  }
  return null;
}

/** 由冻结锚点 + 指针 caret 构建有序选区，并返回 caret 所在端 */
function buildRangeFromFrozenCaret(
  frozen: SelectionFrozenAnchor,
  caret: Range,
  grabbedSide: SelectionHandleSide,
): { range: Range; movingSide: SelectionHandleSide } | null {
  if (typeof document === 'undefined') return null;

  const cmp = compareCaretToFrozen(frozen, caret);
  const next = document.createRange();

  if (cmp < 0) {
    // frozen 在 caret 之前：有序选区 frozen → caret，caret 为 end
    try {
      next.setStart(frozen.container, frozen.offset);
      next.setEnd(caret.startContainer, caret.startOffset);
      if (!next.collapsed) return { range: next, movingSide: 'end' };
    } catch {
      return null;
    }
  }

  if (cmp > 0) {
    // frozen 在 caret 之后：有序选区 caret → frozen，caret 为 start
    try {
      next.setStart(caret.startContainer, caret.startOffset);
      next.setEnd(frozen.container, frozen.offset);
      if (!next.collapsed) return { range: next, movingSide: 'start' };
    } catch {
      return null;
    }
  }

  return expandCollapsedAtMeeting(frozen, grabbedSide);
}

/** 拖拽帧游标布局：优先从已更新的整段选区取边界（图片等非文本结尾与松手后一致） */
export function getDragHandleLayouts(
  session: SelectionDragSession,
  movingSide: SelectionHandleSide,
  x: number,
  y: number,
): SelectionHandleLayout[] | null {
  const fromSelection = getSelectionHandleLayouts();
  if (fromSelection) return fromSelection;

  const passiveSide: SelectionHandleSide = movingSide === 'start' ? 'end' : 'start';
  const active = getSelectionHandleLayoutAtPoint(movingSide, x, y, session.contentRoot);
  const passive = getSelectionHandleLayoutAtBoundary(
    passiveSide,
    session.frozen.container,
    session.frozen.offset,
  );
  if (!active || !passive) return null;
  return movingSide === 'start' ? [active, passive] : [passive, active];
}

export type SelectionDragPreview = {
  /** 跟手端（图标随 movingSide 切换） */
  active: SelectionHandleLayout;
  /** 冻结端 */
  passive: SelectionHandleLayout;
};

export function buildSelectionDragPreview(
  movingSide: SelectionHandleSide,
  x: number,
  y: number,
  frozen: SelectionFrozenAnchor,
  root?: Element | null,
): SelectionDragPreview | null {
  const fromSelection = getSelectionHandleLayouts();
  if (fromSelection?.length === 2) {
    const active = fromSelection.find((layout) => layout.side === movingSide);
    const passive = fromSelection.find((layout) => layout.side !== movingSide);
    if (active && passive) return { active, passive };
  }

  const active = getSelectionHandleLayoutAtPoint(movingSide, x, y, root);
  const passiveSide: SelectionHandleSide = movingSide === 'start' ? 'end' : 'start';
  const passive = getSelectionHandleLayoutAtBoundary(
    passiveSide,
    frozen.container,
    frozen.offset,
  );
  if (!active || !passive) return null;
  return { active, passive };
}

/** 按下游标时冻结对侧锚点（clone 边界，避免 live Range 漂移） */
export function captureSelectionDragSession(
  grabbedSide: SelectionHandleSide,
  contentRoot?: HTMLElement | null,
): SelectionDragSession | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const live = sel.getRangeAt(0);
  const pinned = document.createRange();
  try {
    if (grabbedSide === 'start') {
      pinned.setStart(live.endContainer, live.endOffset);
    } else {
      pinned.setStart(live.startContainer, live.startOffset);
    }
    pinned.collapse(true);
  } catch {
    return null;
  }
  return {
    grabbedSide,
    frozen: { container: pinned.startContainer, offset: pinned.startOffset },
    contentRoot: contentRoot ?? null,
  };
}

/** @deprecated 使用 captureSelectionDragSession */
export function captureSelectionFrozenAnchor(
  grabbedSide: SelectionHandleSide,
): SelectionFrozenAnchor | null {
  return captureSelectionDragSession(grabbedSide)?.frozen ?? null;
}

/** 对侧锚点处游标布局（拖拽时被动端固定在此） */
export function getSelectionHandleLayoutAtBoundary(
  side: SelectionHandleSide,
  container: Node,
  offset: number,
): SelectionHandleLayout | null {
  if (typeof document === 'undefined') return null;
  const probe = document.createRange();
  try {
    probe.setStart(container, offset);
    probe.collapse(true);
  } catch {
    return null;
  }
  return layoutFromCaretRect(side, boundaryCaretRect(probe, side === 'start'));
}

/** 拖拽游标：冻结对侧锚点，移动侧跟随指针；交叉后自动交换起止并返回当前移动侧。 */
export function setSelectionRangeWithDragSession(
  session: SelectionDragSession,
  x: number,
  y: number,
  _root?: Element | null,
  options?: SetSelectionBoundaryOptions,
): SelectionHandleSide | null {
  const contentRoot = session.contentRoot;
  const caret = resolveCaretForDrag(x, y, contentRoot);
  if (!caret) return null;
  if (contentRoot && !isNodeWithinRoot(caret.startContainer, contentRoot)) return null;

  const built = buildRangeFromFrozenCaret(session.frozen, caret, session.grabbedSide);
  if (!built || built.range.collapsed) return null;

  const sel = window.getSelection();
  if (!sel) return null;

  sel.removeAllRanges();
  sel.addRange(built.range);
  markReaderTextSelectionActive();
  if (!options?.quiet && typeof document !== 'undefined') {
    document.dispatchEvent(new Event('selectionchange'));
  }

  return built.movingSide;
}

/** @deprecated 使用 setSelectionRangeWithDragSession */
export function setSelectionRangeWithFrozenAnchor(
  frozen: SelectionFrozenAnchor,
  x: number,
  y: number,
  root?: Element | null,
  options?: SetSelectionBoundaryOptions,
  grabbedSide: SelectionHandleSide = 'start',
): SelectionHandleSide | null {
  return setSelectionRangeWithDragSession(
    { frozen, grabbedSide, contentRoot: root instanceof HTMLElement ? root : null },
    x,
    y,
    root,
    options,
  );
}

export function setSelectionBoundaryAtPoint(
  side: SelectionHandleSide,
  x: number,
  y: number,
  root?: Element | null,
  options?: SetSelectionBoundaryOptions,
): boolean {
  const host =
    root instanceof HTMLElement
      ? root
      : typeof document !== 'undefined'
        ? document.body
        : null;
  const contentRoot =
    root instanceof HTMLElement && root.hasAttribute('data-reader-content')
      ? root
      : queryReaderTextContentRootAtPoint(host, x, y) ??
        (root instanceof HTMLElement ? queryReaderTextContentRoot(root) : null);

  const caret = resolveCaretForDrag(x, y, contentRoot);
  if (!caret) return false;
  if (contentRoot && !isNodeWithinRoot(caret.startContainer, contentRoot)) return false;

  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;

  const current = sel.getRangeAt(0);
  const next = document.createRange();

  if (side === 'start') {
    next.setStart(caret.startContainer, caret.startOffset);
    next.setEnd(current.endContainer, current.endOffset);
  } else {
    next.setStart(current.startContainer, current.startOffset);
    next.setEnd(caret.startContainer, caret.startOffset);
  }

  let normalized = normalizeRange(next);
  if (normalized.collapsed) {
    normalized = expandCollapsedRange(normalized, side) ?? normalized;
  }
  if (normalized.collapsed) return false;

  sel.removeAllRanges();
  sel.addRange(normalized);
  markReaderTextSelectionActive();
  if (!options?.quiet && typeof document !== 'undefined') {
    document.dispatchEvent(new Event('selectionchange'));
  }
  return sel.toString().length > 0;
}

export function resolveReaderTextContentRootFromContainer(
  container: HTMLElement | null | undefined,
): HTMLElement | null {
  return queryReaderTextContentRoot(container);
}
