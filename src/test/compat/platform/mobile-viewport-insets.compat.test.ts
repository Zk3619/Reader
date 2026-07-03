import { describe, expect, it } from 'vitest';
import {
  MOBILE_SAFE_BOTTOM_BUTTONS_PX,
  MOBILE_SAFE_BOTTOM_GESTURE_PX,
  MOBILE_SAFE_TOP_PX,
  NAV_BUTTONS_DETECT_THRESHOLD_PX,
  resolveMobileBottomInset,
  resolveMobileTopInset,
} from '@/lib/platform/mobile-viewport-insets';

describe('mobile-viewport-insets', () => {
  it('顶部取 env / vv 与固定兜底的最大值', () => {
    expect(
      resolveMobileTopInset({
        envSafeTopPx: 28,
        visualViewportOffsetTopPx: 0,
      }),
    ).toBe(28);
    expect(
      resolveMobileTopInset({
        envSafeTopPx: 0,
        visualViewportOffsetTopPx: 0,
      }),
    ).toBe(MOBILE_SAFE_TOP_PX);
  });

  it('env 或 vv 间隙较大时按三键导航处理', () => {
    expect(
      resolveMobileBottomInset({
        envSafeBottomPx: NAV_BUTTONS_DETECT_THRESHOLD_PX,
        visualViewportBottomGapPx: 0,
        screenInnerHeightGapPx: 0,
        android: true,
      }),
    ).toEqual({ mode: 'buttons', insetPx: NAV_BUTTONS_DETECT_THRESHOLD_PX });
  });

  it('Android 屏幕高度差大且 env 为 0 时使用三键兜底', () => {
    expect(
      resolveMobileBottomInset({
        envSafeBottomPx: 0,
        visualViewportBottomGapPx: 0,
        screenInnerHeightGapPx: 56,
        android: true,
      }),
    ).toEqual({ mode: 'buttons', insetPx: MOBILE_SAFE_BOTTOM_BUTTONS_PX });
  });

  it('手势导航且无系统占用时使用拇指条兜底', () => {
    expect(
      resolveMobileBottomInset({
        envSafeBottomPx: 0,
        visualViewportBottomGapPx: 0,
        screenInnerHeightGapPx: 24,
        android: true,
      }),
    ).toEqual({ mode: 'gesture', insetPx: MOBILE_SAFE_BOTTOM_GESTURE_PX });
  });

  it('非 Android 仅用手势兜底', () => {
    expect(
      resolveMobileBottomInset({
        envSafeBottomPx: 0,
        visualViewportBottomGapPx: 0,
        screenInnerHeightGapPx: 80,
        android: false,
      }),
    ).toEqual({ mode: 'gesture', insetPx: MOBILE_SAFE_BOTTOM_GESTURE_PX });
  });

  it('横屏时 screenInnerHeightGap 应较小，避免误判三键导航', () => {
    expect(
      resolveMobileBottomInset({
        envSafeBottomPx: 0,
        visualViewportBottomGapPx: 0,
        screenInnerHeightGapPx: 32,
        android: true,
      }),
    ).toEqual({ mode: 'gesture', insetPx: MOBILE_SAFE_BOTTOM_GESTURE_PX });
  });
});
