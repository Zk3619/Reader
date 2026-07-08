/**
 * 应用内下拉选择：统一触发器/选项样式，以及打开时的无障碍处理。
 * 底层仍使用 @/components/ui/select（Kobalte Select 原语）。
 */

import type { Component, JSX, ParentProps, ValidComponent } from 'solid-js';
import { onCleanup, splitProps } from 'solid-js';
import {
  useAppDrawerOverlayLock,
  useAppDrawerPortalMount,
  syncAppDrawerOverlayLock,
} from '@/components/shared/app-drawer-overlay-lock';
import type { PolymorphicProps } from '@kobalte/core/polymorphic';
import type { SelectRootProps } from '@kobalte/core/select';
import * as SelectPrimitive from '@kobalte/core/select';

import { Select, SelectValue } from '@/components/ui/select';
import { CheckIcon, ChevronsUpDownIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import { overlayLayerZ } from '@/lib/ui/overlay-layer-active';
import {
  popperMenuPanelShell,
  popperOverflowPadding,
} from '@/lib/ui/viewport-classes';
import { PopperScrollViewport } from '@/components/shared/PopperScrollViewport';
import { blurActiveElement } from '@/utils/accessibility';
import { scheduleOverlayPositionSync } from '@/lib/ui/overlay-position-sync';
import { ThemedComponentBackground } from '@/components/theme/ThemedComponentBackground';

/** 选项行：与表单/对话框内其它 Select 一致，缩小左侧勾选留白 */
export const APP_SELECT_ITEM_CLASS = 'pl-2';

/** 表单 / 对话框：全宽触发器 */
export const APP_SELECT_TRIGGER_FORM = 'w-full';

/** 探索枢纽等内联芯片内嵌选择 */
export const APP_SELECT_TRIGGER_INLINE =
  'h-7 w-full min-w-0 border-0 bg-transparent px-0 text-sm shadow-none focus:ring-0';

/** 书源展开区等紧凑行内选择 */
export const APP_SELECT_TRIGGER_COMPACT =
  'h-8 w-full border-border/60 bg-background text-sm';

export type AppSelectTriggerLayout = 'form' | 'inline' | 'compact' | 'plain';

const TRIGGER_LAYOUT_CLASS: Record<AppSelectTriggerLayout, string> = {
  form: APP_SELECT_TRIGGER_FORM,
  inline: APP_SELECT_TRIGGER_INLINE,
  compact: APP_SELECT_TRIGGER_COMPACT,
  plain: '',
};

export type AppSelectContentLayout = 'plain';

const CONTENT_LAYOUT_CLASS: Record<AppSelectContentLayout, string> = {
  plain: popperMenuPanelShell,
};

const APP_SELECT_TRIGGER_BASE_CLASS =
  'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

const APP_SELECT_CONTENT_MOTION_CLASS =
  'relative min-w-32 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-expanded:animate-in data-closed:animate-out data-closed:fade-out-0 data-expanded:fade-in-0 data-closed:zoom-out-95 data-expanded:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2';

const APP_SELECT_ITEM_BASE_CLASS =
  'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50';

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
    }
  };
}

export type AppSelectProps<Option = string, OptGroup = never> = ParentProps<
  SelectRootProps<Option, OptGroup> & {
    /**
     * 为 true 时不注入打开/关闭时的 blur（与内嵌页手势等极少数场景协调时使用）
     */
    disableAccessibilityAnnounce?: boolean;
  }
>;

export function AppSelect<Option = string, OptGroup = never>(
  props: AppSelectProps<Option, OptGroup>
) {
  const [local, rest] = splitProps(props, ['onOpenChange', 'disableAccessibilityAnnounce']);
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
    <Select
      fitViewport
      overflowPadding={popperOverflowPadding}
      {...rest}
      onOpenChange={handleOpenChange}
    />
  );
}

type AppSelectTriggerProps<T extends ValidComponent = 'button'> =
  SelectPrimitive.SelectTriggerProps<T> & {
    class?: string | undefined;
    children?: JSX.Element;
    layout?: AppSelectTriggerLayout;
  };

