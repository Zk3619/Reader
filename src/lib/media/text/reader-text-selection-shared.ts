/**
 * 阅读器正文选文手势单例（PagedViewport / TextViewerPage 共用同一状态机）
 */

import {
  createReaderTextSelectionGesture,
  isReaderHandleSelectMode,
  isSelectionHandleDragActive,
  shouldSuppressReaderRegionalTap,
  type ReaderTextSelectionGestureHandle,
} from '@/lib/media/text/reader-text-selection-gesture';
import { textViewerStore } from '@/stores/viewer';

let sharedGesture: ReaderTextSelectionGestureHandle | null = null;
let selectStartGuardAttached = false;
/** 顶底栏隐藏时才允许长按选文（由 TextViewerPage 注入） */
let readerTextSelectChromeGate: () => boolean = () => false;

export function setReaderTextSelectChromeGate(gate: () => boolean): void {
  readerTextSelectChromeGate = gate;
}

export function canStartReaderTextLongPress(): boolean {
  return readerTextSelectChromeGate();
}

/** 主区单击（九宫格/顶底栏）是否应被吞掉 */
export function shouldBlockReaderContentPrimaryClick(): boolean {
  if (shouldSuppressReaderRegionalTap()) return true;
  return getSharedReaderTextSelectionGesture().shouldSuppressRegionalTap();
}

function ensureReaderTextSelectStartGuard(): void {
  if (selectStartGuardAttached || typeof document === 'undefined') return;
  selectStartGuardAttached = true;
  document.addEventListener(
    'selectstart',
    (e) => {
      if (!isReaderHandleSelectMode(textViewerStore.state.config)) return;
      if (isSelectionHandleDragActive()) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('[data-reader-content]')) return;
      e.preventDefault();
    },
    true,
  );
}

export function getSharedReaderTextSelectionGesture(): ReaderTextSelectionGestureHandle {
  ensureReaderTextSelectStartGuard();
  if (!sharedGesture) {
    sharedGesture = createReaderTextSelectionGesture({
      enabled: () => textViewerStore.state.config.selectText !== false,
      canStartLongPress: () => canStartReaderTextLongPress(),
    });
  }
  return sharedGesture;
}

/** 仅测试用 */
export function resetSharedReaderTextSelectionGesture(): void {
  sharedGesture?.dispose();
  sharedGesture = null;
  readerTextSelectChromeGate = () => false;
}

export function isSelectionAnchorInReaderContent(): boolean {
  if (typeof window === 'undefined') return false;
  const sel = window.getSelection();
  if (!sel?.anchorNode) return false;
  const node = sel.anchorNode;
  const el =
    (node as { nodeType?: number }).nodeType === 3
      ? (node as Text).parentElement
      : (node as Element);
  return !!el?.closest('[data-reader-content]');
}

/** 当前选区所在的正文根（按页/滚动共用；优先锚点所在可见层，避免命中测量层） */
export function resolveReaderContentRootFromSelection(
  container?: HTMLElement | null,
): HTMLElement | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  const sel = window.getSelection();
  const anchor = sel?.anchorNode;
  if (anchor) {
    const el =
      (anchor as { nodeType?: number }).nodeType === 3
        ? (anchor as Text).parentElement
        : (anchor as Element);
    const root = el?.closest('[data-reader-content]');
    if (root instanceof HTMLElement) {
      if (!root.closest('.reader-paged-measure-host')) {
        return root;
      }
    }
  }

  if (container) {
    const live = container.querySelector<HTMLElement>(
      '.reader-paged-live-inner:not(.reader-paged-live-suppressed) [data-reader-content]',
    );
    if (live && !live.closest('.reader-paged-measure-host')) {
      return live;
    }
    for (const root of container.querySelectorAll<HTMLElement>('[data-reader-content]')) {
      if (root.closest('.reader-paged-measure-host')) continue;
      const rect = root.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) return root;
    }
  }

  return container?.querySelector<HTMLElement>('[data-reader-content]') ?? null;
}

export { isReaderTextSelectionUiNode, READER_TEXT_SELECTION_UI_SELECTOR } from '@/lib/media/text/reader-text-selection-gesture';
