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

interface ColumnBlockBounds {
  minTop: number;
  maxBottom: number;
  maxTextBottom: number;
}

function blockTextBottomInGroup(segs: ReaderLayoutSegment[]): number {
  return segs.reduce((max, s) => Math.max(max, s.textBottom ?? s.bottom), 0);
}

/** 段距 tail（margin-only 尾段或单行 bottom−textBottom）；排除行盒下延 */
function paragraphMarginTailPx(blockSegs: ReaderLayoutSegment[]): number {
  const textBottom = blockTextBottomInGroup(blockSegs);
  const last = blockSegs[blockSegs.length - 1]!;
  const tail = Math.max(0, last.bottom - (last.textBottom ?? textBottom));
  if (blockSegs.length === 1) return tail;
  const prev = blockSegs[blockSegs.length - 2]!;
  const marginOnlyTail =
    last.top >= prev.bottom - 1 &&
    Math.abs((last.textBottom ?? last.bottom) - textBottom) < 1;
  if (marginOnlyTail) return tail;
  /** 多行末段为行盒：tail 为 line-height 下延，段距从 margin-only 子段或典型 1em 推断 */
  for (let i = blockSegs.length - 1; i >= 0; i -= 1) {
    const seg = blockSegs[i]!;
    const segTail = Math.max(0, seg.bottom - (seg.textBottom ?? seg.bottom));
    if (segTail >= 10 && segTail <= 28) return segTail;
  }
  return tail >= 10 && tail <= 28 ? tail : 16;
}

/** 块在排版流中的叠高：首段顶 → 末字形 + 段距（与 measure blockFlowBottom 一致） */
function blockFlowExtentInGroup(blockSegs: ReaderLayoutSegment[]): number {
  const firstTop = blockSegs[0]!.top;
  const textBottom = blockTextBottomInGroup(blockSegs);
  return Math.max(0, textBottom + paragraphMarginTailPx(blockSegs) - firstTop);
}

type ColumnStackBlock = {
  minTop: number;
  maxBottom: number;
  maxTextBottom: number;
};

/**
 * 栏尾块清零 margin 后，末行仍保留 line-height 下行盒下延（lh − glyph）。
 * 裁切判断须计入，否则 live 叠高低估 ~半行并被 column-clip 裁切。
 */
function lineBoxSlopBelowGlyphPx(block: ColumnStackBlock): number {
  const tail = Math.max(0, block.maxBottom - block.maxTextBottom);
  if (tail <= 0.5) return 0;
  if (tail <= 10) return tail;
  return 6.8;
}

/** 栏尾块：清零段距后可视高度 = 字形跨度 + 末行行盒下延 */
function tailBlockVisualHeightPx(block: ColumnStackBlock): number {
  const glyphSpan = block.maxTextBottom - block.minTop;
  const marginTail = Math.max(0, block.maxBottom - block.maxTextBottom);
  return glyphSpan + (marginTail >= 10 ? lineBoxSlopBelowGlyphPx(block) : Math.max(lineBoxSlopBelowGlyphPx(block), marginTail));
}

/** 栏内 live 可视叠高：中间块含段距；末块仅字形 + 行盒下延（段距 CSS 清零） */
function columnVisualStackPx(
  placed: ColumnStackBlock[],
  candidate: ColumnStackBlock,
): number {
  let stack = 0;
  let prevMaxBottom: number | null = null;
  const all = [...placed, candidate];
  for (let i = 0; i < all.length; i += 1) {
    const b = all[i]!;
    const gap = prevMaxBottom == null ? 0 : Math.max(0, b.minTop - prevMaxBottom);
    const isTail = i === all.length - 1;
    const blockH = isTail ? tailBlockVisualHeightPx(b) : b.maxBottom - b.minTop;
    stack += gap + blockH;
    prevMaxBottom = b.maxBottom;
  }
  return stack;
}

