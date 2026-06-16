import type { TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';
import {
  textViewerDualPageActive,
  textViewerDualPageActiveInViewport,
} from '@/lib/media/text/reader-ui-config';

export interface LayoutSignatureExtras {
  dualPage?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
}

/** 阅读样式签名（字号、行距、段距、字体、边距等） */
export function buildReaderLayoutSignature(
  config: TextViewerUiConfig,
  extras?: LayoutSignatureExtras,
): string {
  const inset = config.contentInset;
  const dualActive =
    extras?.dualPage ??
    (extras?.viewportHeight != null && extras.viewportWidth != null
      ? textViewerDualPageActiveInViewport(
        config.dualPage,
        extras.viewportWidth,
        extras.viewportHeight,
      )
      : textViewerDualPageActive(
        config.dualPage,
        true,
        extras?.viewportWidth ?? 0,
      ));
  return [
    config.fontSize,
    config.spacing.line,
    config.spacing.paragraph,
    config.spacing.letter,
    config.font,
    config.customFontName,
    config.readWidth,
    inset.left,
    inset.right,
    inset.top,
    inset.bottom,
    config.imageStyle,
    config.textFullJustify ? 1 : 0,
    config.textBottomJustify ? 1 : 0,
    config.useZhLayout ? 1 : 0,
    config.chapterTitleStyle,
    dualActive ? '1:dp9' : 0,
  ].join('\0');
}

export function buildContentRevision(content: string): string {
  if (!content) return '0';
  const len = content.length;
  const head = content.slice(0, 48);
  const tail = content.slice(-48);
  return `${len}:${head}:${tail}`;
}

export function buildViewportSignature(width: number, height: number): string {
  return `${Math.round(width)}x${Math.round(height)}`;
}

export function buildChapterLayoutCacheKey(params: {
  chapterIndex: number;
  contentRevision: string;
  layoutSignature: string;
  viewportSignature: string;
  chapterTitle?: string;
}): string {
  return [
    params.chapterIndex,
    params.contentRevision,
    params.layoutSignature,
    params.viewportSignature,
    params.chapterTitle ?? '',
  ].join('|');
}
