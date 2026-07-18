import { isTauri } from '@/lib/platform/detect';
import {
  patchMusicConfig,
  peekMusicConfigSync,
} from '@/lib/media/audio/music-config-storage';

export const MUSIC_HOTKEY_STORAGE_KEY = 'reader.music.hotkeys';

export const DEFAULT_MUSIC_HOTKEYS = {
  play: 'Ctrl+Alt+P',
  pause: 'Ctrl+Alt+U',
  next: 'Ctrl+Alt+Right',
  prev: 'Ctrl+Alt+Left',
  vol_up: 'Ctrl+Alt+Up',
  vol_down: 'Ctrl+Alt+Down',
  mute: '',
  collect: '',
  lyric_toggle: '',
  seek_forward: 'Ctrl+Alt+]',
  seek_back: 'Ctrl+Alt+[',
} as const;

export type MusicHotkeys = Record<keyof typeof DEFAULT_MUSIC_HOTKEYS, string>;

export function normalizeMusicHotkeys(input: unknown): MusicHotkeys {
  const source =
    input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return Object.fromEntries(
    Object.entries(DEFAULT_MUSIC_HOTKEYS).map(([key, defaultValue]) => [
      key,
      typeof source[key] === 'string' ? source[key] : defaultValue,
    ]),
  ) as MusicHotkeys;
}

export function loadMusicHotkeys(): MusicHotkeys {
  return normalizeMusicHotkeys(peekMusicConfigSync().hotkeys);
}

export async function registerMusicHotkeys(
  hotkeys: MusicHotkeys = loadMusicHotkeys(),
): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('register_music_hotkeys', {
    play: hotkeys.play,
    pause: hotkeys.pause,
    next: hotkeys.next,
    prev: hotkeys.prev,
    volUp: hotkeys.vol_up,
    volDown: hotkeys.vol_down,
    mute: hotkeys.mute,
    collect: hotkeys.collect,
    lyricToggle: hotkeys.lyric_toggle,
    seekForward: hotkeys.seek_forward,
    seekBack: hotkeys.seek_back,
  });
}

export async function saveAndRegisterMusicHotkeys(hotkeys: MusicHotkeys): Promise<void> {
  const normalized = normalizeMusicHotkeys(hotkeys);
  patchMusicConfig({ hotkeys: normalized });
  await registerMusicHotkeys(normalized);
}
