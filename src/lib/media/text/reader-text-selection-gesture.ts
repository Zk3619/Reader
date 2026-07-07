/**
 * 正文长按选文与点击/拖拽翻页的互斥（对标 Legado ReadView）
 *
 * 选文：按住不动 → 长按达成 → **松手**时在触点选中**一个字符**，字符下方左右出现游标。
 * 翻页：按下后移动即走横滑翻页，与长按判定互斥。
 */

import {
  caretRangeFromClientPoint,
  queryReaderTextContentRootAtPoint,
} from '@/lib/media/text/reader-text-selection-hit-test';
import { markPagedTurnPointerConsumed } from '@/lib/media/text/reader-paged-pointer-gesture';
import {
  normalizeTextViewerTextSelectDismissScope,
  type TextViewerTextSelectDismissScope,
} from '@/lib/media/text/reader-ui-config';

/** 与 Legado ReadView.longPressTimeout 一致 */
export const READER_TEXT_SELECT_LONG_PRESS_MS = 600;

/** 移动超过此距离则取消长按判定，改判为拖拽翻页（仅计时完成前生效） */
export const READER_TEXT_SELECT_MOVE_SLOP_PX = 10;

/** 触屏/笔按住时允许更大抖动，避免计时未完成即被取消 */
export const READER_TEXT_SELECT_TOUCH_MOVE_SLOP_PX = 22;

/** 选文结束后抑制分区单击的时长（覆盖 click 合成延迟） */
export const READER_TEXT_SELECT_TAP_SUPPRESS_MS = 450;

/** bridge 鼠标兜底路径使用的 pointerId（与 PointerEvent 原生 id 区分） */
export const READER_TEXT_MOUSE_GESTURE_POINTER_ID = -1;

let selectionHandleDragActive = false;
/** 全局：抑制分区单击 / 顶底栏切换（PagedViewport 与 TextViewerPage 共用单例 gesture） */
let regionalTapSuppressUntil = 0;

export function markReaderRegionalTapSuppressed(
  ms: number = READER_TEXT_SELECT_TAP_SUPPRESS_MS,
): void {
  regionalTapSuppressUntil = Date.now() + ms;
}

/** 取消选区时吞掉本次分区/九宫格单击（与按页翻页 suppress 对齐） */
export function markReaderSelectionDismissClickConsumed(
  ms: number = READER_TEXT_SELECT_TAP_SUPPRESS_MS,
): void {
  markReaderRegionalTapSuppressed(ms);
  markPagedTurnPointerConsumed(ms);
}

/** 仅测试用：清除分区单击抑制窗口 */
export function clearReaderRegionalTapSuppress(): void {
  regionalTapSuppressUntil = 0;
}

export function shouldSuppressReaderRegionalTap(): boolean {
  return Date.now() < regionalTapSuppressUntil;
}

export function setSelectionHandleDragActive(active: boolean): void {
  selectionHandleDragActive = active;
}

export function isSelectionHandleDragActive(): boolean {
  return selectionHandleDragActive;
}

export function isReaderHandleSelectMode(config?: { selectText?: boolean | null }): boolean {
  return config?.selectText !== false;
}

/** 选区游标 / 菜单（fixed，DOM 常在 Shell 外） */
export const READER_TEXT_SELECTION_UI_SELECTOR =
  '[data-reader-selection-handle], [data-reader-text-selection-menu]';

export function isReaderTextSelectionUiNode(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object' || !('closest' in target)) return false;
  return Boolean((target as Element).closest(READER_TEXT_SELECTION_UI_SELECTOR));
}

/** 触点是否落在当前非折叠选区的几何范围内 */
export function isPointInActiveTextSelection(x: number, y: number): boolean {
  if (typeof window === 'undefined') return false;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
  if (typeof sel.getRangeAt !== 'function') return false;
  const range = sel.getRangeAt(0);
  const rects = range.getClientRects();
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]!;
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
  }
  const fallback = range.getBoundingClientRect();
  if (fallback.width > 0 || fallback.height > 0) {
    return (
      x >= fallback.left &&
      x <= fallback.right &&
      y >= fallback.top &&
      y <= fallback.bottom
    );
  }
  return false;
}

