import { Show, createMemo } from 'solid-js';
import { bookshelfLayoutStore } from '@/stores/bookshelf-layout';
import { updateTocQueueStore } from '@/lib/book-source/update-toc-queue';
import { cn } from '@/lib/utils';

const pendingUpdateBadgeClass =
  'inline-flex shrink-0 items-center justify-center rounded-full bg-red-500 text-center font-semibold leading-none tabular-nums text-white shadow-sm';

export function useBookshelfPendingUpdateCount() {
  return createMemo(() => {
    if (!bookshelfLayoutStore.settings.showPendingUpdateCount) return 0;
    return updateTocQueueStore.totalCount;
  });
}

export type BookshelfPendingUpdateBadgeVariant =
  | 'default'
  /** 侧栏收起：1–9 显示数字，≥10 仅红点 */
  | 'sidebar-collapsed';

export function BookshelfPendingUpdateNavBadge(props: {
  class?: string;
  variant?: BookshelfPendingUpdateBadgeVariant;
}) {
  const count = useBookshelfPendingUpdateCount();
  const variant = () => props.variant ?? 'default';

  const label = () => `${count()} 本正在排队或更新目录`;
  const showText = () => {
    const n = count();
    if (n <= 0) return false;
    if (variant() === 'sidebar-collapsed') return n < 10;
    return true;
  };
  const text = () => {
    const n = count();
    if (variant() === 'sidebar-collapsed' && n >= 10) return '';
    return String(n);
  };

  return (
    <Show when={count() > 0}>
      <span
        class={cn(
          pendingUpdateBadgeClass,
          variant() === 'sidebar-collapsed'
            ? showText()
              ? 'min-h-4 min-w-4 px-1 py-px text-[10px]'
              : 'h-2 w-2 min-h-2 min-w-2 p-0'
            : 'min-h-4 min-w-4 px-1 py-px text-[10px]',
          props.class,
        )}
        aria-label={label()}
        title={label()}
      >
        <Show when={showText()}>{text()}</Show>
      </span>
    </Show>
  );
}
