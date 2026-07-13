/**
 * UserApi 默认源与启用状态
 */

import { createSignal } from 'solid-js';
import { getMusicSettings } from '@/lib/media/audio/music-settings';

const DEFAULT_KEY = 'reader_audio_user_api_default';
const OFFLINE_KEY = 'reader_audio_offline_mode';

function readOfflineFromStorage(): boolean {
  try {
    return localStorage.getItem(OFFLINE_KEY) === '1';
  } catch {
    return false;
  }
}

const [offlineMode, setOfflineModeSignal] = createSignal(readOfflineFromStorage());

export function getDefaultUserApiId(): string | null {
  try {
    return localStorage.getItem(DEFAULT_KEY);
  } catch {
    return null;
  }
}

export function setDefaultUserApiId(id: string | null): void {
  try {
    if (id) localStorage.setItem(DEFAULT_KEY, id);
    else localStorage.removeItem(DEFAULT_KEY);
  } catch {
    // ignore
  }
  // 切换默认音源时重置熔断（动态 import 避免环）
  void import('@/lib/media/audio/platform/fallback-resolver')
    .then((m) => m.resetUserApiCircuit?.())
    .catch(() => {});
  void import('@/lib/media/audio/online/online-resolver')
    .then((m) => m.resetPrimaryUserApiCircuit?.())
    .catch(() => {});
}

export function resolveUserApiIdForTrack(
  track: { source: string; meta: Record<string, unknown> },
  activeSource?: string | null,
): string | null {
  if (track.source === 'userApi') {
    const id = track.meta.userApiId;
    return typeof id === 'string' ? id : getDefaultUserApiId();
  }
  if (activeSource?.startsWith('userApi:')) return activeSource.slice('userApi:'.length);
  if (activeSource === 'userApi') return getDefaultUserApiId();
  if (getMusicSettings().urlSourceMode === 'builtin') return null;
  return getDefaultUserApiId();
}

export function userApiSourceKey(scriptId: string): string {
  return `userApi:${scriptId}`;
}

export function getMusicOfflineMode(): boolean {
  return offlineMode();
}

export function setMusicOfflineMode(enabled: boolean): void {
  try {
    localStorage.setItem(OFFLINE_KEY, enabled ? '1' : '0');
  } catch {
    // ignore
  }
  setOfflineModeSignal(enabled);
}
