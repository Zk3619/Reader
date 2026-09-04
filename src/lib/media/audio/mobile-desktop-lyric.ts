/**
 * 移动端悬浮歌词：监听 desktop-lyric-update，算当前行并推到原生 overlay。
 * 当前实现走 Android WindowManager；iOS / HarmonyOS 接入后仍由此模块分发。
 */

import { currentLyricLine } from '@/lib/media/audio/current-lyric-line';
import {
  getMusicSettings,
  subscribeMusicSettings,
} from '@/lib/media/audio/music-settings';
import { isAndroid, isTauri } from '@/lib/platform/detect';

export const MOBILE_OVERLAY_PERMISSION_REQUIRED =
  '需要「显示在其他应用上层」权限后才能开启悬浮歌词';

let listening = false;
let unlistenUpdate: (() => void) | undefined;
let unlistenSettings: (() => void) | undefined;
let unlistenResume: (() => void) | undefined;
let lastLine = '';
let lastMeta = '';

type OverlayPermissionPrompt = () => Promise<boolean>;
let overlayPermissionPrompt: OverlayPermissionPrompt | null = null;

/** 当前是否具备移动端悬浮歌词能力（现仅 Android 原生 overlay） */
export function supportsMobileOverlayLyric(): boolean {
  return isTauri() && isAndroid();
}

export function registerMobileOverlayPermissionPrompt(
  prompt: OverlayPermissionPrompt | null,
): void {
  overlayPermissionPrompt = prompt;
}

function styleFromSettings() {
  const s = getMusicSettings();
  const fontSize = s.desktopLyricFontSize ?? 20;
  const color =
    (s.desktopLyricPlayedColor && s.desktopLyricPlayedColor.trim()) || '#FFFFFF';
  const alpha = Math.max(0.2, Math.min(1, s.desktopLyricOpacity ?? 0.9));
  const align = s.desktopLyricAlign === 'justify' ? 'center' : s.desktopLyricAlign;
  return {
    textSizeSp: fontSize,
    color,
    alpha,
    align,
  };
}

function showArgsFromSettings() {
  const s = getMusicSettings();
  const style = styleFromSettings();
  return {
    locked: s.desktopLyricLocked === true,
    textSizeSp: style.textSizeSp,
    color: style.color,
    alpha: style.alpha,
    align: style.align,
    x: typeof s.desktopLyricX === 'number' ? Math.round(s.desktopLyricX) : -1,
    y: typeof s.desktopLyricY === 'number' ? Math.round(s.desktopLyricY) : -1,
  };
}

async function invokeSetText(line: StringLike, meta: StringLike): Promise<void> {
  const nextLine = String(line ?? '');
  const nextMeta = String(meta ?? '');
  if (nextLine === lastLine && nextMeta === lastMeta) return;
  lastLine = nextLine;
  lastMeta = nextMeta;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('set_android_desktop_lyric_text', {
    line: nextLine,
    meta: nextMeta,
  });
}

type StringLike = string | null | undefined;

/** Android 专用：`SYSTEM_ALERT_WINDOW` / 显示在其他应用上层 */
export async function checkAndroidOverlayPermission(): Promise<boolean> {
  if (!supportsMobileOverlayLyric()) return false;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<boolean>('check_android_overlay_permission');
}

/** Android 专用：打开系统「显示在其他应用上层」设置页 */
export async function requestAndroidOverlayPermission(): Promise<void> {
  if (!supportsMobileOverlayLyric()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('request_android_overlay_permission');
}

/** 打开系统设置后等到回到应用前台且权限已授予。 */
export function waitUntilReturnedFromOverlaySettings(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(poll);
      window.clearTimeout(timer);
      resolve();
    };
    const maybeFinish = async () => {
      if (!(await checkAndroidOverlayPermission())) return;
      // 须在应用前台再结束，避免仍在系统设置页就 addView overlay
      if (typeof document !== 'undefined' && document.hidden) return;
      finish();
    };
    const onVis = () => {
      if (document.hidden) return;
      // 回到前台即尝试结束（部分 WebView 去设置时不触发 hidden）
      void maybeFinish();
    };
    const onFocus = () => {
      if (!document.hidden) {
        void maybeFinish();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    const poll = window.setInterval(() => {
      void maybeFinish();
    }, 400);
    const timer = window.setTimeout(finish, 120_000);
  });
}

