/**
 * 全局视觉特效开关（阴影 / 透明 / 模糊），供低端设备关闭以提升性能
 */

import { settingsState } from '@/stores/settings';

export interface VisualChromeAppearance {
  opacity: number;
  blurPx: number;
}

/** 阴影特效（box-shadow、胶囊光晕等） */
export function isVisualShadowEnabled(): boolean {
  return settingsState.app.enableVisualShadow !== false;
}

/** 半透明背景（color-mix / alpha 背景） */
export function isVisualTransparencyEnabled(): boolean {
  return settingsState.app.enableVisualTransparency !== false;
}

/** 背景模糊（backdrop-filter） */
export function isVisualBlurEnabled(): boolean {
  return settingsState.app.enableVisualBlur !== false;
}

/** 按全局开关裁剪 chrome surface 的透明度与模糊 */
export function applyVisualEffectsToChromeAppearance(
  appearance: VisualChromeAppearance,
): VisualChromeAppearance {
  return {
    opacity: isVisualTransparencyEnabled() ? appearance.opacity : 100,
    blurPx: isVisualBlurEnabled() ? appearance.blurPx : 0,
  };
}

/** 阴影 inline 值；关闭时返回 none，未提供时返回 undefined */
export function resolveVisualBoxShadow(shadow: string | undefined): string | undefined {
  if (!shadow) return undefined;
  if (!isVisualShadowEnabled()) return 'none';
  return shadow;
}
