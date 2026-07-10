/**
 * 音乐模式播放配置（localStorage）
 */

import {
  AudioPlayMode,
  DEFAULT_PLAY_SPEED,
  type AudioPlayConfig,
} from '@/lib/media/audio/types';
import {
  clampPlaySpeed,
  cyclePlayMode,
  normalizePlayMode,
  playModeLabel,
} from '@/lib/media/audio/book-audio-config';

const STORAGE_KEY = 'reader_music_play_config';

function readRaw(): Partial<AudioPlayConfig> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<AudioPlayConfig>) : {};
  } catch {
    return {};
  }
}

function writeRaw(patch: Partial<AudioPlayConfig>): void {
  const next = { ...readRaw(), ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function getMusicPlayConfig(): AudioPlayConfig {
  const raw = readRaw();
  return {
    openCredits: 0,
    closeCredits: 0,
    playMode: normalizePlayMode(raw.playMode ?? AudioPlayMode.listLoop),
    playSpeed: clampPlaySpeed(
      typeof raw.playSpeed === 'number' ? raw.playSpeed : DEFAULT_PLAY_SPEED,
    ),
  };
}

export function setMusicPlayMode(mode: AudioPlayMode): void {
  writeRaw({ playMode: mode });
}

export function cycleMusicPlayMode(): AudioPlayMode {
  const next = cyclePlayMode(getMusicPlayConfig().playMode);
  setMusicPlayMode(next);
  return next;
}

export { playModeLabel };
