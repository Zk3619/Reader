/** 亮度胶囊与顶/底栏之间的间距 */
export const READER_BRIGHTNESS_CHROME_GAP_PX = 10;

/** 与 App.css `--reader-bar-duration` 一致 */
export const READER_BAR_TRANSITION_MS = 400;

/** 小于此差值的 inset 抖动忽略，避免移动端 sub-pixel 测量导致胶囊跳动 */
export const READER_BRIGHTNESS_INSET_STABILIZE_EPS_PX = 4;

/** 合并连续测量请求，避免进入 viewer / resize 时多次写入 CSS 变量 */
export const READER_BRIGHTNESS_MEASURE_DEBOUNCE_MS = 64;

/** chrome-slots 上由 JS 写入的顶/底栏占位（供亮度胶囊 CSS 定位） */
export const READER_BRIGHTNESS_INSET_TOP_VAR = '--reader-brightness-inset-top';
export const READER_BRIGHTNESS_INSET_BOTTOM_VAR = '--reader-brightness-inset-bottom';

export interface ReaderBrightnessChromeInsets {
  top: number;
  bottom: number;
}

export interface MeasureReaderBrightnessChromeInsetsOptions {
  /** 显隐过渡中：包含带 hidden 类的栏，按 surface/track 的视觉边界测量 */
  includeTransitioningChrome?: boolean;
  /** 顶/底操作栏是否计入占位；隐藏时仍保留阅读区内常显页眉/页脚占位 */
  includeChromeBars?: boolean;
}

/** 顶/底操作栏占位：优先外层 panel（无 transform），避免显隐动画中 surface/track 视觉位滞后 */
const TOP_CHROME_SELECTORS = [
  '.reader-chrome-overlay-panel--top',
  '.reader-chrome-overlay-panel--top .reader-chrome-overlay-panel__surface',
  '.reader-chrome-floating-top',
  '.reader-chrome-floating-top__track',
  '.reader-top-bar',
  '.reader-chrome-page-tip-header',
] as const;

const BOTTOM_CHROME_SELECTORS = [
  '.reader-chrome-overlay-panel--bottom',
  '.reader-chrome-overlay-panel--bottom .reader-chrome-overlay-panel__surface',
  '.reader-chrome-floating-bottom',
  '.reader-chrome-floating-bottom__track',
  '.reader-footer',
  '.reader-chrome-page-tip-footer',
] as const;

/** 阅读区内「始终显示」页眉/页脚（与顶底栏显隐无关） */
const TOP_READER_TIP_SELECTORS = ['.reader-page-tip-header'] as const;
const BOTTOM_READER_TIP_SELECTORS = ['.reader-page-tip-footer'] as const;

/** ResizeObserver 仅观测常显页眉/页脚（无顶底栏 max-height 过渡，避免测量反馈环） */
const INSET_WATCH_SELECTORS = [
  ...TOP_READER_TIP_SELECTORS,
  ...BOTTOM_READER_TIP_SELECTORS,
] as const;

/** ResizeObserver 观测目标：仅常显页眉/页脚 */
export function collectReaderBrightnessInsetWatchTargets(
  slotsEl: HTMLElement,
): HTMLElement[] {
  return collectMeasureTargets(slotsEl, INSET_WATCH_SELECTORS);
}

export function insetsNearlyEqual(
  a: ReaderBrightnessChromeInsets,
  b: ReaderBrightnessChromeInsets,
  epsilon = READER_BRIGHTNESS_INSET_STABILIZE_EPS_PX,
): boolean {
  return (
    Math.abs(a.top - b.top) < epsilon && Math.abs(a.bottom - b.bottom) < epsilon
  );
}

export function roundReaderBrightnessChromeInsets(
  insets: ReaderBrightnessChromeInsets,
): ReaderBrightnessChromeInsets {
  return {
    top: Math.round(insets.top),
    bottom: Math.round(insets.bottom),
  };
}

export function mergeReaderBrightnessChromeInsets(
  ...parts: ReaderBrightnessChromeInsets[]
): ReaderBrightnessChromeInsets {
  let top = 0;
  let bottom = 0;
  for (const part of parts) {
    top = Math.max(top, part.top);
    bottom = Math.max(bottom, part.bottom);
  }
  return { top, bottom };
}

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

