/**
 * 双栏物理页分页（对齐 Legado doublePage + leftLineSize）
 * Prepare：DOM 双栏测量 + 按栏归一化 Y；Layout：纯算术分页。
 */

import type { ReaderTextPage } from '@/lib/media/text/reader-chapter-layout-types';
import type { ReaderChapterLayout } from '@/lib/media/text/reader-chapter-layout-types';
import {
  computePageStartsFromSegments,
  measureLayoutSegments,
  pageDisplayHeight,
  resolvePagedMeasureRoot,
  type ReaderLayoutSegment,
} from '@/lib/media/text/text-viewer-paginate';

/** 双栏单栏 pack 上限 = clipHeight（与 live column-clip 同高，无额外扣减） */
export function dualSpreadColumnPackLimit(clipHeight: number): number {
  return Math.max(1, clipHeight);
}

export interface DualSpreadPageResult {
  pageStarts: number[];
  rightPageStarts: number[];
  leftLineSizes: number[];
}

export interface NormalizedDualColumnSegments {
  normalized: ReaderLayoutSegment[];
  leftExtent: number;
  rightExtent: number;
}

export function sortSegmentsReadingOrder(segments: ReaderLayoutSegment[]): ReaderLayoutSegment[] {
  return [...segments].sort((a, b) => {
    const ca = a.column ?? 0;
    const cb = b.column ?? 0;
    if (ca !== cb) return ca - cb;
    return a.top - b.top || a.bottom - b.bottom;
  });
}

export function dualColumnForElement(rootRect: DOMRect, el: Element): 0 | 1 {
  const rect = el.getBoundingClientRect();
  const midX = rootRect.left + rootRect.width / 2;
  const centerX = rect.left + rect.width / 2;
  return centerX >= midX ? 1 : 0;
}

export function annotateSegmentsWithColumn(
  measureRoot: HTMLElement,
  segments: ReaderLayoutSegment[],
): ReaderLayoutSegment[] {
  const rootRect = measureRoot.getBoundingClientRect();
  const blocks = measureRoot.querySelectorAll<HTMLElement>('[data-reader-measure-block]');

  return segments.map((seg) => {
    let column: 0 | 1 = 0;
    let blockIndex = seg.blockIndex;
    for (let i = 0; i < blocks.length; i += 1) {
      const block = blocks[i]!;
      const blockTop = block.getBoundingClientRect().top - rootRect.top;
      const blockBottom = block.getBoundingClientRect().bottom - rootRect.top;
      if (seg.top >= blockTop - 1 && seg.top < blockBottom + 1) {
        column = dualColumnForElement(rootRect, block);
        blockIndex = i;
        break;
      }
    }
    return { ...seg, column, blockIndex };
  });
}

/** 每栏独立 Y' = top - minTop(column)，分页/裁切均在栏内坐标系进行 */
export function normalizeDualColumnSegments(
  segments: ReaderLayoutSegment[],
): NormalizedDualColumnSegments {
  const normalizeColumn = (column: 0 | 1) => {
    const colSegs = segments.filter((s) => (s.column ?? 0) === column);
    if (colSegs.length === 0) return { segs: [] as ReaderLayoutSegment[], extent: 0 };
    const minTop = Math.min(...colSegs.map((s) => s.top));
    const segs = colSegs.map((s) => ({
      ...s,
      top: s.top - minTop,
      bottom: s.bottom - minTop,
    }));
    const extent = segs.reduce((max, s) => Math.max(max, s.bottom), 0);
    return { segs, extent };
  };

  const left = normalizeColumn(0);
  const right = normalizeColumn(1);
  return {
    normalized: [...left.segs, ...right.segs],
    leftExtent: left.extent,
    rightExtent: right.extent,
  };
}

export function segmentsForColumn(segments: ReaderLayoutSegment[], column: 0 | 1): ReaderLayoutSegment[] {
  return segments.filter((s) => (s.column ?? 0) === column);
}

export function dualSpreadColumnWidthPx(spreadWidthPx: number, columnGapPx = 32): number {
  const gap = Math.max(0, columnGapPx);
  return Math.max(1, Math.round((Math.max(1, spreadWidthPx) - gap) / 2));
}

