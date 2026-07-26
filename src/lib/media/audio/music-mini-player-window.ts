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
/** 启用但启动时尚无曲目：等有曲目后再恢复开窗，勿清掉 enable */
let pendingRestoreOpen = false;
/**
 * 用户点小窗「关闭」后为 true：关窗并停播，但不改 miniModeEnabled。
 * 禁止 bootstrap / 自动恢复再次开窗，直到显式 setMiniModeEnabled(true) 或 clearDismissed。
 */
let userDismissed = false;
const dismissedListeners = new Set<() => void>();

function setUserDismissed(next: boolean): void {
  if (userDismissed === next) return;
  userDismissed = next;
  for (const cb of dismissedListeners) cb();
}

export function isMusicMiniPlayerDismissed(): boolean {
  return userDismissed;
}

export function subscribeMusicMiniPlayerDismissed(cb: () => void): () => void {
  dismissedListeners.add(cb);
  return () => dismissedListeners.delete(cb);
}

export function clearMusicMiniPlayerDismissed(): void {
  setUserDismissed(false);
}

/** 将主窗口显示到前台（迷你窗双击打开详情时） */
async function focusMainWindowFromMini(): Promise<void> {
  if (!isTauri() || isAndroid()) return;
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const main = await WebviewWindow.getByLabel('main');
    if (!main) return;
    try {
      await main.unminimize();
    } catch {
      /* ignore */
    }
    await main.show();
    await main.setFocus();
  } catch {
    /* ignore */
  }
}

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

function getNativeOptionsPayload() {
  const s = getMusicSettings();
  return {
    alwaysOnTop: s.miniModeAlwaysOnTop ?? true,
    lockScreen: s.miniModeLockScreen ?? false,
    lockScreenUseWorkArea: s.miniModeLockScreenBounds !== 'screen',
    edgeAutoHide: s.miniModeEdgeAutoHide !== false,
  };
}

async function invokePrecreate(): Promise<void> {
  if (!isTauri() || isAndroid() || windowCreated) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('precreate_music_mini_player_window', getWindowOptions());
  windowCreated = true;
  await invokeNativeOptions();
}

async function invokeOpen(): Promise<void> {
  if (!isTauri() || isAndroid()) return;
  if (userDismissed) return;
  const gen = ++openGeneration;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('open_music_mini_player_window', getWindowOptions());
  windowCreated = true;
  await invokeNativeOptions();
  if (gen !== openGeneration || !getMusicSettings().miniModeEnabled || userDismissed) {
    await invoke('close_music_mini_player_window');
    return;
  }
  // 重启恢复：若上次为贴边隐藏，立刻收起（无动画，避免先闪完整窗）
  await restoreMusicMiniPlayerEdgeCollapsed(false);
}

/** 按设置恢复贴边收起；animate=false 用于启动恢复 */
async function restoreMusicMiniPlayerEdgeCollapsed(animate: boolean): Promise<void> {
  const s = getMusicSettings();
  if (s.miniModeEdgeAutoHide === false) return;
  const side = s.miniModeEdgeSide;
  if (side !== 'left' && side !== 'right' && side !== 'top' && side !== 'bottom') return;
  await setMusicMiniPlayerEdgeCollapsed(side, { animate });
}

async function invokeClose(): Promise<void> {
  if (!isTauri() || isAndroid()) return;
  openGeneration += 1;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('close_music_mini_player_window');
}

async function invokeNativeOptions(): Promise<void> {
  if (!isTauri() || isAndroid()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_music_mini_player_options', getNativeOptionsPayload());
  } catch {
    // ignore
  }
}

