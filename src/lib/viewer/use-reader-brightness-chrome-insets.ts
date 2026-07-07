import { createEffect, onCleanup, onMount, type Accessor } from 'solid-js';
import {
  collectReaderBrightnessInsetWatchTargets,
  insetsNearlyEqual,
  measureReaderBrightnessChromeInsets,
  mergeReaderBrightnessChromeInsets,
  READER_BRIGHTNESS_INSET_BOTTOM_VAR,
  READER_BRIGHTNESS_INSET_TOP_VAR,
  READER_BRIGHTNESS_MEASURE_DEBOUNCE_MS,
  roundReaderBrightnessChromeInsets,
  type ReaderBrightnessChromeInsets,
} from '@/lib/viewer/reader-brightness-insets';
import { subscribeViewportGeometryChange } from '@/lib/platform/viewport-geometry';

const EMPTY_INSETS: ReaderBrightnessChromeInsets = { top: 0, bottom: 0 };

interface MeasureRunOptions {
  includeChromeBars?: boolean;
}

/**
 * 将顶/底栏占位写入 chrome-slots 的 CSS 变量，避免 Solid 响应式更新导致亮度胶囊抖动。
 */
export function useReaderBrightnessChromeInsets(
  hostRef: Accessor<HTMLElement | undefined>,
  chromeVisible: Accessor<boolean>,
  remeasureKey: Accessor<unknown>,
  enabled: Accessor<boolean>,
): void {
  let debounceTimer: number | undefined;
  let lastApplied: ReaderBrightnessChromeInsets = EMPTY_INSETS;
  let lastStableVisibleInsets: ReaderBrightnessChromeInsets | null = null;
  let prevChromeVisible: boolean | undefined;
  let resizeObserver: ResizeObserver | undefined;
  const observedNodes = new Set<Element>();

  const slotsEl = (): HTMLElement | null => {
    const host = hostRef();
    if (!host) return null;
    if (host.matches('[data-media-viewer-chrome-slots]')) return host;
    const slots = host.closest('[data-media-viewer-chrome-slots]');
    return slots instanceof HTMLElement ? slots : null;
  };

  const writeCssInsets = (insets: ReaderBrightnessChromeInsets) => {
    const slots = slotsEl();
    if (!slots) return;
    slots.style.setProperty(READER_BRIGHTNESS_INSET_TOP_VAR, `${insets.top}px`);
    slots.style.setProperty(READER_BRIGHTNESS_INSET_BOTTOM_VAR, `${insets.bottom}px`);
  };

  const rememberStableVisibleInsets = (insets: ReaderBrightnessChromeInsets) => {
    if (!chromeVisible()) return;
    lastStableVisibleInsets = { ...insets };
  };

  const applyInsetsIfChanged = (next: ReaderBrightnessChromeInsets) => {
    if (insetsNearlyEqual(lastApplied, next)) return false;
    lastApplied = next;
    writeCssInsets(next);
    rememberStableVisibleInsets(next);
    return true;
  };

  const clearCssInsets = () => {
    lastApplied = EMPTY_INSETS;
    const slots = slotsEl();
    if (!slots) return;
    slots.style.removeProperty(READER_BRIGHTNESS_INSET_TOP_VAR);
    slots.style.removeProperty(READER_BRIGHTNESS_INSET_BOTTOM_VAR);
  };

  const readInsets = (
    includeChromeBars = chromeVisible(),
  ): ReaderBrightnessChromeInsets | null => {
    if (!enabled()) return null;

    const host = hostRef();
    if (!host) return null;

    return roundReaderBrightnessChromeInsets(
      measureReaderBrightnessChromeInsets(host, host, {
        includeChromeBars,
      }),
    );
  };

  const syncInsets = (options: MeasureRunOptions = {}) => {
    const includeChromeBars = options.includeChromeBars ?? chromeVisible();
    const next = readInsets(includeChromeBars);
    if (!next) {
      clearCssInsets();
      return;
    }
    applyInsetsIfChanged(next);
  };

  const scheduleAsyncInsets = (delayMs = READER_BRIGHTNESS_MEASURE_DEBOUNCE_MS) => {
    if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      debounceTimer = undefined;
      syncInsets();
    }, delayMs);
  };

  const applyChromeVisibilityInsets = (showing: boolean) => {
    if (showing && lastStableVisibleInsets) {
      const tips = readInsets(false);
      if (tips) {
        applyInsetsIfChanged(
          mergeReaderBrightnessChromeInsets(tips, lastStableVisibleInsets),
        );
      }
    } else if (!showing) {
      const tips = readInsets(false);
      if (tips) {
        applyInsetsIfChanged(tips);
      }
    }

    syncInsets({ includeChromeBars: showing });
  };

  const disconnectObserver = () => {
    resizeObserver?.disconnect();
    resizeObserver = undefined;
    observedNodes.clear();
  };

  const observeNode = (node: Element | null | undefined) => {
    if (!node || !resizeObserver || observedNodes.has(node)) return;
    observedNodes.add(node);
    resizeObserver.observe(node);
  };

  const connectObserver = () => {
    disconnectObserver();
    if (typeof ResizeObserver === 'undefined') return;

    const slots = slotsEl();
    if (!slots) return;

    resizeObserver = new ResizeObserver(() => scheduleAsyncInsets());
    for (const el of collectReaderBrightnessInsetWatchTargets(slots)) {
      observeNode(el);
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!resizeObserver) return;
        const lateSlots = slotsEl();
        if (!lateSlots) return;
        for (const el of collectReaderBrightnessInsetWatchTargets(lateSlots)) {
          observeNode(el);
        }
        syncInsets();
      });
    });
  };

  onMount(() => {
    const unsubscribeGeometry = subscribeViewportGeometryChange(
      () => scheduleAsyncInsets(),
      { listenVisualViewportScroll: false },
    );

    onCleanup(() => {
      if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
      unsubscribeGeometry();
      disconnectObserver();
      clearCssInsets();
    });
  });

  createEffect(() => {
    if (!enabled()) {
      clearCssInsets();
      disconnectObserver();
      return;
    }

    const cv = chromeVisible();
    const chromeChanged = prevChromeVisible !== undefined && prevChromeVisible !== cv;
    prevChromeVisible = cv;

    remeasureKey();
    if (!hostRef()) return;

    connectObserver();

    if (chromeChanged) {
      applyChromeVisibilityInsets(cv);
      return;
    }

    syncInsets();
    scheduleAsyncInsets();
  });
}
