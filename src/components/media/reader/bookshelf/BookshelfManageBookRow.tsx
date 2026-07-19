/**
 * 书架管理列表行：按 bookUrl 订阅 books，分组等字段变更时仅本行更新
 */

import { Show, createMemo, type Accessor } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AppContextMenu,
  AppContextMenuContent,
  AppContextMenuItem,
  AppContextMenuTrigger,
} from '@/components/shared/AppContextMenu';
import { BookCoverImg } from '@/components/media/reader/books/BookCoverImg';
import { BookCoverPreviewButton } from '@/components/media/reader/books/BookCoverPreviewButton';
import { BookCoverFallback } from '@/components/media/reader/books/BookCoverFallback';
import {
  bookshelfCompactCoverClass,
  bookshelfCompactListCardClass,
  bookshelfCompactMainClass,
  bookshelfRowSubtitleClass,
  bookshelfRowTitleClass,
} from '@/lib/bookshelf/book-group-card-styles';
import {
  formatBookshelfBookGroupNames,
  getBookshelfBookSourceName,
} from '@/lib/bookshelf/book-source-name';
import { cn } from '@/lib/utils';
import { sourcesStore } from '@/stores/sources';
import type { Book, BookGroup } from '@/types';

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 10;

function useLongPressContextMenu(triggerRef: () => HTMLElement | null) {
  let pressStartTime = 0;
  let pressStartX = 0;
  let pressStartY = 0;
  let hasMoved = false;
  let longPressTimer: number | null = null;
  let longPressTriggered = false;
  let contextMenuTriggered = false;

  const onPointerDown = (e: MouseEvent | TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
    if ('button' in e && (e as MouseEvent).button !== 0) return;
    pressStartTime = Date.now();
    pressStartX = clientX;
    pressStartY = clientY;
    hasMoved = false;
    longPressTriggered = false;
    contextMenuTriggered = false;
    longPressTimer = window.setTimeout(() => {
      if (!hasMoved) longPressTriggered = true;
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e: MouseEvent | TouchEvent) => {
    if (pressStartTime === 0) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
    const dist = Math.sqrt((clientX - pressStartX) ** 2 + (clientY - pressStartY) ** 2);
    if (dist > MOVE_THRESHOLD && longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (dist > MOVE_THRESHOLD) hasMoved = true;
  };

  const onPointerUp = (e: MouseEvent | TouchEvent) => {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    const el = triggerRef();
    if (longPressTriggered && !hasMoved && el) {
      const clientX =
        'changedTouches' in e ? (e as TouchEvent).changedTouches[0].clientX : (e as MouseEvent).clientX;
      const clientY =
        'changedTouches' in e ? (e as TouchEvent).changedTouches[0].clientY : (e as MouseEvent).clientY;
      el.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX, clientY }),
      );
      contextMenuTriggered = true;
      setTimeout(() => {
        contextMenuTriggered = false;
      }, 100);
    }
    pressStartTime = 0;
    hasMoved = false;
    longPressTriggered = false;
  };

  const shouldPreventClick = () => contextMenuTriggered;
  return { onPointerDown, onPointerMove, onPointerUp, shouldPreventClick };
}

export interface BookshelfManageBookRowProps {
  bookUrl: string;
  books: Accessor<readonly Book[]>;
  userGroups: Accessor<readonly BookGroup[]>;
  selectedBookUrls: Accessor<Set<string>>;
  coverClickPreview: Accessor<boolean>;
  openInfoByTitle: Accessor<boolean>;
  enableDragSort: Accessor<boolean>;
  onToggleSelection: (bookUrl: string, checked: boolean) => void;
  onRowClick: (bookUrl: string) => void;
  onTitleClick: (book: Book) => void;
  onEdit: (book: Book) => void;
  onGroupPick: (book: Book) => void;
  onDelete: (book: Book) => void;
  onCoverPreview: (book: Book) => void;
}