/** 与 contentBlockIndicesForSpreadPage / live pane 相同的栏内叠高模型 */
function columnStackHeightsAfterAppend(
  placed: ColumnStackBlock[],
  candidate: ColumnStackBlock,
): { nextFull: number; nextLive: number; nextVisual: number } {
  let stackFull = 0;
  let prevMaxBottom: number | null = null;
  for (const b of [...placed, candidate]) {
    const gap = prevMaxBottom == null ? 0 : Math.max(0, b.minTop - prevMaxBottom);
    stackFull += gap + (b.maxBottom - b.minTop);
    prevMaxBottom = b.maxBottom;
  }
  const tailMargin = Math.max(0, candidate.maxBottom - candidate.maxTextBottom);
  return {
    nextFull: stackFull,
    nextLive: stackFull - tailMargin,
    nextVisual: columnVisualStackPx(placed, candidate),
  };
}

function columnBlockFitsClip(
  placed: ColumnStackBlock[],
  candidate: ColumnStackBlock,
  clipHeight: number,
): { fits: boolean; tailOnly: boolean } {
  const { nextFull, nextLive, nextVisual } = columnStackHeightsAfterAppend(placed, candidate);
  /** 仅以 columnVisualStackPx 为准；勿在 nextVisual 已超 clip 时用「栏尾剩余高度」误判可放（会把块 assign 进 spread 但 live 不渲染） */
  if (nextVisual <= clipHeight + 0.5) {
    if (nextFull <= clipHeight + 0.5) return { fits: true, tailOnly: false };
    if (nextLive <= clipHeight + 0.5) return { fits: true, tailOnly: true };
    return { fits: true, tailOnly: true };
  }
  return { fits: false, tailOnly: false };
}

type ColumnLastBlock = {
  repackedBottom: number;
  origBottom: number;
};

function repackSegmentTextBottom(
  seg: ReaderLayoutSegment,
  blockTop: number,
  offset: number,
): number | undefined {
  if (seg.textBottom == null) return undefined;
  return blockTop + offset + (seg.textBottom - seg.top);
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
      textBottom:
        s.textBottom != null ? s.textBottom - minTop : undefined,
      spreadIndex: s.spreadIndex,
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
): Map<number, ColumnBlockBounds> {
  const byBlock = new Map<number, ReaderLayoutSegment[]>();
  for (const seg of segments) {
    if ((seg.column ?? 0) !== column) continue;
    if (seg.blockIndex == null) continue;
    const list = byBlock.get(seg.blockIndex) ?? [];
    list.push(seg);
    byBlock.set(seg.blockIndex, list);
  }
  const bounds = new Map<number, ColumnBlockBounds>();
  for (const [blockIndex, blockSegs] of byBlock) {
    const minTop = Math.min(...blockSegs.map((s) => s.top));
    const maxTextBottom = blockTextBottomInGroup(blockSegs);
    const flowH = blockFlowExtentInGroup(blockSegs);
    bounds.set(blockIndex, {
      minTop,
      maxBottom: minTop + flowH,
      maxTextBottom,
    });
  }
  return bounds;
}

type SpreadColumnBlock = {
  blockIndex: number;
  minTop: number;
  maxBottom: number;
  maxTextBottom: number;
};

/** live 首屏左栏单独渲染章节标题时，用于 clip 叠高的标题占位（勿用整块 segment 跨度） */
function spreadTitleStackBlock(
  titleBounds: ColumnBlockBounds | undefined,
  clipHeight: number,
): ColumnStackBlock | undefined {
  if (!titleBounds) return undefined;
  const rawSpan = Math.max(0, titleBounds.maxBottom - titleBounds.minTop);
  const sane = Math.min(rawSpan, Math.max(40, Math.round(clipHeight * 0.22)));
  return {
    minTop: 0,
    maxBottom: sane,
    maxTextBottom: sane,
  };
}

/** live pane 叠高：非尾块含段距；尾块 CSS 清零 margin-bottom，保留行盒下延 */
function spreadPageVisualStackPx(
  titleBlock: ColumnStackBlock | undefined,
  contentBlocks: ColumnStackBlock[],
): number {
  if (contentBlocks.length === 0) {
    if (!titleBlock) return 0;
    return columnVisualStackPx([], titleBlock);
  }
  const placed: ColumnStackBlock[] = titleBlock ? [titleBlock] : [];
  const last = contentBlocks[contentBlocks.length - 1]!;
  for (let i = 0; i < contentBlocks.length - 1; i += 1) {
    placed.push(contentBlocks[i]!);
  }
  return columnVisualStackPx(placed, last);
}

