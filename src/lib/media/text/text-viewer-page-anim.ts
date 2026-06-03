import type { TextViewerPageAnim } from '@/lib/media/text/reader-ui-config';

/** 与 Legado PageAnim 顺序对应的翻页方式 */
export const TEXT_VIEWER_PAGE_ANIM_OPTIONS: TextViewerPageAnim[] = [
  'scroll',
  'cover',
  'linkedCover',
  'slide',
  'simulation',
  'none',
];

export const TEXT_VIEWER_PAGE_ANIM_LABELS: Record<TextViewerPageAnim, string> = {
  scroll: '滚动',
  cover: '覆盖',
  linkedCover: '关联覆盖',
  slide: '滑动',
  simulation: '仿真',
  none: '无动画',
};

export function isTextViewerPagedAnim(anim: TextViewerPageAnim): boolean {
  return anim !== 'scroll';
}

export function normalizeTextViewerPageAnim(value: string | undefined | null): TextViewerPageAnim {
  if (
    value === 'scroll' ||
    value === 'cover' ||
    value === 'linkedCover' ||
    value === 'slide' ||
    value === 'simulation' ||
    value === 'none'
  ) {
    return value;
  }
  return 'scroll';
}
