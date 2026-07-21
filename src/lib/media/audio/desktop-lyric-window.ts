/**
 * 桌面歌词窗口开闭（对齐 LX desktopLyric.enable）
 * 单一真相源：music-settings.desktopLyricEnabled
 */

import {
  getMusicSettings,
  setMusicSettings,
  subscribeMusicSettings,
} from '@/lib/media/audio/music-settings';
import { isTauri } from '@/lib/platform/detect';

const ENABLED_EVENT = 'desktop-lyric-enabled-changed';

let syncing = false;
let bootstrapped = false;
/** 取消过期的异步开窗，避免 close 后 open 才完成导致关不掉 */
let openGeneration = 0;
/** 窗口是否已预创建（隐藏态） */
let windowCreated = false;

function getSettingsForWindow() {
  const s = getMusicSettings();
  return {
    width: s.desktopLyricWidth ?? 600,
    height: s.desktopLyricHeight ?? 200,
    x: s.desktopLyricX ?? null,
    y: s.desktopLyricY ?? null,
    showTaskbar: s.desktopLyricShowTaskbar ?? false,
    alwaysOnTop: s.desktopLyricAlwaysOnTop ?? true,
    alwaysOnTopLoop: s.desktopLyricAlwaysOnTopLoop ?? false,
    lockScreen: s.desktopLyricLockScreen ?? false,
  };
}

/** 预创建隐藏窗口（WebView 提前加载就绪），后续 show/hide 无需重建 */
async function invokePrecreate(): Promise<void> {
  if (windowCreated) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('precreate_desktop_lyric_window', getSettingsForWindow());
  windowCreated = true;
}

async function invokeOpen(): Promise<void> {
  const gen = ++openGeneration;
  const { invoke } = await import('@tauri-apps/api/core');
  if (!windowCreated) {
    await invoke('open_desktop_lyric_window', getSettingsForWindow());
    windowCreated = true;
  } else {
    await invoke('open_desktop_lyric_window', getSettingsForWindow());
  }
  if (gen !== openGeneration || !getMusicSettings().desktopLyricEnabled) {
    await invoke('close_desktop_lyric_window');
  }
}

async function invokeClose(): Promise<void> {
  openGeneration += 1;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('close_desktop_lyric_window');
}

function broadcastEnabled(enabled: boolean): void {
  try {
    window.dispatchEvent(
      new CustomEvent(ENABLED_EVENT, { detail: { enabled } }),
    );
  } catch {
    /* ignore */
  }
  if (!isTauri()) return;
  void import('@tauri-apps/api/event')
    .then(({ emit }) => emit(ENABLED_EVENT, { enabled }))
    .catch(() => undefined);
}

/**
 * Hub 挂载时：若设置里已启用且有可播放曲目则恢复窗口；并监听跨窗 enable 变化。
 * @param hasTrack 当前是否有已加载的曲目——无曲目时不自动恢复窗口（避免无音乐时空弹窗）
 */
export function bootstrapDesktopLyricWindow(hasTrack = true): void {
  if (!isTauri() || bootstrapped) return;
  bootstrapped = true;

  void import('@tauri-apps/api/event').then(({ listen }) => {
    void listen<{ enabled?: boolean }>(ENABLED_EVENT, (e) => {
      if (syncing) return;
      const enabled = e.payload?.enabled === true;
      if (getMusicSettings().desktopLyricEnabled === enabled) return;
      syncing = true;
      setMusicSettings({ desktopLyricEnabled: enabled });
      syncing = false;
    });
  });

  window.addEventListener(ENABLED_EVENT, ((e: CustomEvent<{ enabled?: boolean }>) => {
    if (syncing) return;
    const enabled = e.detail?.enabled === true;
    if (getMusicSettings().desktopLyricEnabled === enabled) return;
    syncing = true;
    setMusicSettings({ desktopLyricEnabled: enabled });
    syncing = false;
  }) as EventListener);

  if (!getMusicSettings().desktopLyricEnabled) {
    // 无论是否启用，都预创建隐藏窗口（WebView 预热），后续 show 即开即显
    schedulePrecreate();
    return;
  }

  // 无曲目时静默重置 enable 状态，避免空桌面歌词窗口弹出
  if (!hasTrack) {
    syncing = true;
    setMusicSettings({ desktopLyricEnabled: false });
    syncing = false;
    schedulePrecreate();
    return;
  }

  scheduleDesktopLyricRestoreOpen();
}

function schedulePrecreate(): void {
  const create = () => {
    void invokePrecreate().catch((err) =>
      console.warn('[desktop-lyric] precreate failed', err),
    );
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(create, { timeout: 3000 });
  } else {
    window.setTimeout(create, 1500);
  }
}

