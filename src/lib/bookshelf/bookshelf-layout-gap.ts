import { createEffect, onCleanup, type Accessor } from 'solid-js';
import { bookshelfLayoutStore } from '@/stores/bookshelf-layout';

/** 书架列表/网格动态间距（由 bindBookshelfLayoutGap 写入 --bookshelf-layout-gap） */
export const BOOKSHELF_LAYOUT_GAP_CLASS = 'bookshelf-layout-gap';

/** @deprecated 使用 BOOKSHELF_LAYOUT_GAP_CLASS */
export const BOOKSHELF_GRID_GAP_CLASS = BOOKSHELF_LAYOUT_GAP_CLASS;

export function bookshelfLayoutGapToRem(spacing: number): string {
  return `${spacing * 0.25}rem`;
}

/** 将布局设置中的 spacing 绑定到容器，避免在 JSX 中使用内联 style */
export function bindBookshelfLayoutGap(container: Accessor<HTMLElement | null | undefined>) {
  createEffect(() => {
    const el = container();
    if (!el) {
      return;
    }
    const gap = bookshelfLayoutGapToRem(bookshelfLayoutStore.settings.spacing);
    el.style.setProperty('--bookshelf-layout-gap', gap);
    onCleanup(() => {
      el.style.removeProperty('--bookshelf-layout-gap');
    });
  });
}

/** @deprecated 使用 bindBookshelfLayoutGap */
export const bindBookshelfGridGap = bindBookshelfLayoutGap;
