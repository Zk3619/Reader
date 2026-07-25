/**
 * 歌手 / 专辑大数据分页条：首尾页、省略号、当前窗口与页码跳转。
 */

import { For, Show, createEffect, createMemo, createSignal, type Component } from 'solid-js';
import { AppNumberField } from '@/components/shared/AppNumberField';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type PageToken = number | 'ellipsis';

export interface MusicDiscoverPaginationProps {
  page: number;
  count: number;
  disabled?: boolean;
  totalKnown: boolean;
  onPageChange: (page: number) => void;
  class?: string;
}

function clampPage(value: number, count: number): number {
  return Math.max(1, Math.min(Math.max(1, count), Math.floor(value)));
}

function pageTokens(page: number, count: number, totalKnown: boolean): PageToken[] {
  if (!totalKnown) {
    return Array.from({ length: count }, (_, index) => index + 1);
  }
  if (count <= 7) {
    return Array.from({ length: count }, (_, index) => index + 1);
  }
  // 前段始终露出下一页（如第 4 页可见 5），避免只能点「下一页」
  if (page <= 4) return [1, 2, 3, 4, 5, 'ellipsis', count];
  // 后段始终露出上一页
  if (page >= count - 3) {
    return [1, 'ellipsis', count - 4, count - 3, count - 2, count - 1, count];
  }
  // 中间：1 ... (p-1) p (p+1) ... n
  return [1, 'ellipsis', page - 1, page, page + 1, 'ellipsis', count];
}

export const MusicDiscoverPagination: Component<MusicDiscoverPaginationProps> = (props) => {
  const [jumpPage, setJumpPage] = createSignal(props.page);
  const tokens = createMemo(() =>
    pageTokens(clampPage(props.page, props.count), Math.max(1, props.count), props.totalKnown),
  );

  createEffect(() => {
    setJumpPage(props.page);
  });

  const jump = () => {
    const next = clampPage(jumpPage(), props.count);
    setJumpPage(next);
    if (next !== props.page) props.onPageChange(next);
  };

  return (
    <div
      class={cn(
        'flex flex-wrap items-center justify-center gap-1 py-3',
        props.class,
      )}
      aria-label="分页导航"
    >
      <Button
        type="button"
        variant="ghost"
        class="h-10 px-2.5"
        disabled={props.disabled || props.page <= 1}
        onClick={() => props.onPageChange(props.page - 1)}
      >
        上一页
      </Button>

      <For each={tokens()}>
        {(token) => (
          <Show
            when={token !== 'ellipsis'}
            fallback={
              <span class="flex size-10 items-center justify-center" aria-hidden>
                …
              </span>
            }
          >
            <Button
              type="button"
              variant="ghost"
              class={cn('size-10 p-0', token === props.page && 'border')}
              disabled={props.disabled}
              aria-current={token === props.page ? 'page' : undefined}
              aria-label={`第 ${token as number} 页`}
              onClick={() => props.onPageChange(token as number)}
            >
              {token}
            </Button>
          </Show>
        )}
      </For>

      <Button
        type="button"
        variant="ghost"
        class="h-10 px-2.5"
        disabled={props.disabled || props.page >= props.count}
        onClick={() => props.onPageChange(props.page + 1)}
      >
        下一页
      </Button>

      <Show when={props.totalKnown}>
        <form
          class="ml-1 flex items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            jump();
          }}
        >
          <AppNumberField
            value={jumpPage()}
            onValueChange={setJumpPage}
            min={1}
            max={Math.max(1, props.count)}
            step={1}
            size="sm"
            disabled={props.disabled}
            class="w-20 shrink-0"
            inputClass="px-2 text-center"
            normalize={(value) => Math.floor(value)}
            aria-label={`页码，范围 1 到 ${props.count}`}
          />
          <Button type="submit" variant="outline" size="sm" disabled={props.disabled}>
            跳转
          </Button>
        </form>
      </Show>
    </div>
  );
};
