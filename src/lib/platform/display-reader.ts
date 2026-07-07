/**
 * 阅读器系统显示控制：亮度、常亮、屏幕方向（Tauri + Web 降级）
 */

import { invoke } from '@tauri-apps/api/core';
import { showAppToast } from '@/components/shared/AppToasts';
import { isAndroid, isTauri, isWeb } from '@/lib/platform/detect';
import { mapReadBrightnessToOverlayLuminance } from '@/lib/platform/reader-brightness-overlay';
import { getReadingDisplaySettings } from '@/lib/settings/reading-display-settings';

export interface DisplayBrightnessProbe {
  native: boolean;
  overlay: boolean;
}

interface SetDisplayBrightnessResult {
  windowApplied?: boolean;
  systemApplied?: boolean;
  needsWriteSettings?: boolean;
}

let cachedProbe: DisplayBrightnessProbe | null = null;
let savedNativeBrightness: number | null = null;
let usingOverlay = false;
let writeSettingsHintShown = false;

function invalidateBrightnessProbe(): void {
  cachedProbe = null;
}

/** 进入阅读器时重置探测缓存 */
export function resetDisplayReaderSession(): void {
  invalidateBrightnessProbe();
  writeSettingsHintShown = false;
}

function showWriteSettingsHintOnce(): void {
  if (writeSettingsHintShown || !isAndroid()) return;
  writeSettingsHintShown = true;
  showAppToast({
    title: '阅读亮度',
    description:
      '已开启「同步控制系统亮度」，但尚未授予「修改系统设置」权限。可在设置 → 阅读体验 → 亮度同步系统中打开权限设置。',
    variant: 'info',
  });
}

export async function probeDisplayBrightness(): Promise<DisplayBrightnessProbe> {
  if (cachedProbe) return cachedProbe;
  if (isWeb() || !isTauri()) {
    cachedProbe = { native: false, overlay: true };
    return cachedProbe;
  }
  try {
    const result = await invoke<DisplayBrightnessProbe>('probe_display_brightness');
    cachedProbe = {
      native: result?.native === true,
      overlay: result?.overlay !== false,
    };
    return cachedProbe;
  } catch {
    cachedProbe = { native: false, overlay: true };
    return cachedProbe;
  }
}

export function isUsingBrightnessOverlay(): boolean {
  return usingOverlay;
}

export async function captureNativeBrightnessBeforeRead(): Promise<void> {
  resetDisplayReaderSession();
  if (!isTauri()) return;
  try {
    if (isAndroid()) {
      await invoke('capture_display_brightness');
      return;
    }
    const level = await invoke<number>('get_display_brightness');
    if (Number.isFinite(level)) savedNativeBrightness = level;
  } catch {
    savedNativeBrightness = null;
  }
}

function resolveBrightnessOverlayHost(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return (
    document.querySelector<HTMLElement>('[data-reader-brightness-host]') ??
    document.querySelector<HTMLElement>('#root') ??
    document.documentElement
  );
}

function applyBrightnessOverlay(level: number): void {
  const host = resolveBrightnessOverlayHost();
  if (!host) return;
  const luminance = mapReadBrightnessToOverlayLuminance(level);
  host.setAttribute('data-brightness-overlay', '');
  host.style.setProperty('--reader-brightness-filter', String(luminance));
}

export function clearBrightnessOverlay(): void {
  const host = resolveBrightnessOverlayHost();
  if (!host) return;
  host.removeAttribute('data-brightness-overlay');
  host.style.removeProperty('--reader-brightness-filter');
}

function applyOverlayWithRaf(level: number): void {
  usingOverlay = true;
  applyBrightnessOverlay(level);
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => applyBrightnessOverlay(level));
  }
}

/**
 * 用户主动打开系统「修改系统设置」授权页。
 * 切勿在滑条拖动/进入阅读器时自动调用——离开应用会导致 WebView 进程被杀。
 */
