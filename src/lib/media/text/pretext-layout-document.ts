/**
 * 解析层：章节 raw → LayoutDocument（不调用 Pretext）
 */

import {
  buildReaderDisplayBlocks,
  paragraphHasLegadoCommentImg,
  type ReaderDisplayBlock,
  type ReaderInlineImageRef,
  type ReaderParagraphPart,
} from '@/lib/media/text/reader-content-blocks';
import { resolveInlineTextImageSizeFromSrc, parseSvgDataUrlIntrinsicSize } from '@/lib/media/image/inline-text-image-size';
import {
  normalizePretextImageUrl,
  peekPretextImageIntrinsic,
  type PretextImageIntrinsic,
} from '@/lib/media/image/pretext-image-intrinsic';
import { figureMarginYPx, resolveBlockFigureDisplaySize } from '@/lib/media/image/image-box-metrics';
import {
  isInlineLegadoImageLayout,
  type LegadoImageLayout,
} from '@/lib/js-engine/legado/legado-image-options';
import {
  readerChapterTitleFontSizePx,
  readerChapterTitleSpacingPx,
  readerParagraphIndentPrefix,
  shouldRenderChapterTitle,
} from '@/lib/media/text/reader-chapter-title-style';
import {
  readerLetterSpacingPx,
  readerLineHeightPx,
  readerParagraphMarginPx,
} from '@/lib/media/text/reader-spacing';
import { pretextCanvasFont, pretextChapterTitleFont } from '@/lib/media/text/pretext-font-sync';
import {
  textViewerLayoutContentWidth,
  type TextViewerUiConfig,
} from '@/lib/media/text/reader-ui-config';

export type PretextTextRun = {
  text: string;
  font: string;
  letterSpacing?: number;
};

export type PretextInlineItem =
  | { kind: 'text'; text: string; font: string; letterSpacing?: number }
  | { kind: 'inlineBox'; id: string; width: number; height: number; break: 'never' }
  | { kind: 'commentBubble'; id: string };

export type PretextBlockBox =
  | {
    kind: 'text';
    items: PretextInlineItem[];
    marginTop?: number;
    marginBottom?: number;
  }
  | {
    kind: 'figure';
    refs: ReaderInlineImageRef[];
    url: string;
    layout?: LegadoImageLayout;
    width: number;
    height: number;
    marginY: number;
    float?: 'left' | 'right' | 'none';
  }
  | {
    kind: 'chapterTitle';
    runs: PretextTextRun[];
    marginTop: number;
    marginBottom: number;
    lineHeight: number;
  };

export type LayoutDocument = {
  blocks: PretextBlockBox[];
  contentWidth: number;
  defaultLineHeight: number;
  paragraphGap: number;
  /** 待 decode 的块级图 URL（已测 intrinsic 的不列入） */
  imageIds: string[];
  unsupported: boolean;
  unsupportedReason?: string;
};

export interface LayoutDocumentParams {
  raw: string;
  config: TextViewerUiConfig;
  viewportWidth: number;
  viewportHeight: number;
  chapterTitle?: string;
  horizontalInsetOnSlot?: boolean;
  intrinsicByUrl?: Map<string, PretextImageIntrinsic>;
  /** 双栏时禁用 float 旁绕排 */
  disableFloat?: boolean;
}

const FLOAT_FIGURE_MAX_WIDTH_RATIO = 0.5;
const FLOAT_WRAP_GAP_PX = 8;

export function pretextFloatWrapGapPx(): number {
  return FLOAT_WRAP_GAP_PX;
}

function resolveFigureFloat(
  config: TextViewerUiConfig,
  layout: LegadoImageLayout | undefined,
  intrinsicWidth: number,
  contentWidth: number,
  disableFloat?: boolean,
): 'left' | 'right' | 'none' {
  if (disableFloat) return 'none';
  const style = String(config.imageStyle ?? layout ?? 'DEFAULT').toUpperCase();
  if (style !== 'FULL' && layout !== 'FULL') return 'none';
  if (intrinsicWidth >= contentWidth * FLOAT_FIGURE_MAX_WIDTH_RATIO) return 'none';
  return 'right';
}

