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
  /** 字形/行盒实测底（不含行距下延与段距 margin）；用于页尾贴齐 */
  textBottom?: number;
  /** 双栏时 0=左栏 1=右栏 */
  column?: 0 | 1;
  /** 对应 [data-reader-measure-block] 块索引 */
  blockIndex?: number;
  /** 双栏 spread 物理页序号（assign 后写入；一页 = 左栏+右栏同屏） */
  spreadIndex?: number;
}

export interface PaginateReaderContentOptions {
  padTop?: number;
  padBottom?: number;
  /** 直传 page-window 实测高度，避免 viewportHeight − inset 往返误差 */
  clipHeightPx?: number;
  fontSize?: number;
  lineSpacing?: number;
  /** 段距 em，测量 fallback 与单行块阈值 */
  paragraphSpacing?: number;
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
  /** 双栏 spread 右栏首段 Y（与 pageStarts 等长） */
  rightPageStarts?: number[];
  /** 双栏：左/右栏归一化坐标系下的内容高度 */
  leftColumnExtent?: number;
  rightColumnExtent?: number;
}

export function resolvePagedMeasureRoot(contentRoot: HTMLElement): HTMLElement {
  return contentRoot.querySelector<HTMLElement>('.reader-body') ?? contentRoot;
}

export function readFontSizePx(el: HTMLElement, fontSize?: number): number {
  const fs = parseFloat(getComputedStyle(el).fontSize);
  return Number.isFinite(fs) && fs > 0 ? fs : (fontSize ?? 18);
}

export function readLineHeightPx(el: HTMLElement, fontSize?: number, lineSpacing?: number): number {
  const style = getComputedStyle(el);
  const lh = parseFloat(style.lineHeight);
  if (Number.isFinite(lh) && lh > 0) return lh;
  const size = readFontSizePx(el, fontSize);
  return size * ((lineSpacing ?? 0.8) + 1);
}

export function readParagraphMarginBottomPx(
  el: HTMLElement,
  fontSize?: number,
  paragraphSpacing?: number,
): number {
  const mb = parseFloat(getComputedStyle(el).marginBottom);
  if (Number.isFinite(mb) && mb >= 0) return mb;
  const size = readFontSizePx(el, fontSize);
  return size * (paragraphSpacing ?? 0);
}

function relativeTop(rootRect: DOMRect, el: Element): number {
  return el.getBoundingClientRect().top - rootRect.top;
}

function relativeBottom(rootRect: DOMRect, el: Element): number {
  return el.getBoundingClientRect().bottom - rootRect.top;
}

/** 章节标题 measure-block：间距在 wrapper padding 上，须按整块测量 */
function isChapterTitleMeasureBlock(block: HTMLElement): boolean {
  return (
    block.querySelector('h2') != null &&
    block.querySelector('.reader-p') == null &&
    block.querySelector('figure') == null
  );
}

/** 段落内含行内图（段评 SVG 等）：须按 .reader-p 整块测量，不可只量 span 文字 */
function paragraphHasInlineMeasureContent(textEl: HTMLElement): boolean {
  return (
    textEl.querySelector(
      'img, figure, svg, [data-legado-cmt], [data-reader-inline-img], .reader-legado-cmt-img',
    ) != null
  );
}

/** 段评气泡在末行旁会撑高行盒，须按整块 .reader-p 测量 */
function paragraphHasCommentBubble(textEl: HTMLElement): boolean {
  return textEl.querySelector('.reader-comment-bubble') != null;
}

/** 段评/行内图控件底（相对 measureRoot），用于补全行级 segment 未量的末行高度 */
function paragraphInlineChromeBottom(rootRect: DOMRect, textEl: HTMLElement): number {
  let bottom = 0;
  const nodes = textEl.querySelectorAll(
    '[data-reader-inline-img], [data-legado-cmt], .reader-legado-cmt-img, .reader-comment-bubble',
  );
  for (const node of nodes) {
    const b = relativeBottom(rootRect, node);
    if (b > bottom) bottom = b;
  }
  return bottom;
}

function blockNeedsLegadoInlineMeasure(block: HTMLElement): boolean {
  return (
    block.hasAttribute('data-reader-legado-inline') ||
    block.querySelector(
      '[data-reader-inline-img], [data-legado-cmt], .reader-legado-cmt-img',
    ) != null
  );
}

