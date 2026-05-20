import { cn } from '@/lib/utils';

/** 悬停抬升阴影（与 App.css .book-group-card-motion 位移同步） */
export const BOOK_GROUP_CARD_HOVER_ELEVATION =
  'shadow-none hover:shadow-[0_6px_18px_-6px_rgb(0_0_0/0.1)] dark:hover:shadow-[0_6px_18px_-6px_rgb(255_255_255/0.12)]';

const BOOK_GROUP_CARD_FOCUS_ELEVATION =
  'focus-within:shadow-[0_6px_18px_-6px_rgb(0_0_0/0.1)] dark:focus-within:shadow-[0_6px_18px_-6px_rgb(255_255_255/0.12)]';

/** 书架分组列表卡片（div / ContextMenuTrigger，与 BookGroup 列表视图一致） */
export function bookGroupListCardClass(...extra: Parameters<typeof cn>) {
  return cn(
    'book-group-card-motion relative flex items-center gap-4 rounded-xl border border-border/50 bg-card',
    'hover:border-primary/50 hover:bg-transparent',
    'focus-within:border-primary/50',
    BOOK_GROUP_CARD_HOVER_ELEVATION,
    BOOK_GROUP_CARD_FOCUS_ELEVATION,
    ...extra,
  );
}

/** 分组列表封面容器 */
export function bookGroupListCoverClass(...extra: Parameters<typeof cn>) {
  return cn(
    'book-group-card-cover-motion book-group-card-cover-motion--list',
    'flex h-20 aspect-3/4 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/50',
    ...extra,
  );
}

/** 书架分组紧凑列表卡片（与 BookGroup compact 视图一致） */
export function bookGroupCompactCardClass(...extra: Parameters<typeof cn>) {
  return cn(
    'book-group-card-motion relative flex items-center gap-3 rounded-lg border border-border/50 bg-card px-3 py-2',
    'hover:border-primary/50 hover:bg-accent/50',
    'focus-within:border-primary/50',
    BOOK_GROUP_CARD_HOVER_ELEVATION,
    BOOK_GROUP_CARD_FOCUS_ELEVATION,
    ...extra,
  );
}

/** 紧凑列表封面容器 */
export function bookGroupCompactCoverClass(...extra: Parameters<typeof cn>) {
  return cn(
    'book-group-card-cover-motion book-group-card-cover-motion--list',
    'flex h-14 aspect-3/4 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted/50',
    ...extra,
  );
}

/** 发现页书籍列表卡片（固定高度，与书架列表卡片共用抬升/阴影动效） */
export function discoverBookListCardClass(...extra: Parameters<typeof cn>) {
  return cn(
    'book-group-card-motion group relative flex h-44 w-full cursor-pointer items-stretch gap-3 overflow-hidden rounded-xl border border-border/50 bg-card p-3 text-left',
    'hover:border-primary/50 hover:bg-transparent',
    BOOK_GROUP_CARD_HOVER_ELEVATION,
    ...extra,
  );
}

/** 发现页列表封面：按 3:4 比例撑满卡片左侧高度 */
export function discoverBookListCoverClass(...extra: Parameters<typeof cn>) {
  return cn(
    'book-group-card-cover-motion book-group-card-cover-motion--list',
    'flex h-full w-auto shrink-0 self-stretch aspect-3/4 items-center justify-center overflow-hidden rounded-md bg-muted/50',
    ...extra,
  );
}

/** 发现页卡片右侧信息区 */
export function discoverBookListBodyClass(...extra: Parameters<typeof cn>) {
  return cn('flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-hidden', ...extra);
}

/** 徽章行：单行，不换行；子项需配合 min-w-0 / shrink 才能正确 truncate */
export function discoverBookListBadgeRowClass(...extra: Parameters<typeof cn>) {
  return cn('flex h-5 min-w-0 shrink-0 flex-nowrap items-center gap-1.5 overflow-hidden', ...extra);
}

/** 非末尾徽标：限制最大宽度并在内部省略 */
export function discoverBookListBadgeClass(...extra: Parameters<typeof cn>) {
  return cn(
    'min-w-0 max-w-[7rem] shrink-0 overflow-hidden whitespace-nowrap text-ellipsis text-[10px] px-1.5 py-0 font-normal',
    ...extra,
  );
}

/** 行末徽标（非 ···）：仅在空间不足时收缩并省略，不主动占满剩余空间 */
export function discoverBookListBadgeLastClass(...extra: Parameters<typeof cn>) {
  return cn(
    'min-w-0 max-w-full shrink overflow-hidden whitespace-nowrap text-ellipsis text-[10px] px-1.5 py-0 font-normal',
    ...extra,
  );
}

/** 行末 ··· 徽标：不占满剩余宽度 */
export function discoverBookListBadgeEllipsisClass(...extra: Parameters<typeof cn>) {
  return cn('shrink-0 text-[10px] px-1.5 py-0 font-normal', ...extra);
}

/** 简介外层：占满书名/作者/章节/徽标之下的剩余纵向空间 */
export function discoverBookListIntroWrapClass(...extra: Parameters<typeof cn>) {
  return cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden', ...extra);
}

/** 简介正文：高度填满外层；行数由 --discover-intro-line-clamp（ResizeObserver）控制 */
export function discoverBookListIntroClass(...extra: Parameters<typeof cn>) {
  return cn(
    'discover-book-list-intro m-0 h-full min-h-0 min-w-0 text-xs leading-5 text-muted-foreground',
    ...extra,
  );
}

/** 发现页骨架屏分块脉冲（与真实卡片分区一致，避免整块 Skeleton 连成一片） */
export const discoverSkeletonPulseClass = 'shrink-0 rounded-md bg-muted/60 animate-pulse';
