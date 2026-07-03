/**
 * 阅读器系统显示控制：亮度、常亮、屏幕方向（Tauri + Web 降级）
 */

import { invoke } from '@tauri-apps/api/core';
import { isAndroid, isTauri, isWeb } from '@/lib/platform/detect';

export interface DisplayBrightnessProbe {
  native: boolean;
  overlay: boolean;
}

let cachedProbe: DisplayBrightnessProbe | null = null;
let savedNativeBrightness: number | null = null;
let usingOverlay = false;

export async function probeDisplayBrightness(): Promise<DisplayBrightnessProbe> {
  if (cachedProbe) return cachedProbe;
  if (isWeb()) {
    cachedProbe = { native: false, overlay: true };
    return cachedProbe;
  }
  if (!isTauri()) {
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

export async function applyReadBrightness(
  level: number,
  probe?: DisplayBrightnessProbe,
): Promise<void> {
  const p = probe ?? (await probeDisplayBrightness());
  const clamped = Math.min(100, Math.max(0, Math.round(level)));
  if (p.native && isTauri()) {
    try {
      await invoke('set_display_brightness', { level: clamped });
      usingOverlay = false;
      return;
    } catch {
      /* fallback overlay */
    }
  }
  usingOverlay = true;
  applyBrightnessOverlay(clamped);
}

export async function restoreBrightnessOnExit(brightnessAuto: boolean): Promise<void> {
  clearBrightnessOverlay();
  if (!brightnessAuto || !isTauri()) return;
  if (isAndroid()) {
    try {
      await invoke('restore_display_brightness');
    } catch {
      /* ignore */
    }
    savedNativeBrightness = null;
    usingOverlay = false;
    return;
  }
  if (savedNativeBrightness == null) return;
  try {
    await invoke('set_display_brightness', { level: savedNativeBrightness });
  } catch {
    /* ignore */
  }
  savedNativeBrightness = null;
  usingOverlay = false;
}

function applyBrightnessOverlay(level: number): void {
  const host = document.querySelector('[data-reader-brightness-host]');
  if (!host) return;
  const opacity = Math.max(0, Math.min(1, 1 - level / 100));
  host.setAttribute('data-brightness-overlay', '');
  (host as HTMLElement).style.setProperty('--reader-brightness-overlay', String(opacity));
}

export function clearBrightnessOverlay(): void {
  const host = document.querySelector('[data-reader-brightness-host]');
  host?.removeAttribute('data-brightness-overlay');
  (host as HTMLElement | null)?.style.removeProperty('--reader-brightness-overlay');
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
