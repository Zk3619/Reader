import { createEffect, createMemo, createSignal, For, onMount, Show } from 'solid-js';
import type { WebChapter } from '@/lib/api';

export function PopCatalog(props: {
  chapters: WebChapter[];
  currentIndex: number;
  open: boolean;
  themeFg?: string;
  onSelect: (index: number) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const [wide, setWide] = createSignal(window.innerWidth >= 776);
  let listRef: HTMLDivElement | undefined;

  onMount(() => {
    const onResize = () => setWide(window.innerWidth >= 776);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  const rows = createMemo(() => {
    const list = props.chapters;
    if (!wide()) return list.map((ch) => [ch] as WebChapter[]);
    const out: WebChapter[][] = [];
    for (let i = 0; i < list.length; i += 2) {
      out.push(list.slice(i, i + 2));
    }
    return out;
  });

  createEffect(() => {
    if (!props.open || !listRef) return;
    const el = listRef.querySelector(`[data-chapter-index="${props.currentIndex}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  return (
    <div class="reader-popover reader-catalog-popover" style={{ color: props.themeFg }} onClick={(e: MouseEvent) => e.stopPropagation()}>
      <div class="mb-2 flex items-center justify-between">
        <p class="text-sm font-medium">目录</p>
        <Show when={props.onRefresh}>
          <button
            type="button"
            class="text-xs opacity-70 hover:opacity-100"
            disabled={props.refreshing}
            onClick={() => props.onRefresh?.()}
          >
            {props.refreshing ? '刷新中…' : '刷新'}
          </button>
        </Show>
      </div>
      <div ref={listRef} class="reader-catalog-list max-h-[60vh] overflow-y-auto text-sm">
        <For each={rows()}>
          {(row) => (
            <div class={`reader-catalog-row ${wide() ? 'reader-catalog-row--dual' : ''}`}>
              <For each={row}>
                {(ch) => (
                  <button
                    type="button"
                    data-chapter-index={ch.index}
                    class={`reader-catalog-item ${props.currentIndex === ch.index ? 'is-active' : ''} ${ch.isVolume ? 'is-volume' : ''}`}
                    onClick={() => props.onSelect(ch.index)}
                  >
                    {ch.title}
                  </button>
                )}
              </For>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
