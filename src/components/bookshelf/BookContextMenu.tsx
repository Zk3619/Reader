/**
 * 书架书籍卡片右键 / 长按菜单
 */

import { createSignal, onCleanup, Show, type ParentProps } from 'solid-js';
import {
  AppContextMenu,
  AppContextMenuContent,
  AppContextMenuItem,
  AppContextMenuSeparator,
  AppContextMenuTrigger,
} from '@/components/shared/AppContextMenu';
import { bookGroupCardPressHandlers } from '@/lib/bookshelf/book-group-card-press';
import { findBookOrderIndex } from '@/lib/bookshelf/book-order';
import type { Book } from '@/types';

const DELETE_ITEM_CLASS =
  'text-destructive focus:bg-destructive/10 focus:text-destructive';

export type BookContextMenuActions = {
  onEdit: (book: Book) => void;
  onDelete: (book: Book) => void;
  onPinTop: (book: Book) => void;
  onPinBottom: (book: Book) => void;
};

export interface BookContextMenuContentProps {
  book: Book;
  /** 当前分组书籍列表（手动排序时的展示顺序） */
  orderedBooks: Book[];
  /** 书架布局为手动排序时显示置顶/置底 */
  manualSort: boolean;
  actions: BookContextMenuActions;
}

export function BookContextMenuContent(props: BookContextMenuContentProps) {
  const index = () => findBookOrderIndex(props.orderedBooks, props.book.bookUrl);
  const canPinTop = () => props.manualSort && index() > 0;
  const canPinBottom = () =>
    props.manualSort && index() >= 0 && index() < props.orderedBooks.length - 1;

  return (
    <AppContextMenuContent>
      <AppContextMenuItem onSelect={() => props.actions.onEdit(props.book)}>
        编辑
      </AppContextMenuItem>
      <Show when={props.manualSort}>
        <AppContextMenuItem
          disabled={!canPinTop()}
          onSelect={() => props.actions.onPinTop(props.book)}
        >
          置顶
        </AppContextMenuItem>
        <AppContextMenuItem
          disabled={!canPinBottom()}
          onSelect={() => props.actions.onPinBottom(props.book)}
        >
          置底
        </AppContextMenuItem>
      </Show>
      <AppContextMenuSeparator />
      <AppContextMenuItem
        class={DELETE_ITEM_CLASS}
        onSelect={() => props.actions.onDelete(props.book)}
      >
        删除
      </AppContextMenuItem>
    </AppContextMenuContent>
  );
}

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 10;

function useBookContextMenuLongPress() {
  const [triggerEl, setTriggerEl] = createSignal<HTMLElement | null>(null);
  let pressStartTime = 0;
  let pressStartX = 0;
  let pressStartY = 0;
  let hasMoved = false;
  let longPressTimer: number | null = null;
  let longPressTriggered = false;
  let contextMenuTriggered = false;

  const clearPressTimer = () => {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  const startPress = (clientX: number, clientY: number) => {
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

  const movePress = (clientX: number, clientY: number) => {
    if (pressStartTime === 0) return;
    const dist = Math.hypot(clientX - pressStartX, clientY - pressStartY);
    if (dist > MOVE_THRESHOLD) {
      hasMoved = true;
      clearPressTimer();
    }
  };

  const endPress = (clientX: number, clientY: number) => {
    clearPressTimer();
    const el = triggerEl();
    if (longPressTriggered && !hasMoved && el) {
      el.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
        }),
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

  onCleanup(clearPressTimer);

  const pointerProps = {
    onMouseDown: (e: MouseEvent) => {
      bookGroupCardPressHandlers.onMouseDown(e);
      if (e.button !== 0) return;
      startPress(e.clientX, e.clientY);
    },
    onMouseMove: (e: MouseEvent) => {
      movePress(e.clientX, e.clientY);
    },
    onMouseUp: (e: MouseEvent) => {
      bookGroupCardPressHandlers.onMouseUp(e);
      endPress(e.clientX, e.clientY);
    },
    onMouseLeave: (e: MouseEvent) => {
      bookGroupCardPressHandlers.onMouseLeave(e);
    },
    onTouchStart: (e: TouchEvent) => {
      bookGroupCardPressHandlers.onTouchStart(e);
      const t = e.touches[0];
      startPress(t.clientX, t.clientY);
    },
    onTouchMove: (e: TouchEvent) => {
      const t = e.touches[0];
      movePress(t.clientX, t.clientY);
    },
    onTouchEnd: (e: TouchEvent) => {
      bookGroupCardPressHandlers.onTouchEnd(e);
      const t = e.changedTouches[0];
      endPress(t.clientX, t.clientY);
    },
    onTouchCancel: (e: TouchEvent) => {
      bookGroupCardPressHandlers.onTouchCancel(e);
    },
  };

  return {
    setTriggerRef: (el: HTMLElement | null) => setTriggerEl(el),
    pointerProps,
    shouldPreventClick: () => contextMenuTriggered,
  };
}

export interface BookContextMenuProps extends ParentProps {
  book: Book;
  orderedBooks: Book[];
  manualSort: boolean;
  actions: BookContextMenuActions;
  class?: string;
  onOpenBook?: () => void;
}

export function BookContextMenu(props: BookContextMenuProps) {
  const longPress = useBookContextMenuLongPress();

  return (
    <AppContextMenu>
      <AppContextMenuTrigger
        as="div"
        class={props.class}
        ref={(el: HTMLElement | null) => longPress.setTriggerRef(el)}
        role="button"
        tabIndex={0}
        onClick={(e: MouseEvent) => {
          if (longPress.shouldPreventClick()) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          props.onOpenBook?.();
        }}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            props.onOpenBook?.();
          }
        }}
        {...longPress.pointerProps}
      >
        {props.children}
      </AppContextMenuTrigger>
      <BookContextMenuContent
        book={props.book}
        orderedBooks={props.orderedBooks}
        manualSort={props.manualSort}
        actions={props.actions}
      />
    </AppContextMenu>
  );
}
