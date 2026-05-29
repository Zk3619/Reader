import { createSignal, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';
import {
  bindBookshelfLayoutGap,
  BOOKSHELF_LAYOUT_GAP_CLASS,
} from '@/lib/bookshelf/bookshelf-layout-gap';

/** 书架列表/网格容器：应用动态间距 CSS 变量 */
export function BookshelfLayoutGrid(props: {
  class?: string;
  ref?: (el: HTMLDivElement) => void;
  children: JSX.Element;
}) {
  const [containerRef, setContainerRef] = createSignal<HTMLDivElement | null>(null);
  bindBookshelfLayoutGap(containerRef);

  return (
    <div
      ref={(el) => {
        setContainerRef(el);
        props.ref?.(el);
      }}
      class={cn('grid p-1', BOOKSHELF_LAYOUT_GAP_CLASS, props.class)}
    >
      {props.children}
    </div>
  );
}
