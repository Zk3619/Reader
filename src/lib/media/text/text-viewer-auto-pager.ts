/**
 * 文本阅读器自动翻页（对齐 Legado AutoPager：秒/屏、滚动连续滚、按页进度条后翻页）
 */

import {
  TEXT_VIEWER_AUTO_READ_SPEED_DEFAULT,
  normalizeAutoReadSpeed,
} from '@/lib/media/text/reader-ui-config';

export {
  TEXT_VIEWER_AUTO_READ_SPEED_MIN,
  TEXT_VIEWER_AUTO_READ_SPEED_MAX,
  TEXT_VIEWER_AUTO_READ_SPEED_DEFAULT,
  TEXT_VIEWER_AUTO_PAGE_STYLE_LABELS,
  TEXT_VIEWER_AUTO_PAGE_PROGRESS_EDGE_LABELS,
  normalizeAutoReadSpeed,
  normalizeAutoPageStyle,
  normalizeAutoPageProgressEdge,
  type TextViewerAutoPageStyle,
  type TextViewerAutoPageProgressEdge,
} from '@/lib/media/text/reader-ui-config';

/** 按页翻页动画结束后短暂锁定，避免动画未完成时连翻 */
export const TEXT_VIEWER_AUTO_PAGE_TURN_LOCK_MS = 360;

/** 视口高度在 speed 秒内滚完时的像素步进（含亚像素余量累积） */
export function computeAutoPagePixelDelta(
  viewportHeightPx: number,
  speedSeconds: number,
  elapsedMs: number,
): number {
  const speed = normalizeAutoReadSpeed(speedSeconds);
  const height = Math.max(1, viewportHeightPx);
  const readTimeMs = speed * 1000;
  return (height / readTimeMs) * elapsedMs;
}

export function resolveAutoReadSpeed(
  configured: number | undefined | null,
): number {
  return normalizeAutoReadSpeed(configured ?? TEXT_VIEWER_AUTO_READ_SPEED_DEFAULT);
}
