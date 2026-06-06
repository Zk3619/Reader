/** 按 content-slot 内 page-window 全高分页（上下间距仅由 content-slot inset 承担） */

import { textViewerPagedContentInsets } from '@/lib/media/text/reader-ui-config';
import { computePageStartsForLayout } from '@/lib/media/text/text-viewer-paginate-dual';

export const PAGE_CLIP_SAFETY_BASE_PX = 0;

/** @deprecated 外层 content-slot 已预留上下间距，裁切区内不再留白 */
export const PAGE_BOTTOM_PAD_PX = 0;

export interface ReaderBlockMetric {
  blockIndex: number;
  top: number;
  height: number;
}

export interface ReaderLineMetric {
  top: number;
  height: number;
  bottom: number;
}

export interface ReaderLayoutSegment {
  top: number;
  bottom: number;
  /** 双栏时 0=左栏 1=右栏 */
  column?: 0 | 1;
}

export interface PaginateReaderContentOptions {
  padTop?: number;
  padBottom?: number;
  /** 直传 page-window 实测高度，避免 viewportHeight − inset 往返误差 */
  clipHeightPx?: number;
  fontSize?: number;
  lineSpacing?: number;
  /** 双栏物理页（Legado doublePage） */
  dualPage?: boolean;
}

export interface PaginateReaderContentResult {
  pageStarts: number[];
  clipHeight: number;
  viewportHeight: number;
  contentExtent: number;
  padTop: number;
  padBottom: number;
  segments: ReaderLayoutSegment[];
  leftLineSizes?: number[];
}

export function resolvePagedMeasureRoot(contentRoot: HTMLElement): HTMLElement {
  return contentRoot.querySelector<HTMLElement>('.reader-body') ?? contentRoot;
}

export function readLineHeightPx(el: HTMLElement, fontSize?: number, lineSpacing?: number): number {
  const style = getComputedStyle(el);
  const lh = parseFloat(style.lineHeight);
  if (Number.isFinite(lh) && lh > 0) return lh;
  const fs = parseFloat(style.fontSize);
  const size = Number.isFinite(fs) ? fs : (fontSize ?? 18);
  return size * ((lineSpacing ?? 0.8) + 1);
}

function relativeTop(rootRect: DOMRect, el: Element): number {
  return el.getBoundingClientRect().top - rootRect.top;
}

function relativeBottom(rootRect: DOMRect, el: Element): number {
  return el.getBoundingClientRect().bottom - rootRect.top;
}

function collectLineSegmentsInBlock(
  _measureRoot: HTMLElement,
  rootRect: DOMRect,
  block: HTMLElement,
  lineHeightPx: number,
): ReaderLayoutSegment[] {
  const textEl =
    block.querySelector<HTMLElement>('.reader-p') ??
    block.querySelector<HTMLElement>('h2');
  if (!textEl) return [];

  const range = document.createRange();
  range.selectNodeContents(textEl);
  const rects = Array.from(range.getClientRects()).sort((a, b) => a.top - b.top);
  if (rects.length === 0) {
    return [
      {
        top: relativeTop(rootRect, textEl),
        bottom: relativeBottom(rootRect, textEl),
      },
    ];
  }

  const lines: ReaderLayoutSegment[] = [];
  for (const rect of rects) {
    const top = rect.top - rootRect.top;
    const bottom = top + lineHeightPx;
    if (bottom > top + 0.5) lines.push({ top, bottom });
  }
  return lines;
}

/**
 * 块级为主：整块（含段距、气泡）不可分割；超高块再按行拆。
 */
export function measureLayoutSegments(
  measureRoot: HTMLElement,
  fontSize?: number,
  lineSpacing?: number,
): ReaderLayoutSegment[] {
  const rootRect = measureRoot.getBoundingClientRect();
  const segments: ReaderLayoutSegment[] = [];
  const sampleLineEl =
    measureRoot.querySelector<HTMLElement>('.reader-p') ??
    measureRoot.querySelector<HTMLElement>('h2');
  const defaultLineH = sampleLineEl
    ? readLineHeightPx(sampleLineEl, fontSize, lineSpacing)
    : (fontSize ?? 18) * ((lineSpacing ?? 0.8) + 1);

  const blocks = measureRoot.querySelectorAll<HTMLElement>('[data-reader-measure-block]');
  blocks.forEach((block) => {
    const blockTop = relativeTop(rootRect, block);
    const blockBottom = relativeBottom(rootRect, block);
    if (blockBottom <= blockTop + 0.5) return;

    const figure = block.querySelector('figure');
    if (figure) {
      segments.push({
        top: relativeTop(rootRect, figure),
        bottom: relativeBottom(rootRect, figure),
      });
      return;
    }

    const textEl =
      block.querySelector<HTMLElement>('.reader-p') ??
      block.querySelector<HTMLElement>('h2');
    const lineHeightPx = textEl
      ? readLineHeightPx(textEl, fontSize, lineSpacing)
      : defaultLineH;

    const blockH = blockBottom - blockTop;
    if (blockH <= defaultLineH * 1.5) {
      segments.push({ top: blockTop, bottom: blockBottom });
      return;
    }

    const lineSegs = collectLineSegmentsInBlock(
      measureRoot,
      rootRect,
      block,
      lineHeightPx,
    );
    if (lineSegs.length === 0) {
      segments.push({ top: blockTop, bottom: blockBottom });
      return;
    }

    for (const line of lineSegs) {
      segments.push(line);
    }
    const lastLine = lineSegs[lineSegs.length - 1]!;
    if (blockBottom > lastLine.bottom + 1) {
      segments.push({ top: lastLine.bottom, bottom: blockBottom });
    }
  });

  return segments.sort((a, b) => a.top - b.top || a.bottom - b.bottom);
}

