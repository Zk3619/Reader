import { isAndroid, isTauri } from '@/lib/platform/detect';
import { SHELL_MODULES, type ShellModuleId } from '@/lib/modules/module-registry';
import { getModuleNavItems } from '@/lib/modules/module-nav-items';
import { ensureReaderFontFace, readerCustomFontFamilyName } from '@/lib/media/text/reader-font';
import { composeSansFontStack } from '@/lib/ui/font-stack';
import type { PageType } from '@/components/shell/Navigation';
import {
  DEFAULT_OUTBOUND_PROXY_MODE,
  DEFAULT_OUTBOUND_PROXY_URL,
  normalizeOutboundProxyMode,
  normalizeOutboundProxyUrl,
  setRuntimeOutboundProxy,
  type OutboundProxyMode,
} from '@/lib/settings/outbound-proxy';

export type { OutboundProxyMode } from '@/lib/settings/outbound-proxy';
export {
  DEFAULT_OUTBOUND_PROXY_MODE,
  DEFAULT_OUTBOUND_PROXY_URL,
  getRuntimeOutboundProxy,
  outboundProxyModeLabel,
  resolveOutboundProxyInvocation,
  resolveModuleOutboundProxy,
  syncShellOutboundProxyToRust,
} from '@/lib/settings/outbound-proxy';

/** `last-used` 或 `模块:侧栏页`（如 `reader:shelf`） */
export type StartupPage = string;

export const STARTUP_PAGE_LAST_USED = 'last-used';
export const DEFAULT_STARTUP_PAGE: StartupPage = STARTUP_PAGE_LAST_USED;
export const DEFAULT_NETWORK_REQUEST_TIMEOUT_SECONDS = 30;
export const DEFAULT_NETWORK_RETRY_COUNT = 1;
export const DEFAULT_AUTO_CHECK_UPDATES = true;
export const DEFAULT_APP_FONT_SIZE = 16;
/** 空字符串表示系统默认字体 */
export const DEFAULT_APP_FONT_FAMILY = '';
export const DEFAULT_APP_FONT_PATH = '';
export const APP_FONT_DEFAULT_OPTION_LABEL = '默认字体';

const LAST_SHELL_PAGE_STORAGE_KEY = 'reader_last_shell_page';

/** queryLocalFonts 不可用时的常见系统字体回退列表 */
const FALLBACK_SYSTEM_FONT_FAMILIES = [
  'Microsoft YaHei',
  'Microsoft YaHei UI',
  'SimSun',
  'SimHei',
  'KaiTi',
  'FangSong',
  'Noto Sans SC',
  'Noto Serif SC',
  'Source Han Sans SC',
  'Source Han Serif SC',
  'PingFang SC',
  'Hiragino Sans GB',
  'WenQuanYi Micro Hei',
  'Segoe UI',
  'Arial',
  'Helvetica Neue',
  'Times New Roman',
  'Georgia',
  'Consolas',
  'Courier New',
] as const;

export interface StartupPageOption {
  value: StartupPage;
  label: string;
}

export interface MainProgramSettingsInput {
  startupPage?: unknown;
  networkRequestTimeoutSeconds?: unknown;
  networkRetryCount?: unknown;
  outboundProxyMode?: unknown;
  outboundProxyUrl?: unknown;
  autoCheckUpdates?: unknown;
  appFontSize?: unknown;
  appFontFamily?: unknown;
  appFontPath?: unknown;
}

export interface NormalizedMainProgramSettings {
  startupPage: StartupPage;
  networkRequestTimeoutSeconds: number;
  networkRetryCount: number;
  outboundProxyMode: OutboundProxyMode;
  outboundProxyUrl: string;
  autoCheckUpdates: boolean;
  appFontSize: number;
  appFontFamily: string;
  appFontPath: string;
}

export interface ResolvedStartupTarget {
  shellPage: PageType;
  navId: string;
}

let runtimeNetworkDefaults = {
  timeoutSeconds: DEFAULT_NETWORK_REQUEST_TIMEOUT_SECONDS,
  retryCount: DEFAULT_NETWORK_RETRY_COUNT,
};

