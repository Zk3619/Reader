/**
 * 应用内 Popover：统一 Portal 挂载、z-index 档位，以及「调节型」浮层的焦点/菜单共存行为。
 * 底层仍使用 @/components/ui/popover（Kobalte Popover 原语）。
 */

import type { Component, JSX, ValidComponent } from 'solid-js';
import { splitProps } from 'solid-js';
import type { PolymorphicProps } from '@kobalte/core/polymorphic';
import * as PopoverPrimitive from '@kobalte/core/popover';

import { Popover, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { overlayLayerZ } from '@/lib/ui/overlay-layer-active';
import { MEDIA_VIEWER_OVERLAY_LAYER_Z } from '@/lib/ui/overlay-z';
import { useOverlayPortalMount } from '@/lib/ui/overlay-portal-mount';
import { ThemedComponentBackground } from '@/components/theme/ThemedComponentBackground';
import { blurActiveElement } from '@/utils/accessibility';

export type AppPopoverLayer = 'app' | 'viewer';

export type AppPopoverProps = PopoverPrimitive.PopoverRootProps;

export const AppPopover: Component<AppPopoverProps> = (props) => {
  const [local, rest] = splitProps(props, ['modal', 'gutter']);
  // 与 AppDropdownMenu 一致：默认非 modal，避免内容内 Combobox/Slider 焦点与 dismiss 层冲突
  return (
    <Popover gutter={local.gutter ?? 4} modal={local.modal ?? false} {...rest} />
  );
};

export const AppPopoverTrigger = PopoverTrigger;

const APP_POPOVER_CONTENT_BASE_CLASS =
  'w-72 origin-[var(--kb-popover-content-transform-origin)] rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none';

const APP_POPOVER_CONTENT_MOTION_CLASS =
  'data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95';

/** 拖动 Slider 等持续交互时关掉开关动画，避免看起来像反复打开 */
const APP_POPOVER_CONTENT_STABLE_MOTION_CLASS =
  'data-[expanded]:animate-none data-[closed]:animate-none';

/** 打开后短暂忽略外侧 pointer，避免「同一次点击」把刚打开的层立刻关掉 */
const STABLE_ADJUST_OPEN_GRACE_MS = 320;

function preventDefaultEvent(event: { preventDefault: () => void }): void {
  event.preventDefault();
}

function preventDismissForPortaledMenu(event: {
  preventDefault: () => void;
  target: EventTarget | null;
}): void {
  const el = event.target;
  if (!(el instanceof Element)) return;
  if (
    el.closest('[role="listbox"]') ||
    el.closest('[data-kb-combobox-content]') ||
    el.closest('[data-overlay-portal-host]')
  ) {
    event.preventDefault();
  }
}

export type AppPopoverContentProps<T extends ValidComponent = 'div'> =
  PopoverPrimitive.PopoverContentProps<T> & {
    class?: string | undefined;
    /** 浮层层级；音乐 Hub / 阅读器叠层内用 viewer */
    layer?: AppPopoverLayer;
    /** 覆盖 Content z-index */
    portalZClass?: string;
    /**
     * 挂 document.body（默认挂 overlay portal host；阅读器叠层内建议 true 或 layer=viewer）。
     */
    portalToBody?: boolean;
    /**
     * 调节型浮层：禁用开关动画；忽略 focus outside / 打开自动聚焦；
     * 打开后短宽限期忽略外侧 pointer（防同次点击立刻关闭）。
     * 关闭时不把焦点还给触发器（避免焦点环）。
     */
    stableAdjust?: boolean;
    /**
     * 内容内含 Combobox 等 Portal 菜单时，点击菜单不视为外侧交互。
     */
    allowPortaledMenus?: boolean;
    children?: JSX.Element;
  };

export const AppPopoverContent = <T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, AppPopoverContentProps<T>>,
) => {
  const [local, rest] = splitProps(props as AppPopoverContentProps, [
    'class',
    'layer',
    'portalZClass',
    'portalToBody',
    'stableAdjust',
    'allowPortaledMenus',
    'onOpenAutoFocus',
    'onCloseAutoFocus',
    'onFocusOutside',
    'onInteractOutside',
    'onPointerDownOutside',
    'children',
  ]);
  const overlayMount = useOverlayPortalMount();
  // Content 仅在打开时挂载（Presence）；记下挂载时刻供宽限期判断
  const mountedAt = Date.now();
  const withinOpenGrace = () =>
    local.stableAdjust === true && Date.now() - mountedAt < STABLE_ADJUST_OPEN_GRACE_MS;

  const mount = () => {
    if (local.portalToBody) return document.body;
    return overlayMount ?? document.body;
  };
  const popperZ = () => {
    if (local.portalZClass) return local.portalZClass;
    if (local.layer === 'viewer') return MEDIA_VIEWER_OVERLAY_LAYER_Z.popper;
    return overlayLayerZ().popper;
  };

  return (
    <PopoverPrimitive.Portal mount={mount()}>
      <PopoverPrimitive.Content
        class={cn(
          APP_POPOVER_CONTENT_BASE_CLASS,
          local.stableAdjust
            ? APP_POPOVER_CONTENT_STABLE_MOTION_CLASS
            : APP_POPOVER_CONTENT_MOTION_CLASS,
          popperZ(),
          local.class,
        )}
        onOpenAutoFocus={(event) => {
          if (local.stableAdjust) preventDefaultEvent(event);
          local.onOpenAutoFocus?.(event);
        }}
        onCloseAutoFocus={(event) => {
          // 关闭后不把焦点还给触发器，避免出现 focus-visible 焦点环
          preventDefaultEvent(event);
          blurActiveElement();
          local.onCloseAutoFocus?.(event);
        }}
        onFocusOutside={(event) => {
          if (local.stableAdjust) preventDefaultEvent(event);
          local.onFocusOutside?.(event);
        }}
        onInteractOutside={(event) => {
          if (withinOpenGrace()) {
            preventDefaultEvent(event);
            local.onInteractOutside?.(event);
            return;
          }
          if (local.stableAdjust) {
            const original = (event as { detail?: { originalEvent?: Event } }).detail
              ?.originalEvent;
            if (original && original.type !== 'pointerdown') {
              preventDefaultEvent(event);
            }
          }
          if (local.allowPortaledMenus) preventDismissForPortaledMenu(event);
          local.onInteractOutside?.(event);
        }}
        onPointerDownOutside={(event) => {
          if (withinOpenGrace()) {
            preventDefaultEvent(event);
            local.onPointerDownOutside?.(event);
            return;
          }
          if (local.allowPortaledMenus) preventDismissForPortaledMenu(event);
          local.onPointerDownOutside?.(event);
        }}
        {...rest}
      >
        <ThemedComponentBackground componentId="dropdown" />
        <div class="relative z-1">{local.children}</div>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
};
