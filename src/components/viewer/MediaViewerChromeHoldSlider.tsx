/**
 * 阅读器顶底栏滑条：拖动期间暂停 chrome 自动隐藏。
 * Kobalte Root 不含 Track/Thumb DOM，hold 须挂在 Track/Thumb 上（勿改 ui/slider）。
 */

import { splitProps } from 'solid-js';
import * as SliderPrimitive from '@kobalte/core/slider';
import { cn } from '@/lib/utils';
import {
  mergeMediaViewerChromeSliderChangeEndHold,
  mergeMediaViewerChromeSliderPointerDownHold,
} from '@/lib/media/media-viewer-chrome-auto-hide-hold';

type MediaViewerChromeHoldSliderProps = SliderPrimitive.SliderRootProps & {
  class?: string;
};

export function MediaViewerChromeHoldSlider(props: MediaViewerChromeHoldSliderProps) {
  const [local, others] = splitProps(props, ['class', 'onChange', 'onChangeEnd', 'disabled']);

  return (
    <SliderPrimitive.Root
      class={cn(
        'viewer-chrome-slider-root relative flex w-full touch-none select-none items-center overflow-visible py-1.5',
        local.class,
      )}
      disabled={local.disabled}
      {...others}
      onChange={local.onChange}
      onChangeEnd={mergeMediaViewerChromeSliderChangeEndHold(
        typeof local.onChangeEnd === 'function' ? local.onChangeEnd : undefined,
      )}
    >
      <SliderPrimitive.Track
        class="relative h-2 w-full overflow-visible rounded-full bg-secondary"
        onPointerDown={mergeMediaViewerChromeSliderPointerDownHold()}
      >
        <SliderPrimitive.Fill class="absolute h-full rounded-full bg-primary" />
        <SliderPrimitive.Thumb
          class="top-[-6px] block size-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          onPointerDown={mergeMediaViewerChromeSliderPointerDownHold()}
        >
          <SliderPrimitive.Input />
        </SliderPrimitive.Thumb>
      </SliderPrimitive.Track>
    </SliderPrimitive.Root>
  );
}
