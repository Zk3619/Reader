/**
 * 应用内下拉菜单：统一内容区尺寸/滚动样式，以及打开时的无障碍处理。
 * 底层仍使用 @/components/ui/dropdown-menu（Kobalte DropdownMenu 原语）。
 */

import type { Component, ComponentProps, JSX } from 'solid-js';
import { onCleanup, splitProps } from 'solid-js';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useAppDrawerOverlayLock, syncAppDrawerOverlayLock } from '@/components/shared/app-drawer-overlay-lock';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  popperContentViewportPanel,
  popperContentViewportScroll,
  popperOverflowPadding,
  scrollEdgeBottomInset,
  scrollGutterStableBoth,
} from '@/lib/ui/viewport-classes';
import {
  blurActiveElement,
  blurAfterMenuTriggerRefocus,
  deferUntilMenuDismissed,
  handleMenuCloseAutoFocusForPendingDialog,
  shouldPreventMenuCloseAutoFocus,
  withBlurBefore,
} from '@/utils/accessibility';
import { appDropdownMenuContentMotionClass } from '@/lib/ui/menu-motion';
import { scheduleOverlayPositionSync } from '@/lib/ui/overlay-position-sync';

type AppDropdownMenuItemProps = ComponentProps<typeof DropdownMenuItem> & {
  /** 为 false 时立即执行 onSelect（默认 true：等菜单关闭后再执行） */
  deferOnSelect?: boolean;
};

/** 默认在菜单完全关闭后再执行 onSelect，避免 Android 上 Popper 锚点失效闪到左上角 */
export const AppDropdownMenuItem: Component<AppDropdownMenuItemProps> = (props) => {
  const [local, rest] = splitProps(props, ['onSelect', 'deferOnSelect']);
  return (
    <DropdownMenuItem
      {...rest}
      onSelect={() => {
        const action = local.onSelect;
        if (!action) return;
        if (local.deferOnSelect === false) {
          action();
          return;
        }
        deferUntilMenuDismissed(action);
      }}
    />
  );
};

/** 工具栏/批量操作等：按内容收缩宽度 */
export const APP_DROPDOWN_MENU_CONTENT_COMPACT = 'min-w-0 w-auto';

/** PageToolbar 标题分组下拉（固定宽度面板） */
export const APP_DROPDOWN_MENU_CONTENT_TITLE = cn(
  'p-0 w-52 min-w-52 max-w-52',
  popperContentViewportPanel
);

/** 书架分组标题下拉（更宽，受视口限制） */
export const APP_DROPDOWN_MENU_CONTENT_TITLE_WIDE = cn(
  'p-0 w-[min(280px,calc(100dvw-2rem))] min-w-52 max-w-[min(280px,calc(100dvw-2rem))]',
  popperContentViewportPanel
);

/** 内嵌页等窄菜单 */
export const APP_DROPDOWN_MENU_CONTENT_MIN = 'min-w-40';

/** 标题下拉内可滚动列表容器 */
export const APP_DROPDOWN_MENU_TITLE_LIST_CLASS = cn(
  'flex min-h-0 flex-1 w-full min-w-0 flex-col gap-2 p-2 overflow-y-auto overflow-x-hidden overscroll-contain',
  scrollGutterStableBoth,
  scrollEdgeBottomInset,
);

export type AppDropdownMenuContentLayout =
  | 'compact'
  | 'title'
  | 'titleWide'
  | 'min'
  | 'plain';

const CONTENT_LAYOUT_CLASS: Record<AppDropdownMenuContentLayout, string> = {
  compact: cn(APP_DROPDOWN_MENU_CONTENT_COMPACT, popperContentViewportScroll),
  title: APP_DROPDOWN_MENU_CONTENT_TITLE,
  titleWide: APP_DROPDOWN_MENU_CONTENT_TITLE_WIDE,
  min: cn(APP_DROPDOWN_MENU_CONTENT_MIN, popperContentViewportScroll),
  plain: popperContentViewportScroll,
};

/**
 * 默认相对触发器水平居中、向下展开（覆盖 Kobalte Menu 的 `bottom-start`）。
 */
const APP_DROPDOWN_MENU_PLACEMENT = 'bottom' as const;

/**
 * 空间不足时的翻转顺序：先向上，再左对齐（向右展开）、右对齐（向左展开）。
 * 配合 `fitViewport` 与 Content 的 `max-h-[var(--kb-popper-content-available-height)]`，
 * 上下均不足时 Popper 限制高度并由内容区纵向滚动。
 */
const APP_DROPDOWN_MENU_FLIP = 'top bottom-start bottom-end';

function mergeOpenChange(
  userOnOpenChange: ((open: boolean) => void) | undefined,
  accessibilityDisabled: boolean | undefined
): (open: boolean) => void {
  return (open: boolean) => {
    userOnOpenChange?.(open);
    if (accessibilityDisabled) return;
    if (open) {
      scheduleOverlayPositionSync();
      requestAnimationFrame(() => blurActiveElement());
    } else {
      blurActiveElement();
      if (shouldPreventMenuCloseAutoFocus()) {
        blurAfterMenuTriggerRefocus();
      }
    }
  };
}

export type AppDropdownMenuProps = ComponentProps<typeof DropdownMenu> & {
  /**
   * 为 true 时不注入打开/关闭时的 blur（与内嵌页手势等极少数场景协调时使用）
   */
  disableAccessibilityAnnounce?: boolean;
};

