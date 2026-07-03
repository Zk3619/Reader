import { createEffect, onCleanup, onMount, type Accessor } from 'solid-js';
import {
  measureReaderBrightnessChromeInsets,
  READER_BAR_TRANSITION_MS,
  READER_BRIGHTNESS_INSET_BOTTOM_VAR,
  READER_BRIGHTNESS_INSET_TOP_VAR,
  stabilizeReaderBrightnessChromeInsets,
  type ReaderBrightnessChromeInsets,
} from '@/lib/viewer/reader-brightness-insets';
import { subscribeViewportGeometryChange } from '@/lib/platform/viewport-geometry';

const EMPTY_INSETS: ReaderBrightnessChromeInsets = { top: 0, bottom: 0 };

/**
 * 将顶/底栏占位写入 chrome-slots 的 CSS 变量，避免 Solid 响应式更新导致亮度胶囊抖动。
 */
export function useReaderBrightnessChromeInsets(
  hostRef: Accessor<HTMLElement | undefined>,
  chromeVisible: Accessor<boolean>,
  remeasureKey: Accessor<unknown>,
  enabled: Accessor<boolean>,
): void {
  onMount(() => {
    let settleTimer: number | undefined;
    let orientationTimer: number | undefined;
    let lastApplied: ReaderBrightnessChromeInsets = EMPTY_INSETS;

    const slotsEl = (): HTMLElement | null => {
      const host = hostRef();
      if (!host) return null;
      const slots = host.closest('[data-media-viewer-chrome-slots]');
      return slots instanceof HTMLElement ? slots : null;
    };

    const applyCssInsets = (next: ReaderBrightnessChromeInsets) => {
      const stable = stabilizeReaderBrightnessChromeInsets(lastApplied, next);
      if (stable.top === lastApplied.top && stable.bottom === lastApplied.bottom) {
        return;
      }
      lastApplied = stable;
      const slots = slotsEl();
      if (!slots) return;
      slots.style.setProperty(READER_BRIGHTNESS_INSET_TOP_VAR, `${stable.top}px`);
      slots.style.setProperty(READER_BRIGHTNESS_INSET_BOTTOM_VAR, `${stable.bottom}px`);
    };

    const clearCssInsets = () => {
      lastApplied = EMPTY_INSETS;
      const slots = slotsEl();
      if (!slots) return;
      slots.style.removeProperty(READER_BRIGHTNESS_INSET_TOP_VAR);
      slots.style.removeProperty(READER_BRIGHTNESS_INSET_BOTTOM_VAR);
    };

    const measure = () => {
      if (!enabled() || !chromeVisible()) return;

      const host = hostRef();
      if (!host) {
        clearCssInsets();
        return;
      }
      const slots = host.closest('[data-media-viewer-chrome-slots]');
      if (!(slots instanceof HTMLElement)) {
        clearCssInsets();
        return;
      }
      applyCssInsets(measureReaderBrightnessChromeInsets(slots, host));
    };

    const scheduleSettleMeasure = () => {
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(measure, READER_BAR_TRANSITION_MS);
    };

    const scheduleOrientationMeasure = () => {
      if (orientationTimer !== undefined) window.clearTimeout(orientationTimer);
      orientationTimer = window.setTimeout(measure, 180);
    };

    const unsubscribeGeometry = subscribeViewportGeometryChange(
      () => scheduleOrientationMeasure(),
      { listenVisualViewportScroll: false },
    );

    createEffect(() => {
      if (!enabled()) {
        clearCssInsets();
        return;
      }
      chromeVisible();
      remeasureKey();
      hostRef();
      if (chromeVisible()) {
        scheduleSettleMeasure();
      } else {
        clearCssInsets();
      }
    });

    onCleanup(() => {
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
      if (orientationTimer !== undefined) window.clearTimeout(orientationTimer);
      unsubscribeGeometry();
      clearCssInsets();
    });
  });
}