function blockSpreadIndexInColumn(
  segments: ReaderLayoutSegment[],
  blockIndex: number,
  column: 0 | 1,
): number | undefined {
  for (const seg of segments) {
    if (seg.blockIndex !== blockIndex) continue;
    if ((seg.column ?? 0) !== column) continue;
    return seg.spreadIndex;
  }
  return undefined;
}

function layoutUsesSpreadIndex(segments: ReaderLayoutSegment[]): boolean {
  return segments.some((s) => s.spreadIndex != null);
}

function spreadIndexCount(segments: ReaderLayoutSegment[]): number {
  let max = -1;
  for (const seg of segments) {
    if (seg.spreadIndex != null) max = Math.max(max, seg.spreadIndex);
  }
  return Math.max(1, max + 1);
}

function spreadColumnPageStartY(
  segments: ReaderLayoutSegment[],
  column: 0 | 1,
  spreadIndex: number,
  columnExtent: number,
): number {
  const inSpread = segments.filter(
    (s) => (s.column ?? 0) === column && s.spreadIndex === spreadIndex,
  );
  if (inSpread.length === 0) return columnExtent;
  return Math.min(...inSpread.map((s) => s.top));
}

/** 双栏 spread 单页：按块原子渲染；页尾允许忽略段距/行距下延（字形仍在页内） */
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
  const candidates: SpreadColumnBlock[] = [];
  const spreadAware = layoutUsesSpreadIndex(layout.segments);
  for (const [blockIndex, bounds] of blockBoundsInColumn(layout.segments, column)) {
    if (blockIndex <= 0) continue;
    if (spreadAware) {
      const blockSpread = blockSpreadIndexInColumn(layout.segments, blockIndex, column);
      if (blockSpread != null && blockSpread !== pageIndex) continue;
    } else {
      if (bounds.maxTextBottom <= start + 0.5) continue;
      if (bounds.minTop < start - 0.5) continue;
      if (bounds.minTop >= pageEnd - 0.5) continue;
      if (bounds.maxTextBottom > pageEnd + 0.5) continue;
    }
    candidates.push({
      blockIndex,
      minTop: bounds.minTop,
      maxBottom: bounds.maxBottom,
      maxTextBottom: bounds.maxTextBottom,
    });
  }
  candidates.sort(
    (a, b) => a.minTop - b.minTop || a.maxTextBottom - b.maxTextBottom,
  );

  const clipHeight =
    layout.clipHeight != null && layout.clipHeight > 0
      ? Math.round(layout.clipHeight)
      : null;
  /** Live 首屏左栏会单独渲染章节标题（block 0），叠高须从栏顶 y=0 量到末块底 */
  const stackFromColumnTop =
    pageIndex === 0 && columnShowsChapterTitleOnSpreadPage(layout, column, pageIndex);

  const columnBounds = blockBoundsInColumn(layout.segments, column);
  const resolvedClipForTitle =
    clipHeight ??
    (layout.clipHeight != null && layout.clipHeight > 0
      ? Math.round(layout.clipHeight)
      : 1);
  const titleStackBlock = stackFromColumnTop
    ? spreadTitleStackBlock(columnBounds.get(0), resolvedClipForTitle)
    : undefined;

  const indices: number[] = [];
  const placed: ColumnStackBlock[] = titleStackBlock ? [titleStackBlock] : [];

  for (const c of candidates) {
    if (clipHeight != null) {
      const { fits, tailOnly } = columnBlockFitsClip(placed, c, clipHeight);
      if (fits) {
        indices.push(c.blockIndex - 1);
        placed.push(c);
        if (tailOnly) break;
        continue;
      }
      break;
    }

    indices.push(c.blockIndex - 1);
    placed.push(c);
  }

  if (clipHeight != null) {
    while (indices.length > 0) {
      const contentBlocks = indices
        .map((idx) => candidates.find((b) => b.blockIndex - 1 === idx))
        .filter((b): b is SpreadColumnBlock => b != null);
      const titleBlock = titleStackBlock;
      const liveH = spreadPageVisualStackPx(titleBlock, contentBlocks);
      if (liveH <= clipHeight + 0.5) break;
      indices.pop();
      placed.pop();
    }
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
  /** spread 内先填左栏；左栏放不下的一块起改填右栏，直至右栏也放不下再开新 spread */
  let fillPhase: 'left' | 'right' = 'left';
  const colY: [number, number] = [0, 0];
  let spreadAnchor: [number, number] = [0, 0];
  let spreadTextFill: [number, number] = [0, 0];
  const lastInColumn: [ColumnLastBlock | undefined, ColumnLastBlock | undefined] = [
    undefined,
    undefined,
  ];
  let placedInSpread: [ColumnStackBlock[], ColumnStackBlock[]] = [[], []];
  /** 本 spread 上一块落在哪一栏；跨栏后同栏须紧贴叠放，勿把另一栏在测量流里的高度当 gap */
  let lastPlacedCol: 0 | 1 | null = null;
  /** 当前 spread 物理页；与 UI pageIndex 一一对应，避免左栏 clip 分页混入下一 spread 块 */
  let spreadIndex = 0;

  const resetSpread = () => {
    spreadAnchor = [colY[0], colY[1]];
    spreadTextFill = [0, 0];
    fillPhase = 'left';
    lastInColumn[0] = undefined;
    lastInColumn[1] = undefined;
    placedInSpread = [[], []];
    lastPlacedCol = null;
    spreadIndex += 1;
  };

  const projectedBlockInColumn = (
    targetCol: 0 | 1,
    blockFirstTop: number,
    blockH: number,
    blockTextH: number,
  ) => {
    const prev = lastInColumn[targetCol];
    const measureGap =
      prev != null && lastPlacedCol === targetCol
        ? Math.max(0, blockFirstTop - prev.origBottom)
        : 0;
    const top = prev != null ? prev.repackedBottom + measureGap : colY[targetCol];
    const textBottom = top + blockTextH;
    return {
      top,
      bottom: top + blockH,
      textBottom,
    };
  };

  const blockOverflowsColumn = (
    targetCol: 0 | 1,
    candidate: ColumnStackBlock,
  ) => !columnBlockFitsClip(placedInSpread[targetCol], candidate, packLimit).fits;

  const placeInColumn = (
    targetCol: 0 | 1,
    firstTop: number,
    blockH: number,
    blockTextH: number,
  ) => {
    const { top: blockTop, bottom: blockBottom, textBottom: blockTextBottom } =
      projectedBlockInColumn(targetCol, firstTop, blockH, blockTextH);
    return {
      targetCol,
      blockTop,
      blockBottom,
      blockTextBottom,
    };
  };

  for (const blockSegs of blockGroups) {
    const firstTop = blockSegs[0]!.top;
    const lastBottom = blockSegs[blockSegs.length - 1]!.bottom;
    const measureTextBottom = blockTextBottomInGroup(blockSegs);
    /** 叠高/分栏用流高（字形+段距），勿把每行行盒下延累计进栏高 */
    const blockH = blockFlowExtentInGroup(blockSegs);
    const blockTextH = Math.max(0, measureTextBottom - firstTop);
    if (blockH <= 0.5) continue;
    const origBottom = lastBottom;

    let targetCol: 0 | 1;
    let blockTop: number;
    let blockBottom: number;
    let blockTextBottom: number;

    if (fillPhase === 'left') {
      ({ targetCol, blockTop, blockBottom, blockTextBottom } = placeInColumn(
        0,
        firstTop,
        blockH,
        blockTextH,
      ));
      const leftCandidate = {
        minTop: blockTop,
        maxBottom: blockBottom,
        maxTextBottom: blockTextBottom,
      };
      if (blockOverflowsColumn(0, leftCandidate)) {
        ({ targetCol, blockTop, blockBottom, blockTextBottom } = placeInColumn(
          1,
          firstTop,
          blockH,
          blockTextH,
        ));
        const rightCandidate = {
          minTop: blockTop,
          maxBottom: blockBottom,
          maxTextBottom: blockTextBottom,
        };
        if (blockOverflowsColumn(1, rightCandidate)) {
          resetSpread();
          ({ targetCol, blockTop, blockBottom, blockTextBottom } = placeInColumn(
            0,
            firstTop,
            blockH,
            blockTextH,
          ));
          fillPhase = 'left';
        } else {
          fillPhase = 'right';
        }
      } else {
        targetCol = 0;
      }
    } else {
      ({ targetCol, blockTop, blockBottom, blockTextBottom } = placeInColumn(
        1,
        firstTop,
        blockH,
        blockTextH,
      ));
      const rightCandidate = {
        minTop: blockTop,
        maxBottom: blockBottom,
        maxTextBottom: blockTextBottom,
      };
      if (blockOverflowsColumn(1, rightCandidate)) {
        resetSpread();
        ({ targetCol, blockTop, blockBottom, blockTextBottom } = placeInColumn(
          0,
          firstTop,
          blockH,
          blockTextH,
        ));
        fillPhase = 'left';
      }
    }

    placedInSpread[targetCol].push({
      minTop: blockTop,
      maxBottom: blockBottom,
      maxTextBottom: blockTextBottom,
    });

    const flowCap = blockTop + blockH;
    for (const seg of blockSegs) {
      const offset = seg.top - firstTop;
      const segH = Math.max(0, seg.bottom - seg.top);
      const segBottom = Math.min(flowCap, blockTop + offset + segH);
      out.push({
        ...seg,
        column: targetCol,
        spreadIndex,
        top: blockTop + offset,
        bottom: segBottom,
        textBottom: repackSegmentTextBottom(seg, blockTop, offset),
      });
    }

    colY[targetCol] = blockBottom;
    lastInColumn[targetCol] = {
      repackedBottom: blockBottom,
      origBottom,
    };
    lastPlacedCol = targetCol;
    spreadTextFill[targetCol] = blockTextBottom - spreadAnchor[targetCol];

    if (
      spreadTextFill[0] >= packLimit - 0.5 &&
      spreadTextFill[1] >= packLimit - 0.5
    ) {
      resetSpread();
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
  paragraphSpacing?: number,
): { segments: ReaderLayoutSegment[]; measureRoot?: HTMLElement; extent: number } {
  if (!columnShift) return { segments: [], extent: 0 };
  const contentRoot =
    columnShift.querySelector<HTMLElement>('[data-reader-content]') ?? columnShift;
  const measureRoot = resolvePagedMeasureRoot(contentRoot);
  if (!measureRoot.querySelector('[data-reader-measure-block]')) {
    return { segments: [], measureRoot, extent: 0 };
  }
  const segments = measureLayoutSegments(
    measureRoot,
    fontSize,
    lineSpacing,
    paragraphSpacing,
  ).map((s) => ({
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
  paragraphSpacing?: number,
): (DualSpreadPageResult & { leftColumnExtent: number; rightColumnExtent: number }) | null {
  const left = measureLiveColumnSegments(leftShift, 0, fontSize, lineSpacing, paragraphSpacing);
  const right = measureLiveColumnSegments(rightShift, 1, fontSize, lineSpacing, paragraphSpacing);
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
      textBottom: Math.max(
        prev.textBottom ?? prev.bottom,
        seg.textBottom ?? seg.bottom,
      ),
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

  if (layoutUsesSpreadIndex(segments)) {
    const spreadCount = spreadIndexCount(segments);
    const pageStarts: number[] = [];
    const rightPageStarts: number[] = [];
    const leftLineSizes: number[] = [];
    for (let i = 0; i < spreadCount; i += 1) {
      pageStarts.push(spreadColumnPageStartY(segments, 0, i, leftExtent));
      rightPageStarts.push(spreadColumnPageStartY(segments, 1, i, rightExtent));
      const start = pageStarts[i]!;
      const end =
        i + 1 < spreadCount ? pageStarts[i + 1]! : leftExtent;
      leftLineSizes.push(countColumnSegmentsInPage(leftSegs, start, end));
    }
    return { pageStarts, rightPageStarts, leftLineSizes };
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
    paragraphSpacing?: number;
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