/** 主窗就绪后再恢复桌面歌词，避免与主 WebView 初始化抢锁卡死 */
function scheduleDesktopLyricRestoreOpen(): void {
  const open = () => {
    void invokeOpen().catch((err) =>
      console.warn('[desktop-lyric] restore open failed', err),
    );
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(open, { timeout: 800 });
  } else {
    window.setTimeout(open, 500);
  }
}

export function teardownDesktopLyricWindowSync(): void {
  bootstrapped = false;
  if (windowCreated && isTauri()) {
    windowCreated = false;
    void import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('destroy_desktop_lyric_window'))
      .catch(() => undefined);
  }
}

/** 切换桌面歌词；先更新 enable（按钮立刻切换），再开/关窗 */
export async function setDesktopLyricEnabled(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  const prev = getMusicSettings().desktopLyricEnabled === true;

  syncing = true;
  setMusicSettings({ desktopLyricEnabled: enabled });
  syncing = false;
  broadcastEnabled(enabled);

  try {
    if (enabled) {
      await invokeOpen();
    } else {
      await invokeClose();
    }
    // 再校验一次窗口实际状态
    const { invoke } = await import('@tauri-apps/api/core');
    const open = await invoke<boolean>('is_desktop_lyric_window_open');
    if (enabled && !open) await invokeOpen();
    if (!enabled && open) await invokeClose();
  } catch (err) {
    console.warn('[desktop-lyric] toggle failed', err);
    syncing = true;
    setMusicSettings({ desktopLyricEnabled: prev });
    syncing = false;
    broadcastEnabled(prev);
    throw err;
  }
}

export async function toggleDesktopLyricEnabled(): Promise<boolean> {
  const next = !getMusicSettings().desktopLyricEnabled;
  await setDesktopLyricEnabled(next);
  return next;
}

export function isDesktopLyricEnabled(): boolean {
  return getMusicSettings().desktopLyricEnabled === true;
}

/** 歌词窗关闭时回写（由 LyricDesktopPage 调用） */
export function notifyDesktopLyricWindowClosed(): void {
  if (syncing) return;
  openGeneration += 1;
  if (!getMusicSettings().desktopLyricEnabled) {
    broadcastEnabled(false);
    return;
  }
  syncing = true;
  setMusicSettings({ desktopLyricEnabled: false });
  syncing = false;
  broadcastEnabled(false);
}

/** 将窗口选项同步到原生桌面歌词窗 */
export async function syncDesktopLyricWindowOptions(
  patch?: Partial<{
    alwaysOnTop: boolean;
    locked: boolean;
    showTaskbar: boolean;
    alwaysOnTopLoop: boolean;
    lockScreen: boolean;
  }>,
): Promise<void> {
  if (!isTauri()) return;
  const s = getMusicSettings();
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('set_desktop_lyric_window_options', {
    alwaysOnTop: patch?.alwaysOnTop ?? s.desktopLyricAlwaysOnTop,
    locked: patch?.locked ?? s.desktopLyricLocked,
    showTaskbar: patch?.showTaskbar ?? s.desktopLyricShowTaskbar,
    alwaysOnTopLoop: patch?.alwaysOnTopLoop ?? s.desktopLyricAlwaysOnTopLoop,
    lockScreen: patch?.lockScreen ?? s.desktopLyricLockScreen,
  }).catch(() => undefined);
}

export async function clampDesktopLyricToScreen(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('clamp_desktop_lyric_to_screen').catch(() => undefined);
}

/** 持久化窗口几何 */
export async function persistDesktopLyricGeometry(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const win = getCurrentWebviewWindow();
    const [pos, size, factor] = await Promise.all([
      win.outerPosition(),
      win.innerSize(),
      win.scaleFactor(),
    ]);
    setMusicSettings({
      desktopLyricX: pos.x / factor,
      desktopLyricY: pos.y / factor,
      desktopLyricWidth: size.width / factor,
      desktopLyricHeight: size.height / factor,
    });
  } catch {
    /* ignore */
  }
}

/** 主窗可订阅 enable 变化以刷新 Toggle（storage 跨 WebView 可能不可靠） */
export function subscribeDesktopLyricEnabled(
  listener: (enabled: boolean) => void,
): () => void {
  const onSettings = subscribeMusicSettings((s) => {
    listener(s.desktopLyricEnabled === true);
  });
  const onLocal = ((e: CustomEvent<{ enabled?: boolean }>) => {
    listener(e.detail?.enabled === true);
  }) as EventListener;
  window.addEventListener(ENABLED_EVENT, onLocal);
  let unlistenTauri: (() => void) | undefined;
  if (isTauri()) {
    void import('@tauri-apps/api/event').then(({ listen }) => {
      void listen<{ enabled?: boolean }>(ENABLED_EVENT, (e) => {
        listener(e.payload?.enabled === true);
      }).then((fn) => {
        unlistenTauri = fn;
      });
    });
  }
  return () => {
    onSettings();
    window.removeEventListener(ENABLED_EVENT, onLocal);
    unlistenTauri?.();
  };
}