/** 块在排版流中的底（含段距 margin；wrapper 矩形常不含子段落 margin） */
function blockFlowBottom(
  rootRect: DOMRect,
  textEl: HTMLElement,
  fontSize?: number,
  lineSpacing?: number,
  paragraphSpacing?: number,
): number {
  const lineHeightPx = readLineHeightPx(textEl, fontSize, lineSpacing);
  const glyphBottom = readParagraphGlyphBottom(rootRect, textEl, lineHeightPx);
  const marginBottom = readParagraphMarginBottomPx(textEl, fontSize, paragraphSpacing);
  return glyphBottom + marginBottom;
}

/**
 * 消除 wrapper 与段 margin 造成的块间虚假空隙/重叠，使叠高与 live pane 一致。
 * 仅粘合 ≤ maxGlueGapPx 的小缝（段距量级）；更大间距（插图等）保留。
 */
export function snapContiguousMeasureBlocks(
  segments: ReaderLayoutSegment[],
  maxGlueGapPx = 20,
): ReaderLayoutSegment[] {
  if (segments.length === 0) return segments;

  const blockOrder = [
    ...new Set(
      segments
        .map((s) => s.blockIndex)
        .filter((i): i is number => i != null),
    ),
  ].sort((a, b) => {
    const topA = Math.min(...segments.filter((s) => s.blockIndex === a).map((s) => s.top));
    const topB = Math.min(...segments.filter((s) => s.blockIndex === b).map((s) => s.top));
    return topA - topB;
  });

  const shiftByBlock = new Map<number, number>();
  let cursor = 0;

  for (const blockIndex of blockOrder) {
    const blockSegs = segments.filter((s) => s.blockIndex === blockIndex);
    const minTop = Math.min(...blockSegs.map((s) => s.top));
    const maxBottom = Math.max(...blockSegs.map((s) => s.bottom));
    let shift = 0;

    if (minTop < cursor - 0.5) {
      shift = cursor - minTop;
    } else if (minTop - cursor <= maxGlueGapPx + 0.5) {
      shift = cursor - minTop;
    } else {
      shift = 0;
      cursor = minTop;
    }

    if (Math.abs(shift) > 0.5) shiftByBlock.set(blockIndex, shift);
    cursor = maxBottom + shift;
  }

  if (shiftByBlock.size === 0) return segments;

  return segments.map((seg) => {
    if (seg.blockIndex == null) return seg;
    const shift = shiftByBlock.get(seg.blockIndex) ?? 0;
    if (Math.abs(shift) < 0.5) return seg;
    return {
      ...seg,
      top: seg.top + shift,
      bottom: seg.bottom + shift,
      textBottom: seg.textBottom != null ? seg.textBottom + shift : undefined,
    };
  });
}

/** 正文 span（排除段评图标等行内控件） */
function readParagraphTextContentsEl(textEl: HTMLElement): HTMLElement {
  return (
    textEl.querySelector<HTMLElement>(':scope > span') ??
    textEl.querySelector<HTMLElement>('span') ??
    textEl
  );
}

/** 段落字形底：不含段距 margin，且排除段评图标高度 */
function readParagraphGlyphBottom(
  rootRect: DOMRect,
  textEl: HTMLElement,
  lineHeightPx: number,
): number {
  const textNode = readParagraphTextContentsEl(textEl);
  const range = document.createRange();
  range.selectNodeContents(textNode);
  const rects = Array.from(range.getClientRects()).filter(
    (r) => r.width > 0.5 && r.height > 0.5,
  );
  if (rects.length === 0) {
    return relativeBottom(rootRect, textNode);
  }
  const last = rects.sort((a, b) => a.top - b.top || a.bottom - b.bottom)[
    rects.length - 1
  ]!;
  const rectBottom = last.bottom - rootRect.top;
  // 分栏/叠高只用字形实测底；行盒下延（line-height）记在 segment.bottom，供 clip 裁切判断
  void lineHeightPx;
  return rectBottom;
}