function topInsetFromRect(hostRect: DOMRect, rect: DOMRect): number {
  if (!hasLayoutBox(rect)) return 0;
  return Math.max(0, rect.bottom - hostRect.top);
}

function bottomInsetFromRect(hostRect: DOMRect, rect: DOMRect): number {
  if (!hasLayoutBox(rect)) return 0;
  return Math.max(0, hostRect.bottom - rect.top);
}

function measureChromeAxisInset(
  slotsEl: HTMLElement,
  hostRect: DOMRect,
  selectors: readonly string[],
  axis: 'top' | 'bottom',
  includeTransitioning: boolean,
): number {
  let inset = 0;
  for (const el of collectMeasureTargets(slotsEl, selectors)) {
    if (!isMeasurableChromeElement(el, includeTransitioning)) continue;
    const rect = el.getBoundingClientRect();
    inset = Math.max(
      inset,
      axis === 'top'
        ? topInsetFromRect(hostRect, rect)
        : bottomInsetFromRect(hostRect, rect),
    );
  }
  return inset;
}

function measureReaderTipAxisInset(
  slotsEl: HTMLElement,
  hostRect: DOMRect,
  selectors: readonly string[],
  axis: 'top' | 'bottom',
): number {
  let inset = 0;
  for (const el of collectMeasureTargets(slotsEl, selectors)) {
    const rect = el.getBoundingClientRect();
    inset = Math.max(
      inset,
      axis === 'top'
        ? topInsetFromRect(hostRect, rect)
        : bottomInsetFromRect(hostRect, rect),
    );
  }
  return inset;
}

/**
 * 按顶/底栏及其附属内容（书源条、跟随顶底栏的页眉页脚、常显页眉页脚等）在定位容器内的视觉占位计算偏移。
 */
export function measureReaderBrightnessChromeInsets(
  slotsEl: HTMLElement,
  hostEl: HTMLElement,
  options: MeasureReaderBrightnessChromeInsetsOptions = {},
): ReaderBrightnessChromeInsets {
  const includeTransitioning = options.includeTransitioningChrome === true;
  const includeChromeBars = options.includeChromeBars !== false;
  const hostRect = hostEl.getBoundingClientRect();

  let top = measureReaderTipAxisInset(slotsEl, hostRect, TOP_READER_TIP_SELECTORS, 'top');
  let bottom = measureReaderTipAxisInset(
    slotsEl,
    hostRect,
    BOTTOM_READER_TIP_SELECTORS,
    'bottom',
  );

  if (includeChromeBars) {
    top = Math.max(
      top,
      measureChromeAxisInset(
        slotsEl,
        hostRect,
        TOP_CHROME_SELECTORS,
        'top',
        includeTransitioning,
      ),
    );
    bottom = Math.max(
      bottom,
      measureChromeAxisInset(
        slotsEl,
        hostRect,
        BOTTOM_CHROME_SELECTORS,
        'bottom',
        includeTransitioning,
      ),
    );
  }

  return { top, bottom };
}

export function stabilizeReaderBrightnessChromeInsets(
  prev: ReaderBrightnessChromeInsets,
  next: ReaderBrightnessChromeInsets,
  epsilon = READER_BRIGHTNESS_INSET_STABILIZE_EPS_PX,
): ReaderBrightnessChromeInsets {
  return {
    top: Math.abs(prev.top - next.top) < epsilon ? prev.top : next.top,
    bottom: Math.abs(prev.bottom - next.bottom) < epsilon ? prev.bottom : next.bottom,
  };
}

/** 连续两次读数一致才采纳，阻断亚像素/过渡帧来回翻转 */
export function confirmReaderBrightnessChromeInsets(
  prev: ReaderBrightnessChromeInsets,
  sample: ReaderBrightnessChromeInsets,
  pending: ReaderBrightnessChromeInsets | null,
  epsilon = READER_BRIGHTNESS_INSET_STABILIZE_EPS_PX,
): { applied: ReaderBrightnessChromeInsets; pending: ReaderBrightnessChromeInsets | null } {
  const stable = stabilizeReaderBrightnessChromeInsets(prev, sample, epsilon);
  if (stable.top === prev.top && stable.bottom === prev.bottom) {
    return { applied: prev, pending: null };
  }
  if (pending && pending.top === stable.top && pending.bottom === stable.bottom) {
    return { applied: stable, pending: null };
  }
  return { applied: prev, pending: stable };
}
