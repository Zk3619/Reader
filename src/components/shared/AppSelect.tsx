/**
 * 应用内下拉选择：统一触发器/选项样式，以及打开时的无障碍处理。
 * 底层仍使用 @/components/ui/select（Kobalte Select 原语）。
 */

import type { Accessor, Component, JSX, ParentProps, ValidComponent } from 'solid-js';
import { Show, createContext, onCleanup, splitProps, useContext } from 'solid-js';
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
  type ScrollGutterMode,
} from '@/lib/ui/viewport-classes';
import { PopperScrollViewport } from '@/components/shared/PopperScrollViewport';
import { blurActiveElement } from '@/utils/accessibility';
import { scheduleOverlayPositionSync } from '@/lib/ui/overlay-position-sync';
import { ThemedComponentBackground } from '@/components/theme/ThemedComponentBackground';

export type { ScrollGutterMode };

/** 有 √ 时的选项行左侧留白（给 absolute 勾选图标留位，勿再用 pl-2 覆盖） */
export const APP_SELECT_ITEM_CLASS = 'pl-8';

/** 无 √ 时的选项行内边距 */
export const APP_SELECT_ITEM_PLAIN_CLASS = 'pl-2 pr-2';

/** 表单 / 对话框：全宽触发器 */
export const APP_SELECT_TRIGGER_FORM = 'w-full';

/** 探索枢纽等内联芯片内嵌选择 */
export const APP_SELECT_TRIGGER_INLINE =
  'h-7 w-full min-w-0 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0';

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
  'flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

const APP_SELECT_CONTENT_MOTION_CLASS =
  'relative min-w-32 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-expanded:animate-in data-closed:animate-out data-closed:fade-out-0 data-expanded:fade-in-0 data-closed:zoom-out-95 data-expanded:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2';

const APP_SELECT_ITEM_BASE_CLASS =
  'relative flex w-full min-w-0 cursor-default select-none items-center overflow-hidden rounded-sm py-1.5 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50';

const APP_SELECT_ITEM_LABEL_CLASS = 'min-w-0 flex-1 truncate';

const APP_SELECT_VALUE_CLASS = 'min-w-0 flex-1 truncate text-left';

const AppSelectCheckmarkContext = createContext<Accessor<boolean>>(() => true);

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
      return;
    }
    // 选完会把焦点还回 Trigger；延后到 focus restore 之后再 blur，避免焦点环闪现
    requestAnimationFrame(() => {
      requestAnimationFrame(() => blurActiveElement());
    });
  };
}

export type AppSelectReclickSelected = 'keep' | 'clear';

export type AppSelectProps<Option = string, OptGroup = never> = ParentProps<
  SelectRootProps<Option, OptGroup> & {
    /**
     * 为 true 时不注入打开/关闭时的 blur（与内嵌页手势等极少数场景协调时使用）
     */
    disableAccessibilityAnnounce?: boolean;
    /**
     * 是否在选中项左侧显示 √（默认 true）。
     * 可在根上统一关闭；也可在 AppSelectItem 上逐项覆盖。
     */
    showCheckmark?: boolean;
    /**
     * 再次点击**已选中项**时的行为（映射 Kobalte `disallowEmptySelection`）：
     * - `'keep'`（默认）：保持选中，不触发清空（表单/设置下拉推荐）
     * - `'clear'`：取消选中，`onChange` 收到 `null`/`undefined`，由调用方回落到默认值
     *
     * 若显式传入 `disallowEmptySelection`，以该 prop 为准。
     */
    reclickSelected?: AppSelectReclickSelected;
  }
>;

export function AppSelect<Option = string, OptGroup = never>(
  props: AppSelectProps<Option, OptGroup>
) {
  const [local, rest] = splitProps(props, [
    'onOpenChange',
    'disableAccessibilityAnnounce',
    'showCheckmark',
    'reclickSelected',
    'disallowEmptySelection',
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
  const showCheckmark = () => local.showCheckmark !== false;
  /** 默认 keep：避免「再点已选项 → 清空 → 调用方回落默认」的全局踩坑 */
  const disallowEmptySelection = () =>
    local.disallowEmptySelection ?? local.reclickSelected !== 'clear';

  return (
    <AppSelectCheckmarkContext.Provider value={showCheckmark}>
      <Select
        fitViewport
        overflowPadding={popperOverflowPadding}
        {...rest}
        disallowEmptySelection={disallowEmptySelection()}
        onOpenChange={handleOpenChange}
      />
    </AppSelectCheckmarkContext.Provider>
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
    /**
     * 是否显示左侧 √（默认跟随 AppSelect.showCheckmark，再默认 true）。
     * 设为 false 时去掉勾选图标并收紧左侧留白。
     */
    showCheckmark?: boolean;
  };

export const AppSelectItem = <T extends ValidComponent = 'li'>(
  props: PolymorphicProps<T, AppSelectItemProps<T>>,
) => {
  const [local, others] = splitProps(props as AppSelectItemProps, [
    'class',
    'children',
    'showCheckmark',
  ]);
  const ctxShowCheckmark = useContext(AppSelectCheckmarkContext);
  const showCheckmark = () => local.showCheckmark ?? ctxShowCheckmark();
  return (
    <SelectPrimitive.Item
      class={cn(
        APP_SELECT_ITEM_BASE_CLASS,
        showCheckmark() ? APP_SELECT_ITEM_CLASS : APP_SELECT_ITEM_PLAIN_CLASS,
        local.class,
      )}
      {...others}
    >
      <Show when={showCheckmark()}>
        <SelectPrimitive.ItemIndicator class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
          <CheckIcon class="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </Show>
      <SelectPrimitive.ItemLabel class={APP_SELECT_ITEM_LABEL_CLASS}>
        {local.children}
      </SelectPrimitive.ItemLabel>
    </SelectPrimitive.Item>
  );
};

type AppSelectListboxProps<T extends ValidComponent = 'ul'> =
  SelectPrimitive.SelectListboxProps<T> & {
    class?: string | undefined;
    /**
     * 滚动条预留：both 两侧 / single 单侧 / auto 自动（默认）
     */
    scrollGutter?: ScrollGutterMode;
  };

export const AppSelectListbox = <T extends ValidComponent = 'ul'>(
  props: PolymorphicProps<T, AppSelectListboxProps<T>>,
) => {
  const [local, others] = splitProps(props as AppSelectListboxProps, ['class', 'scrollGutter']);
  return (
    <PopperScrollViewport class="px-1" scrollGutter={local.scrollGutter}>
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

type AppSelectValueProps<Option = unknown, T extends ValidComponent = 'span'> =
  SelectPrimitive.SelectValueProps<Option, T> & {
    class?: string | undefined;
  };

export function AppSelectValue<Option = unknown, T extends ValidComponent = 'span'>(
  props: PolymorphicProps<T, AppSelectValueProps<Option, T>>,
) {
  const [local, others] = splitProps(props as AppSelectValueProps<Option>, ['class']);
  return <SelectValue class={cn(APP_SELECT_VALUE_CLASS, local.class)} {...others} />;
}