/** 当前配置下 pointerdown 是否应保留已有选区（不触发取消选） */
export function shouldPreserveTextSelectionOnPointerDown(
  scope: TextViewerTextSelectDismissScope,
  x: number,
  y: number,
): boolean {
  if (scope !== 'outsideHandleAndSelection') return false;
  return isPointInActiveTextSelection(x, y);
}

export function hasNonCollapsedTextSelection(): boolean {
  if (typeof window === 'undefined') return false;
  const sel = window.getSelection();
  return !!sel && !sel.isCollapsed && sel.toString().length > 0;
}

/** 选区或选区 UI 仍视为活跃（失焦后浏览器可能已清选区但游标/标记未同步） */
export function isReaderTextSelectionSurfaceActive(): boolean {
  if (hasNonCollapsedTextSelection()) return true;
  if (typeof document === 'undefined') return false;
  return document.documentElement?.hasAttribute('data-reader-text-selection-active') ?? false;
}

/** 失焦/可见性变化后：浏览器可能已清 DOM 选区，仅同步隐藏游标/菜单 UI，保留 active 标记供首次单击 dismiss */
export function syncReaderTextSelectionSurface(): void {
  if (hasNonCollapsedTextSelection()) return;
  if (typeof document === 'undefined') return;
  if (!document.documentElement?.hasAttribute('data-reader-text-selection-active')) return;
  document.dispatchEvent(new Event(READER_TEXT_SELECTION_CLEARED_EVENT));
}

/** 主区单击优先取消选区；返回 true 表示本次 click 应被吞掉（仅 orphan mark，不含刚建立/live 选区） */
export function dismissReaderTextSelectionOnClick(): boolean {
  if (hasNonCollapsedTextSelection()) return false;
  if (typeof document === 'undefined') return false;
  if (!document.documentElement?.hasAttribute('data-reader-text-selection-active')) return false;
  clearDocumentTextSelection({ keepDismissMark: false });
  clearReaderRegionalTapSuppress();
  return true;
}

export function markReaderTextSelectionActive(): void {
  if (typeof document === 'undefined') return;
  document.documentElement?.setAttribute('data-reader-text-selection-active', '');
}

export function clearReaderTextSelectionActiveMark(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.removeAttribute('data-reader-text-selection-active');
}

/** 选区被清除时派发，供游标/菜单等 UI 立即同步（不依赖 selectionchange 时序） */
export const READER_TEXT_SELECTION_CLEARED_EVENT = 'reader-text-selection-cleared';

export function clearDocumentTextSelection(options?: { keepDismissMark?: boolean }): void {
  if (typeof window === 'undefined') return;
  const sel = window.getSelection();
  sel?.removeAllRanges();
  if (options?.keepDismissMark !== true) {
    clearReaderTextSelectionActiveMark();
  }
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new Event(READER_TEXT_SELECTION_CLEARED_EVENT));
    document.dispatchEvent(new Event('selectionchange'));
  }
}

/** @deprecated 使用 queryReaderTextContentRootAtPoint */
export function queryReaderTextContentRoot(
  container: HTMLElement | null | undefined,
): HTMLElement | null {
  return container?.querySelector<HTMLElement>('[data-reader-content]') ?? null;
}

export { caretRangeFromClientPoint, queryReaderTextContentRootAtPoint };

const DOM_TEXT_NODE = 3;
const DOM_ELEMENT_NODE = 1;
const DOM_FILTER_SHOW_TEXT = 4;

function isNodeWithinRoot(node: Node | null, root: Element | null | undefined): boolean {
  if (!node || !root) return true;
  if (typeof root.contains === 'function' && root.contains(node)) return true;
  const el =
    (node as { nodeType?: number; parentElement?: Element | null }).nodeType === DOM_ELEMENT_NODE
      ? (node as Element)
      : (node as { parentElement?: Element | null }).parentElement;
  return !!el && root.contains(el);
}

