/** 频谱可视化帧率（播放详情 canvas / 桌面歌词 IPC） */

import { isMobile } from '@/lib/platform/detect';

export const VISUALIZER_FPS_MIN = 15;
export const VISUALIZER_FPS_MAX = 120;
export const VISUALIZER_FPS_DEFAULT = 60;

export function clampVisualizerFps(fps: number | undefined): number {
  if (fps == null || !Number.isFinite(fps)) return VISUALIZER_FPS_DEFAULT;
  return Math.max(VISUALIZER_FPS_MIN, Math.min(VISUALIZER_FPS_MAX, Math.round(fps)));
}

export function visualizerFrameIntervalMs(fps: number | undefined): number {
  return 1000 / clampVisualizerFps(fps);
}

/** 移动端限制 canvas 物理像素，避免 3x DPR 全屏 fillRect 掉帧 */
export function visualizerCanvasDpr(mobile = isMobile()): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const cap = mobile ? 1.5 : 2;
  return Math.min(cap, Math.max(1, dpr));
}