export function setRuntimeNetworkDefaults(value: {
  timeoutSeconds: number;
  retryCount: number;
  outboundProxyMode?: OutboundProxyMode;
  outboundProxyUrl?: string;
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
  if (value.outboundProxyMode !== undefined || value.outboundProxyUrl !== undefined) {
    setRuntimeOutboundProxy({
      mode: value.outboundProxyMode ?? DEFAULT_OUTBOUND_PROXY_MODE,
      url: value.outboundProxyUrl ?? DEFAULT_OUTBOUND_PROXY_URL,
    });
  }
}

export function getRuntimeNetworkDefaults(): Readonly<typeof runtimeNetworkDefaults> {
  return runtimeNetworkDefaults;
}

function buildStartupPageCatalog(): { options: StartupPageOption[]; allowed: Set<string> } {
  const options: StartupPageOption[] = [
    { value: STARTUP_PAGE_LAST_USED, label: '上次页面' },
  ];
  const allowed = new Set<string>([STARTUP_PAGE_LAST_USED]);

  for (const mod of SHELL_MODULES) {
    for (const item of getModuleNavItems(mod.shellPage)) {
      const value = `${mod.id}:${item.id}`;
      options.push({ value, label: `${mod.label} · ${item.label}` });
      allowed.add(value);
    }
  }

  return { options, allowed };
}

let startupCatalog: ReturnType<typeof buildStartupPageCatalog> | null = null;

function getStartupCatalog(): ReturnType<typeof buildStartupPageCatalog> {
  if (!startupCatalog) startupCatalog = buildStartupPageCatalog();
  return startupCatalog;
}

export function listStartupPageOptions(): StartupPageOption[] {
  return getStartupCatalog().options;
}

export function startupPageLabel(value: StartupPage): string {
  return getStartupCatalog().options.find((o) => o.value === value)?.label ?? value;
}

/** 兼容旧值 `bookshelf` → `reader:shelf` */
export function normalizeStartupPage(value: unknown): StartupPage {
  if (value === 'bookshelf') return 'reader:shelf';
  if (typeof value === 'string' && getStartupCatalog().allowed.has(value)) return value;
  return DEFAULT_STARTUP_PAGE;
}

export function parseStartupPageTarget(value: StartupPage): ResolvedStartupTarget | null {
  const normalized = normalizeStartupPage(value);
  if (normalized === STARTUP_PAGE_LAST_USED) return null;
  const sep = normalized.indexOf(':');
  if (sep <= 0) return null;
  const moduleId = normalized.slice(0, sep) as ShellModuleId;
  const navId = normalized.slice(sep + 1);
  const mod = SHELL_MODULES.find((m) => m.id === moduleId);
  if (!mod) return null;
  const items = getModuleNavItems(mod.shellPage);
  if (!items.some((item) => item.id === navId)) return null;
  return { shellPage: mod.shellPage, navId };
}

export function applyMainProgramAppearance(value: {
  appFontSize: number;
  appFontFamily: string;
  appFontPath?: string;
}): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.fontSize = `${normalizeInteger(value.appFontSize, DEFAULT_APP_FONT_SIZE, 12, 24)}px`;

  const path = (value.appFontPath ?? '').trim();
  let family = value.appFontFamily.trim();
  if (path) {
    const faceName =
      family ||
      readerCustomFontFamilyName({ customFontName: '', customFontPath: path });
    ensureReaderFontFace(path, faceName);
    family = faceName;
  }

  // 始终写入带 Emoji 回退的栈；仅设中文字体名时 WebView 易把 emoji 画成 □
  root.style.setProperty('--font-sans', composeSansFontStack(family || null));
}

/** 列举系统字体族（优先 Local Font Access API） */
export async function listSystemFontFamilies(): Promise<string[]> {
  const queryLocalFonts = (
    window as Window & {
      queryLocalFonts?: () => Promise<Array<{ family?: string }>>;
    }
  ).queryLocalFonts;

  if (typeof queryLocalFonts === 'function') {
    try {
      const fonts = await queryLocalFonts();
      const families = new Set<string>();
      for (const font of fonts) {
        const family = font.family?.trim();
        if (family) families.add(family);
      }
      if (families.size > 0) {
        return [...families].sort((a, b) => a.localeCompare(b, 'zh-CN'));
      }
    } catch {
      // 用户拒绝或环境不支持时回退
    }
  }

  return [...FALLBACK_SYSTEM_FONT_FAMILIES];
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
    startupPage: normalizeStartupPage(value.startupPage),
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
    outboundProxyMode: normalizeOutboundProxyMode(value.outboundProxyMode),
    outboundProxyUrl: normalizeOutboundProxyUrl(value.outboundProxyUrl),
    autoCheckUpdates:
      typeof value.autoCheckUpdates === 'boolean'
        ? value.autoCheckUpdates
        : DEFAULT_AUTO_CHECK_UPDATES,
    appFontSize: normalizeInteger(value.appFontSize, DEFAULT_APP_FONT_SIZE, 12, 24),
    appFontFamily:
      typeof value.appFontFamily === 'string'
        ? value.appFontFamily.trim().slice(0, 200)
        : DEFAULT_APP_FONT_FAMILY,
    appFontPath:
      typeof value.appFontPath === 'string'
        ? value.appFontPath.trim().slice(0, 1000)
        : DEFAULT_APP_FONT_PATH,
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
