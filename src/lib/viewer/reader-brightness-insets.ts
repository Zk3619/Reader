/** 亮度胶囊与顶/底栏之间的间距 */
export const READER_BRIGHTNESS_CHROME_GAP_PX = 10;

/** 与 App.css `--reader-bar-duration` 一致 */
export const READER_BAR_TRANSITION_MS = 400;

export interface ReaderBrightnessChromeInsets {
  top: number;
  bottom: number;
}

export interface MeasureReaderBrightnessChromeInsetsOptions {
  /** 显隐过渡中：包含带 hidden 类的栏，按 surface/track 的视觉边界测量 */
  includeTransitioningChrome?: boolean;
}

/** 实际占位元素（内层 surface/track），而非外层裁剪壳 */
const TOP_MEASURE_SELECTORS = [
  '.reader-chrome-overlay-panel--top .reader-chrome-overlay-panel__surface',
  '.reader-chrome-floating-top__track',
  '.reader-top-bar',
] as const;

const BOTTOM_MEASURE_SELECTORS = [
  '.reader-chrome-overlay-panel--bottom .reader-chrome-overlay-panel__surface',
  '.reader-chrome-floating-bottom__track',
  '.reader-footer',
] as const;

function collectMeasureTargets(
  slotsEl: HTMLElement,
  selectors: readonly string[],
): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const targets: HTMLElement[] = [];
  for (const selector of selectors) {
    for (const el of slotsEl.querySelectorAll<HTMLElement>(selector)) {
      if (seen.has(el)) continue;
      seen.add(el);
      targets.push(el);
    }
  }
  return targets;
}

function isMeasurableChromeElement(
  el: HTMLElement,
  includeTransitioning: boolean,
): boolean {
  if (includeTransitioning) return true;

  const overlayPanel = el.closest('.reader-chrome-overlay-panel');
  if (overlayPanel?.classList.contains('reader-chrome-overlay-panel--hidden')) {
    return false;
  }

  const floatingTop = el.closest('.reader-chrome-floating-top');
  if (floatingTop?.classList.contains('reader-chrome-floating-top--hidden')) {
    return false;
  }

  const floatingBottom = el.closest('.reader-chrome-floating-bottom');
  if (floatingBottom?.classList.contains('reader-chrome-floating-bottom--hidden')) {
    return false;
  }

  if (el.classList.contains('reader-bar-hidden')) {
    return false;
  }

  return true;
}

function hasLayoutBox(rect: DOMRect): boolean {
  return rect.width > 0 || rect.height > 0;
}

/**
 * 按顶/底栏及其附属内容（书源条、页眉页脚等）在定位容器内的视觉占位计算偏移。
 */
export function measureReaderBrightnessChromeInsets(
  slotsEl: HTMLElement,
  hostEl: HTMLElement,
  options: MeasureReaderBrightnessChromeInsetsOptions = {},
): ReaderBrightnessChromeInsets {
  const includeTransitioning = options.includeTransitioningChrome === true;
  const hostRect = hostEl.getBoundingClientRect();

  let top = 0;
  for (const el of collectMeasureTargets(slotsEl, TOP_MEASURE_SELECTORS)) {
    if (!isMeasurableChromeElement(el, includeTransitioning)) continue;
    const rect = el.getBoundingClientRect();
    if (!hasLayoutBox(rect)) continue;
    top = Math.max(top, Math.max(0, rect.bottom - hostRect.top));
  }

  let bottom = 0;
  for (const el of collectMeasureTargets(slotsEl, BOTTOM_MEASURE_SELECTORS)) {
    if (!isMeasurableChromeElement(el, includeTransitioning)) continue;
    const rect = el.getBoundingClientRect();
    if (!hasLayoutBox(rect)) continue;
    bottom = Math.max(bottom, Math.max(0, hostRect.bottom - rect.top));
  }

  return { top, bottom };
}
