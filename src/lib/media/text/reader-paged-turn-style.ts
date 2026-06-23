import type { TextViewerPageAnim } from '@/lib/media/text/reader-ui-config';

export type PagedTurnDirection = 'next' | 'prev';

/** 按页阅读：单页窗口内正文纵向偏移（translate 避免 margin 折叠干扰分页测量） */
export function readerPagedContentOffsetStyle(pageStartPx: number): Record<string, string> {
  const y = Math.round(pageStartPx);
  if (y <= 0) return {};
  return { transform: `translate3d(0, ${-y}px, 0)` };
}

export function readerPagedContentOffsetTransform(pageStartPx: number): string | undefined {
  const y = Math.round(pageStartPx);
  return y > 0 ? `translate3d(0, ${-y}px, 0)` : undefined;
}

/** 合并纵向页偏移与翻页动画 transform（仅用于非 cover 栈式 outgoing） */
export function mergePagedContentTransforms(
  pageStartPx: number,
  ...extras: (string | undefined)[]
): string | undefined {
  const parts = [readerPagedContentOffsetTransform(pageStartPx), ...extras].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

/** idle 首屏：y=0 时也保留 translate3d，促发 overflow 裁切区合成层绘制 */
export function readerPagedIdleContentTransform(
  pageStartPx: number,
  ...extras: (string | undefined)[]
): string {
  return mergePagedContentTransforms(pageStartPx, ...extras) ?? 'translate3d(0, 0, 0)';
}

/** 滑动翻页：outgoing 横向位移（px；next 为负） */
export function readerPagedSlideTurnOffsetPx(
  dir: PagedTurnDirection,
  spanWidthPx: number,
  options: { progressRatio?: number; dragOffsetPx?: number },
): number {
  if (options.dragOffsetPx != null) return options.dragOffsetPx;
  const span = Math.max(0, spanWidthPx);
  const p = Math.max(0, Math.min(1, options.progressRatio ?? 0));
  return (dir === 'next' ? -1 : 1) * p * span;
}

export function readerPagedSlideOutgoingTransform(offsetPx: number): string | undefined {
  if (offsetPx === 0) return undefined;
  return `translate3d(${Math.round(offsetPx)}px, 0, 0)`;
}

/** 滑动翻页：incoming 与 outgoing 并排，空出区域露出相邻页 */
export function readerPagedSlideIncomingTransform(
  dir: PagedTurnDirection,
  spanWidthPx: number,
  offsetPx: number,
): string | undefined {
  const span = Math.max(0, spanWidthPx);
  if (span <= 0) return undefined;
  const x = dir === 'next' ? span + offsetPx : offsetPx - span;
  return `translate3d(${Math.round(x)}px, 0, 0)`;
}

/**
 * 覆盖：底层新页固定，当前页横向移出（Legado CoverPageDelegate）
 * 滑动：请用 {@link readerPagedSlideOutgoingTransform} / {@link readerPagedSlideIncomingTransform}
 */
export function readerPagedLayerTransform(
  anim: TextViewerPageAnim,
  role: 'outgoing' | 'incoming',
  dir: PagedTurnDirection,
  progress: number,
): string | undefined {
  const p = Math.max(0, Math.min(1, progress));
  const sign = dir === 'next' ? -1 : 1;

  if (anim === 'none' || anim === 'slide') return undefined;

  if (anim === 'simulation') {
    if (role === 'outgoing') {
      const deg = (dir === 'next' ? -1 : 1) * p * 85;
      return `perspective(1200px) rotateY(${deg}deg)`;
    }
    const deg = (dir === 'next' ? 1 : -1) * (1 - p) * 85;
    return `perspective(1200px) rotateY(${deg}deg)`;
  }

  // cover
  if (role === 'outgoing') {
    return `translate3d(${sign * p * 100}%, 0, 0)`;
  }
  return undefined;
}

export function readerPagedIncomingZIndex(anim: TextViewerPageAnim): number {
  return anim === 'cover' ? 0 : 1;
}

export function readerPagedOutgoingZIndex(anim: TextViewerPageAnim): number {
  return anim === 'cover' ? 2 : 1;
}
