import type { PersistDomain } from '@/lib/persistence/types';
import { registerPersistDomain } from '@/lib/persistence/registry';
import { getStorage, setStorage } from '@/lib/platform/storage';
import { createSignal } from 'solid-js';
import {
  clampSubscribeRefreshIntervalMinutes,
  SUBSCRIBE_REFRESH_INTERVAL_DEFAULT_MINUTES,
} from '@/lib/subscribe/refresh-interval';

export const SUBSCRIBE_CONFIG_DOMAIN_ID = 'subscribe.config';
export const SUBSCRIBE_CONFIG_STORAGE_KEY = 'subscribe_config_v1';
export const SUBSCRIBE_CONFIG_VERSION = 1;

/** 打开原文：系统浏览器 / 阅读式内嵌 / iframe / 独立 WebView 面板 */
export type SubscribeOpenOriginalMode =
  | 'browser'
  | 'inner-web'
  | 'iframe'
  | 'webview';

export const SUBSCRIBE_OPEN_ORIGINAL_MODES: SubscribeOpenOriginalMode[] = [
  'browser',
  'inner-web',
  'iframe',
  'webview',
];

export const SUBSCRIBE_OPEN_ORIGINAL_LABELS: Record<SubscribeOpenOriginalMode, string> = {
  browser: '系统浏览器',
  'inner-web': '内嵌页（自动）',
  iframe: '内嵌 iframe',
  webview: '独立 WebView 面板',
};

export interface SubscribeConfigSnapshot {
  version: typeof SUBSCRIBE_CONFIG_VERSION;
  autoRefreshOnOpen: boolean;
  /** 定期自动刷新全部启用源（本地 RSS，不弹 CF） */
  periodicRefreshEnabled: boolean;
  /** 进入源冷却 & 定期刷新间隔（分钟） */
  autoRefreshIntervalMinutes: number;
  /** 显示免登录发现广场（趋势 / RSSHub 分类） */
  foloDiscoverEnabled: boolean;
  /** 实验：Folo 账号登录与云同步（默认关，需自行承担条款与失效风险） */
  foloCloudAccountEnabled: boolean;
  /** 打开原文方式 */
  openOriginalMode: SubscribeOpenOriginalMode;
}

const DEFAULT_CONFIG: SubscribeConfigSnapshot = {
  version: SUBSCRIBE_CONFIG_VERSION,
  autoRefreshOnOpen: false,
  periodicRefreshEnabled: false,
  autoRefreshIntervalMinutes: SUBSCRIBE_REFRESH_INTERVAL_DEFAULT_MINUTES,
  foloDiscoverEnabled: true,
  foloCloudAccountEnabled: false,
  openOriginalMode: 'browser',
};

let cached = DEFAULT_CONFIG;
const [subscribeConfigRevision, setSubscribeConfigRevision] = createSignal(0);
export { subscribeConfigRevision };

/** 由 periodic-refresh 注册，避免 config ↔ refresh 模块导入环 */
let periodicRefreshSyncHook: (() => void) | null = null;

export function registerSubscribePeriodicRefreshSync(hook: () => void): void {
  periodicRefreshSyncHook = hook;
}

function bumpSubscribeConfigRevision(): void {
  setSubscribeConfigRevision((value) => value + 1);
}

function normalizeOpenOriginalMode(value: unknown): SubscribeOpenOriginalMode {
  if (
    value === 'browser' ||
    value === 'inner-web' ||
    value === 'iframe' ||
    value === 'webview'
  ) {
    return value;
  }
  return DEFAULT_CONFIG.openOriginalMode;
}

function normalizeConfig(stored: Partial<SubscribeConfigSnapshot>): SubscribeConfigSnapshot {
  return {
    version: SUBSCRIBE_CONFIG_VERSION,
    autoRefreshOnOpen: Boolean(stored.autoRefreshOnOpen),
    periodicRefreshEnabled: Boolean(stored.periodicRefreshEnabled),
    autoRefreshIntervalMinutes: clampSubscribeRefreshIntervalMinutes(
      stored.autoRefreshIntervalMinutes ?? DEFAULT_CONFIG.autoRefreshIntervalMinutes,
    ),
    foloDiscoverEnabled:
      stored.foloDiscoverEnabled === undefined
        ? DEFAULT_CONFIG.foloDiscoverEnabled
        : Boolean(stored.foloDiscoverEnabled),
    foloCloudAccountEnabled: Boolean(stored.foloCloudAccountEnabled),
    openOriginalMode: normalizeOpenOriginalMode(stored.openOriginalMode),
  };
}

function schedulePeriodicRefreshSync(): void {
  try {
    periodicRefreshSyncHook?.();
  } catch {
    // ignore hook errors
  }
}

export async function getSubscribeConfig(): Promise<SubscribeConfigSnapshot> {
  const stored = await getStorage<SubscribeConfigSnapshot>(SUBSCRIBE_CONFIG_STORAGE_KEY);
  if (stored?.version === SUBSCRIBE_CONFIG_VERSION) {
    cached = normalizeConfig(stored);
    return cached;
  }
  return cached;
}

/** 同步读缓存（设置已 hydrate 后可用） */
export function peekSubscribeConfig(): SubscribeConfigSnapshot {
  return cached;
}

export async function saveSubscribeConfig(
  patch: Partial<Omit<SubscribeConfigSnapshot, 'version'>>,
): Promise<void> {
  const next = normalizeConfig({
    ...cached,
    ...patch,
  });
  cached = next;
  await setStorage(SUBSCRIBE_CONFIG_STORAGE_KEY, next);
  bumpSubscribeConfigRevision();
  schedulePeriodicRefreshSync();
}

export function createSubscribeConfigPersistDomain(): PersistDomain {
  return {
    id: SUBSCRIBE_CONFIG_DOMAIN_ID,
    version: SUBSCRIBE_CONFIG_VERSION,
    priority: 'deferred',
    hydrate: async () => {
      await getSubscribeConfig();
      schedulePeriodicRefreshSync();
    },
    persist: async () => {
      await setStorage(SUBSCRIBE_CONFIG_STORAGE_KEY, cached);
    },
    flush: async () => {
      await setStorage(SUBSCRIBE_CONFIG_STORAGE_KEY, cached);
    },
    exportSnapshot: async () => cached,
    importSnapshot: async (data: unknown) => {
      if (!data || typeof data !== 'object') return;
      const snap = data as SubscribeConfigSnapshot;
      if (snap.version !== SUBSCRIBE_CONFIG_VERSION) return;
      cached = normalizeConfig(snap);
      await setStorage(SUBSCRIBE_CONFIG_STORAGE_KEY, cached);
      bumpSubscribeConfigRevision();
      schedulePeriodicRefreshSync();
    },
  };
}

export function registerSubscribeConfigPersistDomain(): void {
  registerPersistDomain(createSubscribeConfigPersistDomain());
}
