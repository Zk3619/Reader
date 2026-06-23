/**
 * 计算层：LayoutDocument → ReaderLayoutSegment[]（Pretext）
 */

import {
  layoutNextLineRange,
  materializeLineRange,
  prepareWithSegments,
  type LayoutCursor,
} from '@chenglou/pretext';
import {
  layoutNextRichInlineLineRange,
  materializeRichInlineLineRange,
  prepareRichInline,
  type RichInlineCursor,
  type RichInlineItem,
} from '@chenglou/pretext/rich-inline';
import {
  PRETEXT_COMMENT_BUBBLE,
  pretextFloatWrapGapPx,
  type LayoutDocument,
  type PretextBlockBox,
  type PretextInlineItem,
} from '@/lib/media/text/pretext-layout-document';
import { pretextPrepareOptions } from '@/lib/media/text/pretext-locale';
import type { PretextLineMeta } from '@/lib/media/text/pretext-line-map';
import type { TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';
import type { ReaderLayoutSegment } from '@/lib/media/text/text-viewer-paginate';

export type { PretextLineMeta };

export interface PretextSegmentsResult {
  segments: ReaderLayoutSegment[];
  contentExtent: number;
  lineMetas: PretextLineMeta[];
}

type FloatRect = {
  top: number;
  bottom: number;
  width: number;
  side: 'left' | 'right';
};

function inlineItemsToRich(items: PretextInlineItem[]): RichInlineItem[] {
  const out: RichInlineItem[] = [];
  for (const item of items) {
    if (item.kind === 'text') {
      out.push({
        text: item.text,
        font: item.font,
        ...(item.letterSpacing != null ? { letterSpacing: item.letterSpacing } : {}),
      });
      continue;
    }
    if (item.kind === 'commentBubble') {
      out.push({
        text: '\u200B',
        font: items.find((i) => i.kind === 'text')?.font ?? '400 16px sans-serif',
        break: 'never',
        extraWidth: PRETEXT_COMMENT_BUBBLE.extraWidth,
      });
      continue;
    }
    out.push({
      text: '\u200B',
      font: items.find((i) => i.kind === 'text')?.font ?? '400 16px sans-serif',
      break: 'never',
      extraWidth: item.width,
    });
  }
  return out;
}

function lineHeightForRichBlock(
  items: PretextInlineItem[],
  defaultLineHeight: number,
): number {
  let maxInline = 0;
  for (const item of items) {
    if (item.kind === 'inlineBox') maxInline = Math.max(maxInline, item.height);
    if (item.kind === 'commentBubble') {
      maxInline = Math.max(maxInline, PRETEXT_COMMENT_BUBBLE.height);
    }
  }
  return Math.max(defaultLineHeight, maxInline);
}

function lineWidthAtY(
  y: number,
  contentWidth: number,
  floats: FloatRect[],
): number {
  const gap = pretextFloatWrapGapPx();
  for (const f of floats) {
    if (y >= f.top && y < f.bottom) {
      return Math.max(1, contentWidth - f.width - gap);
    }
  }
  return contentWidth;
}

function richLineTextSlice(
  line: ReturnType<typeof materializeRichInlineLineRange>,
): string {
  return line.fragments.map((frag) => frag.text).join('');
}

function layoutPlainTextRuns(
  text: string,
  font: string,
  config: TextViewerUiConfig,
  contentWidth: number,
  lineHeight: number,
  yStart: number,
  blockIndex: number,
  blockCharOffset: number,
  floats: FloatRect[],
  lineMetas: PretextLineMeta[],
): { segments: ReaderLayoutSegment[]; y: number; nextCharOffset: number } {
  const options = pretextPrepareOptions(config);
  const prepared = prepareWithSegments(text, font, options);
  const segments: ReaderLayoutSegment[] = [];
  let y = yStart;
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
  let charOffset = blockCharOffset;

  while (true) {
    const maxWidth = lineWidthAtY(y, contentWidth, floats);
    const range = layoutNextLineRange(prepared, cursor, maxWidth);
    if (!range) break;
    const top = y;
    const textBottom = top + lineHeight * 0.85;
    const bottom = top + lineHeight;
    const line = materializeLineRange(prepared, range);
    const textSlice = line.text;
    lineMetas.push({
      lineTop: top,
      lineBottom: bottom,
      chapterPosition: charOffset,
      textSlice,
      blockIndex,
    });
    charOffset += textSlice.length;
    segments.push({ top, bottom, textBottom, blockIndex });
    y = bottom;
    cursor = range.end;
  }

  return { segments, y, nextCharOffset: charOffset };
}

function layoutRichInlineBlock(
  items: PretextInlineItem[],
  config: TextViewerUiConfig,
  contentWidth: number,
  lineHeight: number,
  yStart: number,
  blockIndex: number,
  blockCharOffset: number,
  floats: FloatRect[],
  lineMetas: PretextLineMeta[],
): { segments: ReaderLayoutSegment[]; y: number; nextCharOffset: number } {
  const richItems = inlineItemsToRich(items);
  if (richItems.length === 0) {
    return { segments: [], y: yStart, nextCharOffset: blockCharOffset };
  }

  const effectiveLineH = lineHeightForRichBlock(items, lineHeight);
  pretextPrepareOptions(config);
  const prepared = prepareRichInline(richItems);
  const segments: ReaderLayoutSegment[] = [];
  let y = yStart;
  let cursor: RichInlineCursor | undefined;
  let charOffset = blockCharOffset;

  while (true) {
    const maxWidth = lineWidthAtY(y, contentWidth, floats);
    const range = layoutNextRichInlineLineRange(prepared, maxWidth, cursor);
    if (!range) break;
    const top = y;
    const textBottom = top + effectiveLineH * 0.85;
    const bottom = top + effectiveLineH;
    const line = materializeRichInlineLineRange(prepared, range);
    const textSlice = richLineTextSlice(line);
    lineMetas.push({
      lineTop: top,
      lineBottom: bottom,
      chapterPosition: charOffset,
      textSlice,
      blockIndex,
    });
    charOffset += textSlice.length;
    segments.push({ top, bottom, textBottom, blockIndex });
    y = bottom;
    cursor = range.end;
  }

  return { segments, y, nextCharOffset: charOffset };
}

function layoutTextBlock(
  block: Extract<PretextBlockBox, { kind: 'text' }>,
  config: TextViewerUiConfig,
  doc: LayoutDocument,
  yStart: number,
  blockIndex: number,
  blockCharOffset: number,
  floats: FloatRect[],
  lineMetas: PretextLineMeta[],
): { segments: ReaderLayoutSegment[]; y: number; nextCharOffset: number } {
  const hasRich =
    block.items.some((i) => i.kind !== 'text') || block.items.length > 1;

  if (!hasRich) {
    const textItem = block.items.find((i) => i.kind === 'text');
    const text = textItem?.kind === 'text' ? textItem.text : '';
    const font = textItem?.kind === 'text' ? textItem.font : '400 16px sans-serif';
    return layoutPlainTextRuns(
      text,
      font,
      config,
      doc.contentWidth,
      doc.defaultLineHeight,
      yStart,
      blockIndex,
      blockCharOffset,
      floats,
      lineMetas,
    );
  }

  return layoutRichInlineBlock(
    block.items,
    config,
    doc.contentWidth,
    doc.defaultLineHeight,
    yStart,
    blockIndex,
    blockCharOffset,
    floats,
    lineMetas,
  );
}
export function computeSegmentsFromLayoutDocument(
  doc: LayoutDocument,
  config: TextViewerUiConfig,
): PretextSegmentsResult {
  const segments: ReaderLayoutSegment[] = [];
  const lineMetas: PretextLineMeta[] = [];
  const floats: FloatRect[] = [];
  let y = 0;
  let blockIndex = 0;
  let chapterCharOffset = 0;

  for (const block of doc.blocks) {
    if (block.kind === 'chapterTitle') {
      y += block.marginTop;
      for (const run of block.runs) {
        const { segments: lineSegs, y: nextY, nextCharOffset } = layoutPlainTextRuns(
          run.text,
          run.font,
          config,
          doc.contentWidth,
          block.lineHeight,
          y,
          blockIndex,
          chapterCharOffset,
          floats,
          lineMetas,
        );
        segments.push(...lineSegs);
        y = nextY;
        chapterCharOffset = nextCharOffset;
      }
      y += block.marginBottom;
      blockIndex += 1;
      continue;
    }

    if (block.kind === 'figure') {
      y += block.marginY;
      const top = y;
      const bottom = top + block.height;
      segments.push({
        top,
        bottom,
        textBottom: bottom,
        blockIndex,
      });
      const side = block.float === 'left' ? 'left' : 'right';
      if (block.float && block.float !== 'none') {
        floats.push({
          top,
          bottom,
          width: block.width,
          side,
        });
      }
      y = bottom + block.marginY;
      blockIndex += 1;
      continue;
    }

    if (block.kind === 'text') {
      const marginTop = block.marginTop ?? 0;
      y += marginTop;
      const { segments: lineSegs, y: nextY, nextCharOffset } = layoutTextBlock(
        block,
        config,
        doc,
        y,
        blockIndex,
        chapterCharOffset,
        floats,
        lineMetas,
      );
      segments.push(...lineSegs);
      y = nextY;
      chapterCharOffset = nextCharOffset;
      const marginBottom = block.marginBottom ?? doc.paragraphGap;
      if (lineSegs.length > 0) y += marginBottom;
      blockIndex += 1;
    }
  }

  const contentExtent = segments.length > 0
    ? Math.max(y, ...segments.map((s) => s.bottom))
    : 0;

  return { segments, contentExtent, lineMetas };
}