/** DOM 探测：是否有元素跨越裁切下边界 */
export function pageWindowHasStraddle(
  measureRoot: HTMLElement,
  pageStart: number,
  windowBottom: number,
): boolean {
  const rootRect = measureRoot.getBoundingClientRect();
  const selectors = '.reader-p, h2, figure, [data-reader-measure-block]';
  const nodes = measureRoot.querySelectorAll<HTMLElement>(selectors);

  for (const el of nodes) {
    const top = el.getBoundingClientRect().top - rootRect.top;
    const bottom = el.getBoundingClientRect().bottom - rootRect.top;
    if (bottom <= pageStart + 0.5) continue;
    if (top >= windowBottom - 0.5) continue;
    if (top < windowBottom - 1 && bottom > windowBottom + 1) {
      return true;
    }
  }
  return false;
}

export function contentExtentFromSegments(
  segments: ReaderLayoutSegment[],
  measureRoot: HTMLElement,
): number {
  const fromSeg = segments.reduce((max, s) => Math.max(max, s.bottom), 0);
  return Math.max(fromSeg, measureRoot.scrollHeight, measureRoot.offsetHeight);
}

export function measureLineMetrics(
  measureRoot: HTMLElement,
  fontSize?: number,
  lineSpacing?: number,
): ReaderLineMetric[] {
  return measureLayoutSegments(measureRoot, fontSize, lineSpacing).map((s) => ({
    top: s.top,
    height: s.bottom - s.top,
    bottom: s.bottom,
  }));
}

/** @deprecated 行级 segment 断页已保证整行；裁切区不再扣减 */
export function clipSafetyPx(_fontSize = 18, _lineSpacing = 0.8): number {
  return 0;
}

/** 每页 pack 上限 = pageStart + clipHeight（裁切区即 page-window 全高） */
export function pagePackLimitPx(pageStart: number, clipHeight: number): number {
  return pageStart + clipHeight;
}

/**
 * 裁切窗高度：贴齐本页最后一段底，上限为 nextStart（防半行），不超过 clipHeight。
 */
export function pageDisplayHeight(
  pageIndex: number,
  pageStarts: number[],
  clipHeight: number,
  contentExtent: number,
  segments: ReaderLayoutSegment[],
): number {
  const start = Math.round(pageStarts[pageIndex] ?? 0);
  const nextTop = pageStarts[pageIndex + 1];
  const maxEnd = nextTop != null ? Math.round(nextTop) : Math.ceil(contentExtent);
  const maxSpan = Math.min(clipHeight, Math.max(1, maxEnd - start));

  let lastBottom = start;
  for (const seg of segments) {
    if (seg.top < start - 0.5) continue;
    if (seg.top >= maxEnd - 0.5) break;
    lastBottom = Math.max(lastBottom, seg.bottom);
  }

  const contentSpan = Math.max(1, Math.ceil(lastBottom - start));
  return Math.min(maxSpan, contentSpan);
}

function shrinkPageEndBeforeStraddle(
  measureRoot: HTMLElement,
  pageStart: number,
  pageEnd: number,
): number {
  if (!pageWindowHasStraddle(measureRoot, pageStart, pageEnd)) return pageEnd;
  const rootRect = measureRoot.getBoundingClientRect();
  let shrink = pageEnd;
  measureRoot
    .querySelectorAll<HTMLElement>('.reader-p, h2, figure, [data-reader-measure-block]')
    .forEach((el) => {
      const top = el.getBoundingClientRect().top - rootRect.top;
      const bottom = el.getBoundingClientRect().bottom - rootRect.top;
      if (top < pageEnd - 1 && bottom > pageEnd + 1 && top >= pageStart - 0.5) {
        shrink = Math.min(shrink, top);
      }
    });
  return shrink > pageStart + 1 ? shrink : pageEnd;
}

/**
 * 每页仅显示 [pageStart, nextStart) 区间；nextStart 为首个放不下的片段顶。
 * 显示高度 = nextStart - pageStart（≤ clipHeight），避免固定窗高把下一行裁进半幅。
 */
