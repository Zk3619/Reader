/**
 * 块级插图在 Pretext 布局中的显示尺寸（对齐 ReaderInlineImg / figure）
 */

import type { LegadoImageLayout } from '@/lib/js-engine/legado/legado-image-options';
import type { TextViewerImageStyle } from '@/lib/media/text/reader-ui-config';
import { resolveInlineTextImageSizeFromSrc } from '@/lib/media/image/inline-text-image-size';
import { isInlineLegadoImageLayout } from '@/lib/js-engine/legado/legado-image-options';

const FIGURE_MARGIN_Y_PX = 16;
const SINGLE_MIN_VIEWPORT_RATIO = 0.75;

export function figureMarginYPx(): number {
  return FIGURE_MARGIN_Y_PX;
}

export interface BlockImageMetricsInput {
  url: string;
  layout?: LegadoImageLayout;
  imageStyle?: TextViewerImageStyle | string;
  contentWidth: number;
  viewportHeight: number;
  fontSizePx: number;
  /** 已知 intrinsic；缺省用 contentWidth 方形占位 */
  intrinsic?: { width: number; height: number } | null;
}

export function resolveBlockFigureDisplaySize(input: BlockImageMetricsInput): {
  width: number;
  height: number;
  marginY: number;
} {
  const layout = input.layout ?? (input.imageStyle as LegadoImageLayout | undefined) ?? 'DEFAULT';
  const marginY = figureMarginYPx();
  const contentWidth = Math.max(1, input.contentWidth);

  if (isInlineLegadoImageLayout(layout)) {
    const inline = resolveInlineTextImageSizeFromSrc(
      input.url,
      input.fontSizePx,
      layout,
    );
    if (inline) {
      return { width: inline.width, height: inline.height, marginY: 0 };
    }
  }

  const intrinsic = input.intrinsic ?? { width: contentWidth, height: contentWidth * 0.6 };
  const iw = Math.max(1, intrinsic.width);
  const ih = Math.max(1, intrinsic.height);
  const style = String(input.imageStyle ?? layout).toUpperCase();

  if (style === 'FULL') {
    const h = (contentWidth / iw) * ih;
    return { width: contentWidth, height: Math.max(1, h), marginY };
  }

  if (style === 'SINGLE' || layout === 'SINGLE') {
    const maxH = Math.max(120, input.viewportHeight * 0.8);
    const minH = input.viewportHeight * SINGLE_MIN_VIEWPORT_RATIO;
    let w = Math.min(contentWidth, iw);
    let h = (w / iw) * ih;
    if (h > maxH) {
      h = maxH;
      w = (h / ih) * iw;
    }
    const blockH = Math.max(h, minH);
    return { width: Math.min(contentWidth, w), height: blockH, marginY: marginY + 32 };
  }

  let w = Math.min(contentWidth, iw);
  let h = (w / iw) * ih;
  return { width: w, height: Math.max(1, h), marginY };
}
