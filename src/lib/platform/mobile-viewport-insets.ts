/**
 * 移动端系统底栏（手势条 / 三键导航）视口适配。
 * 写入 CSS 变量供 App.css 中贴底 chrome、主壳 inset 等使用。
 */

import { isAndroid, isMobile } from '@/lib/platform/detect';

/** 手势导航 / 主页指示条区域（env 常为 0 时的兜底） */
export const MOBILE_SAFE_BOTTOM_GESTURE_PX = 12;

/** 状态栏 / 刘海区域（env 常为 0 时的兜底） */
export const MOBILE_SAFE_TOP_PX = 12;

/** 三键导航栏典型高度兜底 */
export const MOBILE_SAFE_BOTTOM_BUTTONS_PX = 48;

/** 判定为三键导航的最小底部占用（px） */
export const NAV_BUTTONS_DETECT_THRESHOLD_PX = 40;

export type AndroidNavMode = 'gesture' | 'buttons';

export interface MobileBottomInsetInput {
  envSafeBottomPx: number;
  visualViewportBottomGapPx: number;
  screenInnerHeightGapPx: number;
  android: boolean;
}

export interface MobileBottomInsetResult {
  mode: AndroidNavMode;
  insetPx: number;
}

export interface MobileTopInsetInput {
  envSafeTopPx: number;
  visualViewportOffsetTopPx: number;
}

/**
 * 顶部安全距离：取 env / visualViewport 实测与固定兜底的最大值。
 */
export function resolveMobileTopInset(input: MobileTopInsetInput): number {
  return Math.max(
    input.envSafeTopPx,
    input.visualViewportOffsetTopPx,
    MOBILE_SAFE_TOP_PX,
  );
}

/**
 * 根据 env、visualViewport 与屏幕高度差推断导航模式与底部安全距离。
 */
export function resolveMobileBottomInset(
  input: MobileBottomInsetInput,
): MobileBottomInsetResult {
  const measured = Math.max(
    input.envSafeBottomPx,
    input.visualViewportBottomGapPx,
    0,
  );

  if (measured >= NAV_BUTTONS_DETECT_THRESHOLD_PX) {
    return { mode: 'buttons', insetPx: measured };
  }

  const screenGap = Math.max(0, input.screenInnerHeightGapPx);
  const likelyButtons =
    input.android &&
    measured < MOBILE_SAFE_BOTTOM_GESTURE_PX &&
    screenGap >= NAV_BUTTONS_DETECT_THRESHOLD_PX;

  if (likelyButtons) {
    return {
      mode: 'buttons',
      insetPx: Math.max(measured, MOBILE_SAFE_BOTTOM_BUTTONS_PX),
    };
  }

  return {
    mode: 'gesture',
    insetPx: Math.max(measured, MOBILE_SAFE_BOTTOM_GESTURE_PX),
  };
}

function probeEnvSafeAreaTopPx(): number {
  if (typeof document === 'undefined') return 0;
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;left:-9999px;visibility:hidden;padding-top:env(safe-area-inset-top,0px)';
  document.documentElement.appendChild(el);
  const px = Number.parseFloat(getComputedStyle(el).paddingTop) || 0;
  el.remove();
  return px;
}

function probeEnvSafeAreaBottomPx(): number {
  if (typeof document === 'undefined') return 0;
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;left:-9999px;visibility:hidden;padding-bottom:env(safe-area-inset-bottom,0px)';
  document.documentElement.appendChild(el);
  const px = Number.parseFloat(getComputedStyle(el).paddingBottom) || 0;
  el.remove();
  return px;
}

function measureVisualViewportOffsetTopPx(): number {
  if (typeof window === 'undefined') return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, Math.round(vv.offsetTop));
}

function measureVisualViewportBottomGapPx(): number {
  if (typeof window === 'undefined') return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
}

function measureScreenInnerHeightGapPx(): number {
  if (typeof window === 'undefined') return 0;
  return Math.max(0, Math.round(window.screen.height - window.innerHeight));
}

function applyTouchUiInsets(): void {
  const root = document.documentElement;
  const envTop = probeEnvSafeAreaTopPx();
  const envBottom = probeEnvSafeAreaBottomPx();
  const vvOffsetTop = measureVisualViewportOffsetTopPx();
  const vvGap = measureVisualViewportBottomGapPx();
  const screenGap = measureScreenInnerHeightGapPx();
  const topInsetPx = resolveMobileTopInset({
    envSafeTopPx: envTop,
    visualViewportOffsetTopPx: vvOffsetTop,
  });
  const { mode, insetPx } = resolveMobileBottomInset({
    envSafeBottomPx: envBottom,
    visualViewportBottomGapPx: vvGap,
    screenInnerHeightGapPx: screenGap,
    android: isAndroid(),
  });

  root.setAttribute('data-touch-ui', '');
  if (isAndroid()) {
    root.setAttribute('data-android-nav', mode);
  } else {
    root.removeAttribute('data-android-nav');
  }
  root.style.setProperty('--system-status-inset-top', `${topInsetPx}px`);
  root.style.setProperty('--system-nav-inset-bottom', `${insetPx}px`);
}

function clearTouchUiInsets(): void {
  const root = document.documentElement;
  root.removeAttribute('data-touch-ui');
  root.removeAttribute('data-android-nav');
  root.style.removeProperty('--system-status-inset-top');
  root.style.removeProperty('--system-nav-inset-bottom');
}

export function applyMobileViewportInsets(): void {
  if (typeof document === 'undefined') return;
  if (!isMobile()) {
    clearTouchUiInsets();
    return;
  }
  applyTouchUiInsets();
}

let installed = false;

/**
 * 监听视口变化并更新底部系统栏 inset（与 keyboard-viewport 互补）。
 */
export function installMobileViewportInsets(): () => void {
  if (installed || typeof window === 'undefined') return () => undefined;
  installed = true;

  applyMobileViewportInsets();

  const onChange = () => applyMobileViewportInsets();
  const vv = window.visualViewport;
  vv?.addEventListener('resize', onChange);
  vv?.addEventListener('scroll', onChange);
  window.addEventListener('resize', onChange);
  window.addEventListener('orientationchange', onChange);

  return () => {
    vv?.removeEventListener('resize', onChange);
    vv?.removeEventListener('scroll', onChange);
    window.removeEventListener('resize', onChange);
    window.removeEventListener('orientationchange', onChange);
    clearTouchUiInsets();
    installed = false;
  };
}
