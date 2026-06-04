/**
 * 应用内下拉选择：统一触发器/选项样式，以及打开时的无障碍处理。
 * 底层仍使用 @/components/ui/select（Kobalte Select 原语）。
 */

import type { Component, ComponentProps, ParentProps } from 'solid-js';
import { onCleanup, splitProps } from 'solid-js';
import {
  useAppDrawerOverlayLock,
  useAppDrawerPortalMount,
  syncAppDrawerOverlayLock,
} from '@/components/shared/app-drawer-overlay-lock';
import type { SelectRootProps } from '@kobalte/core/select';

import {
  Select,
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectListbox,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useOverlayLayerZ } from '@/lib/ui/overlay-layer-active';
import {
  popperContentViewportScroll,
  popperOverflowPadding,
} from '@/lib/ui/viewport-classes';
import { blurActiveElement } from '@/utils/accessibility';
import { scheduleOverlayPositionSync } from '@/lib/ui/overlay-position-sync';

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

type AppSelectTriggerProps = ComponentProps<typeof SelectTrigger> & {
  layout?: AppSelectTriggerLayout;
};

export const AppSelectTrigger: Component<AppSelectTriggerProps> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'layout']);
  const layout = () => local.layout ?? 'form';
  return (
    <SelectTrigger
      {...rest}
      class={cn(TRIGGER_LAYOUT_CLASS[layout()], local.class)}
    />
  );
};

type AppSelectContentProps = ComponentProps<typeof SelectContent> & {
  layout?: AppSelectContentLayout;
  /** 附加在 Content 上的 z-index 等（如内嵌页 z-[160]） */
  portalZClass?: string;
  /** 挂 body 并用显式 portalZClass（阅读器内用 ViewerAppSelectContent） */
  portalToBody?: boolean;
};

export const AppSelectContent: Component<AppSelectContentProps> = (props) => {
  const [local, rest] = splitProps(props, ['class', 'layout', 'portalZClass', 'portalToBody']);
  const layout = () => local.layout ?? 'plain';
  const layer = useOverlayLayerZ();
  const drawerPortalMount = useAppDrawerPortalMount();
  const inDrawer = () => !local.portalToBody && drawerPortalMount() != null;
  const popperZ = () =>
    local.portalZClass ?? (inDrawer() ? layer.drawerPopper : layer.dialogPopper);
  return (
    <SelectContent
      {...rest}
      mount={local.portalToBody ? undefined : drawerPortalMount() ?? undefined}
      class={cn(
        CONTENT_LAYOUT_CLASS[layout()],
        popperZ(),
        local.class,
      )}
    />
  );
};

export const AppSelectItem: Component<ComponentProps<typeof SelectItem>> = (props) => {
  const [local, rest] = splitProps(props, ['class']);
  return <SelectItem class={cn(APP_SELECT_ITEM_CLASS, local.class)} {...rest} />;
};

export {
  SelectValue as AppSelectValue,
  SelectIcon as AppSelectIcon,
  SelectListbox as AppSelectListbox,
  SelectItemIndicator as AppSelectItemIndicator,
};
