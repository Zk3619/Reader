/**
 * 搜索历史标签（对齐 Legado HistoryKeyAdapter）
 * - 点击：发起搜索
 * - 可删除时：长按破碎动画后删除（桌面端也可点关闭按钮删除）
 * - 移动端隐藏关闭按钮
 */

import { createSignal, Show, onCleanup } from 'solid-js';
import { XIcon } from '@/components/shared/icons';
import { explodeElement } from '@/lib/ui/element-explosion';
import { isMobile } from '@/lib/platform/detect';
import { settingsStore } from '@/stores/settings';
import { cn } from '@/lib/utils';
import type { SearchKeyword } from '@/types';

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 10;

export interface SearchHistoryChipProps {
  item: SearchKeyword;
  onSelect: (word: string) => void;
  /** 不传则不可删除（无关闭按钮、无长按删除），用于热搜等只读徽标 */
  onDelete?: (word: string) => void | Promise<void>;
  class?: string;
}

export function SearchHistoryChip(props: SearchHistoryChipProps) {
  let rootRef: HTMLSpanElement | undefined;
  const [deleting, setDeleting] = createSignal(false);

  let pressStartX = 0;
  let pressStartY = 0;
  let hasMoved = false;
  let longPressTimer: number | null = null;
  let longPressTriggered = false;
  let suppressNextClick = false;

  const deletable = () => typeof props.onDelete === 'function';

  const clearPressTimer = () => {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  onCleanup(() => clearPressTimer());

  const runDelete = async () => {
    if (!deletable() || deleting()) return;
    setDeleting(true);
    const el = rootRef;
    if (el) {
      await explodeElement(el, {
        reduceMotion: settingsStore.state.app.reduceMotion,
      });
    }
    await props.onDelete?.(props.item.word);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!deletable() || deleting() || e.button !== 0) return;
    pressStartX = e.clientX;
    pressStartY = e.clientY;
    hasMoved = false;
    longPressTriggered = false;
    clearPressTimer();
    longPressTimer = window.setTimeout(() => {
      if (!hasMoved) longPressTriggered = true;
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (longPressTimer === null) return;
    const dist = Math.hypot(e.clientX - pressStartX, e.clientY - pressStartY);
    if (dist > MOVE_THRESHOLD) {
      hasMoved = true;
      clearPressTimer();
    }
  };

  const onPointerUp = () => {
    clearPressTimer();
    if (longPressTriggered && !hasMoved) {
      suppressNextClick = true;
      void runDelete();
    }
    longPressTriggered = false;
    hasMoved = false;
  };

  const onPointerCancel = () => {
    clearPressTimer();
    longPressTriggered = false;
    hasMoved = false;
  };

  return (
    <span
      ref={rootRef}
      class={cn(
        'search-history-chip inline-flex max-w-full items-center gap-0.5 rounded-full border border-border/60',
        'bg-muted/30 text-sm text-foreground shadow-none transition-[color,background-color,border-color,box-shadow,transform]',
        'hover:border-primary/45 hover:bg-accent/55 hover:text-accent-foreground hover:shadow-sm',
        'active:scale-[0.97] active:border-primary/55 active:bg-accent/70',
        'touch-none select-none',
        deleting() && 'pointer-events-none',
        props.class,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <button
        type="button"
        class={cn(
          'min-w-0 truncate rounded-full py-1 pl-3 text-left text-inherit outline-none focus-visible:ring-2 focus-visible:ring-ring',
          !deletable() || isMobile() ? 'pr-3' : 'pr-1',
        )}
        onClick={(e) => {
          if (suppressNextClick || deleting()) {
            suppressNextClick = false;
            e.preventDefault();
            return;
          }
          props.onSelect(props.item.word);
        }}
      >
        {props.item.word}
      </button>
      <Show when={deletable() && !isMobile()}>
        <button
          type="button"
          class="mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
          aria-label={`删除 ${props.item.word}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            void runDelete();
          }}
        >
          <XIcon class="h-3.5 w-3.5" />
        </button>
      </Show>
    </span>
  );
}