export function BookshelfManageBookRow(props: BookshelfManageBookRowProps) {
  const book = createMemo(
    () => props.books().find((entry) => entry.bookUrl === props.bookUrl),
  );

  let triggerEl: HTMLDivElement | null = null;
  const { onPointerDown, onPointerMove, onPointerUp, shouldPreventClick } =
    useLongPressContextMenu(() => triggerEl);

  const blockDragPointerProps = () =>
    props.enableDragSort()
      ? ({ onPointerDown: (e: PointerEvent) => e.stopPropagation() } as const)
      : ({} as const);

  return (
    <Show when={book()}>
      {(currentBook) => (
        <div class="box-border flex h-full min-h-0 items-stretch py-1">
          <AppContextMenu>
            <AppContextMenuTrigger
              as="div"
              ref={(el) => {
                triggerEl = el;
              }}
                class={cn(
                  bookshelfCompactListCardClass('h-16 select-none'),
                  'min-w-0 w-full cursor-pointer text-left',
                )}
                onMouseDown={onPointerDown}
                onMouseMove={onPointerMove}
                onMouseUp={onPointerUp}
                onTouchStart={onPointerDown}
                onTouchMove={onPointerMove}
                onTouchEnd={onPointerUp}
                onClick={(e: MouseEvent) => {
                  if (shouldPreventClick()) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  props.onRowClick(currentBook().bookUrl);
                }}
              >
                <div
                  class="flex h-full shrink-0 items-center"
                  onClick={(e) => e.stopPropagation()}
                  {...blockDragPointerProps()}
                  role="presentation"
                >
                  <Checkbox
                    checked={props.selectedBookUrls().has(currentBook().bookUrl)}
                    onChange={(checked: boolean) => {
                      props.onToggleSelection(currentBook().bookUrl, checked);
                    }}
                    aria-label={`选择 ${currentBook().name}`}
                  />
                </div>
                <Show
                  when={props.coverClickPreview()}
                  fallback={
                    <div
                      class={bookshelfCompactCoverClass()}
                      role="presentation"
                      onClick={(e) => e.stopPropagation()}
                      {...blockDragPointerProps()}
                    >
                      <BookCoverImg
                        src={currentBook().customCoverUrl || currentBook().coverUrl}
                        referer={currentBook().origin}
                        source={sourcesStore.getBookSource(currentBook().origin)}
                        bookUrl={currentBook().bookUrl}
                        alt=""
                        class="h-full w-full object-cover"
                        fallback={<BookCoverFallback class="h-6 w-6" />}
                      />
                    </div>
                  }
                >
                  <BookCoverPreviewButton
                    class={bookshelfCompactCoverClass()}
                    {...blockDragPointerProps()}
                    coverUrl={currentBook().coverUrl}
                    customCoverUrl={currentBook().customCoverUrl}
                    bookUrl={currentBook().bookUrl}
                    origin={currentBook().origin}
                    source={sourcesStore.getBookSource(currentBook().origin)}
                    name={currentBook().name}
                    onPreview={() => props.onCoverPreview(currentBook())}
                    fallback={<BookCoverFallback class="h-6 w-6" />}
                  />
                </Show>
                <div class={bookshelfCompactMainClass()}>
                  <div class="flex min-w-0 items-center gap-1 overflow-hidden">
                    <Show
                      when={props.openInfoByTitle()}
                      fallback={
                        <span class={bookshelfRowTitleClass(true, 'min-w-0')}>
                          {currentBook().name}
                        </span>
                      }
                    >
                      <button
                        type="button"
                        class={cn(
                          bookshelfRowTitleClass(true, 'min-w-0 shrink text-left'),
                          'hover:underline',
                        )}
                        onClick={(e: MouseEvent) => {
                          e.stopPropagation();
                          props.onTitleClick(currentBook());
                        }}
                      >
                        {currentBook().name}
                      </button>
                    </Show>
                    <Show when={currentBook().author}>
                      <span class="shrink-0 text-xs text-muted-foreground/70"> · </span>
                      <span class={cn(bookshelfRowSubtitleClass(true), 'min-w-0')}>
                        {currentBook().author}
                      </span>
                    </Show>
                  </div>
                  <p class={bookshelfRowSubtitleClass(true, 'm-0 min-w-0')}>
                    来源：{getBookshelfBookSourceName(currentBook()) || '—'}
                  </p>
                  <p class={bookshelfRowSubtitleClass(true, 'm-0 min-w-0')}>
                    分组：{formatBookshelfBookGroupNames(currentBook(), props.userGroups())}
                  </p>
                </div>
                <div
                  class="flex h-full shrink-0 items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                  {...blockDragPointerProps()}
                  role="presentation"
                >
                  <Button
                    variant="default"
                    size="sm"
                    type="button"
                    onClick={() => props.onEdit(currentBook())}
                  >
                    编辑
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => props.onGroupPick(currentBook())}
                  >
                    分组
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    type="button"
                    onClick={() => props.onDelete(currentBook())}
                  >
                    删除
                  </Button>
                </div>
              </AppContextMenuTrigger>
              <AppContextMenuContent>
                <AppContextMenuItem onSelect={() => props.onEdit(currentBook())}>
                  编辑
                </AppContextMenuItem>
                <AppContextMenuItem onSelect={() => props.onGroupPick(currentBook())}>
                  分组
                </AppContextMenuItem>
                <AppContextMenuItem
                  class="text-destructive focus:text-destructive"
                  onSelect={() => props.onDelete(currentBook())}
                >
                  删除
                </AppContextMenuItem>
              </AppContextMenuContent>
            </AppContextMenu>
          </div>
        )}
    </Show>
  );
}
