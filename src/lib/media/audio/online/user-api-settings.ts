/**
 * UserApi 默认源与启用状态
 */

const DEFAULT_KEY = 'reader_audio_user_api_default';
const OFFLINE_KEY = 'reader_audio_offline_mode';

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
  return null;
}

export function userApiSourceKey(scriptId: string): string {
  return `userApi:${scriptId}`;
}

export function getMusicOfflineMode(): boolean {
  try {
    return localStorage.getItem(OFFLINE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMusicOfflineMode(enabled: boolean): void {
  try {
    localStorage.setItem(OFFLINE_KEY, enabled ? '1' : '0');
  } catch {
    // ignore
  }
}