export async function openDisplayWriteSettings(): Promise<void> {
  if (!isAndroid() || !isTauri()) return;
  try {
    await invoke('open_display_write_settings');
  } catch {
    /* ignore */
  }
}

async function resolveSyncSystemBrightness(): Promise<boolean> {
  if (!isAndroid()) return false;
  const settings = await getReadingDisplaySettings();
  return settings.syncSystemBrightness === true;
}

async function tryNativeReadBrightness(
  level: number,
  syncSystem: boolean,
): Promise<SetDisplayBrightnessResult | null> {
  try {
    return await invoke<SetDisplayBrightnessResult>('set_display_brightness', {
      level,
      syncSystem,
    });
  } catch {
    return null;
  }
}

export async function applyReadBrightness(
  level: number,
  probe?: DisplayBrightnessProbe,
): Promise<void> {
  const p = probe ?? (await probeDisplayBrightness());
  const clamped = Math.min(100, Math.max(0, Math.round(level)));
  const syncSystem = await resolveSyncSystemBrightness();

  if (isTauri()) {
    const shouldTryNative = isAndroid() || p.native;
    if (shouldTryNative) {
      const result = await tryNativeReadBrightness(clamped, syncSystem);
      if (result && result.windowApplied !== false) {
        if (isAndroid()) {
          // WebView 下 window.screenBrightness 常不可见；系统写入成功时才去掉 overlay
          if (syncSystem && result.systemApplied) {
            clearBrightnessOverlay();
            usingOverlay = false;
          } else {
            applyOverlayWithRaf(clamped);
          }
          if (syncSystem && result.needsWriteSettings) {
            showWriteSettingsHintOnce();
          }
          return;
        }
        clearBrightnessOverlay();
        usingOverlay = false;
        return;
      }
      invalidateBrightnessProbe();
      console.warn('[display-reader] native brightness failed, fallback to overlay');
    }
  }

  applyOverlayWithRaf(clamped);
}

/** 按阅读器配置同步亮度：自动模式走系统亮度，手动模式走原生或全屏 overlay 降级 */
export async function syncReadBrightness(
  readBrightness: number,
  brightnessAuto: boolean,
): Promise<void> {
  if (brightnessAuto) {
    clearBrightnessOverlay();
    usingOverlay = false;
    if (isTauri() && isAndroid()) {
      try {
        await invoke('follow_system_display_brightness');
      } catch {
        /* ignore */
      }
    }
    return;
  }
  await applyReadBrightness(readBrightness);
}

export async function restoreBrightnessOnExit(_brightnessAuto: boolean): Promise<void> {
  clearBrightnessOverlay();
  usingOverlay = false;
  if (!isTauri()) return;

  if (isAndroid()) {
    try {
      await invoke('restore_display_brightness');
    } catch {
      /* ignore */
    }
    savedNativeBrightness = null;
    return;
  }

  if (savedNativeBrightness == null) return;
  try {
    await invoke('set_display_brightness', { level: savedNativeBrightness, syncSystem: false });
  } catch {
    /* ignore */
  }
  savedNativeBrightness = null;
}

export async function applyScreenOrientation(mode: number): Promise<void> {
  if (!isAndroid() || !isTauri()) return;
  try {
    await invoke('set_screen_orientation', { mode });
  } catch (e) {
    console.warn('[display-reader] set_screen_orientation failed', e);
  }
}

export async function applyKeepScreenOn(seconds: number): Promise<void> {
  if (isTauri()) {
    try {
      await invoke('set_keep_screen_on', { seconds });
      return;
    } catch (e) {
      console.warn('[display-reader] set_keep_screen_on failed', e);
    }
  }
  if (seconds === -1 && typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
    try {
      await navigator.wakeLock.request('screen');
    } catch {
      /* ignore */
    }
  }
}

export async function clearKeepScreenOn(): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke('set_keep_screen_on', { seconds: 0 });
  } catch {
    /* ignore */
  }
}
