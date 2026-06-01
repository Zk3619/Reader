/**
 * 从书籍 readConfig 读写音频播放设置
 */

import * as booksDb from '@/lib/database/books';
import {
  AudioPlayMode,
  DEFAULT_PLAY_SPEED,
  MAX_PLAY_SPEED,
  MIN_PLAY_SPEED,
  type AudioPlayConfig,
} from '@/lib/media/audio/types';
import type { Book, ReadConfig } from '@/types';

export function normalizePlayMode(value: unknown): AudioPlayMode {
  const n = typeof value === 'number' ? value : Number(value);
  if (n >= 0 && n <= 3 && Number.isInteger(n)) {
    return n as AudioPlayMode;
  }
  return AudioPlayMode.listEndStop;
}

export function clampPlaySpeed(speed: number): number {
  if (!Number.isFinite(speed)) return DEFAULT_PLAY_SPEED;
  return Math.min(MAX_PLAY_SPEED, Math.max(MIN_PLAY_SPEED, speed));
}

export function getAudioPlayConfig(book: Book | null | undefined): AudioPlayConfig {
  const rc: ReadConfig = book?.readConfig ?? {};
  return {
    openCredits: typeof rc.openCredits === 'number' ? Math.max(0, rc.openCredits) : 0,
    closeCredits: typeof rc.closeCredits === 'number' ? Math.max(0, rc.closeCredits) : 0,
    playMode: normalizePlayMode(rc.playMode),
    playSpeed: clampPlaySpeed(
      typeof rc.playSpeed === 'number' ? rc.playSpeed : DEFAULT_PLAY_SPEED,
    ),
  };
}

export function cyclePlayMode(mode: AudioPlayMode): AudioPlayMode {
  switch (mode) {
    case AudioPlayMode.listEndStop:
      return AudioPlayMode.singleLoop;
    case AudioPlayMode.singleLoop:
      return AudioPlayMode.random;
    case AudioPlayMode.random:
      return AudioPlayMode.listLoop;
    case AudioPlayMode.listLoop:
    default:
      return AudioPlayMode.listEndStop;
  }
}

export function playModeLabel(mode: AudioPlayMode): string {
  switch (mode) {
    case AudioPlayMode.listEndStop:
      return '列表结束停止';
    case AudioPlayMode.singleLoop:
      return '单曲循环';
    case AudioPlayMode.random:
      return '随机播放';
    case AudioPlayMode.listLoop:
      return '列表循环';
    default:
      return '列表结束停止';
  }
}

export function mergeAudioConfigIntoBook(
  book: Book,
  patch: Partial<AudioPlayConfig>,
): Book {
  return {
    ...book,
    readConfig: {
      ...book.readConfig,
      ...(patch.openCredits !== undefined ? { openCredits: patch.openCredits } : {}),
      ...(patch.closeCredits !== undefined ? { closeCredits: patch.closeCredits } : {}),
      ...(patch.playMode !== undefined ? { playMode: patch.playMode } : {}),
      ...(patch.playSpeed !== undefined ? { playSpeed: patch.playSpeed } : {}),
    },
  };
}

export async function persistAudioPlayConfig(
  book: Book,
  patch: Partial<AudioPlayConfig>,
): Promise<Book> {
  const updated = mergeAudioConfigIntoBook(book, patch);
  await booksDb.updateBook(updated);
  return updated;
}
