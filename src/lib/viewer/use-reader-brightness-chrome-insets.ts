import { createEffect, createSignal, onCleanup, onMount, type Accessor } from 'solid-js';
import {
  measureReaderBrightnessChromeInsets,
  READER_BAR_TRANSITION_MS,
  type ReaderBrightnessChromeInsets,
} from '@/lib/viewer/reader-brightness-insets';

const EMPTY_INSETS: ReaderBrightnessChromeInsets = { top: 0, bottom: 0 };

const RESIZE_DEBOUNCE_MS = 120;

/**
 * 左右侧胶囊占位：仅在顶底栏稳定可见后测量；显隐过渡期间冻结，避免与栏动画打架。
 */
export function useReaderBrightnessChromeInsets(
  hostRef: Accessor<HTMLElement | undefined>,
  chromeVisible: Accessor<boolean>,
  remeasureKey: Accessor<unknown>,
  enabled: Accessor<boolean>,
): Accessor<ReaderBrightnessChromeInsets> {
  const [insets, setInsets] = createSignal<ReaderBrightnessChromeInsets>(EMPTY_INSETS);

  onMount(() => {
    let settleTimer: number | undefined;
    let resizeTimer: number | undefined;

    const measure = () => {
      if (!enabled() || !chromeVisible()) return;

      const host = hostRef();
      if (!host) {
        setInsets(EMPTY_INSETS);
        return;
      }
      const slots = host.closest('[data-media-viewer-chrome-slots]');
      if (!(slots instanceof HTMLElement)) {
        setInsets(EMPTY_INSETS);
        return;
      }
      setInsets(measureReaderBrightnessChromeInsets(slots, host));
    };

    const scheduleSettleMeasure = () => {
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(measure, READER_BAR_TRANSITION_MS);
    };

    const scheduleResizeMeasure = () => {
      if (!enabled() || !chromeVisible()) return;
      if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(measure, RESIZE_DEBOUNCE_MS);
    };

    const ro = new ResizeObserver(() => scheduleResizeMeasure());

    const observeChromeTree = () => {
      ro.disconnect();
      if (!enabled()) return;
      const host = hostRef();
      if (!host) return;
      const slots = host.closest('[data-media-viewer-chrome-slots]');
      ro.observe(host);
      if (!(slots instanceof HTMLElement)) return;
      ro.observe(slots);
      for (const el of slots.querySelectorAll<HTMLElement>(
        '.reader-chrome-overlay-panel__surface, .reader-chrome-floating-top__track, .reader-chrome-floating-bottom__track, .reader-top-bar, .reader-footer, .reader-chrome-page-tip',
      )) {
        ro.observe(el);
      }
    };

    createEffect(() => {
      if (!enabled()) return;
      chromeVisible();
      if (chromeVisible()) {
        scheduleSettleMeasure();
      }
    });

    createEffect(() => {
      if (!enabled()) return;
      remeasureKey();
      observeChromeTree();
      if (chromeVisible()) {
        measure();
      }
    });

    createEffect(() => {
      if (!enabled()) return;
      hostRef();
      observeChromeTree();
      if (chromeVisible()) {
        measure();
      }
    });

    createEffect(() => {
      if (!enabled()) {
        ro.disconnect();
        return;
      }
      observeChromeTree();
      if (chromeVisible()) {
        measure();
      }
    });

    onCleanup(() => {
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
      if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
      ro.disconnect();
    });
  });

  return insets;
}
