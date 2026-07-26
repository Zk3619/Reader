/**
 * 视频播放配置
 * - 自动开播：与 Artplayer 全局 playSettings.autoplay 共用
 * - 打开全屏 / 长按倍速：阅读器应用级（reader_video_config）
 * - 常规倍速：Artplayer 全局 playSettings.playbackRate（书级 playSpeed 作迁移源）
 */

import * as booksDb from '@/lib/database/books';
import { clampPlaySpeed } from '@/lib/media/audio/book-audio-config';
import { DEFAULT_PLAY_SPEED } from '@/lib/media/audio/types';
import {
  getArtplayerPlaySettings,
  setArtplayerPlaySettings,
} from '@/lib/media/video/artplayer/play-settings-prefs';

const VIDEO_CONFIG_KEY = 'reader_video_config';

export interface VideoAppConfig {
  /**
   * @deprecated 读写已桥接到 getArtplayerPlaySettings().autoplay
   * 保留字段兼容旧 UI / 调用方
   */
  autoPlay: boolean;
  /** 打开后直接进入全屏（需 autoPlay） */
  startFull: boolean;
  /** 长按倍速档位 5–60，实际倍速 = 值 / 10（默认 30 → 3.0x） */
  longPressSpeed: number;
}

export interface VideoPlayConfig extends VideoAppConfig {
  /** 常规播放倍速（全局 playSettings；书级仅作迁移） */
  playSpeed: number;
}

type StoredVideoApp = {
  autoPlay?: boolean;
  startFull?: boolean;
  longPressSpeed?: number;
};

const DEFAULT_APP: Omit<VideoAppConfig, 'autoPlay'> & { autoPlay?: boolean } = {
  startFull: false,
  longPressSpeed: 30,
};

function readStoredApp(): StoredVideoApp {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(VIDEO_CONFIG_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StoredVideoApp;
  } catch {
    return {};
  }
}

function writeStoredApp(next: StoredVideoApp): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(VIDEO_CONFIG_KEY, JSON.stringify(next));
}

function readAppConfig(): VideoAppConfig {
  const stored = readStoredApp();
  // 若全局尚未写过、旧阅读器配置有 autoPlay，则迁入全局一次
  if (
    typeof stored.autoPlay === 'boolean' &&
    typeof localStorage !== 'undefined' &&
    localStorage.getItem('reader.artplayer.playSettings.v1') == null
  ) {
    setArtplayerPlaySettings({ autoplay: stored.autoPlay !== false });
  }
  const lps =
    typeof stored.longPressSpeed === 'number'
      ? stored.longPressSpeed
      : DEFAULT_APP.longPressSpeed!;
  return {
    autoPlay: getArtplayerPlaySettings().autoplay,
    startFull: stored.startFull === true,
    longPressSpeed: Math.min(60, Math.max(5, Math.round(lps))),
  };
}

export function persistVideoAppConfig(patch: Partial<VideoAppConfig>): VideoAppConfig {
  const stored = readStoredApp();
  if (typeof patch.autoPlay === 'boolean') {
    setArtplayerPlaySettings({ autoplay: patch.autoPlay });
  }
  const nextStored: StoredVideoApp = {
    ...stored,
    startFull:
      typeof patch.startFull === 'boolean' ? patch.startFull : stored.startFull === true,
    longPressSpeed:
      patch.longPressSpeed !== undefined
        ? Math.min(60, Math.max(5, Math.round(patch.longPressSpeed)))
        : typeof stored.longPressSpeed === 'number'
          ? stored.longPressSpeed
          : DEFAULT_APP.longPressSpeed,
  };
  // 不再把 autoPlay 写回 reader_video_config，避免双源
  delete nextStored.autoPlay;
  writeStoredApp(nextStored);
  return readAppConfig();
}

export function longPressSpeedToRate(stored: number): number {
  return Math.min(6, Math.max(0.5, stored / 10));
}

export function getVideoPlayConfig(book: import('@/types').Book | null | undefined): VideoPlayConfig {
  const app = readAppConfig();
  const art = getArtplayerPlaySettings();
  const rc = book?.readConfig ?? {};
  // 全局已有非默认倍速优先；否则尝试书级迁移进全局
  let playSpeed = art.playbackRate;
  if (
    playSpeed === DEFAULT_PLAY_SPEED &&
    typeof rc.playSpeed === 'number' &&
    rc.playSpeed !== DEFAULT_PLAY_SPEED
  ) {
    playSpeed = clampPlaySpeed(rc.playSpeed);
    setArtplayerPlaySettings({ playbackRate: playSpeed });
  } else {
    playSpeed = clampPlaySpeed(playSpeed);
  }
  return {
    ...app,
    playSpeed,
  };
}

export async function persistVideoPlaySpeed(
  book: import('@/types').Book,
  playSpeed: number,
): Promise<import('@/types').Book> {
  const clamped = clampPlaySpeed(playSpeed);
  setArtplayerPlaySettings({ playbackRate: clamped });
  const updated: import('@/types').Book = {
    ...book,
    readConfig: {
      ...book.readConfig,
      playSpeed: clamped,
    },
  };
  await booksDb.updateBook(updated);
  return updated;
}