function intrinsicForFigureUrl(
  url: string,
  intrinsicByUrl?: Map<string, PretextImageIntrinsic>,
): PretextImageIntrinsic | null | undefined {
  const norm = normalizePretextImageUrl(url);
  return intrinsicByUrl?.get(norm)
    ?? intrinsicByUrl?.get(url)
    ?? peekPretextImageIntrinsic(url);
}

function figureNeedsDecode(
  url: string,
  layout: LegadoImageLayout | undefined,
  intrinsic?: PretextImageIntrinsic | null,
): boolean {
  if (intrinsic) return false;
  if (layout && isInlineLegadoImageLayout(layout)) return false;
  if (parseSvgDataUrlIntrinsicSize(normalizePretextImageUrl(url))) return false;
  return true;
}

const COMMENT_BUBBLE_EXTRA_WIDTH_PX = 24;
const COMMENT_BUBBLE_HEIGHT_PX = 24;

function hasUnparseableStructuralHtml(raw: string): boolean {
  return /<(blockquote|pre|code|ul|ol|li|dl|dt|dd|h[1-6]|div|section|article|aside|header|footer|style|script|table)\b/i.test(
    raw,
  );
}

function bodyFont(config: TextViewerUiConfig): string {
  return pretextCanvasFont(config);
}

function partsToInlineItems(
  parts: ReaderParagraphPart[],
  config: TextViewerUiConfig,
  fontSizePx: number,
  showCommentBubble: boolean,
): PretextInlineItem[] {
  const items: PretextInlineItem[] = [];
  const font = bodyFont(config);
  const letterSpacing = readerLetterSpacingPx(config.spacing.letter);

  for (const part of parts) {
    if (part.kind === 'text') {
      if (part.text) {
        items.push({ kind: 'text', text: part.text, font, letterSpacing });
      }
      continue;
    }
    const layout = part.ref.layout;
    if (layout && isInlineLegadoImageLayout(layout)) {
      const size = resolveInlineTextImageSizeFromSrc(part.ref.url, fontSizePx, layout);
      const w = size?.width ?? fontSizePx;
      const h = size?.height ?? fontSizePx;
      items.push({
        kind: 'inlineBox',
        id: part.ref.url,
        width: w,
        height: h,
        break: 'never',
      });
      continue;
    }
    items.push({
      kind: 'inlineBox',
      id: part.ref.url,
      width: fontSizePx,
      height: fontSizePx,
      break: 'never',
    });
  }

  if (showCommentBubble) {
    items.push({ kind: 'commentBubble', id: 'comment-bubble' });
  }

  return items;
}

function displayBlockToPretextBlock(
  block: ReaderDisplayBlock,
  config: TextViewerUiConfig,
  contentWidth: number,
  viewportHeight: number,
  paragraphGap: number,
  options?: {
    intrinsicByUrl?: Map<string, PretextImageIntrinsic>;
    disableFloat?: boolean;
  },
): PretextBlockBox | null {
  const fontSizePx = config.fontSize;

  if (block.type === 'figure') {
    const ref = block.refs[0];
    if (!ref) return null;
    const intrinsic = intrinsicForFigureUrl(ref.url, options?.intrinsicByUrl);
    const intrinsicW = intrinsic?.width ?? contentWidth;
    const float = resolveFigureFloat(
      config,
      ref.layout,
      intrinsicW,
      contentWidth,
      options?.disableFloat,
    );
    let size = resolveBlockFigureDisplaySize({
      url: ref.url,
      layout: ref.layout,
      imageStyle: config.imageStyle,
      contentWidth,
      viewportHeight,
      fontSizePx,
      intrinsic,
    });
    if (float !== 'none' && intrinsic && intrinsic.width > 0 && intrinsic.height > 0) {
      const iw = intrinsic.width;
      const ih = intrinsic.height;
      const w = Math.min(contentWidth, iw);
      const h = (w / iw) * ih;
      size = {
        width: Math.max(1, w),
        height: Math.max(1, h),
        marginY: size.marginY,
      };
    }
    return {
      kind: 'figure',
      refs: block.refs,
      url: ref.url,
      layout: ref.layout,
      width: size.width,
      height: size.height,
      marginY: size.marginY,
      float,
    };
  }

  const indent = readerParagraphIndentPrefix(config.paragraphIndentChars ?? 2);
  const showBubble = paragraphHasLegadoCommentImg(block.parts);
  const items = partsToInlineItems(block.parts, config, fontSizePx, showBubble);

  if (items.length === 0) return null;

  if (indent && items[0]?.kind === 'text') {
    items[0] = { ...items[0], text: indent + items[0].text.replace(/^([ \u3000]+)/, '') };
  }

  return {
    kind: 'text',
    items,
    marginBottom: paragraphGap,
  };
}

