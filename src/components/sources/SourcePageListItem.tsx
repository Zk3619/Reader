/**
 * 书源页列表行：点击打开发现 Drawer；拖拽排序结束后抑制误触点击。
 */

import { Show } from 'solid-js';
import { useSuppressClickAfterDrag } from '@/components/shared/virtual-list/use-suppress-click-after-drag';
import type { BookSource } from '@/types';
import { cn } from '@/lib/utils';
import {
  AppContextMenu,
  AppContextMenuContent,
  AppContextMenuItem,
  AppContextMenuTrigger,
} from '@/components/shared/AppContextMenu';
import { ChevronRightIcon } from '@/components/shared/icons';
import { TruncatedTooltip } from '@/components/shared/TruncatedTooltip';

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

export interface SourcePageListItemProps {
  source: BookSource;
  showGroupBadge: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onSourceEdit?: (source: BookSource) => void;
  onPinSource: (source: BookSource) => void;
  onSourceLogin?: (source: BookSource) => void;
  onSourceVariables?: (source: BookSource) => void;
  onSourceSearch?: (source: BookSource) => void;
  onSourceRefresh: (source: BookSource) => void;
  onDeleteSource: (source: BookSource) => void;
  hasLogin: (source: BookSource) => boolean;
  hasSearch: (source: BookSource) => boolean;
}

export function SourcePageListItem(props: SourcePageListItemProps) {
  let triggerEl: HTMLDivElement | null = null;
  const { onPointerDown, onPointerMove, onPointerUp, shouldPreventClick } =
    useLongPressContextMenu(() => triggerEl);
  const shouldPreventClickAfterDrag = useSuppressClickAfterDrag();

  const shouldBlockRowClick = () =>
    shouldPreventClick() || shouldPreventClickAfterDrag();

  return (
    <div class="box-border h-full pb-2">
      <div class="overflow-hidden rounded-lg border border-border/50 bg-card">
        <AppContextMenu>
          <AppContextMenuTrigger
            as="div"
            ref={(el) => {
              triggerEl = el;
            }}
            onMouseDown={onPointerDown}
            onMouseMove={onPointerMove}
            onMouseUp={onPointerUp}
            onTouchStart={onPointerDown}
            onTouchMove={onPointerMove}
            onTouchEnd={onPointerUp}
            class={cn(
              'flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-all',
              'hover:bg-accent/30',
              props.expanded && 'bg-accent/20',
            )}
            onClick={(e: MouseEvent) => {
              if (shouldBlockRowClick()) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }
              props.onToggleExpand();
            }}
            role="button"
            tabIndex={0}
          >
            <div class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
              <TruncatedTooltip
                as="span"
                text={props.source.sourceName}
                class="min-w-0 shrink font-medium text-foreground"
              />
              <Show when={props.showGroupBadge}>
                <TruncatedTooltip
                  as="span"
                  text={props.source.sourceGroup!}
                  class="min-w-0 shrink-2 rounded bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground"
                />
              </Show>
            </div>
            <ChevronRightIcon
              class={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                props.expanded && 'rotate-90',
              )}
            />
          </AppContextMenuTrigger>
          <AppContextMenuContent>
            <AppContextMenuItem onSelect={() => props.onSourceEdit?.(props.source)}>
              编辑
            </AppContextMenuItem>
            <AppContextMenuItem onSelect={() => props.onSourceVariables?.(props.source)}>
              设置源变量
            </AppContextMenuItem>
            <AppContextMenuItem onSelect={() => props.onPinSource(props.source)}>
              置顶
            </AppContextMenuItem>
            <Show when={props.hasLogin(props.source)}>
              <AppContextMenuItem onSelect={() => props.onSourceLogin?.(props.source)}>
                登录
              </AppContextMenuItem>
            </Show>
            <Show when={props.hasSearch(props.source)}>
              <AppContextMenuItem onSelect={() => props.onSourceSearch?.(props.source)}>
                搜索
              </AppContextMenuItem>
            </Show>
            <AppContextMenuItem onSelect={() => props.onSourceRefresh(props.source)}>
              刷新
            </AppContextMenuItem>
            <AppContextMenuItem
              class="text-destructive focus:text-destructive"
              onSelect={() => props.onDeleteSource(props.source)}
            >
              删除
            </AppContextMenuItem>
          </AppContextMenuContent>
        </AppContextMenu>
      </div>
    </div>
  );
}
