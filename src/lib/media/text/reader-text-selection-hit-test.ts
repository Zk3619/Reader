/**
 * 正文选区命中：按页多层 DOM / caretRangeFromPoint 不可用时的回退
 */

/** DOM 节点类型常量（避免测试环境无 Node 全局） */
const DOM_TEXT_NODE = 3;
const DOM_ELEMENT_NODE = 1;
const DOM_FILTER_SHOW_TEXT = 4;

export function isNodeWithinReaderRoot(
  node: Node | null,
  root: Element | null | undefined,
): boolean {
  if (!node || !root) return true;
  const el =
    (node as { nodeType?: number; parentElement?: Element | null }).nodeType === DOM_ELEMENT_NODE
      ? (node as Element)
      : (node as { parentElement?: Element | null }).parentElement;
  return !!el && root.contains(el);
}

function isElementVisibleForHit(el: Element): boolean {
  if (typeof window === 'undefined') return true;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const opacity = Number.parseFloat(style.opacity);
  if (Number.isFinite(opacity) && opacity <= 0) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

function isMeasureHostElement(el: Element): boolean {
  if (el.classList?.contains('reader-paged-measure-host')) return true;
  const closest = el.closest?.('.reader-paged-measure-host');
  return !!closest;
}

/** 触点处可见的 data-reader-content（避免命中隐藏测量层） */
export function queryReaderTextContentRootAtPoint(
  container: HTMLElement | null | undefined,
  x: number,
  y: number,
): HTMLElement | null {
  if (!container) return null;

  if (typeof document !== 'undefined' && typeof document.elementsFromPoint === 'function') {
    let fallback: HTMLElement | null = null;
    for (const el of document.elementsFromPoint(x, y)) {
      if (!el || typeof el !== 'object' || !('closest' in el)) continue;

      const liveInner = (el as Element).closest(
        '.reader-paged-live-inner:not(.reader-paged-live-suppressed)',
      );
      if (liveInner) {
        const liveRoot = liveInner.querySelector<HTMLElement>('[data-reader-content]');
        if (
          liveRoot &&
          container.contains(liveRoot) &&
          isElementVisibleForHit(liveRoot)
        ) {
          return liveRoot;
        }
      }

      const root = (el as Element).closest('[data-reader-content]');
      if (
        root &&
        typeof root === 'object' &&
        'getBoundingClientRect' in root &&
        container.contains(root as Node) &&
        isElementVisibleForHit(root as Element)
      ) {
        if (isMeasureHostElement(root as Element)) continue;
        if (!fallback) fallback = root as HTMLElement;
      }
    }
    if (fallback) return fallback;
  }

  const roots = container.querySelectorAll<HTMLElement>('[data-reader-content]');
  for (const root of roots) {
    if (!isElementVisibleForHit(root)) continue;
    const rect = root.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return root;
    }
  }

  return container.querySelector<HTMLElement>('[data-reader-content]');
}

function isSelectionUiNode(node: Node): boolean {
  const el =
    (node as { nodeType?: number; parentElement?: Element | null }).nodeType === DOM_TEXT_NODE
      ? (node as Text).parentElement
      : (node as Element);
  return !!el?.closest('[data-reader-selection-handle], [data-reader-text-selection-menu]');
}

export function caretRangeFromClientPoint(
  x: number,
  y: number,
  root?: Element | null,
): Range | null {
  if (typeof document === 'undefined') return null;

  const fromDocumentApi = readCaretRangeFromDocument(x, y);
  if (
    fromDocumentApi &&
    isNodeWithinReaderRoot(fromDocumentApi.startContainer, root) &&
    !isSelectionUiNode(fromDocumentApi.startContainer)
  ) {
    return fromDocumentApi;
  }

  return nearestTextCaretInRoot(x, y, root);
}

function readCaretRangeFromDocument(x: number, y: number): Range | null {
  const doc = document;
  if (typeof doc.caretRangeFromPoint === 'function') {
    return doc.caretRangeFromPoint(x, y);
  }
  const caretPositionFromPoint = (
    doc as Document & {
      caretPositionFromPoint?: (
        px: number,
        py: number,
      ) => { offsetNode: Node; offset: number } | null;
    }
  ).caretPositionFromPoint;
  if (typeof caretPositionFromPoint !== 'function') return null;
  const pos = caretPositionFromPoint.call(doc, x, y);
  if (!pos) return null;
  const range = doc.createRange();
  range.setStart(pos.offsetNode, pos.offset);
  range.collapse(true);
  return range;
}

function nearestTextCaretInRoot(
  x: number,
  y: number,
  root?: Element | null,
): Range | null {
  if (typeof document === 'undefined') return null;

  let searchRoot: Element | null = root ?? null;
  if (!searchRoot && typeof document.elementsFromPoint === 'function') {
    for (const el of document.elementsFromPoint(x, y)) {
      if (!el || typeof el !== 'object' || !('closest' in el)) continue;
      const candidate = (el as Element).closest('[data-reader-content], .reader-body');
      if (candidate && typeof candidate === 'object') {
        searchRoot = candidate as Element;
        break;
      }
    }
  }
  if (!searchRoot) return null;

  const walker = document.createTreeWalker(searchRoot, DOM_FILTER_SHOW_TEXT);
  const probe = document.createRange();
  let best: { node: Text; offset: number; dist: number } | null = null;

  let current: Node | null;
  while ((current = walker.nextNode())) {
    const node = current as Text;
    const text = node.textContent ?? '';
    if (!text.length) continue;
    if (root && !root.contains(node)) continue;

    for (let i = 0; i < text.length; i++) {
      probe.setStart(node, i);
      probe.setEnd(node, i + 1);
      const rect = probe.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) continue;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = (cx - x) ** 2 + (cy - y) ** 2;
      if (!best || dist < best.dist) {
        best = { node, offset: i, dist };
      }
    }
  }

  if (!best) return null;
  const range = document.createRange();
  range.setStart(best.node, best.offset);
  range.collapse(true);
  return range;
}