function mergeLineSegment(
  lines: ReaderLayoutSegment[],
  top: number,
  bottom: number,
  textBottom?: number,
): void {
  if (bottom <= top + 0.5) return;
  const existing = lines.find((line) => Math.abs(line.top - top) < 1);
  if (existing) {
    existing.bottom = Math.max(existing.bottom, bottom);
    if (textBottom != null) {
      existing.textBottom = Math.max(existing.textBottom ?? existing.bottom, textBottom);
    }
    return;
  }
  lines.push({ top, bottom, textBottom: textBottom ?? bottom });
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

  const textNode = readParagraphTextContentsEl(textEl);
  const range = document.createRange();
  range.selectNodeContents(textNode);
  const rects = Array.from(range.getClientRects()).sort((a, b) => a.top - b.top);
  if (rects.length === 0) {
    const top = relativeTop(rootRect, textEl);
    const textBottom = readParagraphGlyphBottom(rootRect, textEl, lineHeightPx);
    const lineBoxBottom = Math.max(top + lineHeightPx, textBottom);
    return [{ top, bottom: lineBoxBottom, textBottom }];
  }

  const lines: ReaderLayoutSegment[] = [];
  for (const rect of rects) {
    const top = rect.top - rootRect.top;
    const rectBottom = rect.bottom - rootRect.top;
    const lineBoxBottom = Math.max(top + lineHeightPx, rectBottom);
    mergeLineSegment(lines, top, lineBoxBottom, rectBottom);
  }
  const chromeBottom = paragraphInlineChromeBottom(rootRect, textEl);
  if (chromeBottom > 0 && lines.length > 0) {
    const last = lines[lines.length - 1]!;
    if (chromeBottom > last.bottom + 0.5) {
      lines[lines.length - 1] = {
        ...last,
        bottom: chromeBottom,
        textBottom: Math.max(last.textBottom ?? last.bottom, chromeBottom),
      };
    }
  }
  return lines.sort((a, b) => a.top - b.top || a.bottom - b.bottom);
}

/**
 * 块级为主：整块（含段距、气泡）不可分割；超高块再按行拆。
 */
export function measureLayoutSegments(
  measureRoot: HTMLElement,
  fontSize?: number,
  lineSpacing?: number,
  paragraphSpacing?: number,
): ReaderLayoutSegment[] {
  const rootRect = measureRoot.getBoundingClientRect();
  const segments: ReaderLayoutSegment[] = [];
  const sampleLineEl =
    measureRoot.querySelector<HTMLElement>('.reader-p') ??
    measureRoot.querySelector<HTMLElement>('h2');
  const defaultLineH = sampleLineEl
    ? readLineHeightPx(sampleLineEl, fontSize, lineSpacing)
    : (fontSize ?? 18) * ((lineSpacing ?? 0.8) + 1);
  const defaultParagraphGap = sampleLineEl
    ? readParagraphMarginBottomPx(sampleLineEl, fontSize, paragraphSpacing)
    : (fontSize ?? 18) * (paragraphSpacing ?? 0);
  const singleBlockThreshold = defaultLineH + defaultParagraphGap + 1;

  const blocks = measureRoot.querySelectorAll<HTMLElement>('[data-reader-measure-block]');
  blocks.forEach((block, blockIndex) => {
    const figure = block.querySelector('figure');
    if (figure) {
      const figTop = relativeTop(rootRect, figure);
      const figBottom = relativeBottom(rootRect, figure);
      segments.push({
        top: figTop,
        bottom: figBottom,
        textBottom: figBottom,
        blockIndex,
      });
      return;
    }

    const textEl =
      block.querySelector<HTMLElement>('.reader-p') ??
      block.querySelector<HTMLElement>('h2');
    if (!textEl) return;

    if (blockNeedsLegadoInlineMeasure(block)) {
      const blockTop = relativeTop(rootRect, block);
      let blockBottom = Math.max(
        relativeBottom(rootRect, block),
        relativeBottom(rootRect, textEl),
      );
      const chromeBottom = paragraphInlineChromeBottom(rootRect, textEl);
      if (chromeBottom > 0) blockBottom = Math.max(blockBottom, chromeBottom);
      if (blockBottom <= blockTop + 0.5) return;
      segments.push({
        top: blockTop,
        bottom: blockBottom,
        textBottom: blockBottom,
        blockIndex,
      });
      return;
    }

    if (isChapterTitleMeasureBlock(block)) {
      const blockTop = relativeTop(rootRect, block);
      const blockBottom = relativeBottom(rootRect, block);
      if (blockBottom <= blockTop + 0.5) return;
      const lineHeightPx = readLineHeightPx(textEl, fontSize, lineSpacing);
      const textContentBottom = readParagraphGlyphBottom(rootRect, textEl, lineHeightPx);
      segments.push({
        top: blockTop,
        bottom: blockBottom,
        textBottom: textContentBottom,
        blockIndex,
      });
      return;
    }

    if (paragraphHasInlineMeasureContent(textEl) || paragraphHasCommentBubble(textEl)) {
      const blockTop = relativeTop(rootRect, textEl);
      const blockBottom = relativeBottom(rootRect, textEl);
      if (blockBottom <= blockTop + 0.5) return;
      segments.push({
        top: blockTop,
        bottom: blockBottom,
        textBottom: blockBottom,
        blockIndex,
      });
      return;
    }

    const blockTop = relativeTop(rootRect, textEl);
    const lineHeightPx = readLineHeightPx(textEl, fontSize, lineSpacing);
    const blockBottom = Math.max(
      blockFlowBottom(rootRect, textEl, fontSize, lineSpacing, paragraphSpacing),
      blockTop + lineHeightPx,
    );
    if (blockBottom <= blockTop + 0.5) return;

    const textContentBottom = readParagraphGlyphBottom(rootRect, textEl, lineHeightPx);

    const blockH = blockBottom - blockTop;
    if (blockH <= singleBlockThreshold) {
      segments.push({
        top: blockTop,
        bottom: blockBottom,
        textBottom: textContentBottom,
        blockIndex,
      });
      return;
    }

    const lineSegs = collectLineSegmentsInBlock(
      measureRoot,
      rootRect,
      block,
      lineHeightPx,
    );
    if (lineSegs.length === 0) {
      segments.push({
        top: blockTop,
        bottom: blockBottom,
        textBottom: textContentBottom,
        blockIndex,
      });
      return;
    }

    for (const line of lineSegs) {
      segments.push({ ...line, blockIndex });
    }
    const lastLine = lineSegs[lineSegs.length - 1]!;
    if (blockBottom > lastLine.bottom + 1) {
      segments.push({
        top: lastLine.bottom,
        bottom: blockBottom,
        textBottom: lastLine.textBottom ?? lastLine.bottom,
        blockIndex,
      });
    }
  });

  return snapContiguousMeasureBlocks(
    segments.sort((a, b) => a.top - b.top || a.bottom - b.bottom),
    defaultParagraphGap + 4,
  );
}

