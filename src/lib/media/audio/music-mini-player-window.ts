/**
 * 桌面迷你播放窗（对齐 MusicFree MiniMode）
 */

import {
  getMusicSettings,
  setMusicSettings,
  subscribeMusicSettings,
} from '@/lib/media/audio/music-settings';
import { isAndroid, isTauri } from '@/lib/platform/detect';

const ENABLED_EVENT = 'music-mini-player-enabled-changed';
const NATIVE_RESYNC_EVENT = 'music-mini-player-native-resync';
const UPDATE_EVENT = 'music-mini-player-update';
const COMMAND_EVENT = 'music-mini-player-command';
const MINI_PLAYER_LABEL = 'music-mini-player';

let bootstrapped = false;
let openGeneration = 0;
let windowCreated = false;

function getWindowOptions() {
  const s = getMusicSettings();
  return {
    width: s.miniModeWidth ?? 380,
    height: s.miniModeHeight ?? 88,
    x: s.miniModeX ?? null,
    y: s.miniModeY ?? null,
    alwaysOnTop: s.miniModeAlwaysOnTop ?? true,
  };
}

async function invokePrecreate(): Promise<void> {
  if (!isTauri() || isAndroid() || windowCreated) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('precreate_music_mini_player_window', getWindowOptions());
  windowCreated = true;
}

async function invokeOpen(): Promise<void> {
  if (!isTauri() || isAndroid()) return;
  const gen = ++openGeneration;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('open_music_mini_player_window', getWindowOptions());
  windowCreated = true;
  if (gen !== openGeneration || !getMusicSettings().miniModeEnabled) {
    await invoke('close_music_mini_player_window');
  }
}

async function invokeClose(): Promise<void> {
  if (!isTauri() || isAndroid()) return;
  openGeneration += 1;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('close_music_mini_player_window');
}

export async function setMiniModeEnabled(enabled: boolean): Promise<void> {
  if (!isTauri() || isAndroid()) return;
  setMusicSettings({ miniModeEnabled: enabled });
  if (enabled) {
    await invokeOpen();
  } else {
    await invokeClose();
  }
  if (isTauri()) {
    void import('@tauri-apps/api/event')
      .then(({ emit }) => emit(ENABLED_EVENT, { enabled }))
      .catch(() => undefined);
  }
}

export async function toggleMiniModeEnabled(): Promise<boolean> {
  const next = !getMusicSettings().miniModeEnabled;
  await setMiniModeEnabled(next);
  return next;
}

export function bootstrapMusicMiniPlayerWindow(hasTrack = true): void {
  if (!isTauri() || isAndroid() || bootstrapped) return;
  bootstrapped = true;

  const schedule = () => {
    void invokePrecreate().catch(() => undefined);
    if (getMusicSettings().miniModeEnabled && hasTrack) {
      void invokeOpen().catch(() => undefined);
    }
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => schedule());
  } else {
    setTimeout(schedule, 200);
  }

  void import('@tauri-apps/api/event').then(({ listen }) => {
    void listen<{ enabled?: boolean }>(ENABLED_EVENT, (e) => {
      const enabled = e.payload?.enabled === true;
      if (getMusicSettings().miniModeEnabled === enabled) return;
      setMusicSettings({ miniModeEnabled: enabled });
    });
    void listen<{ action: string }>(COMMAND_EVENT, async (e) => {
      const action = e.payload?.action;
      const {
        audioShellTogglePlay,
        audioShellSkipNext,
        audioShellSkipPrev,
        audioShellOpenViewer,
      } = await import('@/lib/media/audio/audio-shell-controls');
      switch (action) {
        case 'play':
        case 'pause':
        case 'toggle':
          audioShellTogglePlay();
          break;
        case 'next':
          audioShellSkipNext();
          break;
        case 'prev':
          audioShellSkipPrev();
          break;
        case 'open':
          audioShellOpenViewer();
          break;
        default:
          break;
      }
    });
  });

  subscribeMusicSettings((s) => {
    if (!s.miniModeEnabled) {
      void invokeClose();
    } else {
      void syncMusicMiniPlayerNativeOptionsFromMain();
    }
  });
}

export { UPDATE_EVENT, COMMAND_EVENT, ENABLED_EVENT };

export async function emitMusicMiniPlayerUpdate(payload: {
  title: string;
  artist: string;
  coverUrl?: string;
  positionSec: number;
  durationSec: number;
  playing: boolean;
}): Promise<void> {
  if (!isTauri() || isAndroid() || !getMusicSettings().miniModeEnabled) return;
  try {
    const { emit } = await import('@tauri-apps/api/event');
    await emit(UPDATE_EVENT, payload);
  } catch {
    // ignore
  }
}

/** 将迷你窗限制在当前显示器工作区内 */
export async function clampMusicMiniPlayerToScreen(): Promise<void> {
  if (!isTauri() || isAndroid()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('clamp_music_mini_player_to_screen');
  } catch {
    // ignore
  }
}

/** 持久化迷你窗几何 */
export async function persistMusicMiniPlayerGeometry(): Promise<void> {
  if (!isTauri() || isAndroid()) return;
  try {
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const win = getCurrentWebviewWindow();
    const [pos, size, factor] = await Promise.all([
      win.outerPosition(),
      win.innerSize(),
      win.scaleFactor(),
    ]);
    const logicalX = pos.x / factor;
    const logicalY = pos.y / factor;
    const logicalW = size.width / factor;
    const logicalH = size.height / factor;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_music_mini_player_bounds', {
      x: Math.round(pos.x),
      y: Math.round(pos.y),
      width: Math.round(size.width),
      height: Math.round(size.height),
    });
    setMusicSettings({
      miniModeX: logicalX,
      miniModeY: logicalY,
      miniModeWidth: logicalW,
      miniModeHeight: logicalH,
    });
  } catch {
    // ignore
  }
}

export async function syncMusicMiniPlayerNativeOptions(): Promise<void> {
  if (!isTauri() || isAndroid()) return;
  const s = getMusicSettings();
  try {
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const win = getCurrentWebviewWindow();
    await win.setAlwaysOnTop(s.miniModeAlwaysOnTop ?? true);
  } catch {
    // ignore
  }
}

/** 主窗设置变更时同步迷你窗子窗 */
export async function syncMusicMiniPlayerNativeOptionsFromMain(): Promise<void> {
  if (!isTauri() || isAndroid()) return;
  const s = getMusicSettings();
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const win = await WebviewWindow.getByLabel(MINI_PLAYER_LABEL);
    if (win) {
      await win.setAlwaysOnTop(s.miniModeAlwaysOnTop ?? true);
    }
  } catch {
    // ignore
  }
  try {
    const { emit } = await import('@tauri-apps/api/event');
    await emit(NATIVE_RESYNC_EVENT, null);
  } catch {
    // ignore
  }
}

export { NATIVE_RESYNC_EVENT };
