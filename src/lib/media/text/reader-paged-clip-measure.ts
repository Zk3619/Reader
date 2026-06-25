import { textViewerPagedContentInsets } from '@/lib/media/text/reader-ui-config';
import {
  readStrictTipBodyClipHeightPx,
} from '@/lib/media/text/reader-paged-tip-body-measure';

/** 读取 content-slot 四边 padding（inline 优先，回退 computed） */
export function readContentSlotPaddingPx(
  el: HTMLElement | null | undefined,
): { top: number; bottom: number; left: number; right: number } {
  if (!el) return { top: 0, bottom: 0, left: 0, right: 0 };
  const readPad = (inline: string, computed?: string) => {
    const inlineVal = parseFloat(inline);
    if (Number.isFinite(inlineVal)) return inlineVal;
    if (computed != null) {
      const computedVal = parseFloat(computed);
      if (Number.isFinite(computedVal)) return computedVal;
    }
    return 0;
  };
  const style = el.style;
  const computed =
    typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
  return {
    top: readPad(style.paddingTop, computed?.paddingTop),
    bottom: readPad(style.paddingBottom, computed?.paddingBottom),
    left: readPad(style.paddingLeft, computed?.paddingLeft),
    right: readPad(style.paddingRight, computed?.paddingRight),
  };
}

/** 扣除 content-slot 上下 padding 后的正文排版区高度 */
export function readContentSlotInnerHeightPx(
  el: HTMLElement | null | undefined,
  outerHeight: number,
): number {
  if (!Number.isFinite(outerHeight) || outerHeight <= 0) return 0;
  const pads = readContentSlotPaddingPx(el);
  return Math.max(1, Math.round(outerHeight - pads.top - pads.bottom));
}

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

