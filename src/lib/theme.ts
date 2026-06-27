/**
 * 应用主题：浅色 / 深色 / 跟随系统 / 按设定时段自动。
 * 持久化由 settingsStore 负责，此处负责应用到 document 与定时刷新。
 */

import { settingsState } from '@/stores/settings';

export type ThemeMode = 'light' | 'dark' | 'auto' | 'schedule';

export interface ThemeScheduleHours {
  dayStartHour: number;
  nightStartHour: number;
}

let mediaQuery: MediaQueryList | null = null;
let mediaListener: (() => void) | null = null;
let scheduleThemeTimer: number | null = null;

function getPreferredDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function clampThemeHour(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(23, Math.max(0, Math.round(n)));
}

export function normalizeThemeScheduleHours(
  raw?: Partial<ThemeScheduleHours> | null,
): ThemeScheduleHours {
  return {
    dayStartHour: clampThemeHour(raw?.dayStartHour, 6),
    nightStartHour: clampThemeHour(raw?.nightStartHour, 18),
  };
}

export function normalizeThemeMode(value: unknown): ThemeMode {
  if (value === 'light' || value === 'dark' || value === 'auto' || value === 'schedule') {
    return value;
  }
  return 'auto';
}

export function readThemeScheduleHours(): ThemeScheduleHours {
  return normalizeThemeScheduleHours({
    dayStartHour: settingsState.app.themeScheduleDayHour,
    nightStartHour: settingsState.app.themeScheduleNightHour,
  });
}

/** 当前是否在「浅色时段」（dayStart ≤ 时刻 < nightStart，支持跨午夜） */
export function isScheduleDaylight(
  hours: ThemeScheduleHours,
  now = new Date(),
): boolean {
  const h = now.getHours();
  const { dayStartHour: day, nightStartHour: night } = hours;
  if (day === night) return true;
  if (day < night) return h >= day && h < night;
  return h >= day || h < night;
}

/** 当前主题对应的实际是否为深色 */
export function getEffectiveDark(theme?: ThemeMode): boolean {
  const mode = theme ?? settingsState.app.theme;
  if (mode === 'light') return false;
  if (mode === 'dark') return true;
  if (mode === 'auto') return getPreferredDark();
  return !isScheduleDaylight(readThemeScheduleHours());
}

function clearMediaListener(): void {
  if (mediaListener && mediaQuery) {
    mediaQuery.removeEventListener('change', mediaListener);
    mediaListener = null;
    mediaQuery = null;
  }
}

function clearScheduleThemeTimer(): void {
  if (scheduleThemeTimer != null) {
    clearTimeout(scheduleThemeTimer);
    scheduleThemeTimer = null;
  }
}

function nextScheduleBoundary(hours: ThemeScheduleHours, now = new Date()): Date {
  const next = new Date(now);
  const daylight = isScheduleDaylight(hours, now);
  if (daylight) {
    next.setHours(hours.nightStartHour, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
  } else {
    next.setHours(hours.dayStartHour, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
  }
  return next;
}

function scheduleThemeRefresh(): void {
  clearScheduleThemeTimer();
  if (typeof window === 'undefined') return;
  const hours = readThemeScheduleHours();
  const delay = Math.max(60_000, nextScheduleBoundary(hours).getTime() - Date.now());
  scheduleThemeTimer = window.setTimeout(() => {
    document.documentElement.classList.toggle('dark', getEffectiveDark('schedule'));
    scheduleThemeRefresh();
  }, delay);
}

function applyDocumentDark(dark: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', dark);
}

/** 将主题应用到 document.documentElement（classList dark） */
export function applyThemeToDocument(theme?: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const mode = theme ?? settingsState.app.theme;
  clearMediaListener();
  clearScheduleThemeTimer();
  applyDocumentDark(getEffectiveDark(mode));

  if (mode === 'auto') {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaListener = () => {
      applyDocumentDark(getPreferredDark());
    };
    mediaQuery.addEventListener('change', mediaListener);
    return;
  }

  if (mode === 'schedule') {
    scheduleThemeRefresh();
  }
}