/** 在 UTF-16 文本偏移处取一个字符（码点）对应的 start/end 偏移 */
function singleCharOffsetsInText(text: string, offset: number): { start: number; end: number } | null {
  if (!text.length) return null;
  const units = [...text];
  let unitStart = 0;
  for (let i = 0; i < units.length; i++) {
    const unit = units[i]!;
    const unitEnd = unitStart + unit.length;
    if (offset >= unitStart && offset < unitEnd) {
      return { start: unitStart, end: unitEnd };
    }
    unitStart = unitEnd;
  }
  const last = units[units.length - 1]!;
  return { start: text.length - last.length, end: text.length };
}

function resolveTextNodeAndOffset(
  node: Node,
  offset: number,
): { node: Text; offset: number } | null {
  if ((node as { nodeType?: number }).nodeType === DOM_TEXT_NODE) {
    return { node: node as Text, offset };
  }
  if ((node as { nodeType?: number }).nodeType !== DOM_ELEMENT_NODE) return null;
  const el = node as Element;
  if (el.childNodes.length === 0) return null;
  const child = el.childNodes[Math.min(offset, el.childNodes.length - 1)];
  if (!child) return null;
  if ((child as { nodeType?: number }).nodeType === DOM_TEXT_NODE) {
    return { node: child as Text, offset: 0 };
  }
  const walker = document.createTreeWalker(el, DOM_FILTER_SHOW_TEXT);
  const first = walker.nextNode();
  if ((first as { nodeType?: number } | null)?.nodeType === DOM_TEXT_NODE) {
    return { node: first as Text, offset: 0 };
  }
  return null;
}

/** 长按松手：选中指针附近的一个字符 */
export function selectCharacterAtClientPoint(
  x: number,
  y: number,
  root?: Element | null,
): boolean {
  const rootsToTry: (Element | null | undefined)[] = [
    root,
    queryReaderTextContentRootAtPoint(typeof document !== 'undefined' ? document.body : null, x, y),
    null,
  ];

  for (const tryRoot of rootsToTry) {
    const hit = caretRangeFromClientPoint(x, y, tryRoot ?? undefined);
    if (!hit) continue;
    if (tryRoot && !isNodeWithinRoot(hit.startContainer, tryRoot)) continue;

    const resolved = resolveTextNodeAndOffset(hit.startContainer, hit.startOffset);
    if (!resolved) continue;

    const { node, offset } = resolved;
    const text = node.textContent ?? '';
    const span = singleCharOffsetsInText(text, offset);
    if (!span) continue;

    const charRange = document.createRange();
    charRange.setStart(node, span.start);
    charRange.setEnd(node, span.end);

    const sel = window.getSelection();
    if (!sel) return false;

    sel.removeAllRanges();
    sel.addRange(charRange);

    if (typeof document !== 'undefined') {
      markReaderTextSelectionActive();
      document.dispatchEvent(new Event('selectionchange'));
    }

    return sel.toString().length > 0;
  }

  return false;
}

/** @deprecated 使用 selectCharacterAtClientPoint */
export function selectWordAtClientPoint(
  x: number,
  y: number,
  root?: Element | null,
): boolean {
  return selectCharacterAtClientPoint(x, y, root);
}

export type ReaderTextSelectionGestureHandle = {
  reset: () => void;
  dispose: () => void;
  onPointerDown: (
    e: Pick<PointerEvent, 'clientX' | 'clientY' | 'pointerId' | 'pointerType'>,
    container: HTMLElement,
    target?: EventTarget | null,
  ) => void;
  onPointerMove: (
    e: Pick<PointerEvent, 'clientX' | 'clientY' | 'pointerId' | 'pointerType'>,
    container: HTMLElement,
  ) => void;
  onPointerUp: (e: Pick<PointerEvent, 'clientX' | 'clientY' | 'pointerId'>) => boolean;
  onPointerCancel: () => void;
  blocksPagedDrag: () => boolean;
  shouldSuppressRegionalTap: () => boolean;
  cancelLongPressIntent: () => void;
};

