import type { TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';
import { remToPx } from '@/lib/media/text/reader-rem';
import {
  readerLineHeightPx,
  readerParagraphMarginPx,
} from '@/lib/media/text/reader-spacing';

/** 章节标题在阅读视图中的渲染方式 */
export type TextViewerChapterTitleStyle = 'none' | 'left' | 'center' | 'right';

export const TEXT_VIEWER_CHAPTER_TITLE_STYLE_LABELS: Record<
  TextViewerChapterTitleStyle,
  string
> = {
  none: '不渲染',
  left: '左侧',
  center: '中心',
  right: '右侧',
};

export const TEXT_VIEWER_CHAPTER_TITLE_STYLE_OPTIONS: TextViewerChapterTitleStyle[] = [
  'none',
  'left',
  'center',
  'right',
];

export function normalizeTextViewerChapterTitleStyle(
  raw: unknown,
): TextViewerChapterTitleStyle {
  if (raw === 'topLeft' || raw === 'topRight') return 'right';
  if (raw === 'none' || raw === 'left' || raw === 'center' || raw === 'right') {
    return raw;
  }
  return 'center';
}

export interface ReaderChapterTitleSpacing {
  marginTopPx: number;
  marginBottomPx: number;
  align: 'left' | 'center' | 'right';
  position: 'flow';
}

/** 章节标题间距场景：滚动多章衔接 vs 翻页章首 */
export type ReaderChapterTitleSpacingContext = 'scroll' | 'paged';

function titleExtraPx(config: Pick<TextViewerUiConfig, 'chapterTitleTopSpacing' | 'chapterTitleBottomSpacing'>): {
  top: number;
  bottom: number;
} {
  return {
    top: remToPx(config.chapterTitleTopSpacing ?? 0),
    bottom: remToPx(config.chapterTitleBottomSpacing ?? 0),
  };
}

/**
 * 章节标题上下间距：随字号、行距、段距、字距变化。
 * 左/中/右对齐共用同一套上下间距，仅水平对齐不同。
 */
export function readerChapterTitleSpacingPx(
  style: TextViewerChapterTitleStyle,
  config: Pick<
    TextViewerUiConfig,
    'spacing' | 'fontSize' | 'chapterTitleTopSpacing' | 'chapterTitleBottomSpacing'
  >,
  context: ReaderChapterTitleSpacingContext = 'scroll',
): ReaderChapterTitleSpacing | null {
  if (style === 'none') return null;

  const extra = titleExtraPx(config);
  const { fontSize, spacing } = config;
  const lineFactor = readerLineHeightPx(fontSize, spacing.line) / fontSize;
  const paragraphFactor = Math.max(0.35, readerParagraphMarginPx(spacing.paragraph) / fontSize + 0.35);
  const letterFactor = 1 + remToPx(spacing.letter) / fontSize * 0.35;
  const rhythm = fontSize * lineFactor * paragraphFactor * letterFactor;

  const bottomGap = Math.max(fontSize * 0.45, rhythm * 0.55);
  const topGap =
    context === 'paged'
      ? Math.max(fontSize * 0.2, rhythm * 0.28)
      : Math.max(fontSize * 0.65, rhythm * 0.85);

  const align: ReaderChapterTitleSpacing['align'] =
    style === 'center' ? 'center' : style === 'right' ? 'right' : 'left';

  return {
    marginTopPx: topGap + extra.top,
    marginBottomPx: bottomGap + extra.bottom,
    align,
    position: 'flow',
  };
}

export function readerChapterTitleFontSizePx(
  config: Pick<TextViewerUiConfig, 'fontSize' | 'chapterTitleSize'>,
): number {
  const base = config.fontSize;
  const extraRem = config.chapterTitleSize ?? 0;
  if (extraRem <= 0) return base;
  return base + remToPx(extraRem);
}

export function shouldRenderChapterTitle(
  style: TextViewerChapterTitleStyle | undefined,
  title: string | undefined,
): boolean {
  return style !== 'none' && Boolean(title?.trim());
}

export function readerParagraphIndentPrefix(chars: number): string {
  const n = Math.max(0, Math.min(8, Math.round(chars)));
  if (n <= 0) return '';
  return '\u3000'.repeat(n);
}
