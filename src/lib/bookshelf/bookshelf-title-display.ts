import type { BookTitleDisplay } from '@/stores/bookshelf-layout';

/** 书名/分组名显示设置仅对网格卡片生效；列表与紧凑列表始终按「显示」处理 */
export function getEffectiveTitleDisplay(
  layout: 'list' | 'compact' | 'grid',
  titleDisplay: BookTitleDisplay,
): BookTitleDisplay {
  return layout === 'grid' ? titleDisplay : 'show';
}

export const bookshelfCoverTitleOverlayClass =
  'pointer-events-none absolute inset-x-0 bottom-0 flex min-h-12 items-center justify-center rounded-b-lg bg-linear-to-t from-black/50 via-black/25 to-transparent px-2 py-2';

const coverTitleOverlayTextShadow =
  '[text-shadow:0_1px_2px_rgb(0_0_0/0.55),0_0_6px_rgb(0_0_0/0.35)]';

export const bookshelfCoverTitleOverlayTextClass =
  `m-0 w-full truncate text-center text-xs font-semibold leading-tight text-white ${coverTitleOverlayTextShadow}`;

export const bookshelfCoverTitleOverlaySubtitleClass =
  `m-0 w-full truncate text-center text-[10px] leading-tight text-white/90 ${coverTitleOverlayTextShadow}`;
