import { describe, expect, it } from 'vitest';
import {
  assignSegmentsBySpreadFillLeft,
  computeDualSpreadPageStarts,
  computePageStartsForLayout,
  contentBlockIndicesForColumn,
  contentBlockIndicesForSpreadPage,
  columnShowsChapterTitle,
  dualSpreadColumnPackLimit,
  dualSpreadColumnWidthPx,
  normalizeDualColumnSegments,
  sortSegmentsReadingOrder,
} from '@/lib/media/text/text-viewer-paginate-dual';
import {
  computePageStartsFromSegments,
  type ReaderLayoutSegment,
} from '@/lib/media/text/text-viewer-paginate';

describe('dualSpreadColumnWidthPx', () => {
  it('matches live pane width formula (spread − gap) / 2', () => {
    expect(dualSpreadColumnWidthPx(1000, 32)).toBe(484);
    expect(dualSpreadColumnPackLimit(929)).toBe(929);
  });
});

describe('computeDualSpreadPageStarts', () => {
  const clipHeight = 80;
  const lineH = 32;

  it('breaks pages on block boundaries when a block has multiple line segments', () => {
    const segments: ReaderLayoutSegment[] = [
      { top: 0, bottom: lineH, column: 0 as const, blockIndex: 1 },
      { top: lineH, bottom: lineH * 2, column: 0 as const, blockIndex: 2 },
      { top: lineH * 2, bottom: lineH * 3, column: 0 as const, blockIndex: 3 },
      { top: lineH * 3, bottom: lineH * 4, column: 0 as const, blockIndex: 3 },
      { top: lineH * 4, bottom: lineH * 5, column: 0 as const, blockIndex: 3 },
      { top: 0, bottom: lineH, column: 1 as const, blockIndex: 4 },
    ];
    const { pageStarts } = computeDualSpreadPageStarts(segments, clipHeight, lineH * 5);
    expect(pageStarts).toEqual([0, lineH * 2, lineH * 2 + clipHeight]);
  });

  it('merges independent column pagination by spread index', () => {
    const leftSegs: ReaderLayoutSegment[] = [
      { top: 0, bottom: lineH, column: 0 as const },
      { top: lineH, bottom: lineH * 2, column: 0 as const },
      { top: lineH * 2, bottom: lineH * 3, column: 0 as const },
      { top: lineH * 3, bottom: lineH * 4, column: 0 as const },
    ];
    const rightSegs: ReaderLayoutSegment[] = [
      { top: 0, bottom: lineH, column: 1 as const },
      { top: lineH, bottom: lineH * 2, column: 1 as const },
    ];
    const segments = [...leftSegs, ...rightSegs];

    const leftStarts = computePageStartsFromSegments(leftSegs, clipHeight, lineH * 4, 0);
    const rightStarts = computePageStartsFromSegments(rightSegs, clipHeight, lineH * 2, 0);

    const { pageStarts, rightPageStarts, leftLineSizes } = computeDualSpreadPageStarts(
      segments,
      clipHeight,
      lineH * 4,
    );

    expect(leftStarts).toEqual([0, lineH * 2]);
    expect(rightStarts).toEqual([0]);
    expect(pageStarts).toEqual([0, lineH * 2]);
    expect(rightPageStarts).toEqual([0, lineH * 2]);
    expect(leftLineSizes[0]).toBe(2);
    expect(leftLineSizes[1]).toBe(2);
  });

  it('uses column extent when shorter column is exhausted', () => {
    const segments: ReaderLayoutSegment[] = [
      { top: 0, bottom: lineH, column: 0 as const },
      { top: lineH, bottom: lineH * 2, column: 0 as const },
      { top: lineH * 2, bottom: lineH * 3, column: 0 as const },
      { top: lineH * 3, bottom: lineH * 4, column: 0 as const },
      { top: 0, bottom: lineH, column: 1 as const },
    ];
    const { pageStarts, rightPageStarts } = computeDualSpreadPageStarts(
      segments,
      clipHeight,
      lineH * 4,
    );
    expect(pageStarts.length).toBe(2);
    expect(rightPageStarts[0]).toBe(0);
    expect(rightPageStarts[1]).toBe(lineH);
  });

  it('returns single spread when both columns fit one page', () => {
    const segments: ReaderLayoutSegment[] = [
      { top: 0, bottom: lineH, column: 0 as const },
      { top: lineH, bottom: lineH * 2, column: 0 as const },
      { top: 0, bottom: lineH, column: 1 as const },
      { top: lineH, bottom: lineH * 2, column: 1 as const },
    ];
    const { pageStarts, rightPageStarts, leftLineSizes } = computeDualSpreadPageStarts(
      segments,
      clipHeight,
      lineH * 2,
    );
    expect(pageStarts).toEqual([0]);
    expect(rightPageStarts).toEqual([0]);
    expect(leftLineSizes[0]).toBe(2);
  });

  it('sorts reading order column-first', () => {
    const segments: ReaderLayoutSegment[] = [
      { top: 100, bottom: 132, column: 1 as const },
      { top: 0, bottom: 32, column: 0 as const },
    ];
    const sorted = sortSegmentsReadingOrder(segments);
    expect(sorted[0]!.column).toBe(0);
    expect(sorted[1]!.column).toBe(1);
  });

  it('normalizes Y per column for independent pagination', () => {
    const segments: ReaderLayoutSegment[] = [
      { top: 0, bottom: 32, column: 0 as const },
      { top: 32, bottom: 64, column: 0 as const },
      { top: 200, bottom: 232, column: 1 as const },
      { top: 232, bottom: 264, column: 1 as const },
    ];
    const { normalized, leftExtent, rightExtent } = normalizeDualColumnSegments(segments);
    expect(normalized.filter((s) => s.column === 0).map((s) => s.top)).toEqual([0, 32]);
    expect(normalized.filter((s) => s.column === 1).map((s) => s.top)).toEqual([0, 32]);
    expect(leftExtent).toBe(64);
    expect(rightExtent).toBe(64);
  });

  it('normalizes textBottom with top/bottom per column', () => {
    const segments: ReaderLayoutSegment[] = [
      {
        top: 100,
        bottom: 148,
        textBottom: 132,
        column: 0 as const,
        blockIndex: 1,
      },
      {
        top: 148,
        bottom: 196,
        textBottom: 180,
        column: 0 as const,
        blockIndex: 2,
      },
    ];
    const { normalized } = normalizeDualColumnSegments(segments);
    expect(normalized[0]).toMatchObject({ top: 0, bottom: 48, textBottom: 32 });
    expect(normalized[1]).toMatchObject({ top: 48, bottom: 96, textBottom: 80 });
  });
});

