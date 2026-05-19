/** 书架分组/书籍卡片按压态 class（对应 App.css .book-group-card-motion--pressed） */
export const BOOK_GROUP_CARD_PRESSED_CLASS = 'book-group-card-motion--pressed';

function clearPressed(target: EventTarget | null) {
  if (target instanceof HTMLElement) {
    target.classList.remove(BOOK_GROUP_CARD_PRESSED_CLASS);
  }
}

/**
 * 卡片按压缩放：仅左键按下进入按压态，任意键松开或指针离开即清除。
 * 避免右键触发 :active 后菜单弹出导致缩放卡住。
 */
export const bookGroupCardPressHandlers = {
  onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).classList.add(BOOK_GROUP_CARD_PRESSED_CLASS);
  },
  onMouseUp(e: MouseEvent) {
    clearPressed(e.currentTarget);
  },
  onMouseLeave(e: MouseEvent) {
    clearPressed(e.currentTarget);
  },
  onTouchStart(e: TouchEvent) {
    (e.currentTarget as HTMLElement).classList.add(BOOK_GROUP_CARD_PRESSED_CLASS);
  },
  onTouchEnd(e: TouchEvent) {
    clearPressed(e.currentTarget);
  },
  onTouchCancel(e: TouchEvent) {
    clearPressed(e.currentTarget);
  },
} as const;
