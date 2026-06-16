/**
 * 纯文本章节：Canvas measureText 预分页（无 getClientRects / 无隐藏 DOM）
 */

import { splitRawIntoParagraphSegments } from '@/lib/media/text/reader-content-blocks';
import type { ReaderChapterLayout } from '@/lib/media/text/reader-chapter-layout-types';
import { textViewerLayoutContentWidth, textViewerPagedContentInsets } from '@/lib/media/text/reader-ui-config';
import type { TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';
import { readerChapterTitleSpacingPx } from '@/lib/media/text/reader-chapter-title-style';
import {
  computePageStartsFromSegments,
  pageDisplayHeight,
  type ReaderLayoutSegment,
} from '@/lib/media/text/text-viewer-paginate';

export interface CanvasTextLayoutParams {
  chapterIndex: number;
  raw: string;
  chapterTitle?: string;
  viewportWidth: number;
  viewportHeight: number;
  config: TextViewerUiConfig;
  cacheKey: string;
  padTop?: number;
  padBottom?: number;
  clipHeightPx?: number;
  horizontalInsetOnSlot?: boolean;
}

let measureCanvas: HTMLCanvasElement | null = null;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!measureCanvas) {
    measureCanvas = document.createElement('canvas');
  }
  return measureCanvas.getContext('2d');
}

function stripHtmlToPlain(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function resolveReaderFontFamily(config: TextViewerUiConfig): string {
  if (config.font !== 0 && config.customFontName) return config.customFontName;
  return 'ui-sans-serif, system-ui, sans-serif';
}

function wrapParagraphToLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (!text.trim()) return [];
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    if (ch === '\n') {
      if (line) lines.push(line);
      line = '';
      continue;
    }
    const trial = line + ch;
    if (line && ctx.measureText(trial).width > maxWidth) {
      lines.push(line);
      line = ch.trimStart() || ch;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function buildCanvasSegments(params: CanvasTextLayoutParams): {
  segments: ReaderLayoutSegment[];
  contentExtent: number;
  clipHeight: number;
  padTop: number;
  padBottom: number;
} {
  const { config, viewportWidth, viewportHeight, chapterTitle, raw } = params;
  const defaultPads = textViewerPagedContentInsets(config);
  const padTop = params.padTop ?? defaultPads.top;
  const padBottom = params.padBottom ?? defaultPads.bottom;
  const clipHeight =
    params.clipHeightPx != null && params.clipHeightPx > 0
      ? Math.max(1, Math.round(params.clipHeightPx))
      : Math.max(1, viewportHeight - padTop - padBottom);
  const fontSize = config.fontSize;
  const lineHeight = fontSize * (config.spacing.line + 1);
  const paragraphGap = fontSize * config.spacing.paragraph;
  const contentWidth = textViewerLayoutContentWidth(viewportWidth, config, {
    horizontalInsetOnSlot: params.horizontalInsetOnSlot,
  });

  const ctx = getMeasureContext();
  if (!ctx) {
    return {
      segments: [{ top: 0, bottom: clipHeight }],
      contentExtent: clipHeight,
      clipHeight,
      padTop,
      padBottom,
    };
  }

  const fontFamily = resolveReaderFontFamily(config);
  ctx.font = `${fontSize}px ${fontFamily}`;

  const segments: ReaderLayoutSegment[] = [];
  let y = 0;

  const titleStyle = config.chapterTitleStyle ?? 'center';
  const titleSpacing = readerChapterTitleSpacingPx(titleStyle, config, 'paged');
  if (titleSpacing && chapterTitle?.trim()) {
    y += titleSpacing.marginTopPx;
    const titleLines = wrapParagraphToLines(ctx, chapterTitle.trim(), contentWidth);
    const titleLineH = fontSize * (config.spacing.line + 0.2);
    for (const _line of titleLines) {
      segments.push({ top: y, bottom: y + titleLineH });
      y += titleLineH;
    }
    y += titleSpacing.marginBottomPx;
  }

  const plain = stripHtmlToPlain(raw);
  const paragraphs = splitRawIntoParagraphSegments(plain);
  for (let p = 0; p < paragraphs.length; p++) {
    const para = paragraphs[p]!;
    if (!para.trim()) continue;
    const lines = wrapParagraphToLines(ctx, para, contentWidth);
    for (const _line of lines) {
      segments.push({ top: y, bottom: y + lineHeight });
      y += lineHeight;
    }
    if (p < paragraphs.length - 1) y += paragraphGap;
  }

  const contentExtent = Math.max(y, segments.reduce((m, s) => Math.max(m, s.bottom), 0));
  return { segments, contentExtent, clipHeight, padTop, padBottom };
}

export function layoutPlainTextChapterCanvas(
  params: CanvasTextLayoutParams,
): ReaderChapterLayout {
  const { segments, contentExtent, clipHeight, padTop, padBottom } =
    buildCanvasSegments(params);
  const extent = Math.max(
    contentExtent,
    segments.reduce((m, s) => Math.max(m, s.bottom), 0),
  );
  const pageStarts = computePageStartsFromSegments(
    segments,
    clipHeight,
    extent,
    0,
  );

  const pages = pageStarts.map((startY, index) => ({
    index,
    startY,
    endY: pageStarts[index + 1] ?? extent,
    displayHeight: pageDisplayHeight(
      index,
      pageStarts,
      clipHeight,
      extent,
      segments,
    ),
    chapterPosition: 0,
  }));

  return {
    chapterIndex: params.chapterIndex,
    engine: 'canvas',
    pages,
    pageStarts,
    clipHeight,
    viewportHeight: Math.max(1, params.viewportHeight),
    viewportWidth: Math.max(1, params.viewportWidth),
    contentExtent: extent,
    padTop,
    padBottom,
    segments,
    cacheKey: params.cacheKey,
  };
}