const PAGE_STRADDLE_BLOCK_SELECTORS =
  '.reader-p, h2, figure, [data-reader-measure-block]';
const PAGE_STRADDLE_INLINE_SELECTORS =
  '[data-reader-inline-img], [data-legado-cmt], .reader-legado-cmt-img, .reader-comment-bubble';

function elementStraddlesWindowBottom(
  el: Element,
  rootRect: DOMRect,
  pageStart: number,
  windowBottom: number,
): boolean {
  const rect = el.getBoundingClientRect();
  const top = rect.top - rootRect.top;
  const bottom = rect.bottom - rootRect.top;
  if (bottom <= pageStart + 0.5) return false;
  if (top >= windowBottom - 0.5) return false;
  return top < windowBottom - 1 && bottom > windowBottom + 1;
}

/** DOM 探测：是否有元素跨越裁切下边界 */
export function pageWindowHasStraddle(
  measureRoot: HTMLElement,
  pageStart: number,
  windowBottom: number,
): boolean {
  const rootRect = measureRoot.getBoundingClientRect();
  const nodes = measureRoot.querySelectorAll<HTMLElement>(
    `${PAGE_STRADDLE_BLOCK_SELECTORS}, ${PAGE_STRADDLE_INLINE_SELECTORS}`,
  );

  for (const el of nodes) {
    if (elementStraddlesWindowBottom(el, rootRect, pageStart, windowBottom)) {
      return true;
    }
  }

  for (const textEl of measureRoot.querySelectorAll<HTMLElement>('.reader-p, h2')) {
    const range = document.createRange();
    range.selectNodeContents(textEl);
    for (const rect of range.getClientRects()) {
      if (rect.width < 0.5 || rect.height < 0.5) continue;
      const top = rect.top - rootRect.top;
      const bottom = rect.bottom - rootRect.top;
      if (bottom <= pageStart + 0.5) continue;
      if (top >= windowBottom - 0.5) continue;
      if (top < windowBottom - 1 && bottom > windowBottom + 1) {
        return true;
      }
    }
  }
  return false;
}

