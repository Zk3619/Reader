import { remToPx } from '@/lib/media/text/reader-rem';

/** 行距（rem）：在 1em 行高基础上追加的 leading */
export function readerLineHeightCss(lineRem: number): string {
  if (!Number.isFinite(lineRem) || lineRem <= 0) return '1';
  return `calc(1em + ${lineRem}rem)`;
}

export function readerLineHeightPx(fontSize: number, lineRem: number): number {
  const extra = Number.isFinite(lineRem) ? lineRem : 0;
  return fontSize + remToPx(extra);
}

export function readerLetterSpacingCss(letterRem: number): string | undefined {
  if (!Number.isFinite(letterRem) || letterRem <= 0) return undefined;
  return `${letterRem}rem`;
}

export function readerParagraphMarginCss(paragraphRem: number): string | undefined {
  if (!Number.isFinite(paragraphRem) || paragraphRem <= 0) return undefined;
  return `${paragraphRem}rem`;
}

export function readerParagraphMarginPx(paragraphRem: number): number {
  if (!Number.isFinite(paragraphRem) || paragraphRem <= 0) return 0;
  return remToPx(paragraphRem);
}

/** Pretext / Canvas 字距为 CSS px */
export function readerLetterSpacingPx(letterRem: number): number | undefined {
  if (!Number.isFinite(letterRem) || letterRem <= 0) return undefined;
  return remToPx(letterRem);
}
