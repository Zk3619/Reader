/**
 * 应用内下拉菜单：统一内容区尺寸/滚动样式，以及打开时的无障碍处理。
 * 底层仍使用 @/components/ui/dropdown-menu（Kobalte DropdownMenu 原语）。
 */

import type { Component, ComponentProps, JSX } from 'solid-js';
import { splitProps } from 'solid-js';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
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
  scrollGutterStableBoth,
} from '@/lib/ui/viewport-classes';
import {
  blurActiveElement,
  blurAfterMenuTriggerRefocus,
  handleMenuCloseAutoFocusForPendingDialog,
  shouldPreventMenuCloseAutoFocus,
  withBlurBefore,
} from '@/utils/accessibility';

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
  'flex min-h-0 flex-1 w-full min-w-0 flex-col gap-2 p-3 overflow-y-auto overflow-x-hidden overscroll-contain',
  scrollGutterStableBoth
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

function mergeOpenChange(
  userOnOpenChange: ((open: boolean) => void) | undefined,
  accessibilityDisabled: boolean | undefined
): (open: boolean) => void {
  return (open: boolean) => {
    userOnOpenChange?.(open);
    if (accessibilityDisabled) return;
    if (open) {
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
  ]);
  const handleOpenChange = mergeOpenChange(
    local.onOpenChange,
    local.disableAccessibilityAnnounce
  );
  return (
    <DropdownMenu
      modal={local.modal ?? false}
      fitViewport
      overflowPadding={popperOverflowPadding}
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
      class={cn(CONTENT_LAYOUT_CLASS[layout()], local.portalZClass, local.class)}
    />
  );
};

/**
 * 与 Kobalte Trigger `as` 联用的图标按钮：先 spread triggerProps，再包 onClick blur。
 */
/** 与 Trigger `as` 联用的普通按钮（如批量操作 outline 触发器） */
export function AppDropdownMenuButtonTrigger(
  props: {
    triggerProps: Record<string, unknown>;
    children: JSX.Element;
  } & Omit<ComponentProps<typeof Button>, 'onClick' | 'children'>
) {
  const [local, buttonRest] = splitProps(props, ['triggerProps', 'children']);
  return (
    <Button
      {...local.triggerProps}
      {...buttonRest}
      onClick={withBlurBefore(local.triggerProps.onClick as (() => void) | undefined)}
    >
      {local.children}
    </Button>
  );
}

export function AppDropdownMenuIconTrigger(
  props: {
    triggerProps: Record<string, unknown>;
    children: JSX.Element;
  } & Omit<ComponentProps<typeof Button>, 'onClick' | 'children' | 'variant' | 'size'>
) {
  const [local, buttonRest] = splitProps(props, ['triggerProps', 'children']);
  return (
    <Button
      variant="ghost"
      size="icon"
      class={cn('h-9 w-9', buttonRest.class)}
      {...local.triggerProps}
      {...buttonRest}
      onClick={withBlurBefore(local.triggerProps.onClick as (() => void) | undefined)}
    >
      {local.children}
    </Button>
  );
}

export {
  DropdownMenuTrigger as AppDropdownMenuTrigger,
  DropdownMenuItem as AppDropdownMenuItem,
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
