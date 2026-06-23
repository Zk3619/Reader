import type { TextViewerPageTipsConfig, TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';
import { normalizePretextImageUrl } from '@/lib/media/image/pretext-image-intrinsic';
import {
  textViewerDualPageActive,
  textViewerDualPageActiveInViewport,
} from '@/lib/media/text/reader-ui-config';

export interface LayoutSignatureExtras {
  dualPage?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
}

/** 页眉页脚影响分页窗高，须纳入排版缓存签名 */
function pageTipsLayoutSignature(tips: TextViewerPageTipsConfig): string {
  const inset = (i: TextViewerPageTipsConfig['headerInset']) =>
    `${i.top},${i.bottom},${i.left},${i.right}`;
  return [
    tips.headerMode,
    tips.footerMode,
    tips.headerLeft,
    tips.headerMiddle,
    tips.headerRight,
    tips.footerLeft,
    tips.footerMiddle,
    tips.footerRight,
    tips.headerFontSize,
    tips.footerFontSize,
    inset(tips.headerInset),
    inset(tips.footerInset),
    tips.showHeaderLine ? 1 : 0,
    tips.showFooterLine ? 1 : 0,
  ].join(',');
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
    config.chapterTitleSize,
    config.chapterTitleTopSpacing,
    config.chapterTitleBottomSpacing,
    config.chapterTitleFontWeight,
    config.fontWeight,
    config.paragraphIndentChars,
    config.customFontPath,
    dualActive ? '1:dp9' : 0,
    pageTipsLayoutSignature(config.pageTips),
    config.layoutEngine ?? 'dom',
  ].join('\0');
}

export function buildContentRevision(content: string): string {
  if (!content) return '0';
  const len = content.length;
  const head = content.slice(0, 48);
  const tail = content.slice(-48);
  return `${len}:${head}:${tail}`;
}

/** 块级图 intrinsic 从占位变为实测时改变 revision，避免同章重复全量重算 */
export function buildChapterImageRevision(
  urls: string[],
  intrinsicByUrl?: ReadonlyMap<string, { width: number; height: number }> | null,
): string {
  if (urls.length === 0) return '';
  return urls
    .map((raw) => {
      const norm = normalizePretextImageUrl(raw);
      const intrinsic =
        intrinsicByUrl?.get(norm) ?? intrinsicByUrl?.get(raw);
      return intrinsic
        ? `${norm}@${Math.round(intrinsic.width)}x${Math.round(intrinsic.height)}`
        : `${norm}@pending`;
    })
    .join('\0');
}

export function buildViewportSignature(
  width: number,
  height: number,
  pageWindow?: { clipHeight: number; padTop: number; padBottom: number },
): string {
  const base = `${Math.round(width)}x${Math.round(height)}`;
  if (!pageWindow) return base;
  return `${base}|c${Math.round(pageWindow.clipHeight)}|t${Math.round(pageWindow.padTop)}|b${Math.round(pageWindow.padBottom)}`;
}

export function buildChapterLayoutCacheKey(params: {
  chapterIndex: number;
  contentRevision: string;
  layoutSignature: string;
  viewportSignature: string;
  chapterTitle?: string;
  imageRevision?: string;
}): string {
  return [
    params.chapterIndex,
    params.contentRevision,
    params.layoutSignature,
    params.viewportSignature,
    params.chapterTitle ?? '',
    params.imageRevision ?? '',
  ].join('|');
}