export function blockIndicesForColumn(
  segments: ReaderLayoutSegment[],
  column: 0 | 1,
): number[] {
  const indices = new Set<number>();
  for (const seg of segments) {
    if ((seg.column ?? 0) !== column) continue;
    if (seg.blockIndex != null) indices.add(seg.blockIndex);
  }
  return [...indices].sort((a, b) => a - b);
}

/** measure block 0 = 章节标题；正文块从 measure index 1 起 */
export function columnShowsChapterTitle(
  segments: ReaderLayoutSegment[],
  column: 0 | 1,
): boolean {
  return blockIndicesForColumn(segments, column).includes(0);
}

/** 将 measure blockIndex 转为 ReaderContent 正文块索引（标题块 0 除外） */
export function contentBlockIndicesForColumn(
  segments: ReaderLayoutSegment[],
  column: 0 | 1,
): number[] {
  return blockIndicesForColumn(segments, column)
    .filter((i) => i > 0)
    .map((i) => i - 1);
}

function blockBoundsInColumn(
  segments: ReaderLayoutSegment[],
  column: 0 | 1,
): Map<number, { minTop: number; maxBottom: number }> {
  const bounds = new Map<number, { minTop: number; maxBottom: number }>();
  for (const seg of segments) {
    if ((seg.column ?? 0) !== column) continue;
    if (seg.blockIndex == null) continue;
    const prev = bounds.get(seg.blockIndex);
    if (!prev) {
      bounds.set(seg.blockIndex, { minTop: seg.top, maxBottom: seg.bottom });
      continue;
    }
    prev.minTop = Math.min(prev.minTop, seg.top);
    prev.maxBottom = Math.max(prev.maxBottom, seg.bottom);
  }
  return bounds;
}

/** 双栏 spread 单页：整块须完整落在页界且栏内叠高 ≤ clipHeight（Render 按块原子、自顶堆叠） */
export function contentBlockIndicesForSpreadPage(
  layout: DualSpreadLayoutPick,
  column: 0 | 1,
  pageIndex: number,
): number[] {
  const starts = column === 0 ? layout.pageStarts : resolveDualSpreadRightStarts(layout);
  const start = Math.round(starts[pageIndex] ?? 0);
  const nextTop = starts[pageIndex + 1];
  const pageEnd =
    nextTop != null
      ? Math.round(nextTop)
      : Math.ceil(
          column === 0
            ? layout.leftColumnExtent ?? layout.contentExtent
            : layout.rightColumnExtent ?? layout.contentExtent,
        );
  const candidates: { blockIndex: number; minTop: number; maxBottom: number }[] = [];
  for (const [blockIndex, bounds] of blockBoundsInColumn(layout.segments, column)) {
    if (blockIndex <= 0) continue;
    if (bounds.maxBottom <= start + 0.5) continue;
    if (bounds.minTop >= pageEnd - 0.5) continue;
    if (bounds.maxBottom > pageEnd + 0.5) continue;
    candidates.push({ blockIndex, minTop: bounds.minTop, maxBottom: bounds.maxBottom });
  }
  candidates.sort((a, b) => a.minTop - b.minTop || a.maxBottom - b.maxBottom);

  const clipHeight =
    layout.clipHeight != null && layout.clipHeight > 0
      ? Math.round(layout.clipHeight)
      : null;
  /** Live 首屏左栏会单独渲染章节标题（block 0），叠高须从栏顶 y=0 量到末块底 */
  const stackFromColumnTop =
    pageIndex === 0 && columnShowsChapterTitleOnSpreadPage(layout, column, pageIndex);

  const indices: number[] = [];
  let spanMin = Number.POSITIVE_INFINITY;
  let spanMax = Number.NEGATIVE_INFINITY;

  for (const c of candidates) {
    if (clipHeight != null) {
      const newMin = Math.min(spanMin, c.minTop);
      const newMax = Math.max(spanMax, c.maxBottom);
      const stackSpan = stackFromColumnTop
        ? newMax
        : spanMin === Number.POSITIVE_INFINITY
          ? c.maxBottom - c.minTop
          : newMax - newMin;
      if (stackSpan > clipHeight + 0.5) break;
      spanMin = newMin;
      spanMax = newMax;
    }
    indices.push(c.blockIndex - 1);
  }

  return indices.sort((a, b) => a - b);
}

