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

export type AndroidMediaAction =
  | 'play'
  | 'pause'
  | 'next'
  | 'prev'
  | 'seek_forward'
  | 'seek_back'
  | 'seek';

export type AndroidMediaActionEvent = {
  action: AndroidMediaAction;
  positionSec?: number;
};

const ANDROID_MEDIA_ACTIONS = new Set<string>([
  'play',
  'pause',
  'next',
  'prev',
  'seek_forward',
  'seek_back',
  'seek',
]);

function dispatchMediaPayload(
  payload: { action?: string; positionSec?: number } | null | undefined,
  handler: (event: AndroidMediaActionEvent) => void,
): void {
  const action = payload?.action;
  if (!action || !ANDROID_MEDIA_ACTIONS.has(action)) return;
  const positionSec =
    typeof payload?.positionSec === 'number' && Number.isFinite(payload.positionSec)
      ? payload.positionSec
      : undefined;
  handler({ action: action as AndroidMediaAction, positionSec });
}

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
  handler: (event: AndroidMediaActionEvent) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {};
  const cleanups: Array<() => void | Promise<void>> = [];

  try {
    const { addPluginListener } = await import('@tauri-apps/api/core');
    const listener = await addPluginListener(
      'music-media',
      'android-media-action',
      (payload: { action?: string; positionSec?: number }) => {
        dispatchMediaPayload(payload, handler);
      },
    );
    cleanups.push(() => {
      void listener.unregister();
    });
  } catch {
    // 插件监听不可用时回退全局事件
  }

  try {
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten = await listen<{ action?: string; positionSec?: number }>(
      'android-media-action',
      (e) => {
        dispatchMediaPayload(e.payload, handler);
      },
    );
    cleanups.push(unlisten);
  } catch {
    // ignore
  }

  return () => {
    for (const cleanup of cleanups) void cleanup();
  };
}
