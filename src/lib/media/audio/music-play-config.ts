/**
 * 音乐模式播放配置（settings.json / music_config_v1.playConfig）
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
import {
  patchMusicConfig,
  peekMusicConfigSync,
} from '@/lib/media/audio/music-config-storage';

function readConfig(): AudioPlayConfig {
  const raw = peekMusicConfigSync().playConfig;
  return {
    openCredits: 0,
    closeCredits: 0,
    playMode: normalizePlayMode(raw?.playMode ?? AudioPlayMode.listLoop),
    playSpeed: clampPlaySpeed(
      typeof raw?.playSpeed === 'number' ? raw.playSpeed : DEFAULT_PLAY_SPEED,
    ),
  };
}

function writeConfig(patch: Partial<AudioPlayConfig>): void {
  const next = { ...readConfig(), ...patch };
  patchMusicConfig({ playConfig: next });
}

export function getMusicPlayConfig(): AudioPlayConfig {
  return readConfig();
}

export function setMusicPlayMode(mode: AudioPlayMode): void {
  writeConfig({ playMode: mode });
}

export function cycleMusicPlayMode(): AudioPlayMode {
  const next = cyclePlayMode(getMusicPlayConfig().playMode);
  setMusicPlayMode(next);
  return next;
}

export { playModeLabel };
