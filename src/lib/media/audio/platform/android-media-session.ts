/**
 * Android MediaSession 薄层（Tauri 命令桥接）
 */

import { isTauri } from '@/lib/platform/detect';

export interface AndroidMediaSessionState {
  playing: boolean;
  title: string;
  artist?: string;
  coverUrl?: string;
  positionSec?: number;
  durationSec?: number;
}

export type AndroidMediaAction = 'play' | 'pause' | 'next' | 'prev';

export async function syncAndroidMediaSession(state: AndroidMediaSessionState): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('sync_android_media_session', {
      playing: state.playing,
      title: state.title,
      artist: state.artist ?? '',
      coverUrl: state.coverUrl ?? '',
      positionSec: state.positionSec ?? 0,
      durationSec: state.durationSec ?? 0,
    });
  } catch {
    // Android 未实现或桌面端无此命令时忽略
  }
}

export async function listenAndroidMediaActions(
  handler: (action: AndroidMediaAction) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {};
  try {
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten = await listen<{ action?: string }>('android-media-action', (e) => {
      const action = e.payload.action;
      if (action === 'play' || action === 'pause' || action === 'next' || action === 'prev') {
        handler(action);
      }
    });
    return unlisten;
  } catch {
    return () => {};
  }
}
