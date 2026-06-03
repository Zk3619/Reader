import type { TextViewerPageAnim } from '@/lib/media/text/reader-ui-config';

export type PagedTurnDirection = 'next' | 'prev';

/** 按页阅读：单页窗口内正文纵向偏移 */
export function readerPagedContentOffsetStyle(pageStartPx: number): Record<string, string> {
  return { transform: `translate3d(0, ${-pageStartPx}px, 0)` };
}

/**
 * 覆盖：底层新页固定，当前页横向移出（Legado CoverPageDelegate）
 * 滑动：当前页与下一页并排平移（Legado SlidePageDelegate）
 * 关联覆盖：新页先露约 20% 并带遮罩（Legado LinkedCoverPageDelegate）
 */
export function readerPagedLayerTransform(
  anim: TextViewerPageAnim,
  role: 'outgoing' | 'incoming',
  dir: PagedTurnDirection,
  progress: number,
): string | undefined {
  const p = Math.max(0, Math.min(1, progress));
  const sign = dir === 'next' ? -1 : 1;

  if (anim === 'none') return undefined;

  if (anim === 'slide') {
    if (role === 'outgoing') {
      return `translate3d(${dir === 'next' ? -p * 100 : p * 100}%, 0, 0)`;
    }
    return dir === 'next'
      ? `translate3d(${(1 - p) * 100}%, 0, 0)`
      : `translate3d(${-(1 - p) * 100}%, 0, 0)`;
  }

  if (anim === 'simulation') {
    if (role === 'outgoing') {
      const deg = (dir === 'next' ? -1 : 1) * p * 85;
      return `perspective(1200px) rotateY(${deg}deg)`;
    }
    const deg = (dir === 'next' ? 1 : -1) * (1 - p) * 85;
    return `perspective(1200px) rotateY(${deg}deg)`;
  }

  if (anim === 'linkedCover') {
    if (role === 'incoming') {
      const peek = dir === 'next' ? 20 * (1 - p) : -20 * (1 - p);
      return `translate3d(${peek}%, 0, 0)`;
    }
    return `translate3d(${sign * p * 100}%, 0, 0)`;
  }

  // cover
  if (role === 'outgoing') {
    return `translate3d(${sign * p * 100}%, 0, 0)`;
  }
  return undefined;
}

export function readerPagedIncomingZIndex(anim: TextViewerPageAnim): number {
  return anim === 'cover' || anim === 'linkedCover' ? 0 : 1;
}

export function readerPagedOutgoingZIndex(anim: TextViewerPageAnim): number {
  return anim === 'cover' || anim === 'linkedCover' ? 2 : 1;
}
