/**
 * 应用内 Tooltip：Portal 挂 body，z-index 随 publishActiveOverlayLayer(nav.top()) 档位。
 * 阅读器叠层内请用 ViewerAppTooltipContent（显式 portalToBody + VIEWER_OVERLAY_Z）。
 */

import type { ValidComponent } from 'solid-js';
import { splitProps } from 'solid-js';
import type { PolymorphicProps } from '@kobalte/core/polymorphic';
import * as TooltipPrimitive from '@kobalte/core/tooltip';

import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip';
import { useOverlayLayerZ } from '@/lib/ui/overlay-layer-active';
import { cn } from '@/lib/utils';

export { Tooltip as AppTooltip, TooltipTrigger as AppTooltipTrigger };

const TOOLTIP_CONTENT_BASE_CLASS =
  'origin-(--kb-popover-content-transform-origin) overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95';

type AppTooltipContentProps<T extends ValidComponent = 'div'> =
  TooltipPrimitive.TooltipContentProps<T> & {
    class?: string | undefined;
    /** 覆盖 Content z-index（如内嵌页更高档位） */
    portalZClass?: string;
    /**
     * 与 BookInfoDrawer / ViewerApp* 一致：挂 document.body。
     * 未设时仍挂 body，但 z-index 走当前 overlay 档位。
     */
    portalToBody?: boolean;
  };

export const AppTooltipContent = <T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, AppTooltipContentProps<T>>,
) => {
  const [local, rest] = splitProps(props as AppTooltipContentProps, [
    'class',
    'portalZClass',
    'portalToBody',
  ]);
  const layer = useOverlayLayerZ();
  const popperZ = () => local.portalZClass ?? layer.popper;

  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        class={cn(TOOLTIP_CONTENT_BASE_CLASS, popperZ(), local.class)}
        {...rest}
      />
    </TooltipPrimitive.Portal>
  );
};
