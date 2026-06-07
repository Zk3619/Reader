import { textViewerPagedContentInsets } from '@/lib/media/text/reader-ui-config';

export interface PagedContentInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface PagedPageWindowMetrics {
  /** 与 DOM page-window 一致的正文排版区高度 */
  clipHeight: number;
  padTop: number;
  padBottom: number;
  /** 外层视口高度（clipHeight + padTop + padBottom） */
  viewportHeight: number;
}

/** 从 content-slot 读取四边间距：支持 absolute inset 与滑动翻页的 padding inset */
export function measureContentSlotInsets(
  contentSlotEl: HTMLElement | null | undefined,
  fallback?: PagedContentInsets,
): PagedContentInsets {
  const defaults = fallback ?? textViewerPagedContentInsets();
  if (!contentSlotEl) return defaults;

  const style = getComputedStyle(contentSlotEl);
  const readEdge = (position: string, padding: string, defaultVal: number) => {
    const pos = parseFloat(position);
    if (Number.isFinite(pos) && pos > 0) return pos;
    const pad = parseFloat(padding);
    if (Number.isFinite(pad) && pad > 0) return pad;
    return defaultVal;
  };

  return {
    top: readEdge(style.top, style.paddingTop, defaults.top),
    bottom: readEdge(style.bottom, style.paddingBottom, defaults.bottom),
    left: readEdge(style.left, style.paddingLeft, defaults.left),
    right: readEdge(style.right, style.paddingRight, defaults.right),
  };
}

/**
 * 双栏 spread 排版内宽：以视口减 inset 为准，避免宽 shift 子节点撑大 content-slot 导致 2× 宽度反馈。
 */
export function readPagedSpreadContentWidthPx(params: {
  viewportEl?: HTMLElement | null;
  contentSlotEl?: HTMLElement | null;
  fallbackInsets?: PagedContentInsets;
}): number {
  const insets = measureContentSlotInsets(params.contentSlotEl, params.fallbackInsets);
  const viewportW = params.viewportEl?.clientWidth ?? 0;
  if (viewportW > 0) {
    return Math.max(1, Math.round(viewportW - insets.left - insets.right));
  }
  const slot = params.contentSlotEl;
  if (slot && slot.clientWidth > 0) {
    const padLeft = parseFloat(slot.style.paddingLeft) || 0;
    const padRight = parseFloat(slot.style.paddingRight) || 0;
    const inner = Math.round(slot.clientWidth - padLeft - padRight);
    if (inner > 0) return inner;
  }
  return Math.max(1, 320);
}

/** 分页与展示共用的 page-window 度量（clipHeight 对齐 content-slot 实测高度） */
export function readPagedPageWindowMetrics(params: {
  viewportEl?: HTMLElement | null;
  clipEl?: HTMLElement | null;
  contentSlotEl?: HTMLElement | null;
  fallbackInsets?: PagedContentInsets;
}): PagedPageWindowMetrics {
  const insets = measureContentSlotInsets(params.contentSlotEl, params.fallbackInsets);
  const outer =
    (params.viewportEl && params.viewportEl.clientHeight > 0
      ? params.viewportEl.clientHeight
      : 0) ||
    (params.clipEl && params.clipEl.clientHeight > 0 ? params.clipEl.clientHeight : 0);

  const clipHeight = measurePagedClipContentHeight(
    params.clipEl ?? null,
    outer,
    insets,
    params.contentSlotEl,
  );

  return {
    clipHeight,
    padTop: insets.top,
    padBottom: insets.bottom,
    viewportHeight: outerViewportHeightFromClipContent(clipHeight, insets.top, insets.bottom),
  };
}

/** 正文排版区高度（优先测 content-slot；否则从 clip 减去逻辑 inset） */
export function measurePagedClipContentHeight(
  clipEl: HTMLElement | null | undefined,
  fallbackOuterHeight = 0,
  insets?: { top: number; bottom: number },
  contentSlotEl?: HTMLElement | null,
): number {
  const defaults = textViewerPagedContentInsets();
  const top = insets?.top ?? defaults.top;
  const bottom = insets?.bottom ?? defaults.bottom;
  const fallback = Math.max(1, fallbackOuterHeight - top - bottom);

  if (contentSlotEl && contentSlotEl.clientHeight > 0) {
    // 滑动翻页时 slot 为满视口面板，inset 由 padding 承担；clientHeight 含 padding 需扣除，
    // 否则排版区高度被高估、切章前后页界不一致而抖动。按页挂载时 padding 为 0，结果不变。
    const padTop = parseFloat(contentSlotEl.style.paddingTop) || 0;
    const padBottom = parseFloat(contentSlotEl.style.paddingBottom) || 0;
    return Math.max(1, Math.round(contentSlotEl.clientHeight - padTop - padBottom));
  }

  if (!clipEl || clipEl.clientHeight <= 0) {
    return fallback;
  }

  const style = getComputedStyle(clipEl);
  const cssPadTop = parseFloat(style.paddingTop) || 0;
  const cssPadBottom = parseFloat(style.paddingBottom) || 0;

  let height: number;
  if (cssPadTop > 0 || cssPadBottom > 0) {
    height = clipEl.clientHeight - cssPadTop - cssPadBottom;
  } else {
    height = clipEl.clientHeight - top - bottom;
  }

  if (height <= 0) {
    const rect = clipEl.getBoundingClientRect();
    height =
      cssPadTop > 0 || cssPadBottom > 0
        ? rect.height - cssPadTop - cssPadBottom
        : rect.height - top - bottom;
  }

  if (height <= 0) {
    return fallback;
  }

  return Math.max(1, Math.round(height));
}

/** 分页 API 用的外层视口高度（= 裁切 content 高 + 上下 contentInset） */
export function outerViewportHeightFromClipContent(
  clipContentHeight: number,
  padTop?: number,
  padBottom?: number,
): number {
  const pads = textViewerPagedContentInsets();
  const top = padTop ?? pads.top;
  const bottom = padBottom ?? pads.bottom;
  return Math.max(1, clipContentHeight + top + bottom);
}
