/**
 * 应用内 Tooltip：Portal 挂 body，z-index 随浮层档位；阅读器叠层内请为 Content 设置 layer="viewer"。
 * 全局开关：设置 → 外观与主题 → 显示工具提示。
 */

import type { Component, ValidComponent } from 'solid-js';
import { splitProps } from 'solid-js';
import type { PolymorphicProps } from '@kobalte/core/polymorphic';
import * as TooltipPrimitive from '@kobalte/core/tooltip';

import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip';
import { overlayLayerZ } from '@/lib/ui/overlay-layer-active';
import { MEDIA_VIEWER_OVERLAY_LAYER_Z } from '@/lib/ui/overlay-z';
import { settingsStore } from '@/stores/settings';
import { cn } from '@/lib/utils';

/** 浮层层级：阅读器导航叠层内须用 viewer，避免被 Drawer 遮挡 */
export type AppTooltipLayer = 'app' | 'viewer';

const TOOLTIP_CONTENT_BASE_CLASS =
  'origin-(--kb-popover-content-transform-origin) overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95';

type AppTooltipRootProps = TooltipPrimitive.TooltipRootProps;

const AppTooltipRoot: Component<AppTooltipRootProps> = (props) => {
  const [local, rest] = splitProps(props, ['disabled']);
  const tooltipsEnabled = () => settingsStore.state.app.showTooltips !== false;
  return (
    <Tooltip
      disabled={!tooltipsEnabled() || local.disabled}
      {...rest}
    />
  );
};

export { AppTooltipRoot as AppTooltip, TooltipTrigger as AppTooltipTrigger };

export type AppTooltipContentProps<T extends ValidComponent = 'div'> =
  TooltipPrimitive.TooltipContentProps<T> & {
    class?: string | undefined;
    /** 浮层层级；阅读器 Drawer / 工具栏内用 viewer */
    layer?: AppTooltipLayer;
    /** 覆盖 Content z-index */
    portalZClass?: string;
  };

export const AppTooltipContent = <T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, AppTooltipContentProps<T>>,
) => {
  const [local, rest] = splitProps(props as AppTooltipContentProps, [
    'class',
    'portalZClass',
    'layer',
  ]);
  const popperZ = () => {
    if (local.portalZClass) return local.portalZClass;
    if (local.layer === 'viewer') {
      return MEDIA_VIEWER_OVERLAY_LAYER_Z.popper;
    }
    return overlayLayerZ().popper;
  };

  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        class={cn(TOOLTIP_CONTENT_BASE_CLASS, popperZ(), local.class)}
        {...rest}
      />
    </TooltipPrimitive.Portal>
  );
};
