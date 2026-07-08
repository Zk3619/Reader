/**
 * 应用内右键菜单：统一内容区视口约束/滚动样式，以及打开时的无障碍处理。
 * 底层仍使用 @/components/ui/context-menu（Kobalte ContextMenu 原语）。
 */

import type { Component, ComponentProps } from 'solid-js';
import { splitProps } from 'solid-js';

import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuGroupLabel,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import { ThemedComponentBackground } from '@/components/theme/ThemedComponentBackground';
import {
  popperMenuPanelShell,
  popperOverflowPadding,
} from '@/lib/ui/viewport-classes';
import { PopperScrollViewport } from '@/components/shared/PopperScrollViewport';
import { overlayLayerZ } from '@/lib/ui/overlay-layer-active';
import { useOverlayPortalMount } from '@/lib/ui/overlay-portal-mount';
import { blurActiveElement } from '@/utils/accessibility';

/** 常规右键菜单：最小宽度 + 内层 PopperScrollViewport 纵向滚动 */
export const APP_CONTEXT_MENU_CONTENT_COMPACT = cn(
  'min-w-32 max-w-[min(280px,calc(100dvw-2rem))]',
  popperMenuPanelShell,
);

export type AppContextMenuContentLayout = 'compact' | 'plain';

const CONTENT_LAYOUT_CLASS: Record<AppContextMenuContentLayout, string> = {
  compact: APP_CONTEXT_MENU_CONTENT_COMPACT,
  plain: popperMenuPanelShell,
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
    }
  };
}

export type AppContextMenuProps = ComponentProps<typeof ContextMenu> & {
  /**
   * 为 true 时不注入打开/关闭时的 blur（与内嵌页手势等极少数场景协调时使用）
   */
  disableAccessibilityAnnounce?: boolean;
};

export const AppContextMenu: Component<AppContextMenuProps> = (props) => {
  const [local, rest] = splitProps(props, ['onOpenChange', 'disableAccessibilityAnnounce']);
  const handleOpenChange = mergeOpenChange(
    local.onOpenChange,
    local.disableAccessibilityAnnounce
  );
  return (
    <ContextMenu
      fitViewport
      overflowPadding={popperOverflowPadding}
      {...rest}
      onOpenChange={handleOpenChange}
    />
  );
};

type AppContextMenuContentProps = ComponentProps<typeof ContextMenuContent> & {
  layout?: AppContextMenuContentLayout;
  /** 附加在 Content 上的 z-index 等 */
  portalZClass?: string;
};

export const AppContextMenuContent: Component<AppContextMenuContentProps> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'layout', 'portalZClass', 'children']);
  const layout = () => local.layout ?? 'compact';
  const mount = useOverlayPortalMount();
  const popperZ = () => local.portalZClass ?? overlayLayerZ().popper;
  return (
    <ContextMenuContent
      mount={mount}
      {...rest}
      class={cn(CONTENT_LAYOUT_CLASS[layout()], popperZ(), 'overflow-hidden isolate', local.class)}
    >
      <ThemedComponentBackground componentId="contextMenu" />
      <PopperScrollViewport class="relative z-1 px-1">{local.children}</PopperScrollViewport>
    </ContextMenuContent>
  );
};

type AppContextMenuSubContentProps = ComponentProps<typeof ContextMenuSubContent> & {
  portalZClass?: string;
};

export const AppContextMenuSubContent: Component<AppContextMenuSubContentProps> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'portalZClass', 'children']);
  const popperZ = () => local.portalZClass ?? overlayLayerZ().popper;
  return (
    <ContextMenuSubContent
      {...rest}
      class={cn(popperMenuPanelShell, popperZ(), local.class)}
    >
      <PopperScrollViewport class="px-1">{local.children}</PopperScrollViewport>
    </ContextMenuSubContent>
  );
};

export {
  ContextMenuTrigger as AppContextMenuTrigger,
  ContextMenuItem as AppContextMenuItem,
  ContextMenuSeparator as AppContextMenuSeparator,
  ContextMenuCheckboxItem as AppContextMenuCheckboxItem,
  ContextMenuRadioGroup as AppContextMenuRadioGroup,
  ContextMenuRadioItem as AppContextMenuRadioItem,
  ContextMenuGroup as AppContextMenuGroup,
  ContextMenuGroupLabel as AppContextMenuGroupLabel,
  ContextMenuShortcut as AppContextMenuShortcut,
  ContextMenuSub as AppContextMenuSub,
  ContextMenuSubTrigger as AppContextMenuSubTrigger,
  ContextMenuPortal as AppContextMenuPortal,
};
