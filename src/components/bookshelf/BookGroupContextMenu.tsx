/**
 * 书架分组右键 / 长按菜单（分组管理、分组列表共用）
 */

import { createSignal, onCleanup, type ParentProps } from 'solid-js';
import {
  AppContextMenu,
  AppContextMenuContent,
  AppContextMenuItem,
  AppContextMenuSeparator,
  AppContextMenuTrigger,
} from '@/components/shared/AppContextMenu';
import { ThemedComponentBackground } from '@/components/theme/ThemedComponentBackground';
import { bookGroupCardPressHandlers } from '@/lib/bookshelf/book-group-card-press';
import {
  findGroupOrderIndex,
  isDefaultBookGroup,
  sortGroupsByOrder,
} from '@/lib/bookshelf/book-group-order';
import { cn } from '@/lib/utils';

import type { BookGroup } from '@/types';

const DELETE_ITEM_CLASS =
  'text-destructive focus:bg-destructive/10 focus:text-destructive';

const DELETE_ITEM_DISABLED_CLASS =
  'text-destructive/45 focus:bg-transparent focus:text-destructive/45 data-disabled:opacity-100';

export type GroupContextMenuActions = {
  onEdit: (group: BookGroup) => void;
  onDelete: (group: BookGroup) => void;
  onPinTop: (group: BookGroup) => void;
  onPinBottom: (group: BookGroup) => void;
};

export interface GroupContextMenuContentProps {
  group: BookGroup;
  /** 完整分组列表（含系统分组），用于置顶/置底可用态 */
  orderGroups: BookGroup[];
  actions: GroupContextMenuActions;
}

export function GroupContextMenuContent(props: GroupContextMenuContentProps) {
  const isDefault = () => isDefaultBookGroup(props.group.groupId);
  const sorted = () => sortGroupsByOrder(props.orderGroups);
  const index = () => findGroupOrderIndex(props.orderGroups, props.group.groupId);
  const canPinTop = () => !isDefault() && index() > 0;
  const canPinBottom = () => !isDefault() && index() >= 0 && index() < sorted().length - 1;

  return (
    <AppContextMenuContent>
      <AppContextMenuItem onSelect={() => props.actions.onEdit(props.group)}>
        编辑
      </AppContextMenuItem>
      <AppContextMenuItem
        disabled={!canPinTop()}
        onSelect={() => props.actions.onPinTop(props.group)}
      >
        置顶
      </AppContextMenuItem>
      <AppContextMenuItem
        disabled={!canPinBottom()}
        onSelect={() => props.actions.onPinBottom(props.group)}
      >
        置底
      </AppContextMenuItem>
      <AppContextMenuSeparator />
      <AppContextMenuItem
        disabled={isDefault()}
        class={isDefault() ? DELETE_ITEM_DISABLED_CLASS : DELETE_ITEM_CLASS}
        onSelect={() => props.actions.onDelete(props.group)}
      >
        删除
      </AppContextMenuItem>
    </AppContextMenuContent>
  );
}

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 10;

function useGroupContextMenuLongPress() {
  const [triggerEl, setTriggerEl] = createSignal<HTMLElement | null>(null);
  let pressStartTime = 0;
  let pressStartX = 0;
  let pressStartY = 0;
  let hasMoved = false;
  let longPressTimer: number | null = null;
  let longPressTriggered = false;

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
    }
    pressStartTime = 0;
    hasMoved = false;
    longPressTriggered = false;
  };

  onCleanup(clearPressTimer);

  return {
    setTriggerRef: (el: HTMLElement | null) => setTriggerEl(el),
    longPressProps: {
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
      onMouseLeave: bookGroupCardPressHandlers.onMouseLeave,
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
      onTouchCancel: bookGroupCardPressHandlers.onTouchCancel,
    },
  };
}

export interface GroupContextMenuProps extends ParentProps {
  group: BookGroup;
  orderGroups: BookGroup[];
  actions: GroupContextMenuActions;
  /** 移动端长按打开菜单 */
  withLongPress?: boolean;
  /** 触发器元素类型 */
  triggerAs?: 'div' | 'button';
  class?: string;
  onClick?: (e: MouseEvent) => void;
  'data-group-id'?: number;
}

export function GroupContextMenu(props: GroupContextMenuProps) {
  const longPress = useGroupContextMenuLongPress();
  const triggerAs = () => props.triggerAs ?? 'div';

  const triggerProps = () => {
    const base: Record<string, unknown> = {
      class: cn('relative overflow-hidden', props.class),
      onClick: props.onClick,
      'data-group-id': props['data-group-id'] ?? props.group.groupId,
      ref: (el: HTMLElement | null) => longPress.setTriggerRef(el),
    };
    if (props.withLongPress) {
      Object.assign(base, longPress.longPressProps);
    } else {
      Object.assign(base, {
        onMouseDown: bookGroupCardPressHandlers.onMouseDown,
        onMouseUp: bookGroupCardPressHandlers.onMouseUp,
        onMouseLeave: bookGroupCardPressHandlers.onMouseLeave,
        onTouchStart: bookGroupCardPressHandlers.onTouchStart,
        onTouchEnd: bookGroupCardPressHandlers.onTouchEnd,
        onTouchCancel: bookGroupCardPressHandlers.onTouchCancel,
      });
    }
    if (triggerAs() === 'button') {
      base.type = 'button';
      base.variant = 'ghost';
    }
    return base;
  };

  return (
    <AppContextMenu>
      <AppContextMenuTrigger as={triggerAs()} {...triggerProps()}>
        <ThemedComponentBackground componentId="bookshelfGroupCard" />
        {props.children}
      </AppContextMenuTrigger>
      <GroupContextMenuContent
        group={props.group}
        orderGroups={props.orderGroups}
        actions={props.actions}
      />
    </AppContextMenu>
  );
}
