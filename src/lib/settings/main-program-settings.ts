import { isAndroid, isTauri } from '@/lib/platform/detect';

export type StartupPage = 'bookshelf' | 'last-used';

export const DEFAULT_STARTUP_PAGE: StartupPage = 'bookshelf';
export const DEFAULT_NETWORK_REQUEST_TIMEOUT_SECONDS = 30;
export const DEFAULT_NETWORK_RETRY_COUNT = 1;
export const DEFAULT_AUTO_CHECK_UPDATES = true;
export const DEFAULT_APP_FONT_SIZE = 16;
export const DEFAULT_APP_FONT_FAMILY = '';
const LAST_SHELL_PAGE_STORAGE_KEY = 'reader_last_shell_page';

export interface MainProgramSettingsInput {
  startupPage?: unknown;
  networkRequestTimeoutSeconds?: unknown;
  networkRetryCount?: unknown;
  autoCheckUpdates?: unknown;
  appFontSize?: unknown;
  appFontFamily?: unknown;
}

export interface NormalizedMainProgramSettings {
  startupPage: StartupPage;
  networkRequestTimeoutSeconds: number;
  networkRetryCount: number;
  autoCheckUpdates: boolean;
  appFontSize: number;
  appFontFamily: string;
}

let runtimeNetworkDefaults = {
  timeoutSeconds: DEFAULT_NETWORK_REQUEST_TIMEOUT_SECONDS,
  retryCount: DEFAULT_NETWORK_RETRY_COUNT,
};

export function setRuntimeNetworkDefaults(value: {
  timeoutSeconds: number;
  retryCount: number;
}): void {
  runtimeNetworkDefaults = {
    timeoutSeconds: normalizeInteger(
      value.timeoutSeconds,
      DEFAULT_NETWORK_REQUEST_TIMEOUT_SECONDS,
      5,
      300,
    ),
    retryCount: normalizeInteger(value.retryCount, DEFAULT_NETWORK_RETRY_COUNT, 0, 5),
  };
}

export function getRuntimeNetworkDefaults(): Readonly<typeof runtimeNetworkDefaults> {
  return runtimeNetworkDefaults;
}

export function applyMainProgramAppearance(value: {
  appFontSize: number;
  appFontFamily: string;
}): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.fontSize = `${normalizeInteger(value.appFontSize, DEFAULT_APP_FONT_SIZE, 12, 24)}px`;
  const family = value.appFontFamily.trim();
  if (family) root.style.setProperty('--font-sans', family);
  else root.style.removeProperty('--font-sans');
}

export function readLastShellPage(): string | null {
  try {
    return localStorage.getItem(LAST_SHELL_PAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function persistLastShellPage(page: string): void {
  try {
    if (page.trim()) localStorage.setItem(LAST_SHELL_PAGE_STORAGE_KEY, page);
  } catch {
    // 存储不可用时保留默认启动页。
  }
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function normalizeMainProgramSettings(
  value: MainProgramSettingsInput,
): NormalizedMainProgramSettings {
  return {
    startupPage: value.startupPage === 'last-used' ? 'last-used' : DEFAULT_STARTUP_PAGE,
    networkRequestTimeoutSeconds: normalizeInteger(
      value.networkRequestTimeoutSeconds,
      DEFAULT_NETWORK_REQUEST_TIMEOUT_SECONDS,
      5,
      300,
    ),
    networkRetryCount: normalizeInteger(
      value.networkRetryCount,
      DEFAULT_NETWORK_RETRY_COUNT,
      0,
      5,
    ),
    autoCheckUpdates:
      typeof value.autoCheckUpdates === 'boolean'
        ? value.autoCheckUpdates
        : DEFAULT_AUTO_CHECK_UPDATES,
    appFontSize: normalizeInteger(value.appFontSize, DEFAULT_APP_FONT_SIZE, 12, 24),
    appFontFamily:
      typeof value.appFontFamily === 'string'
        ? value.appFontFamily.trim().slice(0, 200)
        : DEFAULT_APP_FONT_FAMILY,
  };
}

export type MainProgramRuntime = 'web' | 'android' | 'tauri-desktop';

export function detectMainProgramRuntime(): MainProgramRuntime {
  if (isAndroid()) return 'android';
  return isTauri() ? 'tauri-desktop' : 'web';
}

export function desktopIntegrationUnavailableReason(runtime: MainProgramRuntime): string | null {
  if (runtime === 'tauri-desktop') return null;
  if (runtime === 'android') return 'Android 不支持桌面窗口、系统托盘与桌面自启动设置。';
  return '纯 Web 运行时由浏览器管理启动、窗口与系统托盘，无法修改这些设置。';
}