export interface ReadPagedPageWindowMetricsParams {
  viewportEl?: HTMLElement | null;
  clipEl?: HTMLElement | null;
  /** 正文槽（页眉页脚之间的 flex 子节点） */
  contentSlotEl?: HTMLElement | null;
  /** 页眉页脚之间的 flex 正文区（reader-page-tip-body） */
  pageTipBodyEl?: HTMLElement | null;
  /** 外层 content-frame（承担四边 inset；缺省回退 contentSlotEl） */
  contentFrameEl?: HTMLElement | null;
  fallbackInsets?: PagedContentInsets;
  /** content-frame 贴视口上下时，由页眉/页脚占据的垂直空间 */
  tipChromePadTop?: number;
  tipChromePadBottom?: number;
  /** 页眉底至页脚底实测正文高（优先于算术推算） */
  authoritativeBodyHeightPx?: number;
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
    const pad = parseFloat(padding);
    if (Number.isFinite(pad) && pad > 0) return pad;
    if (position !== '' && position !== 'auto') {
      const pos = parseFloat(position);
      if (Number.isFinite(pos) && pos > 0) return pos;
    }
    if (Number.isFinite(pad)) return pad;
    if (position !== '' && position !== 'auto') {
      const pos = parseFloat(position);
      if (Number.isFinite(pos)) return pos;
    }
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

/** 页眉/页脚之间的正文窗高（与 grid tip-body 对齐） */
function resolveTipChromeBodyHeightPx(
  frameOuter: number,
  tipTop: number,
  tipBottom: number,
  params: ReadPagedPageWindowMetricsParams,
): number {
  if (params.authoritativeBodyHeightPx != null && params.authoritativeBodyHeightPx > 0) {
    return Math.max(1, Math.floor(params.authoritativeBodyHeightPx));
  }

  const estimated = Math.max(1, frameOuter - tipTop - tipBottom);
  const strictBody = readStrictTipBodyClipHeightPx(params.pageTipBodyEl);
  if (strictBody > 0) {
    return strictBody;
  }

  const frame = params.contentFrameEl;
  if (frame && typeof frame.querySelector === 'function') {
    const tipBody = frame.querySelector<HTMLElement>('.reader-page-tip-body');
    const dom = readStrictTipBodyClipHeightPx(tipBody);
    if (dom > 0) {
      return dom;
    }
  }

  return estimated;
}

/** 分页与展示共用的 page-window 度量（clipHeight 严格等于 tip-body，不含页眉页脚） */
export function readPagedPageWindowMetrics(
  params: ReadPagedPageWindowMetricsParams,
): PagedPageWindowMetrics {
  const tipBodyClip = readStrictTipBodyClipHeightPx(params.pageTipBodyEl);
  const frameOuter =
    (params.contentFrameEl && params.contentFrameEl.clientHeight > 0
      ? params.contentFrameEl.clientHeight
      : 0) ||
    (params.viewportEl && params.viewportEl.clientHeight > 0
      ? params.viewportEl.clientHeight
      : 0) ||
    (params.clipEl && params.clipEl.clientHeight > 0 ? params.clipEl.clientHeight : 0);

  const tipTop = params.tipChromePadTop ?? 0;
  const tipBottom = params.tipChromePadBottom ?? 0;

  if (tipBodyClip > 0) {
    const padsTop = tipTop;
    const padsBottom = tipBottom;
    const clipHeight = readContentSlotInnerHeightPx(
      params.contentSlotEl,
      tipBodyClip,
    );
    return {
      clipHeight,
      padTop: padsTop,
      padBottom: padsBottom,
      viewportHeight: Math.max(1, tipBodyClip + padsTop + padsBottom),
    };
  }

  const insetEl = params.contentFrameEl ?? params.contentSlotEl;
  const insets = measureContentSlotInsets(insetEl, params.fallbackInsets);
  const outer =
    frameOuter;

  const frameFullBleed = insets.top === 0 && insets.bottom === 0;

  const frameOuterForTip =
    params.contentFrameEl && params.contentFrameEl.clientHeight > 0
      ? params.contentFrameEl.clientHeight
      : outer;

  /** 满视口 frame + 页眉/页脚：正文区恒为 frame−tip，与 grid tip-body 一致 */
  if (frameFullBleed && frameOuterForTip > 0 && (tipTop > 0 || tipBottom > 0)) {
    const clipHeight = resolveTipChromeBodyHeightPx(frameOuterForTip, tipTop, tipBottom, params);
    return {
      clipHeight,
      padTop: tipTop,
      padBottom: tipBottom,
      viewportHeight: frameOuterForTip,
    };
  }

  const measuredClip = measurePagedClipContentHeight(
    params.clipEl ?? null,
    outer,
    insets,
    params.contentSlotEl,
    { top: tipTop, bottom: tipBottom },
    params.pageTipBodyEl,
  );

  const clipHeight = Math.max(1, measuredClip);

  return {
    clipHeight,
    padTop: insets.top,
    padBottom: insets.bottom,
    viewportHeight: outerViewportHeightFromClipContent(clipHeight, insets.top, insets.bottom),
  };
}

/** 正文排版区高度（优先测 tip-body / content-slot；否则从 clip 减去逻辑 inset） */
export function measurePagedClipContentHeight(
  clipEl: HTMLElement | null | undefined,
  fallbackOuterHeight = 0,
  insets?: { top: number; bottom: number },
  contentSlotEl?: HTMLElement | null,
  tipChromePads?: { top: number; bottom: number },
  pageTipBodyEl?: HTMLElement | null,
): number {
  const defaults = textViewerPagedContentInsets();
  const top = insets?.top ?? defaults.top;
  const bottom = insets?.bottom ?? defaults.bottom;
  const tipTop = tipChromePads?.top ?? 0;
  const tipBottom = tipChromePads?.bottom ?? 0;

  let fallback = Math.max(1, fallbackOuterHeight - top - bottom);
  if (top === 0 && bottom === 0 && fallbackOuterHeight > 0 && (tipTop > 0 || tipBottom > 0)) {
    fallback = Math.max(1, fallbackOuterHeight - tipTop - tipBottom);
  }

  const capToTipChrome = (height: number) => {
    if (fallbackOuterHeight > 0 && (tipTop > 0 || tipBottom > 0)) {
      return Math.min(height, Math.max(1, fallbackOuterHeight - tipTop - tipBottom));
    }
    return height;
  };

  if (pageTipBodyEl && pageTipBodyEl.clientHeight > 0) {
    return readContentSlotInnerHeightPx(
      contentSlotEl,
      readStrictTipBodyClipHeightPx(pageTipBodyEl),
    );
  }

  if (contentSlotEl && contentSlotEl.clientHeight > 0) {
    const height = readContentSlotInnerHeightPx(contentSlotEl, contentSlotEl.clientHeight);
    return capToTipChrome(height);
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
