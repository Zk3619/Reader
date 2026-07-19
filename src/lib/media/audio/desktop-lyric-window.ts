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

async function invokeOpen(): Promise<void> {
  const gen = ++openGeneration;
  const s = getMusicSettings();
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('open_desktop_lyric_window', {
    width: s.desktopLyricWidth ?? 600,
    height: s.desktopLyricHeight ?? 200,
    x: s.desktopLyricX ?? null,
    y: s.desktopLyricY ?? null,
  });
  // 若期间已请求关闭，立刻拆掉刚建好的窗
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

/** Hub 挂载时：若设置里已启用则恢复窗口；并监听跨窗 enable 变化 */
export function bootstrapDesktopLyricWindow(): void {
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

  if (!getMusicSettings().desktopLyricEnabled) return;
  void invokeOpen().catch((err) =>
    console.warn('[desktop-lyric] restore open failed', err),
  );
}

export function teardownDesktopLyricWindowSync(): void {
  bootstrapped = false;
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
