/**
 * OpenAPI 播放状态桥接（前端 → Rust HTTP 服务）
 */

import { isTauri } from '@/lib/platform/detect';

export interface MusicOpenApiPlayerState {
  playing: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  collected: boolean;
  trackName?: string;
  trackArtist?: string;
  trackSource?: string;
  lyric?: string;
  lyricAll?: Record<string, string>;
}

let cachedState: MusicOpenApiPlayerState = {
  playing: false,
  position: 0,
  duration: 0,
  volume: 1,
  muted: false,
  collected: false,
};

let pushTimer: ReturnType<typeof setInterval> | undefined;

export function getMusicOpenApiState(): MusicOpenApiPlayerState {
  return { ...cachedState };
}

export async function pushMusicOpenApiState(patch: Partial<MusicOpenApiPlayerState>): Promise<void> {
  cachedState = { ...cachedState, ...patch };
  if (!isTauri()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('update_music_openapi_state', { state: cachedState });
  } catch {
    // ignore
  }
}

export function startMusicOpenApiStateSync(
  getter: () => Partial<MusicOpenApiPlayerState>,
  intervalMs = 1000,
): () => void {
  stopMusicOpenApiStateSync();
  const tick = () => void pushMusicOpenApiState(getter());
  tick();
  pushTimer = setInterval(tick, intervalMs);
  return stopMusicOpenApiStateSync;
}

export function stopMusicOpenApiStateSync(): void {
  if (pushTimer) {
    clearInterval(pushTimer);
    pushTimer = undefined;
  }
}