export const AppDropdownMenu: Component<AppDropdownMenuProps> = (props) => {
  const [local, rest] = splitProps(props, [
    'onOpenChange',
    'disableAccessibilityAnnounce',
    'modal',
    'placement',
    'flip',
  ]);
  const drawerOverlayLock = useAppDrawerOverlayLock();
  const inAppDrawer = () => drawerOverlayLock != null;
  const overlayReleaseRef: { current: (() => void) | undefined } = { current: undefined };
  onCleanup(() => overlayReleaseRef.current?.());

  const handleOpenChange = (open: boolean) => {
    syncAppDrawerOverlayLock(drawerOverlayLock, open, overlayReleaseRef);
    mergeOpenChange(
      local.onOpenChange,
      local.disableAccessibilityAnnounce || inAppDrawer(),
    )(open);
  };
  return (
    <DropdownMenu
      modal={local.modal ?? false}
      fitViewport
      overflowPadding={popperOverflowPadding}
      placement={local.placement ?? APP_DROPDOWN_MENU_PLACEMENT}
      flip={local.flip ?? APP_DROPDOWN_MENU_FLIP}
      {...rest}
      onOpenChange={handleOpenChange}
    />
  );
};

type AppDropdownMenuContentProps = ComponentProps<typeof DropdownMenuContent> & {
  layout?: AppDropdownMenuContentLayout;
  /** 附加在 Content 上的 z-index 等（如内嵌页 z-[160]） */
  portalZClass?: string;
};

export const AppDropdownMenuContent: Component<AppDropdownMenuContentProps> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'layout', 'portalZClass', 'onCloseAutoFocus']);
  const layout = () => local.layout ?? 'compact';
  const userOnCloseAutoFocus = local.onCloseAutoFocus;
  return (
    <DropdownMenuContent
      {...rest}
      onCloseAutoFocus={(e) => {
        if (handleMenuCloseAutoFocusForPendingDialog(e)) return;
        userOnCloseAutoFocus?.(e);
      }}
      class={cn(
        appDropdownMenuContentMotionClass,
        CONTENT_LAYOUT_CLASS[layout()],
        local.portalZClass,
        local.class
      )}
    />
  );
};

/**
 * 与 Kobalte Trigger `as` 联用的图标按钮：先 spread triggerProps，再包 onClick blur。
 */
/** 与 Trigger `as` 联用的普通按钮（如批量操作 outline 触发器） */
export function AppDropdownMenuButtonTrigger(
  props: {
    triggerProps?: Record<string, unknown>;
    children: JSX.Element;
  } & Omit<ComponentProps<typeof Button>, 'onClick' | 'children'>
) {
  const [local, buttonRest] = splitProps(props, ['triggerProps', 'children']);
  const fromTrigger = (local.triggerProps ?? {}) as Record<string, unknown>;
  const fromRest = buttonRest as Record<string, unknown>;
  const onClick = (fromTrigger.onClick ?? fromRest.onClick) as
    | ((event: Event) => void)
    | undefined;
  const { onClick: _t, ...triggerSpread } = fromTrigger;
  const { onClick: _r, ...restSpread } = fromRest;
  return (
    <Button
      {...triggerSpread}
      {...restSpread}
      onClick={withBlurBefore(onClick)}
    >
      {local.children}
    </Button>
  );
}

export function AppDropdownMenuIconTrigger(
  props: {
    triggerProps?: Record<string, unknown>;
    children: JSX.Element;
  } & Omit<ComponentProps<typeof Button>, 'onClick' | 'children' | 'variant' | 'size'>
) {
  const [local, buttonRest] = splitProps(props, ['triggerProps', 'children']);
  const fromTrigger = (local.triggerProps ?? {}) as Record<string, unknown>;
  const fromRest = buttonRest as Record<string, unknown>;
  const onClick = (fromTrigger.onClick ?? fromRest.onClick) as
    | ((event: Event) => void)
    | undefined;
  const { onClick: _t, ...triggerSpread } = fromTrigger;
  const { onClick: _r, class: restClass, ...restSpread } = fromRest;
  return (
    <Button
      variant="ghost"
      size="icon"
      class={cn('h-9 w-9', restClass as string | undefined)}
      {...triggerSpread}
      {...restSpread}
      onClick={withBlurBefore(onClick)}
    >
      {local.children}
    </Button>
  );
}

export {
  DropdownMenuTrigger as AppDropdownMenuTrigger,
  DropdownMenuSeparator as AppDropdownMenuSeparator,
  DropdownMenuCheckboxItem as AppDropdownMenuCheckboxItem,
  DropdownMenuRadioGroup as AppDropdownMenuRadioGroup,
  DropdownMenuRadioItem as AppDropdownMenuRadioItem,
  DropdownMenuGroup as AppDropdownMenuGroup,
  DropdownMenuGroupLabel as AppDropdownMenuGroupLabel,
  DropdownMenuLabel as AppDropdownMenuLabel,
  DropdownMenuShortcut as AppDropdownMenuShortcut,
  DropdownMenuSub as AppDropdownMenuSub,
  DropdownMenuSubTrigger as AppDropdownMenuSubTrigger,
  DropdownMenuSubContent as AppDropdownMenuSubContent,
  DropdownMenuPortal as AppDropdownMenuPortal,
};