export function computePageStartsFromSegments(
  segments: ReaderLayoutSegment[],
  clipHeight: number,
  contentExtent?: number,
  _safetyPx?: number,
  measureRoot?: HTMLElement,
): number[] {
  if (segments.length === 0) return [0];

  const contentBottom =
    contentExtent ?? segments.reduce((max, s) => Math.max(max, s.bottom), 0);
  const packLimit = (pageStart: number) => pagePackLimitPx(pageStart, clipHeight);
  if (contentBottom <= packLimit(0) + 0.5) return [0];

  const starts: number[] = [0];
  let pageStart = 0;

  for (;;) {
    const limit = packLimit(pageStart);
    if (pageStart + clipHeight >= contentBottom - 0.5) break;

    let nextStart = -1;
    for (const seg of segments) {
      if (seg.top < pageStart - 0.5) continue;
      if (seg.bottom <= limit + 0.5) continue;
      nextStart = seg.top;
      break;
    }

    if (nextStart < 0) break;

    // 行级 segment 断点已是整行顶：勿对 nextStart 做块级 straddle 回缩（会误伤多行段落）
    if (nextStart <= pageStart + 0.5) {
      const windowBottom = pageStart + clipHeight;
      nextStart = measureRoot
        ? shrinkPageEndBeforeStraddle(measureRoot, pageStart, windowBottom)
        : windowBottom;
    }

    if (nextStart <= pageStart + 0.5) break;

    starts.push(nextStart);
    pageStart = nextStart;
  }

  return starts;
}

/**
 * 末页索引：跳过尾部无 segment 的空白页（仅用于跨章 prev 落点/预览，勿写入全局 pageStarts）。
 * 判断：该页起点之后须存在 segment 顶 ≥ start−0.5（与行级断页一致，避免误删含文页界）。
 */
export function lastNonBlankPageIndex(
  pageStarts: number[],
  segments: ReaderLayoutSegment[],
): number {
  if (pageStarts.length <= 1) return 0;
  let last = pageStarts.length - 1;
  while (last > 0) {
    const start = pageStarts[last] ?? 0;
    const hasContent = segments.some(
      (s) => s.top >= start - 0.5 && s.bottom > start + 0.5,
    );
    if (hasContent) break;
    last -= 1;
  }
  return last;
}

export function pageCountFromStarts(starts: number[]): number {
  return Math.max(1, starts.length);
}

export function paginateReaderContent(
  contentRoot: HTMLElement,
  viewportHeight: number,
  options?: PaginateReaderContentOptions,
): PaginateReaderContentResult {
  const defaultInsets = textViewerPagedContentInsets();
  const padTop = options?.padTop ?? defaultInsets.top;
  const padBottom = options?.padBottom ?? defaultInsets.bottom;
  const measureRoot = resolvePagedMeasureRoot(contentRoot);
  const fontSize = options?.fontSize;
  const lineSpacing = options?.lineSpacing;
  const segments = measureLayoutSegments(measureRoot, fontSize, lineSpacing);
  const extent = contentExtentFromSegments(segments, measureRoot);
  /** 正文可排版高度（优先 page-window 实测，否则视口减 inset） */
  const clipHeight =
    options?.clipHeightPx != null && options.clipHeightPx > 0
      ? Math.max(1, Math.round(options.clipHeightPx))
      : Math.max(1, viewportHeight - padTop - padBottom);
  const { pageStarts, leftLineSizes } = computePageStartsForLayout(
    segments,
    clipHeight,
    extent,
    {
      dualPage: options?.dualPage,
      measureRoot,
      fontSize,
      lineSpacing,
      safetyPx: 0,
    },
  );

  return {
    pageStarts,
    clipHeight,
    viewportHeight: Math.max(1, viewportHeight),
    contentExtent: extent,
    padTop,
    padBottom,
    segments,
    leftLineSizes,
  };
}

/** @deprecated */
export function computePageStartsFromLines(
  lines: ReaderLineMetric[],
  clipHeight: number,
  contentExtent?: number,
  safetyPx?: number,
): number[] {
  const segments = lines.map((l) => ({
    top: l.top,
    bottom: l.bottom ?? l.top + l.height,
  }));
  return computePageStartsFromSegments(segments, clipHeight, contentExtent, safetyPx);
}

export function splitBlockIndicesByPageHeight(
  blockHeights: number[],
  pageHeight: number,
): number[][] {
  if (blockHeights.length === 0) return [[]];
  const safeHeight = Math.max(1, pageHeight);
  const pages: number[][] = [];
  let current: number[] = [];
  let acc = 0;

  for (let i = 0; i < blockHeights.length; i++) {
    const h = blockHeights[i] ?? 0;
    if (current.length > 0 && acc + h > safeHeight) {
      pages.push(current);
      current = [];
      acc = 0;
    }
    current.push(i);
    acc += h;
  }

  if (current.length > 0) pages.push(current);
  return pages.length > 0 ? pages : [[]];
}
