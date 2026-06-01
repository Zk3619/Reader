/**
 * 音频播放配置（对齐 Legado AudioPlay / Book.config）
 */

export const MIN_PLAY_SPEED = 0.5;
export const MAX_PLAY_SPEED = 3;
export const DEFAULT_PLAY_SPEED = 1;
export const PROGRESS_SAVE_INTERVAL_MS = 15_000;

/** 播放模式，顺序与 Legado AudioPlay.PlayMode.ordinal 一致 */
export enum AudioPlayMode {
  /** 列表播放完毕后停止 */
  listEndStop = 0,
  /** 单曲循环 */
  singleLoop = 1,
  /** 随机播放 */
  random = 2,
  /** 列表循环 */
  listLoop = 3,
}

export interface AudioPlayConfig {
  openCredits: number;
  closeCredits: number;
  playMode: AudioPlayMode;
  playSpeed: number;
}
