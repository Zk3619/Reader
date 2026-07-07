/**
 * 阅读器亮度 overlay 降级：将滑条 0–100 映射为 CSS brightness 系数。
 * 对齐 Android screenBrightness 线性语义，并加感知曲线与下限，避免纯黑/过曝。
 */

/** 对齐常见设备最低背光，避免 slider=0 时过暗（约 20–25%） */
export const READER_BRIGHTNESS_OVERLAY_LUMINANCE_FLOOR = 0.22;

/** 略低于 2.2，使中段与系统亮度滑条观感更接近 */
export const READER_BRIGHTNESS_OVERLAY_GAMMA = 1.6;

/**
 * 滑条值 → CSS `brightness()` 乘数（1 = 原样，越小越暗）。
 */
export function mapReadBrightnessToOverlayLuminance(level: number): number {
  const t = Math.min(1, Math.max(0, level / 100));
  const curved = Math.pow(t, READER_BRIGHTNESS_OVERLAY_GAMMA);
  const floor = READER_BRIGHTNESS_OVERLAY_LUMINANCE_FLOOR;
  const luminance = floor + curved * (1 - floor);
  return Math.round(luminance * 1000) / 1000;
}
