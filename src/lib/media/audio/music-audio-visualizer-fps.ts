/** 频谱可视化帧率（播放详情 canvas / 桌面歌词 IPC） */

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