export async function setMiniModeEnabled(enabled: boolean): Promise<void> {
  if (!isTauri() || isAndroid()) return;
  // 显式开关时清除「临时关闭」；关开关也不保留 dismissed
  setUserDismissed(false);
  // 关闭时立即落盘：迷你窗可能马上销毁，防抖写可能来不及
  setMusicSettings({ miniModeEnabled: enabled }, { persistImmediate: !enabled });
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

/**
 * 临时关闭迷你窗并停止播放（对齐影视 closeMini）：
 * 不改 miniModeEnabled；之后不会自动再开，直到再次打开开关 / PiP。
 */
export async function dismissMusicMiniPlayer(): Promise<void> {
  if (!isTauri() || isAndroid()) return;
  setUserDismissed(true);
  pendingRestoreOpen = false;
  await invokeClose();
  try {
    const { audioShellPause } = await import('@/lib/media/audio/audio-shell-controls');
    audioShellPause();
  } catch {
    /* ignore */
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

  void import('@tauri-apps/api/event').then(({ listen }) => {
    void listen<{ enabled?: boolean }>(ENABLED_EVENT, (e) => {
      const enabled = e.payload?.enabled === true;
      if (getMusicSettings().miniModeEnabled === enabled) return;
      setMusicSettings({ miniModeEnabled: enabled });
    });
    void listen<{ action: string; idle?: boolean }>(COMMAND_EVENT, async (e) => {
      const action = e.payload?.action;
      const {
        audioShellPlay,
        audioShellPause,
        audioShellTogglePlay,
        audioShellSkipNext,
        audioShellSkipPrev,
        audioShellOpenViewer,
      } = await import('@/lib/media/audio/audio-shell-controls');
      switch (action) {
        case 'play':
          // 与桌面歌词一致：起播走 playOrFetch；勿把 pause 也当成 toggle
          audioShellPlay();
          break;
        case 'pause':
          audioShellPause();
          break;
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
          await focusMainWindowFromMini();
          // idle（等待播放）或无当前曲目：进音乐模块即可，不强制空详情
          audioShellOpenViewer({ preferHub: e.payload?.idle === true });
          break;
        default:
          break;
      }
    });
  });

  subscribeMusicSettings((s) => {
    if (!s.miniModeEnabled) {
      pendingRestoreOpen = false;
      void invokeClose();
    } else {
      void syncMusicMiniPlayerNativeOptionsFromMain();
    }
  });

  if (!getMusicSettings().miniModeEnabled || userDismissed) {
    pendingRestoreOpen = false;
    schedulePrecreate();
    return;
  }

  // 会话尚未 hydrate 出曲目时：保留 enable（按钮高亮），等有曲目后再开窗
  if (!hasTrack) {
    pendingRestoreOpen = true;
    schedulePrecreate();
    return;
  }

  pendingRestoreOpen = false;
  scheduleRestoreOpen();
}

/**
 * 曲目队列恢复后调用：若 bootstrap 时因无曲目延后了开窗，此时补开。
 */
export function notifyMusicMiniPlayerTrackAvailability(hasTrack: boolean): void {
  if (!isTauri() || isAndroid() || !bootstrapped) return;
  if (!hasTrack) return;
  if (!getMusicSettings().miniModeEnabled || userDismissed) {
    pendingRestoreOpen = false;
    return;
  }
  if (!pendingRestoreOpen) return;
  pendingRestoreOpen = false;
  scheduleRestoreOpen();
}

function schedulePrecreate(): void {
  const create = () => {
    void invokePrecreate().catch(() => undefined);
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => create());
  } else {
    setTimeout(create, 200);
  }
}

function scheduleRestoreOpen(): void {
  const open = () => {
    void invokeOpen().catch((err) =>
      console.warn('[music-mini-player] restore open failed', err),
    );
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => open(), { timeout: 800 });
  } else {
    setTimeout(open, 500);
  }
}

export { UPDATE_EVENT, COMMAND_EVENT, ENABLED_EVENT };

export async function emitMusicMiniPlayerUpdate(payload: {
  title: string;
  artist: string;
  coverUrl?: string;
  lyric?: string;
  positionSec: number;
  durationSec: number;
  playing: boolean;
}): Promise<void> {
  if (!isTauri() || isAndroid() || !getMusicSettings().miniModeEnabled || userDismissed) return;
  try {
    const { emit } = await import('@tauri-apps/api/event');
    await emit(UPDATE_EVENT, payload);
  } catch {
    // ignore
  }
}

