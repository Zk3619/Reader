/**
 * 音频播放配置（对齐 Legado AudioPlay / Book.config）
 */

export const MIN_PLAY_SPEED = 0.5;
export const MAX_PLAY_SPEED = 3;
export const DEFAULT_PLAY_SPEED = 1;
export const PROGRESS_SAVE_INTERVAL_MS = 15_000;

/** 播放模式，顺序与 Legado AudioPlay.PlayMode.ordinal 一致；none 对齐 lx 禁用切歌 */
export enum AudioPlayMode {
  /** 顺序播放：按列表顺序播完后停止 */
  listEndStop = 0,
  /** 单曲循环 */
  singleLoop = 1,
  /** 列表随机播放 */
  random = 2,
  /** 列表循环 */
  listLoop = 3,
  /** 禁止切换：曲终停止；手动上一首/下一首仍按列表循环切歌 */
  none = 4,
}

export interface AudioPlayConfig {
  openCredits: number;
  closeCredits: number;
  playMode: AudioPlayMode;
  playSpeed: number;
}