export const AppSelectTrigger = <T extends ValidComponent = 'button'>(
  props: PolymorphicProps<T, AppSelectTriggerProps<T>>,
) => {
  const [local, others] = splitProps(props as AppSelectTriggerProps, ['class', 'children', 'layout']);
  const layout = () => local.layout ?? 'form';
  return (
    <SelectPrimitive.Trigger
      class={cn(APP_SELECT_TRIGGER_BASE_CLASS, TRIGGER_LAYOUT_CLASS[layout()], local.class)}
      {...others}
    >
      {local.children}
    </SelectPrimitive.Trigger>
  );
};

export const AppSelectIcon: Component<SelectPrimitive.SelectIconProps> = (props) => {
  return (
    <SelectPrimitive.Icon {...props}>
      <ChevronsUpDownIcon class="h-4 w-4 shrink-0 opacity-50" />
    </SelectPrimitive.Icon>
  );
};

type AppSelectContentProps<T extends ValidComponent = 'div'> =
  SelectPrimitive.SelectContentProps<T> & {
    class?: string | undefined;
    children?: JSX.Element;
    layout?: AppSelectContentLayout;
    /** 附加在 Content 上的 z-index 等（如内嵌页 z-[160]） */
    portalZClass?: string;
    /** 挂 body 并用显式 portalZClass（阅读器内用 ViewerAppSelectContent） */
    portalToBody?: boolean;
    /** 挂到指定节点（如 AppDrawer 内 Portal 锚点），避免 body 层被抽屉挡住 */
    mount?: HTMLElement | undefined;
  };

export const AppSelectContent = <T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, AppSelectContentProps<T>>,
) => {
  const [local, others] = splitProps(props as AppSelectContentProps, [
    'class',
    'layout',
    'portalZClass',
    'portalToBody',
    'mount',
    'children',
  ]);
  const layout = () => local.layout ?? 'plain';
  const drawerPortalMount = useAppDrawerPortalMount();
  const inDrawer = () => !local.portalToBody && drawerPortalMount() != null;
  const popperZ = () =>
    local.portalZClass ??
    (inDrawer() ? overlayLayerZ().drawerPopper : overlayLayerZ().dialogPopper);
  const resolveMount = () => {
    if (local.portalToBody) return undefined;
    return local.mount ?? drawerPortalMount() ?? undefined;
  };
  return (
    <SelectPrimitive.Portal mount={resolveMount()}>
      <SelectPrimitive.Content
        class={cn(
          APP_SELECT_CONTENT_MOTION_CLASS,
          CONTENT_LAYOUT_CLASS[layout()],
          popperZ(),
          'overflow-hidden isolate',
          local.class,
        )}
        {...others}
      >
        <ThemedComponentBackground componentId="select" />
        <div class="relative z-1">{local.children}</div>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
};

type AppSelectItemProps<T extends ValidComponent = 'li'> =
  SelectPrimitive.SelectItemProps<T> & {
    class?: string | undefined;
    children?: JSX.Element;
  };

export const AppSelectItem = <T extends ValidComponent = 'li'>(
  props: PolymorphicProps<T, AppSelectItemProps<T>>,
) => {
  const [local, others] = splitProps(props as AppSelectItemProps, ['class', 'children']);
  return (
    <SelectPrimitive.Item
      class={cn(APP_SELECT_ITEM_BASE_CLASS, APP_SELECT_ITEM_CLASS, local.class)}
      {...others}
    >
      <SelectPrimitive.ItemIndicator class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <CheckIcon class="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemLabel>{local.children}</SelectPrimitive.ItemLabel>
    </SelectPrimitive.Item>
  );
};

type AppSelectListboxProps<T extends ValidComponent = 'ul'> =
  SelectPrimitive.SelectListboxProps<T> & { class?: string | undefined };

export const AppSelectListbox = <T extends ValidComponent = 'ul'>(
  props: PolymorphicProps<T, AppSelectListboxProps<T>>,
) => {
  const [local, others] = splitProps(props as AppSelectListboxProps, ['class']);
  return (
    <PopperScrollViewport class="px-1">
      <SelectPrimitive.Listbox class={cn('p-0', local.class)} {...others} />
    </PopperScrollViewport>
  );
};

export const AppSelectItemIndicator: Component<SelectPrimitive.SelectItemIndicatorProps> = (
  props,
) => {
  return (
    <SelectPrimitive.ItemIndicator
      class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center"
      {...props}
    >
      <CheckIcon class="h-4 w-4" />
    </SelectPrimitive.ItemIndicator>
  );
};

export { SelectValue as AppSelectValue };
