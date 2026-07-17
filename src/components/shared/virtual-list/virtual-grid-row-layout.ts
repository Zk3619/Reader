/**
 * 行级虚拟网格：容器宽度、列宽与动态行高计算（ResizeObserver + 估算）
 */

import { createEffect, createSignal, onCleanup, type Accessor } from 'solid-js';

export interface VirtualGridRowLayoutMetrics {
  containerWidth: number;
  colCount: number;
  gapPx: number;
  colWidth: number;
}

export interface VirtualGridResponsiveRowHeightConfig {
  /** 行容器水平内边距合计（px），默认 8（Tailwind p-1 × 2） */
  horizontalPaddingPx?: number;
  /** 读取列间距（px）；默认读 computed gap / --bookshelf-layout-gap */
  getGapPx?: (scrollContainer: HTMLElement, rowElement: HTMLElement | null) => number;
  estimateRowHeight?: (metrics: VirtualGridRowLayoutMetrics) => number;
}

export function parseCssLengthPx(value: string, el?: HTMLElement): number | null {
  const v = value.trim();
  if (!v) return null;
  if (v.endsWith('px')) return parseFloat(v);
  if (v.endsWith('rem')) {
    const root =
      typeof document !== 'undefined'
        ? parseFloat(getComputedStyle(document.documentElement).fontSize)
        : 16;
    return parseFloat(v) * (Number.isFinite(root) && root > 0 ? root : 16);
  }
  if (v.endsWith('em') && el) {
    const base = parseFloat(getComputedStyle(el).fontSize);
    return parseFloat(v) * (Number.isFinite(base) && base > 0 ? base : 16);
  }
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** 从滚动容器或行元素读取 grid gap（px） */
export function readGridGapPx(
  scrollContainer: HTMLElement,
  rowElement: HTMLElement | null,
): number {
  const targets = [rowElement, scrollContainer].filter(
    (el): el is HTMLElement => el != null,
  );
  for (const target of targets) {
    const style = getComputedStyle(target);
    const custom = style.getPropertyValue('--bookshelf-layout-gap').trim();
    if (custom) {
      const px = parseCssLengthPx(custom, target);
      if (px != null) return px;
    }
    for (const key of ['rowGap', 'gap', 'columnGap'] as const) {
      const raw = style[key];
      if (raw && raw !== 'normal') {
        const px = parseCssLengthPx(raw, target);
        if (px != null) return px;
      }
    }
  }
  return 8;
}

export function computeGridColumnWidth(
  containerWidth: number,
  colCount: number,
  gapPx: number,
  horizontalPaddingPx: number,
): number {
  const cols = Math.max(1, colCount);
  const inner = Math.max(0, containerWidth - horizontalPaddingPx);
  if (cols === 1) return inner;
  return Math.max(0, (inner - gapPx * (cols - 1)) / cols);
}

export function buildVirtualGridRowLayoutMetrics(
  containerWidth: number,
  colCount: number,
  gapPx: number,
  horizontalPaddingPx: number,
): VirtualGridRowLayoutMetrics {
  const cols = Math.max(1, colCount);
  return {
    containerWidth,
    colCount: cols,
    gapPx,
    colWidth: computeGridColumnWidth(containerWidth, cols, gapPx, horizontalPaddingPx),
  };
}

/** 监听虚拟列表滚动容器 content box 宽度 */
export function useVirtualGridContainerWidth(
  scrollContainer: Accessor<HTMLDivElement | null | undefined>,
) {
  const [width, setWidth] = createSignal(0);

  createEffect(() => {
    const el = scrollContainer();
    if (!el || typeof ResizeObserver === 'undefined') return;

    let raf = 0;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const apply = () => {
      const next = el.clientWidth;
      if (next > 0) setWidth((prev) => (prev === next ? prev : next));
    };
    const sync = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        // 连续拖拽改窗：先 rAF 合并，再短延迟 settle，避免列数/行高每像素重算
        if (settleTimer !== undefined) clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
          settleTimer = undefined;
          apply();
        }, 120);
      });
    };

    apply();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    onCleanup(() => {
      if (raf) cancelAnimationFrame(raf);
      if (settleTimer !== undefined) clearTimeout(settleTimer);
      ro.disconnect();
    });
  });

  return width;
}