describe('assignSegmentsBySpreadFillLeft', () => {
  const clipHeight = 80;
  const lineH = 32;

  it('fills left column before right within a spread', () => {
    const raw: ReaderLayoutSegment[] = [
      { top: 0, bottom: lineH, blockIndex: 0 },
      { top: lineH, bottom: lineH * 2, blockIndex: 1 },
      { top: lineH * 2, bottom: lineH * 3, blockIndex: 2 },
      { top: lineH * 3, bottom: lineH * 4, blockIndex: 3 },
    ];
    const assigned = assignSegmentsBySpreadFillLeft(raw, clipHeight);
    const left = assigned.filter((s) => s.column === 0);
    const right = assigned.filter((s) => s.column === 1);
    expect(left.map((s) => s.blockIndex)).toEqual([0, 1]);
    expect(right.map((s) => s.blockIndex)).toEqual([2, 3]);
    expect(left.reduce((sum, s) => sum + (s.bottom - s.top), 0)).toBeLessThanOrEqual(clipHeight + 0.5);
  });

  it('preserves measured gap between blocks in the same column spread', () => {
    const blockGap = 16;
    const raw: ReaderLayoutSegment[] = [
      { top: 0, bottom: lineH, blockIndex: 0 },
      { top: lineH + blockGap, bottom: lineH * 2 + blockGap, blockIndex: 1 },
      { top: lineH * 2 + blockGap * 2, bottom: lineH * 3 + blockGap * 2, blockIndex: 2 },
    ];
    const assigned = assignSegmentsBySpreadFillLeft(raw, clipHeight);
    const left = assigned.filter((s) => s.column === 0);
    expect(left).toHaveLength(2);
    expect(left[0]!.top).toBe(0);
    expect(left[0]!.bottom).toBe(lineH);
    expect(left[1]!.top).toBe(lineH + blockGap);
    expect(left[1]!.bottom).toBe(lineH * 2 + blockGap);
  });

  it('switches column using repacked height including block gaps', () => {
    const blockGap = 16;
    const clip = 80;
    const raw: ReaderLayoutSegment[] = [
      { top: 0, bottom: lineH, blockIndex: 0 },
      { top: lineH + blockGap, bottom: lineH * 2 + blockGap, blockIndex: 1 },
      { top: lineH * 2 + blockGap * 2, bottom: lineH * 3 + blockGap * 2, blockIndex: 2 },
      { top: lineH * 3 + blockGap * 3, bottom: lineH * 4 + blockGap * 3, blockIndex: 3 },
    ];
    const assigned = assignSegmentsBySpreadFillLeft(raw, clip);
    const left = assigned.filter((s) => s.column === 0);
    const right = assigned.filter((s) => s.column === 1);
    expect(left.map((s) => s.blockIndex)).toEqual([0, 1]);
    expect(right.map((s) => s.blockIndex)).toEqual([2, 3]);
    expect(left[left.length - 1]!.bottom - left[0]!.top).toBeLessThanOrEqual(clip + 0.5);
  });

  it('does not split a multi-line block across left and right columns', () => {
    const lineH = 32;
    const clip = 80;
    const raw: ReaderLayoutSegment[] = [
      { top: 0, bottom: lineH, blockIndex: 0 },
      { top: lineH, bottom: lineH * 2, blockIndex: 1 },
      { top: lineH * 2, bottom: lineH * 3, blockIndex: 2 },
      { top: lineH * 3, bottom: lineH * 4, blockIndex: 2 },
      { top: lineH * 4, bottom: lineH * 5, blockIndex: 2 },
      { top: lineH * 5, bottom: lineH * 6, blockIndex: 3 },
    ];
    const assigned = assignSegmentsBySpreadFillLeft(raw, clip);
    const block2Cols = new Set(
      assigned.filter((s) => s.blockIndex === 2).map((s) => s.column),
    );
    expect(block2Cols.size).toBe(1);
  });

  it('moves a trailing single-line block to the right when it would clip the left column', () => {
    const lineH = 32;
    const clip = 80;
    const raw: ReaderLayoutSegment[] = [
      { top: 0, bottom: lineH, blockIndex: 0 },
      { top: lineH, bottom: lineH * 2, blockIndex: 1 },
      { top: lineH * 2, bottom: clip - 4, blockIndex: 2 },
      { top: clip - 4, bottom: clip + lineH - 4, blockIndex: 3 },
    ];
    const assigned = assignSegmentsBySpreadFillLeft(raw, clip);
    const leftBlocks = new Set(
      assigned.filter((s) => s.column === 0).map((s) => s.blockIndex),
    );
    const rightBlocks = new Set(
      assigned.filter((s) => s.column === 1).map((s) => s.blockIndex),
    );
    expect(leftBlocks.has(3)).toBe(false);
    expect(rightBlocks.has(3)).toBe(true);
    const leftBottom = Math.max(
      ...assigned.filter((s) => s.column === 0).map((s) => s.bottom),
    );
    expect(leftBottom).toBeLessThanOrEqual(clip + 0.5);
  });

  it('keeps block on left when only trailing paragraph margin exceeds clip', () => {
    const lineH = 28.8;
    const margin = 16;
    const blockFull = lineH + margin;
    const clip = 952;
    const raw: ReaderLayoutSegment[] = [];
    let y = 0;
    for (let blockIndex = 0; blockIndex < 20; blockIndex += 1) {
      raw.push({
        top: y,
        bottom: y + blockFull,
        textBottom: y + lineH,
        blockIndex,
      });
      y += blockFull;
    }
    const tailTop = 920;
    raw.push({
      top: tailTop,
      bottom: tailTop + blockFull,
      textBottom: tailTop + lineH,
      blockIndex: 20,
    });
    const assigned = assignSegmentsBySpreadFillLeft(raw, clip);
    const block20 = assigned.find((s) => s.blockIndex === 20);
    expect(block20).toBeDefined();
    /** 左栏叠满时改填右栏，但块不得丢失 */
    expect(block20!.column === 0 || block20!.column === 1).toBe(true);
    expect(tailTop + lineH).toBeLessThanOrEqual(clip + 0.5);
    expect(tailTop + blockFull).toBeGreaterThan(clip + 0.5);
  });

  it('keeps next block on left when line-box inflation was falsely counting against glyph stack', () => {
    const glyphH = 22;
    const lineBoxSlop = 6.8;
    const lineBoxH = glyphH + lineBoxSlop;
    const margin = 16;
    const blockFull = lineBoxH + margin;
    const clip = 955;
    const raw: ReaderLayoutSegment[] = [];
    let y = 0;
    for (let blockIndex = 0; blockIndex < 18; blockIndex += 1) {
      raw.push({
        top: y,
        bottom: y + blockFull,
        textBottom: y + glyphH,
        blockIndex,
      });
      y += blockFull;
    }
    const tailTop = y;
    raw.push({
      top: tailTop,
      bottom: tailTop + blockFull,
      textBottom: tailTop + glyphH,
      blockIndex: 18,
    });
    const glyphStack = tailTop + glyphH;
    expect(glyphStack).toBeLessThanOrEqual(clip + 0.5);
    const assigned = assignSegmentsBySpreadFillLeft(raw, clip);
    expect(assigned.find((s) => s.blockIndex === 18)?.column).toBe(0);
  });

  it('keeps single-line block on left when glyph stack fits but line-box stack would overflow', () => {
    const glyphH = 22;
    const lineBoxH = 28.8;
    const margin = 16;
    const blockFull = lineBoxH + margin;
    const clip = 952;
    const raw: ReaderLayoutSegment[] = [];
    let y = 0;
    for (let blockIndex = 0; blockIndex < 20; blockIndex += 1) {
      raw.push({
        top: y,
        bottom: y + blockFull,
        textBottom: y + glyphH,
        blockIndex,
      });
      y += blockFull;
    }
    const tailTop = y;
    raw.push({
      top: tailTop,
      bottom: tailTop + blockFull,
      textBottom: tailTop + glyphH,
      blockIndex: 20,
    });
    expect(tailTop + glyphH).toBeLessThanOrEqual(clip + 0.5);
    expect(tailTop + lineBoxH).toBeLessThanOrEqual(clip + 0.5);
    const assigned = assignSegmentsBySpreadFillLeft(raw, clip);
    expect(assigned.find((s) => s.blockIndex === 20)?.column).toBe(0);
  });

  it('moves block to right column when glyph bottom exceeds clip', () => {
    const lineH = 28.8;
    const margin = 16;
    const blockFull = lineH + margin;
    const clip = 952;
    const raw: ReaderLayoutSegment[] = [];
    let y = 0;
    for (let blockIndex = 0; blockIndex < 22; blockIndex += 1) {
      raw.push({
        top: y,
        bottom: y + blockFull,
        textBottom: y + lineH,
        blockIndex,
      });
      y += blockFull;
    }
    const tailTop = 21 * blockFull;
    expect(tailTop + lineH).toBeGreaterThan(clip + 0.5);
    const assigned = assignSegmentsBySpreadFillLeft(raw, clip);
    expect(assigned.find((s) => s.blockIndex === 21)?.column).toBe(1);
  });

  it('keeps next single-line block on left after mixed multi-line spread tail (chapter 1 regression)', () => {
    const glyphH = 22;
    const lineBoxH = 28.8;
    const margin = 16;
    /** 与 measure blockFlowBottom 一致：字形底 + 段距（不含行盒下延） */
    const blockFlow = glyphH + margin;
    const clip = 955;
    const raw: ReaderLayoutSegment[] = [];

    const pushSingle = (top: number, blockIndex: number) => {
      raw.push({
        top,
        bottom: top + blockFlow,
        textBottom: top + glyphH,
        blockIndex,
      });
      return top + blockFlow;
    };

    const pushMulti = (top: number, lines: number, blockIndex: number) => {
      let ty = top;
      for (let i = 0; i < lines; i += 1) {
        raw.push({
          top: ty,
          bottom: ty + lineBoxH,
          textBottom: ty + glyphH,
          blockIndex,
        });
        ty += lineBoxH;
      }
      const lastGlyph = top + (lines - 1) * lineBoxH + glyphH;
      const blockBottom = lastGlyph + margin;
      if (blockBottom > ty + 0.5) {
        raw.push({
          top: ty,
          bottom: blockBottom,
          textBottom: lastGlyph,
          blockIndex,
        });
      }
      return blockBottom;
    };

    let y = 0;
    let blockIndex = 0;
    y = pushSingle(y, blockIndex++);
    const spreadTailPattern: Array<{ kind: 'single' } | { kind: 'multi'; lines: number }> = [
      { kind: 'single' },
      { kind: 'single' },
      { kind: 'multi', lines: 3 },
      { kind: 'single' },
      { kind: 'single' },
      { kind: 'multi', lines: 2 },
      { kind: 'single' },
      { kind: 'single' },
      { kind: 'multi', lines: 2 },
      { kind: 'single' },
      { kind: 'single' },
      { kind: 'single' },
      { kind: 'multi', lines: 3 },
      { kind: 'single' },
      { kind: 'single' },
      { kind: 'single' },
      { kind: 'multi', lines: 2 },
      { kind: 'single' },
    ];
    while (y + blockFlow < 880) {
      const step = spreadTailPattern[blockIndex % spreadTailPattern.length]!;
      if (step.kind === 'single') {
        y = pushSingle(y, blockIndex++);
      } else {
        y = pushMulti(y, step.lines, blockIndex++);
      }
    }
    while (y + blockFlow < 920) {
      y = pushSingle(y, blockIndex++);
    }
    const rainBlockIndex = blockIndex++;
    y = pushSingle(y, rainBlockIndex);
    const muddyBlockIndex = blockIndex++;
    pushSingle(y, muddyBlockIndex);

    const assigned = assignSegmentsBySpreadFillLeft(raw, clip);
    expect(assigned.find((s) => s.blockIndex === rainBlockIndex)?.column).toBe(0);
    expect(assigned.find((s) => s.blockIndex === muddyBlockIndex)?.column).toBe(0);

    const contentExtent = Math.max(...raw.map((s) => s.bottom));
    const layoutResult = computePageStartsForLayout(raw, clip, contentExtent, {
      dualPage: true,
    });
    const layout = {
      pageStarts: layoutResult.pageStarts!,
      rightPageStarts: layoutResult.rightPageStarts,
      dualPage: true as const,
      clipHeight: clip,
      contentExtent: Math.max(
        layoutResult.leftColumnExtent ?? 0,
        layoutResult.rightColumnExtent ?? 0,
        contentExtent,
      ),
      leftColumnExtent: layoutResult.leftColumnExtent,
      rightColumnExtent: layoutResult.rightColumnExtent,
      segments: layoutResult.segments!,
    };
    const rainContentIndex = rainBlockIndex - 1;
    const muddyContentIndex = muddyBlockIndex - 1;
    expect(contentBlockIndicesForSpreadPage(layout, 0, 0)).toEqual(
      expect.arrayContaining([rainContentIndex, muddyContentIndex]),
    );
    expect(contentBlockIndicesForSpreadPage(layout, 1, 0)).not.toContain(muddyContentIndex);
  });

  it('excludes next block when line-box slop would clip tail glyph', () => {
    const glyphH = 22;
    const margin = 16;
    const blockFlow = glyphH + margin;
    const clip = 955;
    const rainTextBottom = 911.6;
    const layout = {
      pageStarts: [0],
      rightPageStarts: [0],
      dualPage: true as const,
      clipHeight: clip,
      contentExtent: rainTextBottom + margin + blockFlow,
      leftColumnExtent: rainTextBottom + margin + blockFlow,
      rightColumnExtent: 0,
      segments: [
        {
          top: 0,
          bottom: rainTextBottom + margin,
          textBottom: rainTextBottom,
          column: 0 as const,
          blockIndex: 1,
        },
        {
          top: rainTextBottom + margin,
          bottom: rainTextBottom + margin + blockFlow,
          textBottom: rainTextBottom + margin + glyphH,
          column: 0 as const,
          blockIndex: 2,
        },
      ],
    };
    expect(rainTextBottom + margin + blockFlow).toBeGreaterThan(clip + 0.5);
    expect(contentBlockIndicesForSpreadPage(layout, 0, 0)).toEqual([0]);
  });

  it('packs next block when line-box slop still fits within clip', () => {
    const glyphH = 22;
    const margin = 16;
    const blockFlow = glyphH + margin;
    const clip = 955;
    const rainTextBottom = 910;
    const layout = {
      pageStarts: [0],
      rightPageStarts: [0],
      dualPage: true as const,
      clipHeight: clip,
      contentExtent: rainTextBottom + margin + blockFlow,
      leftColumnExtent: rainTextBottom + margin + blockFlow,
      rightColumnExtent: 0,
      segments: [
        {
          top: 0,
          bottom: rainTextBottom + margin,
          textBottom: rainTextBottom,
          column: 0 as const,
          blockIndex: 1,
        },
        {
          top: rainTextBottom + margin,
          bottom: rainTextBottom + margin + blockFlow,
          textBottom: rainTextBottom + margin + glyphH,
          column: 0 as const,
          blockIndex: 2,
        },
      ],
    };
    expect(contentBlockIndicesForSpreadPage(layout, 0, 0)).toEqual([0, 1]);
  });

  it('stacks next-spread left column without gap from skipped right-column blocks', () => {
    const lineH = 32;
    const clip = 80;
    const raw: ReaderLayoutSegment[] = [
      { top: 0, bottom: lineH, blockIndex: 0 },
      { top: lineH, bottom: lineH * 2, blockIndex: 1 },
      { top: lineH * 2, bottom: lineH * 3, blockIndex: 2 },
      { top: lineH * 3, bottom: lineH * 4, blockIndex: 3 },
      { top: lineH * 4, bottom: lineH * 5, blockIndex: 4 },
      { top: lineH * 5, bottom: lineH * 6, blockIndex: 5 },
    ];
    const assigned = assignSegmentsBySpreadFillLeft(raw, clip);
    const left = assigned.filter((s) => s.column === 0);
    expect(left.map((s) => s.blockIndex)).toEqual([0, 1, 4, 5]);
    const spread1LastLeft = left.find((s) => s.blockIndex === 1)!;
    const spread2FirstLeft = left.find((s) => s.blockIndex === 4)!;
    expect(spread2FirstLeft.top).toBe(spread1LastLeft.bottom);
  });

  it('spread page 0 left does not include next-spread blocks within clip fold', () => {
    const lineH = 32;
    const clip = 80;
    const raw: ReaderLayoutSegment[] = [
      { top: 0, bottom: lineH, blockIndex: 0 },
      { top: lineH, bottom: lineH * 2, blockIndex: 1 },
      { top: lineH * 2, bottom: lineH * 3, blockIndex: 2 },
      { top: lineH * 3, bottom: lineH * 4, blockIndex: 3 },
      { top: lineH * 4, bottom: lineH * 5, blockIndex: 4 },
      { top: lineH * 5, bottom: lineH * 6, blockIndex: 5 },
    ];
    const assigned = assignSegmentsBySpreadFillLeft(raw, clip);
    const { normalized, leftExtent, rightExtent } = normalizeDualColumnSegments(assigned);
    const spread = computeDualSpreadPageStarts(normalized, clip, leftExtent);
    const layout = {
      pageStarts: spread.pageStarts,
      rightPageStarts: spread.rightPageStarts,
      dualPage: true as const,
      clipHeight: clip,
      contentExtent: leftExtent,
      leftColumnExtent: leftExtent,
      rightColumnExtent: rightExtent,
      segments: normalized,
    };
    const spread1LeftContent = normalized
      .filter((s) => s.spreadIndex === 1 && s.column === 0 && (s.blockIndex ?? 0) > 0)
      .map((s) => s.blockIndex! - 1);
    expect(spread1LeftContent.length).toBeGreaterThan(0);
    const page0Left = contentBlockIndicesForSpreadPage(layout, 0, 0);
    for (const idx of spread1LeftContent) {
      expect(page0Left).not.toContain(idx);
    }
    expect(contentBlockIndicesForSpreadPage(layout, 0, 1).length).toBeGreaterThan(0);
  });

  it('every assigned content block appears on a spread page (no orphan spill)', () => {
    const glyphH = 22;
    const margin = 16;
    const blockFlow = glyphH + margin;
    const clip = 955;
    const raw: ReaderLayoutSegment[] = [];
    let y = 0;
    const contentBlockCount = 85;
    for (let blockIndex = 0; blockIndex <= contentBlockCount; blockIndex += 1) {
      raw.push({
        top: y,
        bottom: y + blockFlow,
        textBottom: y + glyphH,
        blockIndex,
      });
      y += blockFlow;
    }
    const contentExtent = Math.max(...raw.map((s) => s.bottom));
    const layoutResult = computePageStartsForLayout(raw, clip, contentExtent, {
      dualPage: true,
    });
    const layout = {
      pageStarts: layoutResult.pageStarts!,
      rightPageStarts: layoutResult.rightPageStarts,
      dualPage: true as const,
      clipHeight: clip,
      contentExtent: Math.max(
        layoutResult.leftColumnExtent ?? 0,
        layoutResult.rightColumnExtent ?? 0,
        contentExtent,
      ),
      leftColumnExtent: layoutResult.leftColumnExtent,
      rightColumnExtent: layoutResult.rightColumnExtent,
      segments: layoutResult.segments!,
    };
    const spreadCount = layout.pageStarts.length;
    const seen = new Set<number>();
    for (let page = 0; page < spreadCount; page += 1) {
      for (const col of [0, 1] as const) {
        for (const idx of contentBlockIndicesForSpreadPage(layout, col, page)) {
          seen.add(idx);
        }
      }
    }
    for (let i = 0; i < contentBlockCount; i += 1) {
      expect(seen.has(i)).toBe(true);
    }
  });
});