export function columnShowsChapterTitleOnSpreadPage(
  layout: DualSpreadLayoutPick,
  column: 0 | 1,
  pageIndex: number,
): boolean {
  if (pageIndex !== 0) return false;
  if (!columnShowsChapterTitle(layout.segments, column)) return false;
  const starts = column === 0 ? layout.pageStarts : resolveDualSpreadRightStarts(layout);
  const pageEnd =
    starts[1] != null
      ? Math.round(starts[1]!)
      : Math.ceil(
          column === 0
            ? layout.leftColumnExtent ?? layout.contentExtent
            : layout.rightColumnExtent ?? layout.contentExtent,
        );
  return layout.segments.some(
    (s) =>
      (s.column ?? 0) === column &&
      s.blockIndex === 0 &&
      s.top >= -0.5 &&
      s.top < pageEnd - 0.5,
  );
}

function groupSegmentsByBlock(segments: ReaderLayoutSegment[]): ReaderLayoutSegment[][] {
  const sorted = [...segments].sort((a, b) => a.top - b.top || a.bottom - b.bottom);
  const groups: ReaderLayoutSegment[][] = [];
  let current: ReaderLayoutSegment[] = [];
  let lastBlock: number | undefined;

  for (const seg of sorted) {
    const blockKey = seg.blockIndex;
    if (lastBlock !== undefined && blockKey !== lastBlock && current.length > 0) {
      groups.push(current);
      current = [];
    }
    current.push(seg);
    lastBlock = blockKey;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/**
 * 单栏宽测量后按 spread 先填左页再填右页（对齐 column-fill:auto + clipHeight）。
 * 以 measure block 为原子单位分配栏位（Render 按 visibleBlockIndices 整块渲染，不可拆行跨栏）。
 */
export function assignSegmentsBySpreadFillLeft(
  segments: ReaderLayoutSegment[],
  clipHeight: number,
): ReaderLayoutSegment[] {
  const packLimit = dualSpreadColumnPackLimit(clipHeight);
  const blockGroups = groupSegmentsByBlock(segments);
  const out: ReaderLayoutSegment[] = [];
  let col: 0 | 1 = 0;
  const colY: [number, number] = [0, 0];
  let spreadAnchor: [number, number] = [0, 0];
  let spreadFill: [number, number] = [0, 0];
  const lastInColumn: [
    { repackedBottom: number; origBottom: number } | undefined,
    { repackedBottom: number; origBottom: number } | undefined,
  ] = [undefined, undefined];

  const resetSpread = () => {
    spreadAnchor = [colY[0], colY[1]];
    spreadFill = [0, 0];
    col = 0;
    lastInColumn[0] = undefined;
    lastInColumn[1] = undefined;
  };

  const projectedBlockInColumn = (targetCol: 0 | 1, blockFirstTop: number, blockH: number) => {
    const prev = lastInColumn[targetCol];
    const top =
      prev != null
        ? prev.repackedBottom + Math.max(0, blockFirstTop - prev.origBottom)
        : colY[targetCol];
    return { top, bottom: top + blockH };
  };

  const blockOverflowsColumn = (
    targetCol: 0 | 1,
    bottom: number,
    blockH: number,
  ) => {
    const used = bottom - spreadAnchor[targetCol];
    if (used > packLimit + 0.5) return true;
    if (spreadFill[targetCol] <= 0.5 && blockH > packLimit + 0.5) return true;
    return false;
  };

  for (const blockSegs of blockGroups) {
    const firstTop = blockSegs[0]!.top;
    const lastBottom = blockSegs[blockSegs.length - 1]!.bottom;
    const blockH = Math.max(0, lastBottom - firstTop);
    if (blockH <= 0.5) continue;
    const origBottom = lastBottom;

    let targetCol = col;
    let { top: blockTop, bottom: blockBottom } = projectedBlockInColumn(
      targetCol,
      firstTop,
      blockH,
    );

    if (blockOverflowsColumn(targetCol, blockBottom, blockH)) {
      if (targetCol === 0) {
        targetCol = 1;
        ({ top: blockTop, bottom: blockBottom } = projectedBlockInColumn(1, firstTop, blockH));
        if (blockOverflowsColumn(1, blockBottom, blockH)) {
          resetSpread();
          targetCol = 0;
          ({ top: blockTop, bottom: blockBottom } = projectedBlockInColumn(0, firstTop, blockH));
        }
      } else {
        resetSpread();
        targetCol = 0;
        ({ top: blockTop, bottom: blockBottom } = projectedBlockInColumn(0, firstTop, blockH));
      }
    }

    col = targetCol;
    for (const seg of blockSegs) {
      const offset = seg.top - firstTop;
      const segH = Math.max(0, seg.bottom - seg.top);
      out.push({
        ...seg,
        column: targetCol,
        top: blockTop + offset,
        bottom: blockTop + offset + segH,
      });
    }

    colY[targetCol] = blockBottom;
    lastInColumn[targetCol] = { repackedBottom: blockBottom, origBottom };
    spreadFill[targetCol] = blockBottom - spreadAnchor[targetCol];

    if (spreadFill[0] >= packLimit - 0.5 && spreadFill[1] >= packLimit - 0.5) {
      resetSpread();
    } else if (spreadFill[0] >= packLimit - 0.5 && col === 0) {
      col = 1;
    }
  }
  return out;
}

function columnContentExtent(segments: ReaderLayoutSegment[]): number {
  if (segments.length === 0) return 0;
  return segments.reduce((max, s) => Math.max(max, s.bottom), 0);
}

function mergeDualSpreadColumnStarts(
  leftSegs: ReaderLayoutSegment[],
  rightSegs: ReaderLayoutSegment[],
  leftStarts: number[],
  rightStarts: number[],
): DualSpreadPageResult {
  const leftExtent = columnContentExtent(leftSegs);
  const rightExtent = columnContentExtent(rightSegs);
  const spreadCount = Math.max(leftStarts.length, rightStarts.length);
  const pageStarts: number[] = [];
  const rightPageStarts: number[] = [];
  const leftLineSizes: number[] = [];

  for (let i = 0; i < spreadCount; i += 1) {
    const leftStart = i < leftStarts.length ? leftStarts[i]! : leftExtent;
    const rightStart = i < rightStarts.length ? rightStarts[i]! : rightExtent;
    const leftEnd = leftStarts[i + 1] ?? leftExtent;

    pageStarts.push(Math.round(leftStart));
    rightPageStarts.push(Math.round(rightStart));
    leftLineSizes.push(countColumnSegmentsInPage(leftSegs, leftStart, leftEnd));
  }

  return { pageStarts, rightPageStarts, leftLineSizes };
}

function measureLiveColumnSegments(
  columnShift: HTMLElement | undefined,
  column: 0 | 1,
  fontSize?: number,
  lineSpacing?: number,
): { segments: ReaderLayoutSegment[]; measureRoot?: HTMLElement; extent: number } {
  if (!columnShift) return { segments: [], extent: 0 };
  const contentRoot =
    columnShift.querySelector<HTMLElement>('[data-reader-content]') ?? columnShift;
  const measureRoot = resolvePagedMeasureRoot(contentRoot);
  if (!measureRoot.querySelector('[data-reader-measure-block]')) {
    return { segments: [], measureRoot, extent: 0 };
  }
  const segments = measureLayoutSegments(measureRoot, fontSize, lineSpacing).map((s) => ({
    ...s,
    column,
  }));
  return { segments, measureRoot, extent: columnContentExtent(segments) };
}

/**
 * 从 live 双栏 pane（已按 visibleBlockIndices 分栏）实测分页，使 translateY 与 DOM 坐标一致。
 */
export function computeDualSpreadPageStartsFromLiveColumns(
  leftShift: HTMLElement | undefined,
  rightShift: HTMLElement | undefined,
  clipHeight: number,
  fontSize?: number,
  lineSpacing?: number,
): (DualSpreadPageResult & { leftColumnExtent: number; rightColumnExtent: number }) | null {
  const left = measureLiveColumnSegments(leftShift, 0, fontSize, lineSpacing);
  const right = measureLiveColumnSegments(rightShift, 1, fontSize, lineSpacing);
  if (left.segments.length === 0 && right.segments.length === 0) return null;

  const leftStarts =
    left.segments.length > 0
      ? computePageStartsFromSegments(
        left.segments,
        clipHeight,
        left.extent,
        0,
        left.measureRoot,
      )
      : [0];
  const rightStarts =
    right.segments.length > 0
      ? computePageStartsFromSegments(
        right.segments,
        clipHeight,
        right.extent,
        0,
        right.measureRoot,
      )
      : [0];

  const spread = mergeDualSpreadColumnStarts(
    left.segments,
    right.segments,
    leftStarts,
    rightStarts,
  );
  return {
    ...spread,
    leftColumnExtent: left.extent,
    rightColumnExtent: right.extent,
  };
}

export function dualSpreadPageStartsMaxDelta(
  a: number[] | undefined,
  b: number[] | undefined,
): number {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return Number.POSITIVE_INFINITY;
  if (left.length === 0) return 0;
  return Math.max(...left.map((v, i) => Math.abs(v - (right[i] ?? 0))));
}

/** 用 live 精修后的 spread 页界覆盖 layout（保留 hidden 测量得到的 column/segments） */
export function patchDualSpreadLayoutFromLiveStarts(
  layout: ReaderChapterLayout,
  live: DualSpreadPageResult & { leftColumnExtent: number; rightColumnExtent: number },
): ReaderChapterLayout {
  const leftSegs = segmentsForColumn(layout.segments, 0);
  const contentExtent = Math.max(
    live.leftColumnExtent,
    live.rightColumnExtent,
    layout.contentExtent,
  );
  const pages: ReaderTextPage[] = live.pageStarts.map((startY, index) => {
    const prev = layout.pages[index];
    return {
      index,
      startY,
      endY: live.pageStarts[index + 1] ?? live.leftColumnExtent,
      displayHeight: pageDisplayHeight(
        index,
        live.pageStarts,
        layout.clipHeight,
        live.leftColumnExtent,
        leftSegs,
      ),
      chapterPosition: prev?.chapterPosition ?? 0,
      text: prev?.text,
      lines: prev?.lines,
      leftLineSize: live.leftLineSizes[index] ?? prev?.leftLineSize,
    };
  });

  return {
    ...layout,
    pages,
    pageStarts: live.pageStarts,
    rightPageStarts: live.rightPageStarts,
    leftColumnExtent: live.leftColumnExtent,
    rightColumnExtent: live.rightColumnExtent,
    contentExtent,
  };
}

function countColumnSegmentsInPage(
  segments: ReaderLayoutSegment[],
  pageStart: number,
  pageEnd: number,
): number {
  return segments.filter(
    (s) => s.top >= pageStart - 0.5 && s.top < pageEnd - 0.5,
  ).length;
}

/** 多行块在测量阶段会拆成多 segment；分页须按整块边界断页，与 visibleBlockIndices 一致 */
function aggregateSegmentsByBlock(segments: ReaderLayoutSegment[]): ReaderLayoutSegment[] {
  const byBlock = new Map<number, ReaderLayoutSegment>();
  const unindexed: ReaderLayoutSegment[] = [];
  for (const seg of segments) {
    if (seg.blockIndex == null) {
      unindexed.push(seg);
      continue;
    }
    const prev = byBlock.get(seg.blockIndex);
    if (!prev) {
      byBlock.set(seg.blockIndex, { ...seg });
      continue;
    }
    byBlock.set(seg.blockIndex, {
      ...prev,
      top: Math.min(prev.top, seg.top),
      bottom: Math.max(prev.bottom, seg.bottom),
    });
  }
  return [...byBlock.values(), ...unindexed].sort(
    (a, b) => a.top - b.top || a.bottom - b.bottom,
  );
}

/** segments 须已按栏归一化 Y；Layout 阶段不读 DOM */
export function computeDualSpreadPageStarts(
  segments: ReaderLayoutSegment[],
  clipHeight: number,
  _contentExtent: number,
): DualSpreadPageResult {
  const leftSegs = segmentsForColumn(segments, 0);
  const rightSegs = segmentsForColumn(segments, 1);
  const leftExtent = columnContentExtent(leftSegs);
  const rightExtent = columnContentExtent(rightSegs);

  if (leftSegs.length === 0 && rightSegs.length === 0) {
    return { pageStarts: [0], rightPageStarts: [0], leftLineSizes: [0] };
  }

  const leftBlocks = aggregateSegmentsByBlock(leftSegs);
  const rightBlocks = aggregateSegmentsByBlock(rightSegs);

  const leftStarts =
    leftBlocks.length > 0
      ? computePageStartsFromSegments(leftBlocks, clipHeight, leftExtent, 0)
      : [0];
  const rightStarts =
    rightBlocks.length > 0
      ? computePageStartsFromSegments(rightBlocks, clipHeight, rightExtent, 0)
      : [0];

  return mergeDualSpreadColumnStarts(leftSegs, rightSegs, leftStarts, rightStarts);
}

export interface DualSpreadLayoutPick {
  pageStarts: number[];
  rightPageStarts?: number[];
  segments: ReaderLayoutSegment[];
  dualPage?: boolean;
  contentExtent: number;
  clipHeight?: number;
  leftColumnExtent?: number;
  rightColumnExtent?: number;
}

export function inferDualSpreadRightStart(
  layout: DualSpreadLayoutPick | null | undefined,
  pageIndex: number,
): number {
  if (!layout?.dualPage) {
    return Math.round(layout?.pageStarts[pageIndex] ?? 0);
  }
  const stored = layout.rightPageStarts?.[pageIndex];
  if (stored != null) return Math.round(stored);

  const rightSegs = segmentsForColumn(layout.segments, 1);
  if (rightSegs.length === 0) return 0;

  const rightExtent = layout.rightColumnExtent ?? columnContentExtent(rightSegs);
  const clipHeight = layout.clipHeight ?? Math.max(1, rightExtent);
  const starts = computePageStartsFromSegments(rightSegs, clipHeight, rightExtent, 0);
  if (pageIndex < starts.length) return Math.round(starts[pageIndex]!);
  return Math.round(rightExtent);
}

export function resolveDualSpreadRightStarts(layout: DualSpreadLayoutPick): number[] {
  if (layout.rightPageStarts?.length) return layout.rightPageStarts;
  const count = Math.max(1, layout.pageStarts.length);
  return Array.from({ length: count }, (_, i) => inferDualSpreadRightStart(layout, i));
}

export function dualSpreadColumnStarts(
  layout: DualSpreadLayoutPick,
  column: 'left' | 'right',
): number[] {
  return column === 'left' ? layout.pageStarts : resolveDualSpreadRightStarts(layout);
}

export function buildDualSpreadPages(
  pageStarts: number[],
  leftLineSizes: number[],
  clipHeight: number,
  contentExtent: number,
  segments: ReaderLayoutSegment[],
  _rightPageStarts?: number[],
): ReaderTextPage[] {
  const leftSegs = segmentsForColumn(segments, 0);
  return pageStarts.map((startY, index) => ({
    index,
    startY,
    endY: pageStarts[index + 1] ?? contentExtent,
    displayHeight: pageDisplayHeight(
      index,
      pageStarts,
      clipHeight,
      contentExtent,
      leftSegs,
    ),
    chapterPosition: 0,
    leftLineSize: leftLineSizes[index],
  }));
}

export function computePageStartsForLayout(
  segments: ReaderLayoutSegment[],
  clipHeight: number,
  contentExtent: number,
  options: {
    dualPage?: boolean;
    measureRoot?: HTMLElement;
    fontSize?: number;
    lineSpacing?: number;
  },
): {
  pageStarts: number[];
  leftLineSizes?: number[];
  rightPageStarts?: number[];
  segments?: ReaderLayoutSegment[];
  leftColumnExtent?: number;
  rightColumnExtent?: number;
} {
  let segs = segments;
  if (options.dualPage) {
    segs = assignSegmentsBySpreadFillLeft(segments, clipHeight);
    const { normalized, leftExtent, rightExtent } = normalizeDualColumnSegments(segs);
    const spread = computeDualSpreadPageStarts(
      normalized,
      clipHeight,
      Math.max(leftExtent, rightExtent, contentExtent),
    );
    return {
      pageStarts: spread.pageStarts,
      leftLineSizes: spread.leftLineSizes,
      rightPageStarts: spread.rightPageStarts,
      segments: normalized,
      leftColumnExtent: leftExtent,
      rightColumnExtent: rightExtent,
    };
  }

  return {
    pageStarts: computePageStartsFromSegments(
      segs,
      clipHeight,
      contentExtent,
      0,
      options.measureRoot,
    ),
  };
}

export function dualSpreadMeasureHostStyle(columnWidthPx: number): Record<string, string> {
  return {
    width: `${Math.max(1, Math.round(columnWidthPx))}px`,
  };
}
