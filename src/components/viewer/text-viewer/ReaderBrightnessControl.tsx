/**
 * 阅读器亮度控件（对齐 Legado ReadMenu llBrightness：视口左侧竖向悬浮）
 */

import { createEffect, createSignal, Show } from 'solid-js';
import * as SliderPrimitive from '@kobalte/core/slider';
import { Button } from '@/components/ui/button';
import { textViewerStore } from '@/stores/viewer';
import {
  normalizeBrightnessViewPosition,
  normalizeReadBrightness,
  type TextViewerBrightnessViewPosition,
} from '@/lib/media/text/reader-ui-config';
import {
  resolveBrightnessChrome,
  type ReaderBrightnessChrome,
} from '@/lib/media/text/reader-theme-classes';
import {
  applyReadBrightness,
  restoreBrightnessOnExit,
} from '@/lib/platform/display-reader';
import { ThemeLightIcon, ThemeScheduleIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import { READER_BRIGHTNESS_CHROME_GAP_PX } from '@/lib/viewer/reader-brightness-insets';
import { useReaderBrightnessChromeInsets } from '@/lib/viewer/use-reader-brightness-chrome-insets';
import { mediaViewerChromeHitTargetClass } from '@/components/viewer/viewer-chrome';

export interface ReaderBrightnessControlProps {
  /** 顶底栏可见时显示（与 Legado 菜单联动） */
  chromeVisible: boolean;
  /** 嵌入顶/底栏内，随栏显隐，无需绝对定位 */
  embeddedChrome?: 'top' | 'bottom';
  class?: string;
}

/** 左右侧胶囊高度上限 */
const SIDE_CAPSULE_MAX_HEIGHT = 'min(56dvh, 20rem)';
/** 顶/底胶囊宽度上限 */
const EDGE_CAPSULE_MAX_WIDTH = 'min(72dvw, 20rem)';

function BrightnessSlider(props: {
  orientation: 'horizontal' | 'vertical';
  value: number;
  disabled: boolean;
  chrome: ReaderBrightnessChrome;
  onChange: (value: number) => void;
}) {
  const vertical = () => props.orientation === 'vertical';

  return (
    <SliderPrimitive.Root
      orientation={props.orientation}
      class={cn(
        'relative flex touch-none select-none',
        vertical() ? 'h-full w-full flex-col items-center' : 'h-full w-full items-center',
      )}
      value={[props.value]}
      minValue={0}
      maxValue={100}
      step={1}
      disabled={props.disabled}
      onChange={(values) => props.onChange(normalizeReadBrightness(values[0]))}
    >
      <SliderPrimitive.Track
        class={cn(
          'relative rounded-full',
          vertical() ? 'h-full w-2' : 'h-2 w-full',
        )}
        style={{ 'background-color': props.chrome.sliderTrack }}
      >
        <SliderPrimitive.Fill
          class={cn('absolute rounded-full', vertical() ? 'inset-x-0' : 'inset-y-0')}
          style={{ 'background-color': props.chrome.sliderFill }}
        />
        <SliderPrimitive.Thumb
          class={cn(
            'absolute block size-5 rounded-full border-2',
            'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:pointer-events-none disabled:opacity-50',
            vertical()
              ? 'left-1/2 -translate-x-1/2'
              : 'top-1/2 -translate-y-1/2',
          )}
          style={{
            'background-color': props.chrome.sliderThumb,
            'border-color': props.chrome.sliderThumb,
          }}
        >
          <SliderPrimitive.Input />
        </SliderPrimitive.Thumb>
      </SliderPrimitive.Track>
    </SliderPrimitive.Root>
  );
}

function brightnessShellClass(
  position: TextViewerBrightnessViewPosition,
  embeddedChrome?: 'top' | 'bottom',
): string {
  const posClass = `reader-brightness-capsule-shell--${position}`;

  if (embeddedChrome === 'top') {
    return cn(
      posClass,
      'reader-brightness-capsule-shell--embedded-top',
      'w-full items-center justify-center px-3',
    );
  }
  if (embeddedChrome === 'bottom') {
    return cn(
      posClass,
      'reader-brightness-capsule-shell--embedded-bottom',
      'w-full items-center justify-center px-3',
    );
  }

  switch (position) {
    case 'right':
      return cn(posClass, 'right-3 w-10 items-center justify-center');
    case 'top':
      return cn(posClass, 'left-1/2 w-auto max-w-[min(92vw,24rem)] -translate-x-1/2 items-start justify-center');
    case 'bottom':
      return cn(posClass, 'left-1/2 w-auto max-w-[min(92vw,24rem)] -translate-x-1/2 items-end justify-center');
    default:
      return cn(posClass, 'left-3 w-10 items-center justify-center');
  }
}

function brightnessShellInsetStyle(
  position: TextViewerBrightnessViewPosition,
  insets: { top: number; bottom: number },
): { top?: string; bottom?: string } {
  const gap = READER_BRIGHTNESS_CHROME_GAP_PX;
  switch (position) {
    case 'top':
      return { top: `${insets.top + gap}px` };
    case 'bottom':
      return { bottom: `${insets.bottom + gap}px` };
    case 'right':
    case 'left':
      return {
        top: `${insets.top + gap}px`,
        bottom: `${insets.bottom + gap}px`,
      };
    default:
      return {};
  }
}

function brightnessCapsuleClass(
  position: TextViewerBrightnessViewPosition,
  embedded?: boolean,
): string {
  const edge = position === 'top' || position === 'bottom';
  return cn(
    'flex items-center rounded-full backdrop-blur-sm',
    edge
      ? cn(
          'h-10 flex-row gap-0 px-3 py-1.5',
          embedded ? 'w-auto max-w-[min(72vw,20rem)]' : 'w-full max-w-[min(72vw,20rem)]',
        )
      : 'h-full w-full max-h-[min(56dvh,20rem)] flex-col px-1.5 py-3',
  );
}

export function ReaderBrightnessControl(props: ReaderBrightnessControlProps) {
  const [hostRef, setHostRef] = createSignal<HTMLElement | undefined>();
  const brightnessAuto = () => textViewerStore.state.config.brightnessAuto !== false;
  const position = () =>
    normalizeBrightnessViewPosition(textViewerStore.state.config.brightnessViewPosition);
  const embeddedChrome = () => props.embeddedChrome;
  const isEmbedded = () => embeddedChrome() != null;
  const isEdgePosition = () => position() === 'top' || position() === 'bottom';
  const configEnabled = () => textViewerStore.state.config.showBrightnessView !== false;
  const visible = () => props.chromeVisible && configEnabled();
  const followPageTheme = () =>
    textViewerStore.state.config.brightnessViewStyleFollowPage !== false;
  const chrome = () =>
    resolveBrightnessChrome(
      textViewerStore.state.config.theme ?? 0,
      followPageTheme(),
    );
  const sliderOrientation = (): 'horizontal' | 'vertical' =>
    isEdgePosition() ? 'horizontal' : 'vertical';

  const chromeInsets = useReaderBrightnessChromeInsets(
    hostRef,
    () => props.chromeVisible,
    () =>
      [
        position(),
        textViewerStore.state.config.showReadTitleAddition,
        textViewerStore.state.config.pageTips,
        textViewerStore.state.config.viewerChromeLayout,
      ] as const,
    () => !isEmbedded() && (position() === 'left' || position() === 'right'),
  );

  const shellInsetStyle = () =>
    isEmbedded() ? undefined : brightnessShellInsetStyle(position(), chromeInsets());

  createEffect(() => {
    if (!visible() || brightnessAuto()) return;
    const level = normalizeReadBrightness(textViewerStore.state.config.readBrightness);
    void applyReadBrightness(level);
  });

  const value = () => normalizeReadBrightness(textViewerStore.state.config.readBrightness);

  const toggleBrightnessAuto = () => {
    const next = !brightnessAuto();
    textViewerStore.setConfig({ brightnessAuto: next });
    if (next) {
      void restoreBrightnessOnExit(true);
      return;
    }
    void applyReadBrightness(textViewerStore.state.config.readBrightness ?? 100);
  };

  const capsuleStyle = () => {
    const c = chrome();
    const edge = isEdgePosition();
    return {
      'background-color': c.capsuleBg,
      color: c.foreground,
      'box-shadow': c.capsuleGlow,
      ...(edge ? { 'max-width': EDGE_CAPSULE_MAX_WIDTH } : { 'max-height': SIDE_CAPSULE_MAX_HEIGHT }),
    } as const;
  };

  return (
    <Show when={configEnabled()}>
      <div
        ref={(el) => {
          if (isEmbedded()) return;
          const parent = el.parentElement;
          setHostRef(parent instanceof HTMLElement ? parent : el);
        }}
        class={cn(
          'reader-brightness-capsule-shell pointer-events-none flex',
          !isEmbedded() && 'absolute z-20',
          brightnessShellClass(position(), embeddedChrome()),
          !isEmbedded() && !visible() && 'reader-brightness-capsule-shell--hidden',
          props.class,
        )}
        style={shellInsetStyle()}
        data-media-viewer-interactive-zone
        onClick={(e) => e.stopPropagation()}
      >
        <div
          class={cn(
            'reader-brightness-capsule-track',
            mediaViewerChromeHitTargetClass,
            brightnessCapsuleClass(position(), isEmbedded()),
          )}
          style={capsuleStyle()}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="size-8 shrink-0 rounded-full transition-colors"
            style={{ color: chrome().foreground }}
            aria-label={brightnessAuto() ? '切换为手动亮度' : '切换为自动亮度'}
            aria-pressed={brightnessAuto()}
            onClick={toggleBrightnessAuto}
            onMouseEnter={(e: MouseEvent) => {
              const el = e.currentTarget as HTMLElement | null;
              if (!el) return;
              el.style.backgroundColor = chrome().buttonHoverBg;
            }}
            onMouseLeave={(e: MouseEvent) => {
              const el = e.currentTarget as HTMLElement | null;
              if (!el) return;
              el.style.backgroundColor = 'transparent';
            }}
          >
            <Show when={brightnessAuto()} fallback={<ThemeLightIcon class="size-4" />}>
              <ThemeScheduleIcon class="size-4" />
            </Show>
          </Button>
          <div
            class={cn(
              'flex min-w-0',
              isEdgePosition()
                ? 'min-w-34 flex-1 items-center px-1 py-0.5'
                : 'min-h-0 w-full flex-1 flex-col px-1 py-0.5',
            )}
          >
            <BrightnessSlider
              orientation={sliderOrientation()}
              value={value()}
              disabled={brightnessAuto()}
              chrome={chrome()}
              onChange={(next) => {
                textViewerStore.setConfig({
                  brightnessAuto: false,
                  readBrightness: next,
                });
              }}
            />
          </div>
        </div>
      </div>
    </Show>
  );
}