export function contentExtentFromSegments(
  segments: ReaderLayoutSegment[],
  measureRoot: HTMLElement,
): number {
  const fromSeg = segments.reduce((max, s) => Math.max(max, s.bottom), 0);
  if (fromSeg > 0.5) return fromSeg;
  return Math.max(measureRoot.scrollHeight, measureRoot.offsetHeight);
}

export function measureLineMetrics(
  measureRoot: HTMLElement,
  fontSize?: number,
  lineSpacing?: number,
  paragraphSpacing?: number,
): ReaderLineMetric[] {
  return measureLayoutSegments(measureRoot, fontSize, lineSpacing, paragraphSpacing).map((s) => ({
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
 * 含跨页 segment（top 在上一页、bottom 落入本页）。
 */
export function segmentOverlapsRange(
  seg: ReaderLayoutSegment,
  rangeStart: number,
  rangeEnd: number,
): boolean {
  return seg.bottom > rangeStart + 0.5 && seg.top < rangeEnd - 0.5;
}

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
    if (!segmentOverlapsRange(seg, start, maxEnd)) continue;
    lastBottom = Math.max(lastBottom, Math.min(seg.bottom, maxEnd));
  }

  const contentSpan = Math.max(1, Math.ceil(lastBottom - start));
  return Math.min(maxSpan, contentSpan);
}

export interface PageContentSpanLayout {
  pageStarts: number[];
  rightPageStarts?: number[];
  clipHeight: number;
  contentExtent: number;
  segments: ReaderLayoutSegment[];
  pages?: { displayHeight: number }[];
  dualPage?: boolean;
}

function columnPageContentSpanPx(
  pageIndex: number,
  columnStarts: number[],
  layout: PageContentSpanLayout,
  liveClipHeightPx: number,
  columnSegments: ReaderLayoutSegment[],
): number {
  const liveClip = Math.max(1, Math.round(liveClipHeightPx));
  const start = Math.round(columnStarts[pageIndex] ?? 0);
  const nextTop = columnStarts[pageIndex + 1];
  const pageEnd =
    nextTop != null ? Math.round(nextTop) : Math.ceil(layout.contentExtent);

  if (nextTop != null && pageEnd <= start) {
    return Math.min(liveClip, layout.clipHeight);
  }

  const breakSpan =
    nextTop != null
      ? Math.min(layout.clipHeight, Math.max(1, pageEnd - start))
      : liveClip;

  // 裁切高度仅跟页界 breakSpan 对齐；勿再用 displayHeight 缩窗（会在 page-window 底部留出错误占位并裁切正文）
  void columnSegments;
  return Math.min(liveClip, breakSpan);
}

/**
 * 双栏 spread 单栏正文裁切高度（左/右栏各自按页界与末行贴齐，防半行）。
 */
export function dualSpreadColumnContentSpanPx(
  pageIndex: number,
  column: 'left' | 'right',
  layout: PageContentSpanLayout | null | undefined,
  liveClipHeightPx: number,
): number {
  const liveClip = Math.max(1, Math.round(liveClipHeightPx));
  if (!layout) return liveClip;
  if (!layout.dualPage) {
    return pageContentSpanPx(pageIndex, layout, liveClipHeightPx);
  }

  // 按页块切片：栏 clip 恒为页窗高，避免 displayHeight 缩窗导致半行/重复
  void pageIndex;
  void column;
  return liveClip;
}

/**
 * 单页正文裁切高度：nextStart − pageStart 防漏页/半行；
 * liveClipHeight 对齐 DOM page-window，避免 layout.clipHeight 与实测偏差裁切。
 * 双栏时取左右栏较大值作为外层 clip，各 pane 另用 dualSpreadColumnContentSpanPx。
 */
export function pageContentSpanPx(
  pageIndex: number,
  layout: PageContentSpanLayout | null | undefined,
  liveClipHeightPx: number,
): number {
  const liveClip = Math.max(1, Math.round(liveClipHeightPx));
  if (!layout) return liveClip;

  if (layout.dualPage) {
    const left = dualSpreadColumnContentSpanPx(pageIndex, 'left', layout, liveClipHeightPx);
    const right = dualSpreadColumnContentSpanPx(pageIndex, 'right', layout, liveClipHeightPx);
    return Math.max(left, right);
  }

  return columnPageContentSpanPx(
    pageIndex,
    layout.pageStarts,
    layout,
    liveClipHeightPx,
    layout.segments,
  );
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
    .querySelectorAll<HTMLElement>(
      `${PAGE_STRADDLE_BLOCK_SELECTORS}, ${PAGE_STRADDLE_INLINE_SELECTORS}`,
    )
    .forEach((el) => {
      const top = el.getBoundingClientRect().top - rootRect.top;
      const bottom = el.getBoundingClientRect().bottom - rootRect.top;
      if (top < pageEnd - 1 && bottom > pageEnd + 1 && top >= pageStart - 0.5) {
        shrink = Math.min(shrink, top);
      }
    });
  return shrink > pageStart + 1 ? shrink : pageEnd;
}

/** DOM 复核：裁切线下仍有跨行元素时前移页界，与 tip-body 可视区严格对齐 */
export function trimPageStartsBeforeClipStraddle(
  measureRoot: HTMLElement,
  pageStarts: number[],
  clipHeight: number,
): number[] {
  if (pageStarts.length <= 1 || clipHeight <= 0) return pageStarts;

  const trimmed: number[] = [pageStarts[0] ?? 0];
  for (let i = 0; i < pageStarts.length - 1; i += 1) {
    const pageStart = trimmed[trimmed.length - 1] ?? 0;
    const nominalNext = pageStarts[i + 1] ?? pageStart + clipHeight;
    const windowBottom = pageStart + clipHeight;
    let nextStart = nominalNext;

    if (pageWindowHasStraddle(measureRoot, pageStart, windowBottom)) {
      const shrunk = shrinkPageEndBeforeStraddle(measureRoot, pageStart, windowBottom);
      if (shrunk > pageStart + 1 && shrunk < nominalNext + 0.5) {
        nextStart = Math.round(shrunk);
      }
    }

    if (nextStart <= pageStart + 0.5) break;
    if (Math.abs(nextStart - (trimmed[trimmed.length - 1] ?? 0)) < 0.5) break;
    trimmed.push(nextStart);
  }

  return trimmed.length > 0 ? trimmed : pageStarts;
}

/**
 * segment 复核：非末页时禁止片段 visual bottom 超出 pageStart+clipHeight（行内图/段评底常漏进半行）。
 */
export function trimPageStartsToSegmentVisualBounds(
  pageStarts: number[],
  segments: ReaderLayoutSegment[],
  clipHeight: number,
  contentExtent?: number,
): number[] {
  if (pageStarts.length <= 1 || clipHeight <= 0 || segments.length === 0) {
    return pageStarts;
  }

  const contentBottom =
    contentExtent ?? segments.reduce((max, s) => Math.max(max, s.bottom), 0);
  const trimmed: number[] = [pageStarts[0] ?? 0];

  for (let i = 0; i < pageStarts.length - 1; i += 1) {
    const pageStart = trimmed[trimmed.length - 1] ?? 0;
    const limit = pageStart + clipHeight;
    let nextStart = pageStarts[i + 1] ?? limit;

    if (limit >= contentBottom - 0.5) break;

    for (const seg of segments) {
      if (seg.bottom <= pageStart + 0.5) continue;
      if (seg.top >= nextStart - 0.5) break;
      if (seg.top < pageStart - 0.5 || seg.bottom <= limit + 0.5) continue;

      const textBottom = seg.textBottom ?? seg.bottom;
      const tailSpacingOnly =
        textBottom <= limit + 0.5 && seg.bottom > textBottom + 0.5;
      if (tailSpacingOnly) continue;

      nextStart = Math.min(nextStart, Math.round(seg.top));
    }

    if (nextStart <= pageStart + 0.5) break;
    if (Math.abs(nextStart - pageStart) < 0.5) break;
    trimmed.push(nextStart);
  }

  return trimmed.length > 0 ? trimmed : pageStarts;
}

/** 片段是否可放入当前页；尾行允许忽略行距/段距下延（字形底仍在页窗内） */
export function segmentFitsInPageLimit(
  seg: ReaderLayoutSegment,
  pageStart: number,
  limit: number,
): boolean {
  if (seg.bottom <= limit + 0.5) return true;
  const textBottom = seg.textBottom ?? seg.bottom;
  return textBottom <= limit + 0.5 && textBottom > pageStart + 0.5;
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

  for (; ;) {
    const limit = packLimit(pageStart);
    if (pageStart + clipHeight >= contentBottom - 0.5) break;

    let nextStart = -1;
    let usedFull = 0;
    let usedText = 0;
    let prevBottom = pageStart;
    let segIndex = -1;

    for (const seg of segments) {
      segIndex += 1;
      if (seg.bottom <= pageStart + 0.5) continue;

      const gap = Math.max(0, seg.top - prevBottom);
      const blockFull = gap + (seg.bottom - seg.top);
      const textBottom = seg.textBottom ?? seg.bottom;
      const blockText = gap + (textBottom - seg.top);

      if (usedFull + blockFull <= clipHeight + 0.5) {
        usedFull += blockFull;
        usedText += blockText;
        prevBottom = seg.bottom;
        continue;
      }
      if (usedText + blockText <= clipHeight + 0.5) {
        const visualUsed = usedFull + blockFull;
        const inlineChromeOverflow =
          visualUsed > clipHeight + 0.5 &&
          seg.bottom > textBottom + 1 &&
          textBottom > seg.top + 0.5;
        if (inlineChromeOverflow) {
          nextStart =
            seg.top >= pageStart - 0.5 ? Math.round(seg.top) : Math.round(limit);
          break;
        }
        if (visualUsed > clipHeight + 0.5) {
          const tailSpacingOnly =
            segIndex === segments.length - 1 &&
            textBottom <= limit + 0.5 &&
            seg.bottom > textBottom + 0.5;
          if (!tailSpacingOnly) {
            nextStart =
              seg.top >= pageStart - 0.5 ? Math.round(seg.top) : Math.round(limit);
            break;
          }
        }
        prevBottom = seg.bottom;
        for (let j = segIndex + 1; j < segments.length; j += 1) {
          const next = segments[j]!;
          if (next.bottom <= pageStart + 0.5) continue;
          nextStart = Math.round(next.top);
          break;
        }
        break;
      }
      nextStart =
        seg.top >= pageStart - 0.5 ? Math.round(seg.top) : Math.round(limit);
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
  contentExtent?: number,
): number {
  if (pageStarts.length <= 1) return 0;
  let last = pageStarts.length - 1;
  while (last > 0) {
    const start = pageStarts[last] ?? 0;
    const pageEnd =
      pageStarts[last + 1] ??
      Math.ceil(
        contentExtent ?? segments.reduce((max, s) => Math.max(max, s.bottom), 0),
      );
    const hasContent = segments.some((s) =>
      segmentOverlapsRange(s, start, pageEnd),
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
  const paragraphSpacing = options?.paragraphSpacing;
  const segments = measureLayoutSegments(
    measureRoot,
    fontSize,
    lineSpacing,
    paragraphSpacing,
  );
  const extent = contentExtentFromSegments(segments, measureRoot);
  /** 正文可排版高度：按页模式须直传 tip-body 实测 clipHeightPx */
  const clipHeight =
    options?.clipHeightPx != null && options.clipHeightPx > 0
      ? Math.max(1, Math.floor(options.clipHeightPx))
      : Math.max(1, viewportHeight - padTop - padBottom);
  const layoutResult = computePageStartsForLayout(
    segments,
    clipHeight,
    extent,
    {
      dualPage: options?.dualPage,
      measureRoot,
      fontSize,
      lineSpacing,
      paragraphSpacing,
    },
  );

  let pageStarts = layoutResult.pageStarts;
  if (pageStarts.length > 1) {
    pageStarts = trimPageStartsToSegmentVisualBounds(
      pageStarts,
      segments,
      clipHeight,
      extent,
    );
  }
  if (measureRoot && pageStarts.length > 1) {
    pageStarts = trimPageStartsBeforeClipStraddle(measureRoot, pageStarts, clipHeight);
  }

  const layoutSegments = layoutResult.segments ?? segments;
  const contentExtent =
    options?.dualPage && layoutResult.leftColumnExtent != null
      ? Math.max(
          layoutResult.leftColumnExtent,
          layoutResult.rightColumnExtent ?? 0,
          extent,
        )
      : extent;

  return {
    pageStarts,
    clipHeight,
    viewportHeight: Math.max(1, viewportHeight),
    contentExtent,
    padTop,
    padBottom,
    segments: layoutSegments,
    leftLineSizes: layoutResult.leftLineSizes,
    rightPageStarts: layoutResult.rightPageStarts,
    leftColumnExtent: layoutResult.leftColumnExtent,
    rightColumnExtent: layoutResult.rightColumnExtent,
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
