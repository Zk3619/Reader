import type { TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';

/** 章节标题在阅读视图中的渲染方式 */
export type TextViewerChapterTitleStyle = 'none' | 'center' | 'topLeft';

export const TEXT_VIEWER_CHAPTER_TITLE_STYLE_LABELS: Record<
  TextViewerChapterTitleStyle,
  string
> = {
  none: '不渲染',
  center: '中心渲染',
  topLeft: '左上角渲染',
};

export const TEXT_VIEWER_CHAPTER_TITLE_STYLE_OPTIONS: TextViewerChapterTitleStyle[] = [
  'none',
  'center',
  'topLeft',
];

export interface ReaderChapterTitleSpacing {
  marginTopPx: number;
  marginBottomPx: number;
  align: 'center' | 'left';
}

/** 章节标题间距场景：滚动多章衔接 vs 翻页章首 */
export type ReaderChapterTitleSpacingContext = 'scroll' | 'paged';

/**
 * 章节标题上下间距：随字号、行距、段距、字距变化。
 * 翻页模式章首无前置正文，上间距显著缩小。
 */
export function readerChapterTitleSpacingPx(
  style: TextViewerChapterTitleStyle,
  config: Pick<TextViewerUiConfig, 'spacing' | 'fontSize'>,
  context: ReaderChapterTitleSpacingContext = 'scroll',
): ReaderChapterTitleSpacing | null {
  if (style === 'none') return null;

  const { fontSize, spacing } = config;
  const lineFactor = spacing.line + 1;
  const paragraphFactor = Math.max(0.35, spacing.paragraph + 0.35);
  const letterFactor = 1 + spacing.letter * 0.35;
  const rhythm = fontSize * lineFactor * paragraphFactor * letterFactor;

  if (style === 'center') {
    const gap = Math.max(fontSize * 0.65, rhythm * 0.85);
    if (context === 'paged') {
      return { marginTopPx: 0, marginBottomPx: gap, align: 'center' };
    }
    return { marginTopPx: gap, marginBottomPx: gap, align: 'center' };
  }

  const bottomGap = Math.max(fontSize * 0.28, rhythm * 0.38);
  if (context === 'paged') {
    return {
      marginTopPx: Math.max(fontSize * 0.2, rhythm * 0.28),
      marginBottomPx: bottomGap,
      align: 'left',
    };
  }

  return {
    marginTopPx: Math.max(fontSize * 0.9, rhythm * 1.35),
    marginBottomPx: bottomGap,
    align: 'left',
  };
}

export function shouldRenderChapterTitle(
  style: TextViewerChapterTitleStyle | undefined,
  title: string | undefined,
): boolean {
  return style !== 'none' && Boolean(title?.trim());
}