export function createReaderTextSelectionGesture(options: {
  enabled: () => boolean;
  /** 顶底栏隐藏时才允许发起长按选文 */
  canStartLongPress?: () => boolean;
  /** 点击取消选区范围（默认游标与选区外） */
  getDismissScope?: () => TextViewerTextSelectDismissScope | undefined | null;
}): ReaderTextSelectionGestureHandle {
  let activePointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  /** 长按计时完成前是否移动超过阈值 */
  let movedBeforeLongPress = false;
  let longPressTimer: ReturnType<typeof setTimeout> | undefined;
  /** 长按计时已到，待松手提交选区 */
  let selectionPendingOnRelease = false;
  let pressOnTextSelected = false;
  /** 点击落在选区文字上：保留选区并吞掉本次 click */
  let consumeClickOnSelectionBody = false;
  let contentRoot: Element | null = null;
  let gestureHost: HTMLElement | null = null;
  let longPressArmedEl: Element | null = null;
  /** pointerdown 时快照：计时/提交不再受顶底栏中途显隐影响 */
  let longPressChromeAllowed = false;

  const canLongPress = () => options.canStartLongPress?.() ?? true;

  const hasActiveLongPressSession = () =>
    activePointerId !== null &&
    (longPressTimer !== undefined || selectionPendingOnRelease || longPressChromeAllowed);

  const clearLongPressArmedVisual = () => {
    longPressArmedEl?.removeAttribute?.('data-reader-long-press-armed');
    longPressArmedEl = null;
  };

  const moveSlopPx = (pointerType: string) =>
    pointerType === 'touch' || pointerType === 'pen'
      ? READER_TEXT_SELECT_TOUCH_MOVE_SLOP_PX
      : READER_TEXT_SELECT_MOVE_SLOP_PX;

  const clearLongPressTimer = () => {
    if (longPressTimer !== undefined) {
      clearTimeout(longPressTimer);
      longPressTimer = undefined;
    }
  };

  const markSuppressTap = () => {
    markReaderSelectionDismissClickConsumed();
  };

  const resetPointerSession = () => {
    clearLongPressTimer();
    clearLongPressArmedVisual();
    activePointerId = null;
    movedBeforeLongPress = false;
    selectionPendingOnRelease = false;
    consumeClickOnSelectionBody = false;
    pressOnTextSelected = false;
    contentRoot = null;
    gestureHost = null;
    longPressChromeAllowed = false;
  };

  const reset = () => {
    clearLongPressTimer();
    clearLongPressArmedVisual();
    activePointerId = null;
    movedBeforeLongPress = false;
    selectionPendingOnRelease = false;
    pressOnTextSelected = false;
    consumeClickOnSelectionBody = false;
    contentRoot = null;
    gestureHost = null;
    longPressChromeAllowed = false;
  };

  const onLongPressTimeout = () => {
    longPressTimer = undefined;
    if (
      activePointerId === null ||
      movedBeforeLongPress ||
      !options.enabled() ||
      !longPressChromeAllowed
    ) {
      return;
    }
    selectionPendingOnRelease = true;
    clearLongPressArmedVisual();
    longPressArmedEl =
      (gestureHost?.classList?.contains?.('reader-paged-viewport') ? gestureHost : null) ??
      gestureHost?.closest?.('.reader-paged-viewport') ??
      contentRoot?.closest?.('.reader-paged-viewport') ??
      gestureHost ??
      null;
    longPressArmedEl?.setAttribute?.('data-reader-long-press-armed', '');
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(12);
      } catch {
        /* ignore */
      }
    }
  };

  const commitSelectionOnRelease = (): boolean => {
    if (
      !selectionPendingOnRelease ||
      movedBeforeLongPress ||
      !options.enabled() ||
      !longPressChromeAllowed
    ) {
      return false;
    }
    const host = gestureHost;
    const root =
      (host ? queryReaderTextContentRootAtPoint(host, startX, startY) : null) ??
      contentRoot ??
      queryReaderTextContentRootAtPoint(
        typeof document !== 'undefined' ? document.body : null,
        startX,
        startY,
      );
    return selectCharacterAtClientPoint(startX, startY, root);
  };

  const onPointerDown = (
    e: Pick<PointerEvent, 'clientX' | 'clientY' | 'pointerId' | 'pointerType'>,
    container: HTMLElement,
    target: EventTarget | null = null,
  ) => {
    if (!options.enabled() || isSelectionHandleDragActive()) return;
    if (isReaderTextSelectionUiNode(target)) return;

    clearLongPressTimer();
    clearLongPressArmedVisual();
    consumeClickOnSelectionBody = false;
    pressOnTextSelected = false;
    movedBeforeLongPress = false;
    selectionPendingOnRelease = false;
    longPressChromeAllowed = false;

    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    gestureHost = container;

    if (hasNonCollapsedTextSelection()) {
      const dismissScope = normalizeTextViewerTextSelectDismissScope(
        options.getDismissScope?.(),
      );
      if (shouldPreserveTextSelectionOnPointerDown(dismissScope, e.clientX, e.clientY)) {
        consumeClickOnSelectionBody = true;
        return;
      }
      clearDocumentTextSelection({ keepDismissMark: true });
      pressOnTextSelected = true;
      return;
    }

    if (isReaderTextSelectionSurfaceActive()) {
      clearDocumentTextSelection({ keepDismissMark: true });
      pressOnTextSelected = true;
      return;
    }

    if (!canLongPress()) return;

    longPressChromeAllowed = true;
    contentRoot = queryReaderTextContentRootAtPoint(container, startX, startY);
    longPressTimer = setTimeout(onLongPressTimeout, READER_TEXT_SELECT_LONG_PRESS_MS);
  };

  const onPointerMove = (
    e: Pick<PointerEvent, 'clientX' | 'clientY' | 'pointerId' | 'pointerType'>,
    _container: HTMLElement,
  ) => {
    if (!options.enabled() || activePointerId !== e.pointerId) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const slop = moveSlopPx(e.pointerType);
    const exceededSlop = Math.abs(dx) > slop || Math.abs(dy) > slop;

    if (selectionPendingOnRelease) {
      // 振动后等待松手：不因抬手微动取消（横滑翻页由 cancelLongPressIntent 取消）
      return;
    }

    if (!movedBeforeLongPress && exceededSlop) {
      movedBeforeLongPress = true;
      clearLongPressTimer();
      longPressChromeAllowed = false;
    }
  };

  const onPointerUp = (e: Pick<PointerEvent, 'clientX' | 'clientY' | 'pointerId'>) => {
    const consumeClick = pressOnTextSelected || consumeClickOnSelectionBody;
    if (activePointerId !== null && e.pointerId !== activePointerId) {
      return shouldSuppressReaderRegionalTap() || consumeClick;
    }
    clearLongPressTimer();
    const shouldSelectOnRelease = selectionPendingOnRelease && !movedBeforeLongPress;
    if (shouldSelectOnRelease) {
      commitSelectionOnRelease();
      markSuppressTap();
    } else if (consumeClick) {
      markSuppressTap();
    }
    const suppressClick = shouldSuppressReaderRegionalTap() || consumeClick;
    resetPointerSession();
    return suppressClick;
  };

  const onPointerCancel = () => {
    clearLongPressTimer();
    clearLongPressArmedVisual();
    resetPointerSession();
  };

  const blocksPagedDrag = () => {
    if (!options.enabled()) return false;
    if (isSelectionHandleDragActive()) return true;
    if (selectionPendingOnRelease && activePointerId !== null) return true;
    if (hasActiveLongPressSession()) return true;
    if (!canLongPress()) return false;
    return (
      activePointerId !== null &&
      !movedBeforeLongPress &&
      longPressTimer !== undefined
    );
  };

  const shouldSuppressRegionalTap = () => {
    if (!options.enabled()) return false;
    if (shouldSuppressReaderRegionalTap()) return true;
    if (pressOnTextSelected) return true;
    return false;
  };

  const cancelLongPressIntent = () => {
    clearLongPressTimer();
    clearLongPressArmedVisual();
    selectionPendingOnRelease = false;
    longPressChromeAllowed = false;
    movedBeforeLongPress = true;
  };

  return {
    reset,
    dispose: reset,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    blocksPagedDrag,
    shouldSuppressRegionalTap,
    cancelLongPressIntent,
  };
}
