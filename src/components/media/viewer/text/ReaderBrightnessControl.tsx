/**
 * 阅读器亮度控件（对齐 Legado ReadMenu llBrightness：视口左侧竖向悬浮）
 */

import { createSignal, Show } from 'solid-js';
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
import { textViewerChromeFollowPageSurfaceStyle } from '@/lib/theme/TextViewerTheme';
import { resolveVisualBoxShadow } from '@/lib/ui/visual-effects-settings';
import {
  restoreBrightnessOnExit,
} from '@/lib/platform/display-reader';
import {
  mergeMediaViewerChromeSliderChangeEndHold,
  mergeMediaViewerChromeSliderPointerDownHold,
} from '@/lib/media/media-viewer-chrome-auto-hide-hold';
import { ThemeLightIcon, ThemeScheduleIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import { useReaderBrightnessChromeInsets } from '@/lib/viewer/use-reader-brightness-chrome-insets';
import {
  mediaViewerChromeFloatingControlClass,
  mediaViewerChromeHitTargetClass,
} from '@/components/media/viewer/viewer-chrome';
import { useMediaViewerChromeFloating, useViewerChromeLayout } from '@/lib/viewer/viewer-chrome-layout';
import {
  mergeViewerChromeSurfaceStyles,
  resolveViewerChromeOverlayAppearanceStyle,
  viewerChromeOverlayAppearanceApplies,
} from '@/lib/viewer/media-viewer-chrome-overlay-appearance';

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
        'relative flex min-w-0 touch-none select-none overflow-visible',
        vertical()
          ? 'h-full w-full min-h-0 flex-col items-center'
          : 'h-auto w-full max-w-full items-center py-1.5',
      )}
      value={[props.value]}
      minValue={0}
      maxValue={100}
      step={1}
      disabled={props.disabled}
      onChange={(values) => props.onChange(normalizeReadBrightness(values[0]))}
      onChangeEnd={mergeMediaViewerChromeSliderChangeEndHold()}
    >
      <SliderPrimitive.Track
        onPointerDown={mergeMediaViewerChromeSliderPointerDownHold()}
        class={cn(
          'relative shrink-0 overflow-visible rounded-full',
          vertical() ? 'h-full w-2' : 'h-2 w-full max-w-full',
        )}
        style={{ 'background-color': props.chrome.sliderTrack }}
      >
        <SliderPrimitive.Fill
          class={cn('absolute rounded-full', vertical() ? 'inset-x-0' : 'inset-y-0 left-0')}
          style={{ 'background-color': props.chrome.sliderFill }}
        />
        <SliderPrimitive.Thumb
          onPointerDown={mergeMediaViewerChromeSliderPointerDownHold()}
          class={cn(
            'absolute block size-5 rounded-full border-2',
            'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:pointer-events-none disabled:opacity-50',
            vertical()
              ? 'left-1/2 -translate-x-1/2'
              : 'top-[-6px]',
          )}
          style={{
            'background-color': props.chrome.capsuleBg,
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
      'w-full min-w-0 max-w-full items-center justify-center overflow-visible px-2',
    );
  }
  if (embeddedChrome === 'bottom') {
    return cn(
      posClass,
      'reader-brightness-capsule-shell--embedded-bottom',
      'w-full min-w-0 max-w-full items-center justify-center overflow-visible px-2',
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

function brightnessShellInsetClass(
  position: TextViewerBrightnessViewPosition,
): string | undefined {
  switch (position) {
    case 'top':
      return 'reader-brightness-capsule-shell--inset-top';
    case 'bottom':
      return 'reader-brightness-capsule-shell--inset-bottom';
    case 'right':
    case 'left':
      return 'reader-brightness-capsule-shell--inset-vertical';
    default:
      return undefined;
  }
}

function brightnessCapsuleClass(
  position: TextViewerBrightnessViewPosition,
  embedded?: boolean,
  floating?: boolean,
  followPage?: boolean,
): string {
  const edge = position === 'top' || position === 'bottom';
  return cn(
    'reader-brightness-capsule-track flex shrink-0 items-center rounded-full',
    edge
      ? 'h-10 w-[min(72dvw,20rem)] max-w-full min-w-[10rem] flex-row gap-1 px-2'
      : 'h-full min-w-0 w-full max-h-[min(56dvh,20rem)] flex-col px-1.5 py-3',
    floating &&
    (followPage
      ? 'border border-border/50 text-foreground shadow-sm'
      : mediaViewerChromeFloatingControlClass),
    floating && embedded && 'mx-auto',
  );
}

export function ReaderBrightnessControl(props: ReaderBrightnessControlProps) {
  const [hostRef, setHostRef] = createSignal<HTMLElement | undefined>();
  const floating = useMediaViewerChromeFloating();
  const chromeLayout = useViewerChromeLayout();
  const overlayChromeApplies = () => viewerChromeOverlayAppearanceApplies(chromeLayout());
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
  const themeId = () => textViewerStore.state.config.theme ?? 0;
  const chrome = () =>
    resolveBrightnessChrome(themeId(), followPageTheme());
  const sliderOrientation = (): 'horizontal' | 'vertical' =>
    isEdgePosition() ? 'horizontal' : 'vertical';

  useReaderBrightnessChromeInsets(
    hostRef,
    () => props.chromeVisible,
    () =>
      [
        position(),
        textViewerStore.state.config.showReadTitleAddition,
        textViewerStore.state.config.pageTips,
        textViewerStore.state.config.viewerChromeLayout,
      ] as const,
    () => !isEmbedded(),
  );

  const value = () => normalizeReadBrightness(textViewerStore.state.config.readBrightness);

  const toggleBrightnessAuto = () => {
    const next = !brightnessAuto();
    textViewerStore.setConfig({ brightnessAuto: next });
    if (next) {
      void restoreBrightnessOnExit(true);
    }
  };

  const capsuleStyle = () => {
    const c = chrome();
    const edge = isEdgePosition();
    const sizeConstraint = edge
      ? { width: EDGE_CAPSULE_MAX_WIDTH, maxWidth: '100%' }
      : { maxHeight: SIDE_CAPSULE_MAX_HEIGHT };

    const baseStyle = {
      color: c.foreground,
      'box-shadow': resolveVisualBoxShadow(c.capsuleGlow) ?? 'none',
      ...sizeConstraint,
    };

    if (followPageTheme()) {
      return mergeViewerChromeSurfaceStyles(
        textViewerChromeFollowPageSurfaceStyle(themeId(), {
          themeSurfaceAppearance: textViewerStore.state.config.themeSurfaceAppearance,
        }, 'brightness'),
        baseStyle,
      );
    }

    if (overlayChromeApplies()) {
      return mergeViewerChromeSurfaceStyles(
        resolveViewerChromeOverlayAppearanceStyle(c.capsuleBg),
        baseStyle,
      );
    }

    return mergeViewerChromeSurfaceStyles({ 'background-color': c.capsuleBg }, baseStyle);
  };

  return (
    <Show when={configEnabled()}>
      <div
        ref={(el) => {
          if (isEmbedded()) return;
          const slots = el.closest('[data-media-viewer-chrome-slots]');
          setHostRef(slots instanceof HTMLElement ? slots : undefined);
        }}
        class={cn(
          'reader-brightness-capsule-shell pointer-events-none flex',
          !isEmbedded() && 'absolute z-20',
          brightnessShellClass(position(), embeddedChrome()),
          !isEmbedded() && brightnessShellInsetClass(position()),
          !isEmbedded() && !visible() && 'reader-brightness-capsule-shell--hidden',
          props.class,
        )}
        data-media-viewer-interactive-zone
        onClick={(e) => e.stopPropagation()}
      >
        <div
          class={cn(
            mediaViewerChromeHitTargetClass,
            brightnessCapsuleClass(
              position(),
              isEmbedded(),
              floating.isFloating(),
              followPageTheme(),
            ),
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
              'reader-brightness-capsule-slider-lane',
              isEdgePosition() ? 'flex-row' : 'flex-col px-0.5',
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
