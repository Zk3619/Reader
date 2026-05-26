import { cn } from '@/lib/utils';
import { getBookshelfListColumnLayout } from '@/lib/bookshelf/bookshelf-view-mode';

function bookshelfListIntroResponsiveClasses(mode: string, display: 'flex' | 'block') {
  const cols = getBookshelfListColumnLayout(mode);
  const base =
    'h-full min-h-0 min-w-0 overflow-hidden border-l border-border/40 pl-3';
  if (display === 'flex') {
    if (cols === 3) {
      return `${base} hidden shrink-0 2xl:flex 2xl:w-[38%] 2xl:max-w-[46%]`;
    }
    if (cols === 2) {
      return `${base} hidden shrink-0 lg:flex lg:w-[38%] lg:max-w-[46%]`;
    }
    return `${base} hidden shrink-0 sm:flex sm:w-[38%] sm:max-w-[46%]`;
  }
  if (cols === 3) return `${base} hidden 2xl:block`;
  if (cols === 2) return `${base} hidden lg:block`;
  return `${base} hidden sm:block`;
}

function bookshelfCompactRowGridClasses(mode: string) {
  const cols = getBookshelfListColumnLayout(mode);
  if (cols === 3) {
    return '2xl:grid 2xl:w-full 2xl:grid-cols-[3rem_7.75rem_minmax(0,1fr)] 2xl:gap-x-1.5';
  }
  if (cols === 2) {
    return 'lg:grid lg:w-full lg:grid-cols-[3rem_7.75rem_minmax(0,1fr)] lg:gap-x-1.5';
  }
  return 'sm:grid sm:w-full sm:grid-cols-[3rem_7.75rem_minmax(0,1fr)] sm:gap-x-1.5';
}

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

/** 书架列表卡片：固定高度，封面按 3:4 撑满左侧 */
export function bookshelfListCardClass(...extra: Parameters<typeof cn>) {
  return cn(
    '[contain-intrinsic-size:auto_7rem] [content-visibility:auto] book-group-card-motion relative flex h-28 w-full cursor-pointer items-stretch gap-3 overflow-hidden rounded-xl border border-border/50 bg-card p-2',
    'hover:border-primary/50 hover:bg-transparent',
    BOOK_GROUP_CARD_HOVER_ELEVATION,
    ...extra,
  );
}

/** 书架紧凑列表卡片 */
export function bookshelfCompactListCardClass(...extra: Parameters<typeof cn>) {
  return cn(
    '[contain-intrinsic-size:auto_4.5rem] [content-visibility:auto] book-group-card-motion relative flex h-[4.5rem] w-full cursor-pointer items-stretch gap-2 overflow-hidden rounded-lg border border-border/50 bg-card p-1',
    'hover:border-primary/50 hover:bg-accent/50',
    BOOK_GROUP_CARD_HOVER_ELEVATION,
    ...extra,
  );
}

/** 书架列表封面：高度占满项、固定 3:4 */
export function bookshelfListCoverClass(...extra: Parameters<typeof cn>) {
  return cn(
    'book-group-card-cover-motion book-group-card-cover-motion--list',
    'flex h-full w-auto shrink-0 self-stretch aspect-3/4 items-center justify-center overflow-hidden rounded-md bg-muted/50',
    ...extra,
  );
}

/** 紧凑列表行：窄时 flex；达简介断点后固定列宽网格，保证分界线与未读徽标纵向对齐 */
export function bookshelfCompactRowClass(
  viewMode: string,
  hasIntro?: boolean,
  ...extra: Parameters<typeof cn>
) {
  return cn(
    'flex min-w-0 flex-1 items-stretch gap-1.5 overflow-hidden',
    hasIntro && bookshelfCompactRowGridClasses(viewMode),
    ...extra,
  );
}

/** 紧凑列表主信息列（grid 第 2 列固定 7.75rem；flex 单列时 flex-1 占满封面右侧） */
export function bookshelfCompactMainClass(...extra: Parameters<typeof cn>) {
  return cn(
    'flex h-full min-h-0 min-w-0 flex-1 flex-col justify-center gap-0.5 overflow-hidden text-left',
    ...extra,
  );
}

/** 紧凑列表简介列（grid 第 3 列，占满剩余宽度） */
export function bookshelfCompactIntroColumnClass(
  viewMode: string,
  ...extra: Parameters<typeof cn>
) {
  return cn(bookshelfListIntroResponsiveClasses(viewMode, 'block'), ...extra);
}

