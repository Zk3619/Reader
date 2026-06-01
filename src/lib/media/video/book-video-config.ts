/**
 * 视频播放配置（对齐 Legado VideoPlay VIDEO_PREF_NAME + playSpeed）
 */

import * as booksDb from '@/lib/database/books';
import { clampPlaySpeed } from '@/lib/media/audio/book-audio-config';
import { DEFAULT_PLAY_SPEED } from '@/lib/media/audio/types';

const VIDEO_CONFIG_KEY = 'reader_video_config';

export interface VideoAppConfig {
  /** 是否自动播放 */
  autoPlay: boolean;
  /** 打开后直接进入全屏（需 autoPlay） */
  startFull: boolean;
  /** 长按倍速档位 5–60，实际倍速 = 值 / 10（默认 30 → 3.0x） */
  longPressSpeed: number;
}

export interface VideoPlayConfig extends VideoAppConfig {
  /** 常规播放倍速（存于书籍 readConfig.playSpeed） */
  playSpeed: number;
}

const DEFAULT_APP: VideoAppConfig = {
  autoPlay: true,
  startFull: false,
  longPressSpeed: 30,
};

function readAppConfig(): VideoAppConfig {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_APP };
  try {
    const raw = localStorage.getItem(VIDEO_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_APP };
    const o = JSON.parse(raw) as Partial<VideoAppConfig>;
    const lps = typeof o.longPressSpeed === 'number' ? o.longPressSpeed : DEFAULT_APP.longPressSpeed;
    return {
      autoPlay: o.autoPlay !== false,
      startFull: o.startFull === true,
      longPressSpeed: Math.min(60, Math.max(5, Math.round(lps))),
    };
  } catch {
    return { ...DEFAULT_APP };
  }
}

export function persistVideoAppConfig(patch: Partial<VideoAppConfig>): VideoAppConfig {
  const next = { ...readAppConfig(), ...patch };
  if (patch.longPressSpeed !== undefined) {
    next.longPressSpeed = Math.min(60, Math.max(5, Math.round(next.longPressSpeed)));
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(VIDEO_CONFIG_KEY, JSON.stringify(next));
  }
  return next;
}

export function longPressSpeedToRate(stored: number): number {
  return Math.min(6, Math.max(0.5, stored / 10));
}

export function getVideoPlayConfig(book: import('@/types').Book | null | undefined): VideoPlayConfig {
  const app = readAppConfig();
  const rc = book?.readConfig ?? {};
  return {
    ...app,
    playSpeed: clampPlaySpeed(
      typeof rc.playSpeed === 'number' ? rc.playSpeed : DEFAULT_PLAY_SPEED,
    ),
  };
}

export async function persistVideoPlaySpeed(
  book: import('@/types').Book,
  playSpeed: number,
): Promise<import('@/types').Book> {
  const updated: import('@/types').Book = {
    ...book,
    readConfig: {
      ...book.readConfig,
      playSpeed: clampPlaySpeed(playSpeed),
    },
  };
  await booksDb.updateBook(updated);
  return updated;
}