describe('contentBlockIndicesForSpreadPage', () => {
  it('returns blocks that fit entirely on the spread page', () => {
    const layout = {
      pageStarts: [0, 64],
      rightPageStarts: [0, 32],
      dualPage: true as const,
      clipHeight: 128,
      contentExtent: 200,
      leftColumnExtent: 128,
      rightColumnExtent: 64,
      segments: [
        { top: 0, bottom: 32, column: 0 as const, blockIndex: 0 },
        { top: 32, bottom: 64, column: 0 as const, blockIndex: 1 },
        { top: 64, bottom: 96, column: 0 as const, blockIndex: 2 },
        { top: 0, bottom: 32, column: 1 as const, blockIndex: 3 },
        { top: 32, bottom: 64, column: 1 as const, blockIndex: 4 },
      ],
    };
    expect(contentBlockIndicesForSpreadPage(layout, 0, 0)).toEqual([0]);
    expect(contentBlockIndicesForSpreadPage(layout, 0, 1)).toEqual([1]);
    expect(contentBlockIndicesForSpreadPage(layout, 1, 0)).toEqual([2]);
    expect(contentBlockIndicesForSpreadPage(layout, 1, 1)).toEqual([3]);
  });

  it('excludes multi-line blocks that straddle the page boundary', () => {
    const layout = {
      pageStarts: [0, 64],
      rightPageStarts: [0, 0],
      dualPage: true as const,
      clipHeight: 128,
      contentExtent: 200,
      leftColumnExtent: 128,
      rightColumnExtent: 64,
      segments: [
        { top: 0, bottom: 32, column: 0 as const, blockIndex: 1 },
        { top: 32, bottom: 64, column: 0 as const, blockIndex: 2 },
        { top: 64, bottom: 80, column: 0 as const, blockIndex: 3 },
        { top: 80, bottom: 112, column: 0 as const, blockIndex: 3 },
      ],
    };
    expect(contentBlockIndicesForSpreadPage(layout, 0, 0)).toEqual([0, 1]);
    expect(contentBlockIndicesForSpreadPage(layout, 0, 1)).toEqual([2]);
  });

  it('drops trailing blocks that would exceed clipHeight in the column stack', () => {
    const clipHeight = 80;
    const layout = {
      pageStarts: [0],
      rightPageStarts: [0],
      dualPage: true as const,
      clipHeight,
      contentExtent: 200,
      leftColumnExtent: 80,
      rightColumnExtent: 0,
      segments: [
        { top: 0, bottom: 32, column: 0 as const, blockIndex: 1 },
        { top: 32, bottom: 64, column: 0 as const, blockIndex: 2 },
        { top: 64, bottom: 96, column: 0 as const, blockIndex: 3 },
      ],
    };
    expect(contentBlockIndicesForSpreadPage(layout, 0, 0)).toEqual([0, 1]);
  });

  it('keeps tail block when only paragraph margin exceeds pageEnd', () => {
    const lineH = 32;
    const margin = 16;
    const pageEnd = lineH + margin;
    const layout = {
      pageStarts: [0, pageEnd],
      rightPageStarts: [0, 0],
      dualPage: true as const,
      clipHeight: pageEnd,
      contentExtent: 200,
      leftColumnExtent: lineH * 2 + margin,
      rightColumnExtent: 0,
      segments: [
        {
          top: 0,
          bottom: pageEnd,
          textBottom: lineH,
          column: 0 as const,
          blockIndex: 1,
        },
        {
          top: pageEnd,
          bottom: lineH * 2 + margin,
          textBottom: lineH * 2 + margin,
          column: 0 as const,
          blockIndex: 2,
        },
      ],
    };
    expect(contentBlockIndicesForSpreadPage(layout, 0, 0)).toEqual([0]);
  });

  it('includes tail block when glyph fits clip but paragraph margin overflows', () => {
    const lineH = 32;
    const margin = 16;
    const clipHeight = 80;
    const layout = {
      pageStarts: [0, clipHeight],
      rightPageStarts: [0, 0],
      dualPage: true as const,
      clipHeight,
      contentExtent: 200,
      leftColumnExtent: lineH * 2 + margin,
      rightColumnExtent: 0,
      segments: [
        {
          top: 0,
          bottom: lineH + margin,
          textBottom: lineH,
          column: 0 as const,
          blockIndex: 1,
        },
        {
          top: lineH + margin,
          bottom: lineH * 2 + margin,
          textBottom: lineH * 2,
          column: 0 as const,
          blockIndex: 2,
        },
        {
          top: lineH * 2 + margin,
          bottom: lineH * 3 + margin,
          textBottom: lineH * 3,
          column: 0 as const,
          blockIndex: 3,
        },
      ],
    };
    expect(contentBlockIndicesForSpreadPage(layout, 0, 0)).toEqual([0, 1]);
  });

  it('excludes next block when glyph stack would exceed clipHeight', () => {
    const lineH = 32;
    const margin = 16;
    const clipHeight = 80;
    const layout = {
      pageStarts: [0, clipHeight],
      rightPageStarts: [0, 0],
      dualPage: true as const,
      clipHeight,
      contentExtent: 200,
      leftColumnExtent: lineH * 3 + margin * 2,
      rightColumnExtent: 0,
      segments: [
        {
          top: 0,
          bottom: lineH + margin,
          textBottom: lineH,
          column: 0 as const,
          blockIndex: 1,
        },
        {
          top: lineH + margin,
          bottom: lineH * 2 + margin,
          textBottom: lineH * 2,
          column: 0 as const,
          blockIndex: 2,
        },
        {
          top: lineH * 2 + margin,
          bottom: lineH * 3 + margin,
          textBottom: lineH * 3,
          column: 0 as const,
          blockIndex: 3,
        },
      ],
    };
    expect(contentBlockIndicesForSpreadPage(layout, 0, 0)).toEqual([0, 1]);
  });

  it('stacks from column top when first spread left page shows chapter title', () => {
    const clipHeight = 80;
    const titleH = 32;
    const lineH = 32;
    const layout = {
      pageStarts: [0],
      rightPageStarts: [0],
      dualPage: true as const,
      clipHeight,
      contentExtent: 200,
      leftColumnExtent: 128,
      rightColumnExtent: 0,
      segments: [
        { top: 0, bottom: titleH, column: 0 as const, blockIndex: 0 },
        { top: titleH, bottom: titleH + lineH, column: 0 as const, blockIndex: 1 },
        { top: titleH + lineH, bottom: titleH + lineH * 2, column: 0 as const, blockIndex: 2 },
        {
          top: titleH + lineH * 2,
          bottom: titleH + lineH * 3,
          column: 0 as const,
          blockIndex: 3,
        },
      ],
    };
    expect(contentBlockIndicesForSpreadPage(layout, 0, 0)).toEqual([0]);
  });

  it('uses incremental stack height matching live pane (not span min-max)', () => {
    const lineH = 32;
    const margin = 16;
    const clipHeight = 952;
    const pageStart = 640;
    const pageEnd = pageStart + clipHeight;
    const layout = {
      pageStarts: [0, pageStart, pageEnd + lineH],
      rightPageStarts: [0, pageStart, pageEnd + lineH],
      dualPage: true as const,
      clipHeight,
      contentExtent: 3000,
      leftColumnExtent: pageEnd + lineH,
      rightColumnExtent: pageEnd + lineH,
      segments: [
        {
          top: pageStart,
          bottom: pageStart + lineH + margin,
          textBottom: pageStart + lineH,
          column: 0 as const,
          blockIndex: 10,
        },
        {
          top: pageStart + lineH + margin,
          bottom: pageStart + lineH * 2 + margin,
          textBottom: pageStart + lineH * 2,
          column: 0 as const,
          blockIndex: 11,
        },
        {
          top: pageStart + lineH * 2 + margin,
          bottom: pageStart + lineH * 3 + margin,
          textBottom: pageStart + lineH * 3,
          column: 0 as const,
          blockIndex: 12,
        },
      ],
    };
    const indices = contentBlockIndicesForSpreadPage(layout, 0, 1);
    expect(indices.length).toBeGreaterThan(0);
    const bounds = indices.map((i) => {
      const blockIndex = i + 1;
      const segs = layout.segments.filter((s) => s.blockIndex === blockIndex);
      const minTop = Math.min(...segs.map((s) => s.top));
      const maxBottom = Math.max(...segs.map((s) => s.bottom));
      const maxTextBottom = Math.max(...segs.map((s) => s.textBottom ?? s.bottom));
      return { minTop, maxBottom, maxTextBottom };
    });
    let stackFull = 0;
    let stackText = 0;
    let prevMaxBottom = pageStart;
    for (const b of bounds) {
      const gap = Math.max(0, b.minTop - prevMaxBottom);
      stackFull += gap + (b.maxBottom - b.minTop);
      stackText += gap + (b.maxTextBottom - b.minTop);
      prevMaxBottom = b.maxBottom;
    }
    expect(stackText).toBeLessThanOrEqual(clipHeight + 0.5);
  });

  it('live stack stays within clip for 16px / 0.8 line / 1em paragraph spacing', () => {
    const lineH = 28.8;
    const margin = 16;
    const blockFull = lineH + margin;
    const clipHeight = 952;
    const segments: {
      top: number;
      bottom: number;
      textBottom: number;
      column: 0 | 1;
      blockIndex: number;
    }[] = [];
    let y = 0;
    for (let blockIndex = 1; blockIndex <= 28; blockIndex += 1) {
      segments.push({
        top: y,
        bottom: y + blockFull,
        textBottom: y + lineH,
        column: 0 as const,
        blockIndex,
      });
      y += blockFull;
    }
    const pageStart = blockFull * 12;
    const layout = {
      pageStarts: [0, pageStart, y],
      rightPageStarts: [0, pageStart, y],
      dualPage: true as const,
      clipHeight,
      contentExtent: y,
      leftColumnExtent: y,
      rightColumnExtent: y,
      segments,
    };
    const indices = contentBlockIndicesForSpreadPage(layout, 0, 1);
    expect(indices.length).toBeGreaterThan(0);
    let full = 0;
    let prev: number | null = null;
    let lastBottom = 0;
    let lastTextBottom = 0;
    for (const idx of indices) {
      const segs = segments.filter((s) => s.blockIndex === idx + 1);
      const minTop = Math.min(...segs.map((s) => s.top));
      const maxBottom = Math.max(...segs.map((s) => s.bottom));
      const maxTextBottom = Math.max(...segs.map((s) => s.textBottom));
      const gap = prev == null ? 0 : Math.max(0, minTop - prev);
      full += gap + (maxBottom - minTop);
      prev = maxBottom;
      lastBottom = maxBottom;
      lastTextBottom = maxTextBottom;
    }
    const tailMargin = indices.length > 0
      ? Math.max(0, lastBottom - lastTextBottom)
      : 0;
    expect(full - tailMargin).toBeLessThanOrEqual(clipHeight + 0.5);
  });

  it('excludes blocks that start before the page boundary', () => {
    const lineH = 32;
    const pageStart = lineH * 2;
    const layout = {
      pageStarts: [0, pageStart],
      rightPageStarts: [0, 0],
      dualPage: true as const,
      clipHeight: 128,
      contentExtent: 200,
      leftColumnExtent: lineH * 4,
      rightColumnExtent: 64,
      segments: [
        { top: 0, bottom: lineH, column: 0 as const, blockIndex: 1 },
        { top: lineH, bottom: lineH * 2, column: 0 as const, blockIndex: 2 },
        { top: pageStart, bottom: pageStart + lineH, column: 0 as const, blockIndex: 3 },
        {
          top: lineH,
          bottom: pageStart + lineH * 2,
          column: 0 as const,
          blockIndex: 4,
        },
      ],
    };
    expect(contentBlockIndicesForSpreadPage(layout, 0, 1)).toEqual([2]);
  });
});

describe('contentBlockIndicesForColumn', () => {
  it('maps measure block indices to content block indices', () => {
    const segments: ReaderLayoutSegment[] = [
      { top: 0, bottom: 32, column: 0 as const, blockIndex: 0 },
      { top: 32, bottom: 64, column: 0 as const, blockIndex: 1 },
      { top: 0, bottom: 32, column: 1 as const, blockIndex: 2 },
    ];
    expect(columnShowsChapterTitle(segments, 0)).toBe(true);
    expect(columnShowsChapterTitle(segments, 1)).toBe(false);
    expect(contentBlockIndicesForColumn(segments, 0)).toEqual([0]);
    expect(contentBlockIndicesForColumn(segments, 1)).toEqual([1]);
  });
});