/** 书架列表主信息区（封面右侧：书名/作者/章节/未读） */
export function bookshelfListMainClass(compact?: boolean, ...extra: Parameters<typeof cn>) {
  return cn(
    'flex h-full min-h-0 min-w-0 flex-col justify-center gap-0.5 overflow-hidden text-left',
    compact ? 'min-w-0 flex-1' : 'flex-1',
    ...extra,
  );
}

/** 书架列表简介列（仅普通列表；紧凑列表用 bookshelfCompactIntroColumnClass） */
export function bookshelfListIntroColumnClass(
  viewMode: string,
  ...extra: Parameters<typeof cn>
) {
  return cn(bookshelfListIntroResponsiveClasses(viewMode, 'flex'), ...extra);
}

/** 发现页书籍列表卡片（固定高度，与书架列表卡片共用抬升/阴影动效） */
export function exploreBookListCardClass(...extra: Parameters<typeof cn>) {
  return cn(
    'book-group-card-motion group relative flex h-44 w-full cursor-pointer items-stretch gap-3 overflow-hidden rounded-xl border border-border/50 bg-card p-3 text-left',
    'hover:border-primary/50 hover:bg-transparent',
    BOOK_GROUP_CARD_HOVER_ELEVATION,
    ...extra,
  );
}

/** 发现页列表封面：按 3:4 比例撑满卡片左侧高度 */
export function exploreBookListCoverClass(...extra: Parameters<typeof cn>) {
  return cn(
    'book-group-card-cover-motion book-group-card-cover-motion--list',
    'flex h-full w-auto shrink-0 self-stretch aspect-3/4 items-center justify-center overflow-hidden rounded-md bg-muted/50',
    ...extra,
  );
}

/** 发现页卡片右侧信息区 */
export function exploreBookListBodyClass(...extra: Parameters<typeof cn>) {
  return cn('flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-hidden', ...extra);
}

/** 徽章行：单行，不换行；子项需配合 min-w-0 / shrink 才能正确 truncate */
export function exploreBookListBadgeRowClass(...extra: Parameters<typeof cn>) {
  return cn('flex h-5 min-w-0 shrink-0 flex-nowrap items-center gap-1.5 overflow-hidden', ...extra);
}

/** 非末尾徽标：限制最大宽度并在内部省略 */
export function exploreBookListBadgeClass(...extra: Parameters<typeof cn>) {
  return cn(
    'min-w-0 max-w-[7rem] shrink-0 overflow-hidden whitespace-nowrap text-ellipsis text-[10px] px-1.5 py-0 font-normal',
    ...extra,
  );
}

/** 行末徽标（非 ···）：仅在空间不足时收缩并省略，不主动占满剩余空间 */
export function exploreBookListBadgeLastClass(...extra: Parameters<typeof cn>) {
  return cn(
    'min-w-0 max-w-full shrink overflow-hidden whitespace-nowrap text-ellipsis text-[10px] px-1.5 py-0 font-normal',
    ...extra,
  );
}

/** 行末 ··· 徽标：不占满剩余宽度 */
export function exploreBookListBadgeEllipsisClass(...extra: Parameters<typeof cn>) {
  return cn('shrink-0 text-[10px] px-1.5 py-0 font-normal', ...extra);
}

/** 简介外层：占满书名/作者/章节/徽标之下的剩余纵向空间 */
export function exploreBookListIntroWrapClass(...extra: Parameters<typeof cn>) {
  return cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden', ...extra);
}

/** 简介正文：高度填满外层；行数由 --explore-intro-line-clamp（ResizeObserver）控制 */
export function exploreBookListIntroClass(...extra: Parameters<typeof cn>) {
  return cn(
    'explore-book-list-intro m-0 h-full min-h-0 min-w-0 text-xs leading-5 text-muted-foreground',
    ...extra,
  );
}

/** 书架列表简介正文（固定行高项，用 line-clamp 即可，无需 ResizeObserver） */
export function bookshelfListIntroTextClass(
  layout: 'list' | 'compact',
  ...extra: Parameters<typeof cn>
) {
  return cn(
    'm-0 max-h-full min-h-0 min-w-0 w-full wrap-break-word text-xs leading-5 text-muted-foreground',
    layout === 'compact' ? 'line-clamp-3' : 'line-clamp-4',
    ...extra,
  );
}

/** 发现页骨架屏分块脉冲（与真实卡片分区一致，避免整块 Skeleton 连成一片） */
export const exploreSkeletonPulseClass = 'shrink-0 rounded-md bg-muted/60 animate-pulse';