/** 将迷你窗限制在当前显示器可用区域内（尊重 lockScreen / workArea） */
export async function clampMusicMiniPlayerToScreen(): Promise<void> {
  if (!isTauri() || isAndroid()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('clamp_music_mini_player_to_screen');
  } catch {
    // ignore
  }
}

export async function setMusicMiniPlayerInteracting(interacting: boolean): Promise<void> {
  if (!isTauri() || isAndroid()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_music_mini_player_interacting', { interacting });
  } catch {
    // ignore
  }
}

export async function setMusicMiniPlayerBounds(next: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Promise<void> {
  if (!isTauri() || isAndroid()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_music_mini_player_bounds', next);
  } catch {
    // ignore
  }
}

export type MiniPlayerEdgeSide = 'left' | 'right' | 'top' | 'bottom' | 'none';

export type MiniPlayerDragBoundsResult = {
  x: number;
  y: number;
  width: number;
  height: number;
  outwardLeft: number;
  outwardRight: number;
  outwardTop?: number;
  outwardBottom?: number;
  /** 窗口顶住该侧边界且仍在向外推（光标钉在屏幕边缘时也为 true） */
  pressLeft?: boolean;
  pressRight?: boolean;
  pressTop?: boolean;
  pressBottom?: boolean;
};

/** 拖拽帧：夹紧位置并返回相对四边的外推量 */
export async function setMusicMiniPlayerBoundsForDrag(next: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Promise<MiniPlayerDragBoundsResult | null> {
  if (!isTauri() || isAndroid()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<MiniPlayerDragBoundsResult>(
      'set_music_mini_player_bounds_for_drag',
      next,
    );
  } catch (err) {
    console.warn('[music-mini-player] bounds_for_drag failed', err);
    return null;
  }
}

export async function setMusicMiniPlayerEdgeCollapsed(
  side: MiniPlayerEdgeSide,
  options?: { animate?: boolean },
): Promise<boolean> {
  if (!isTauri() || isAndroid()) return false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_music_mini_player_edge_collapsed', {
      side,
      animate: options?.animate !== false,
    });
    // 持久化贴边侧，供重启恢复
    const persistSide: MiniPlayerEdgeSide =
      side === 'left' || side === 'right' || side === 'top' || side === 'bottom'
        ? side
        : 'none';
    setMusicSettings({ miniModeEdgeSide: persistSide });
    return true;
  } catch (err) {
    console.warn('[music-mini-player] edge_collapsed failed', err);
    return false;
  }
}

/**
 * 拖拽松手：由原生根据本轮顶边+外推累计决定是否贴边收起。
 * @returns 'left' | 'right' | 'top' | 'bottom' | ''
 */
export async function finishMusicMiniPlayerDrag(): Promise<
  'left' | 'right' | 'top' | 'bottom' | ''
> {
  if (!isTauri() || isAndroid()) return '';
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const side = await invoke<string>('finish_music_mini_player_drag');
    if (side === 'left' || side === 'right' || side === 'top' || side === 'bottom') {
      setMusicSettings({ miniModeEdgeSide: side });
      return side;
    }
    return '';
  } catch (err) {
    console.warn('[music-mini-player] finish_drag failed', err);
    return '';
  }
}

export async function detectMusicMiniPlayerEdgeSide(): Promise<
  'left' | 'right' | 'top' | 'bottom' | ''
> {
  if (!isTauri() || isAndroid()) return '';
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const side = await invoke<string>('detect_music_mini_player_edge_side');
    if (side === 'left' || side === 'right' || side === 'top' || side === 'bottom') {
      return side;
    }
    return '';
  } catch {
    return '';
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
    // 贴边细条尺寸勿写入，否则展开会还原成细条
    if (logicalW < 200 || logicalH < 56) return;
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
  await invokeNativeOptions();
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
  await invokeNativeOptions();
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