async function waitForForegroundPaint(): Promise<void> {
  if (typeof document === 'undefined' || document.hidden) return;
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** 授权后恢复悬浮歌词（已开启 desktopLyricEnabled 时补显窗并刷新歌词） */
export async function resumeMobileDesktopLyricAfterPermissionGranted(): Promise<void> {
  if (!supportsMobileOverlayLyric()) return;
  if (!(await checkAndroidOverlayPermission())) return;
  if (!getMusicSettings().desktopLyricEnabled) return;
  await waitForForegroundPaint();
  ensureMobileDesktopLyricBridge();
  try {
    if (!(await isMobileDesktopLyricShown())) {
      await showMobileDesktopLyric();
      return;
    }
    const { emit } = await import('@tauri-apps/api/event');
    await emit('desktop-lyric-command', { action: 'request-info' });
  } catch (err) {
    console.warn('[mobile-desktop-lyric] resume after permission failed', err);
  }
}

/**
 * 若尚未授权：走已注册的 AppDialog（否则直接打开系统设置）。
 * 不在页面内插入常驻提示。
 */
export async function promptMobileOverlayPermission(): Promise<boolean> {
  if (!supportsMobileOverlayLyric()) return false;
  if (await checkAndroidOverlayPermission()) return true;
  if (overlayPermissionPrompt) return overlayPermissionPrompt();
  await requestAndroidOverlayPermission();
  await waitUntilReturnedFromOverlaySettings();
  return checkAndroidOverlayPermission();
}

export async function showMobileDesktopLyric(): Promise<void> {
  if (!supportsMobileOverlayLyric()) return;
  const allowed = await checkAndroidOverlayPermission();
  if (!allowed) {
    throw new Error(MOBILE_OVERLAY_PERMISSION_REQUIRED);
  }
  await waitForForegroundPaint();
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('show_android_desktop_lyric', showArgsFromSettings());
  ensureMobileDesktopLyricBridge();
  if (!(await confirmMobileDesktopLyricShown())) {
    throw new Error('悬浮歌词显示失败，请稍后重试');
  }
  if (lastLine || lastMeta) {
    await invokeSetText(lastLine, lastMeta);
  }
  try {
    const { emit } = await import('@tauri-apps/api/event');
    await emit('desktop-lyric-command', { action: 'request-info' });
  } catch {
    /* hub 未挂载时忽略 */
  }
}

export async function hideMobileDesktopLyric(): Promise<void> {
  if (!supportsMobileOverlayLyric()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('hide_android_desktop_lyric');
}

export async function isMobileDesktopLyricShown(): Promise<boolean> {
  if (!supportsMobileOverlayLyric()) return false;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<boolean>('is_android_desktop_lyric_shown');
}

async function confirmMobileDesktopLyricShown(maxAttempts = 5): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    if (await isMobileDesktopLyricShown()) return true;
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 100 * (i + 1));
    });
  }
  return false;
}

export async function syncMobileDesktopLyricStyle(): Promise<void> {
  if (!supportsMobileOverlayLyric()) return;
  if (!(await isMobileDesktopLyricShown())) return;
  const { invoke } = await import('@tauri-apps/api/core');
  const style = styleFromSettings();
  await invoke('set_android_desktop_lyric_style', style);
}

export async function syncMobileDesktopLyricLock(): Promise<void> {
  if (!supportsMobileOverlayLyric()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('set_android_desktop_lyric_lock', {
    locked: getMusicSettings().desktopLyricLocked === true,
  });
}

async function refreshMobileDesktopLyricFromEvent(payload: {
  title?: string;
  artist?: string;
  lyric?: string;
  positionSec?: number;
}): Promise<void> {
  if (!getMusicSettings().desktopLyricEnabled) return;
  const title = payload.title ?? '';
  const artist = payload.artist ?? '';
  const lyric = payload.lyric ?? '';
  const positionSec = payload.positionSec ?? 0;
  const line = currentLyricLine(lyric, positionSec);
  const showMeta = getMusicSettings().desktopLyricShowMeta !== false;
  const meta = showMeta ? [title, artist].filter(Boolean).join(' · ') : '';
  await invokeSetText(line, meta);
}

/** 挂载 desktop-lyric-update → 原生文字 的桥；可重复调用 */
export function ensureMobileDesktopLyricBridge(): void {
  if (!supportsMobileOverlayLyric() || listening) return;
  listening = true;

  void import('@tauri-apps/api/event').then(({ listen }) => {
    void listen<{
      title?: string;
      artist?: string;
      lyric?: string;
      positionSec?: number;
      playing?: boolean;
    }>('desktop-lyric-update', (e) => {
      void refreshMobileDesktopLyricFromEvent(e.payload).catch(() => undefined);
    }).then((fn) => {
      unlistenUpdate = fn;
    });
  });

  unlistenSettings = subscribeMusicSettings(() => {
    if (!getMusicSettings().desktopLyricEnabled) return;
    void syncMobileDesktopLyricStyle().catch(() => undefined);
    void syncMobileDesktopLyricLock().catch(() => undefined);
  });

  const onResume = () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    if (!getMusicSettings().desktopLyricEnabled) return;
    void resumeMobileDesktopLyricAfterPermissionGranted().catch(() => undefined);
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    unlistenResume = () => {
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
    };
  }
}

export function teardownMobileDesktopLyricBridge(): void {
  listening = false;
  unlistenUpdate?.();
  unlistenUpdate = undefined;
  unlistenSettings?.();
  unlistenSettings = undefined;
  unlistenResume?.();
  unlistenResume = undefined;
  lastLine = '';
  lastMeta = '';
}
