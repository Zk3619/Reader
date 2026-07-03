/**
 * 视口几何测量与变更订阅（resize / orientation / visualViewport）。
 */

/** orientationchange 后等待布局稳定的延迟（ms） */
export const VIEWPORT_ORIENTATION_SETTLE_MS = 150;

export interface LayoutScreenHeightInput {
  screenWidth: number;
  screenHeight: number;
  innerWidth: number;
  innerHeight: number;
}

/**
 * 当前朝向下，布局轴对应的屏幕高度（CSS px）。
 * `screen.width/height` 在部分 WebView 中不随旋转交换，需结合 inner 尺寸推断。
 */
export function resolveLayoutScreenHeightPx(input: LayoutScreenHeightInput): number {
  const isLandscape = input.innerWidth > input.innerHeight;
  const screenShort = Math.min(input.screenWidth, input.screenHeight);
  const screenLong = Math.max(input.screenWidth, input.screenHeight);
  return isLandscape ? screenShort : screenLong;
}

/** 屏幕布局高度与 innerHeight 之差，用于推断系统 UI 占用（状态栏/导航栏）。 */
export function measureScreenInnerHeightGapPx(): number {
  if (typeof window === 'undefined') return 0;
  const layoutHeight = resolveLayoutScreenHeightPx({
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  });
  return Math.max(0, Math.round(layoutHeight - window.innerHeight));
}

export interface SubscribeViewportGeometryChangeOptions {
  /** 是否监听 visualViewport scroll（地址栏显隐时易误触发，定位类 UI 宜关闭） */
  listenVisualViewportScroll?: boolean;
}

/**
 * 订阅视口几何变化。orientationchange 会在 rAF 与短延迟后再次回调，以等待尺寸稳定。
 */
export function subscribeViewportGeometryChange(
  handler: () => void,
  options: SubscribeViewportGeometryChangeOptions = {},
): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const listenScroll = options.listenVisualViewportScroll !== false;
  let orientationTimer: number | undefined;

  const onResize = () => handler();

  const onOrientation = () => {
    handler();
    requestAnimationFrame(() => {
      handler();
      if (orientationTimer !== undefined) window.clearTimeout(orientationTimer);
      orientationTimer = window.setTimeout(handler, VIEWPORT_ORIENTATION_SETTLE_MS);
    });
  };

  const vv = window.visualViewport;
  vv?.addEventListener('resize', onResize);
  if (listenScroll) {
    vv?.addEventListener('scroll', onResize);
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onOrientation);

  return () => {
    vv?.removeEventListener('resize', onResize);
    if (listenScroll) {
      vv?.removeEventListener('scroll', onResize);
    }
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onOrientation);
    if (orientationTimer !== undefined) window.clearTimeout(orientationTimer);
  };
}
