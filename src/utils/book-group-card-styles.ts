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
