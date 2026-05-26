import { Show } from 'solid-js';
import type { Book } from '@/types';
import { cn } from '@/lib/utils';
import {
  formatChapterIndexAndTitle,
  formatChapterIndexOnly,
  formatLatestChapterTimeAgo,
  formatUnreadBadgeCount,
  getBookshelfReadingBadgeState,
  getBookshelfUnreadBadgeCount,
  getLatestChapterDisplayIndex,
  getReadingChapterDisplayIndex,
  hasBookshelfChapterUpdate,
  shouldShowBookshelfLastUpdateTime,
  shouldShowBookshelfUnreadBadge,
} from '@/lib/bookshelf/book-reading-progress';
import { BookshelfLatestChapterIcon, BookshelfReadProgressIcon } from '@/components/shared/icons';

const metaIconClass = 'size-3.5 shrink-0 text-muted-foreground';
const metaLineClass = 'flex min-w-0 items-center gap-1 text-xs leading-snug text-muted-foreground';
const metaLabelClass = 'shrink-0';

const unreadBadgeBaseClass =
  'shrink-0 min-w-5 max-w-full rounded-md px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none tabular-nums text-white shadow-sm';

const lastUpdateBadgeBaseClass =
  'shrink-0 max-w-full rounded-md border border-border/50 bg-muted/70 px-1.5 py-0.5 text-center text-[10px] font-medium leading-none tabular-nums text-muted-foreground';

function unreadBadgeHighlightClass(highlight: boolean) {
  return highlight ? 'bg-green-600/85' : 'bg-zinc-500/80';
}

function unreadBadgeStateClass(book: Book) {
  const state = getBookshelfReadingBadgeState(book);
  if (state === 'unread') return 'bg-red-500/85';
  return unreadBadgeHighlightClass(hasBookshelfChapterUpdate(book));
}

function BookShelfUnreadCountBadge(props: { book: Book; class?: string }) {
  const count = () => getBookshelfUnreadBadgeCount(props.book);

  return (
    <Show when={shouldShowBookshelfUnreadBadge(props.book)}>
      <span
        class={cn(unreadBadgeBaseClass, unreadBadgeStateClass(props.book), props.class)}
      >
        {formatUnreadBadgeCount(count())}
      </span>
    </Show>
  );
}

function MetaIconRow(props: { icon: typeof BookshelfLatestChapterIcon; label: string; text: string }) {
  const Icon = props.icon;
  return (
    <div class={metaLineClass}>
      <Icon class={metaIconClass} size={14} />
      <span class={metaLabelClass}>{props.label}</span>
      <span class="min-w-0 truncate">{props.text}</span>
    </div>
  );
}

/** 列表 / 紧凑列表：标题旁数字徽标（受 showUnreadFlag 控制） */
export function BookShelfListUnreadBadge(props: { book: Book }) {
  return <BookShelfUnreadCountBadge book={props.book} />;
}

/** 最新章节更新时间灰色徽标 */
export function BookShelfLastUpdateBadge(props: { book: Book; class?: string }) {
  const label = () => formatLatestChapterTimeAgo(props.book.latestChapterTime);

  return (
    <Show when={label()}>
      <span class={cn(lastUpdateBadgeBaseClass, props.class)}>{label()}</span>
    </Show>
  );
}

/** 列表 / 紧凑：右侧徽标列（未读在上，更新时间在下） */
export function BookShelfListBadgeColumn(props: {
  book: Book;
  showUnreadFlag: boolean;
  showLastUpdateTime: boolean;
}) {
  const showLast = () =>
    shouldShowBookshelfLastUpdateTime(props.book, props.showLastUpdateTime);
  const showColumn = () =>
    (props.showUnreadFlag && shouldShowBookshelfUnreadBadge(props.book)) || showLast();

  return (
    <Show when={showColumn()}>
      <div class="flex shrink-0 flex-col items-end gap-0.5 self-start">
        <Show when={props.showUnreadFlag}>
          <BookShelfListUnreadBadge book={props.book} />
        </Show>
        <Show when={showLast()}>
          <BookShelfLastUpdateBadge book={props.book} />
        </Show>
      </div>
    </Show>
  );
}

/** 列表视图：作者下方两行（最新章节 / 最近阅读），始终显示 */
export function BookShelfListReadingMeta(props: { book: Book }) {
  const latestText = () =>
    formatChapterIndexAndTitle(
      getLatestChapterDisplayIndex(props.book),
      props.book.latestChapterTitle,
    );
  const readText = () =>
    formatChapterIndexAndTitle(
      getReadingChapterDisplayIndex(props.book),
      props.book.durChapterTitle,
    );

  return (
    <div class="mt-0.5 flex w-full min-w-0 flex-col gap-0.5 overflow-hidden">
      <MetaIconRow icon={BookshelfLatestChapterIcon} label="最新章节：" text={latestText()} />
      <MetaIconRow icon={BookshelfReadProgressIcon} label="最近阅读：" text={readText()} />
    </div>
  );
}

/** 紧凑列表：最新章节与最近阅读分居两侧 */
export function BookShelfCompactReadingMeta(props: { book: Book }) {
  return (
    <div class="mt-0.5 flex min-w-0 w-full items-center justify-between gap-2">
      <div class={cn(metaLineClass, 'min-w-0 flex-1')}>
        <BookshelfLatestChapterIcon class={metaIconClass} size={14} />
        <span class="min-w-0 truncate tabular-nums">
          {formatChapterIndexOnly(getLatestChapterDisplayIndex(props.book))}
        </span>
      </div>
      <div class={cn(metaLineClass, 'min-w-0 flex-1 justify-end')}>
        <BookshelfReadProgressIcon class={metaIconClass} size={14} />
        <span class="min-w-0 truncate tabular-nums">
          {formatChapterIndexOnly(getReadingChapterDisplayIndex(props.book))}
        </span>
      </div>
    </div>
  );
}

/** 网格封面右上角徽标（受 showUnreadFlag 控制） */
export function BookShelfGridUnreadBadge(props: { book: Book }) {
  return (
    <BookShelfUnreadCountBadge
      book={props.book}
      class="pointer-events-none absolute top-1 right-1 z-10"
    />
  );
}

/** 网格封面左上角：上次更新时间 */
export function BookShelfGridLastUpdateBadge(props: {
  book: Book;
  showLastUpdateTime: boolean;
}) {
  return (
    <Show when={shouldShowBookshelfLastUpdateTime(props.book, props.showLastUpdateTime)}>
      <BookShelfLastUpdateBadge
        book={props.book}
        class="pointer-events-none absolute top-1 left-1 z-10"
      />
    </Show>
  );
}