export function layoutDocumentFromChapter(params: LayoutDocumentParams): LayoutDocument {
  const { config, raw, viewportWidth, viewportHeight, chapterTitle } = params;
  const contentWidth = textViewerLayoutContentWidth(viewportWidth, config, {
    horizontalInsetOnSlot: params.horizontalInsetOnSlot,
  });
  const lineHeight = readerLineHeightPx(config.fontSize, config.spacing.line);
  const paragraphGap = readerParagraphMarginPx(config.spacing.paragraph);

  if (hasUnparseableStructuralHtml(raw)) {
    return {
      blocks: [],
      contentWidth,
      defaultLineHeight: lineHeight,
      paragraphGap,
      imageIds: [],
      unsupported: true,
      unsupportedReason: 'structural-html',
    };
  }

  const displayBlocks = buildReaderDisplayBlocks(raw, config.imageStyle);
  const blocks: PretextBlockBox[] = [];
  const imageIds: string[] = [];
  const blockOptions = {
    intrinsicByUrl: params.intrinsicByUrl,
    disableFloat: params.disableFloat,
  };

  const titleStyle = config.chapterTitleStyle ?? 'center';
  const titleSpacing = readerChapterTitleSpacingPx(titleStyle, config, 'paged');
  if (
    titleSpacing &&
    shouldRenderChapterTitle(titleStyle, chapterTitle) &&
    chapterTitle?.trim()
  ) {
    const titleSize = readerChapterTitleFontSizePx(config);
    blocks.push({
      kind: 'chapterTitle',
      runs: [{
        text: chapterTitle.trim(),
        font: pretextChapterTitleFont(config, titleSize),
      }],
      marginTop: titleSpacing.marginTopPx,
      marginBottom: titleSpacing.marginBottomPx,
      lineHeight: readerLineHeightPx(titleSize, config.spacing.line + 0.2),
    });
  }

  for (const block of displayBlocks) {
    const converted = displayBlockToPretextBlock(
      block,
      config,
      contentWidth,
      viewportHeight,
      paragraphGap,
      blockOptions,
    );
    if (converted) {
      blocks.push(converted);
      if (converted.kind === 'figure' && figureNeedsDecode(
        converted.url,
        converted.layout,
        intrinsicForFigureUrl(converted.url, params.intrinsicByUrl),
      )) {
        imageIds.push(converted.url);
      }
    }
  }

  return {
    blocks,
    contentWidth,
    defaultLineHeight: lineHeight,
    paragraphGap,
    imageIds,
    unsupported: false,
  };
}

export const PRETEXT_COMMENT_BUBBLE = {
  extraWidth: COMMENT_BUBBLE_EXTRA_WIDTH_PX,
  height: COMMENT_BUBBLE_HEIGHT_PX,
} as const;

export const PRETEXT_FIGURE_MARGIN_Y = figureMarginYPx;
