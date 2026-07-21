/**
 * Android 悬浮歌词：监听 desktop-lyric-update，算当前行并推到原生 overlay。
 */

import { currentLyricLine } from '@/lib/media/audio/current-lyric-line';
import {
  getMusicSettings,
  subscribeMusicSettings,
} from '@/lib/media/audio/music-settings';
import { isAndroid, isTauri } from '@/lib/platform/detect';

let listening = false;
let unlistenUpdate: (() => void) | undefined;
let unlistenSettings: (() => void) | undefined;
let lastLine = '';
let lastMeta = '';

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

export async function checkAndroidOverlayPermission(): Promise<boolean> {
  if (!isTauri() || !isAndroid()) return false;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<boolean>('check_android_overlay_permission');
}

export async function requestAndroidOverlayPermission(): Promise<void> {
  if (!isTauri() || !isAndroid()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('request_android_overlay_permission');
}

export async function showAndroidDesktopLyric(): Promise<void> {
  if (!isTauri() || !isAndroid()) return;
  const allowed = await checkAndroidOverlayPermission();
  if (!allowed) {
    await requestAndroidOverlayPermission();
    throw new Error('需要「显示在其他应用上层」权限后才能开启悬浮歌词');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('show_android_desktop_lyric', showArgsFromSettings());
  ensureAndroidDesktopLyricBridge();
  // 立刻刷一行，避免空白
  if (lastLine || lastMeta) {
    await invokeSetText(lastLine, lastMeta);
  }
}

export async function hideAndroidDesktopLyric(): Promise<void> {
  if (!isTauri() || !isAndroid()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('hide_android_desktop_lyric');
}

export async function isAndroidDesktopLyricShown(): Promise<boolean> {
  if (!isTauri() || !isAndroid()) return false;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<boolean>('is_android_desktop_lyric_shown');
}

export async function syncAndroidDesktopLyricStyle(): Promise<void> {
  if (!isTauri() || !isAndroid()) return;
  if (!(await isAndroidDesktopLyricShown())) return;
  const { invoke } = await import('@tauri-apps/api/core');
  const style = styleFromSettings();
  await invoke('set_android_desktop_lyric_style', style);
}

export async function syncAndroidDesktopLyricLock(): Promise<void> {
  if (!isTauri() || !isAndroid()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('set_android_desktop_lyric_lock', {
    locked: getMusicSettings().desktopLyricLocked === true,
  });
}

/** 挂载 desktop-lyric-update → 原生文字 的桥；可重复调用 */
export function ensureAndroidDesktopLyricBridge(): void {
  if (!isTauri() || !isAndroid() || listening) return;
  listening = true;

  void import('@tauri-apps/api/event').then(({ listen }) => {
    void listen<{
      title?: string;
      artist?: string;
      lyric?: string;
      positionSec?: number;
      playing?: boolean;
    }>('desktop-lyric-update', (e) => {
      if (!getMusicSettings().desktopLyricEnabled) return;
      const title = e.payload.title ?? '';
      const artist = e.payload.artist ?? '';
      const lyric = e.payload.lyric ?? '';
      const positionSec = e.payload.positionSec ?? 0;
      const line = currentLyricLine(lyric, positionSec);
      const meta = [title, artist].filter(Boolean).join(' · ');
      // 暂停时可略降透明度：由样式 opacity 管，这里只推字
      void invokeSetText(line, meta).catch(() => undefined);
    }).then((fn) => {
      unlistenUpdate = fn;
    });
  });

  unlistenSettings = subscribeMusicSettings(() => {
    if (!getMusicSettings().desktopLyricEnabled) return;
    void syncAndroidDesktopLyricStyle().catch(() => undefined);
    void syncAndroidDesktopLyricLock().catch(() => undefined);
  });
}

export function teardownAndroidDesktopLyricBridge(): void {
  listening = false;
  unlistenUpdate?.();
  unlistenUpdate = undefined;
  unlistenSettings?.();
  unlistenSettings = undefined;
  lastLine = '';
  lastMeta = '';
}
