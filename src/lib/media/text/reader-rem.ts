/** 阅读器界面 rem 换算（根字号 16px，与浏览器默认一致） */
export const READER_REM_BASE_PX = 16;

export function pxToRem(px: number): number {
  return px / READER_REM_BASE_PX;
}

export function remToPx(rem: number): number {
  return rem * READER_REM_BASE_PX;
}

export function formatRem(rem: number, digits = 2): string {
  return `${rem.toFixed(digits)}rem`;
}

export function formatRemFromPx(px: number, digits = 2): string {
  return formatRem(pxToRem(px), digits);
}
