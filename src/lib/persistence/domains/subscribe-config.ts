import type { PersistDomain } from '@/lib/persistence/types';
import { registerPersistDomain } from '@/lib/persistence/registry';
import { getStorage, setStorage } from '@/lib/platform/storage';
import { createSignal } from 'solid-js';

export const SUBSCRIBE_CONFIG_DOMAIN_ID = 'subscribe.config';
export const SUBSCRIBE_CONFIG_STORAGE_KEY = 'subscribe_config_v1';
export const SUBSCRIBE_CONFIG_VERSION = 1;

export interface SubscribeConfigSnapshot {
  version: typeof SUBSCRIBE_CONFIG_VERSION;
  autoRefreshOnOpen: boolean;
  /** 显示免登录发现广场（趋势 / RSSHub 分类） */
  foloDiscoverEnabled: boolean;
  /** 实验：Folo 账号登录与云同步（默认关，需自行承担条款与失效风险） */
  foloCloudAccountEnabled: boolean;
}

const DEFAULT_CONFIG: SubscribeConfigSnapshot = {
  version: SUBSCRIBE_CONFIG_VERSION,
  autoRefreshOnOpen: false,
  foloDiscoverEnabled: true,
  foloCloudAccountEnabled: false,
};

let cached = DEFAULT_CONFIG;
const [subscribeConfigRevision, setSubscribeConfigRevision] = createSignal(0);
export { subscribeConfigRevision };

function bumpSubscribeConfigRevision(): void {
  setSubscribeConfigRevision((value) => value + 1);
}

export async function getSubscribeConfig(): Promise<SubscribeConfigSnapshot> {
  const stored = await getStorage<SubscribeConfigSnapshot>(SUBSCRIBE_CONFIG_STORAGE_KEY);
  if (stored?.version === SUBSCRIBE_CONFIG_VERSION) {
    cached = {
      version: SUBSCRIBE_CONFIG_VERSION,
      autoRefreshOnOpen: Boolean(stored.autoRefreshOnOpen),
      foloDiscoverEnabled:
        stored.foloDiscoverEnabled === undefined
          ? DEFAULT_CONFIG.foloDiscoverEnabled
          : Boolean(stored.foloDiscoverEnabled),
      foloCloudAccountEnabled: Boolean(stored.foloCloudAccountEnabled),
    };
    return cached;
  }
  return cached;
}

export async function saveSubscribeConfig(
  patch: Partial<Omit<SubscribeConfigSnapshot, 'version'>>,
): Promise<void> {
  const next: SubscribeConfigSnapshot = {
    ...cached,
    ...patch,
    version: SUBSCRIBE_CONFIG_VERSION,
  };
  cached = next;
  await setStorage(SUBSCRIBE_CONFIG_STORAGE_KEY, next);
  bumpSubscribeConfigRevision();
}

export function createSubscribeConfigPersistDomain(): PersistDomain {
  return {
    id: SUBSCRIBE_CONFIG_DOMAIN_ID,
    version: SUBSCRIBE_CONFIG_VERSION,
    priority: 'deferred',
    hydrate: async () => {
      await getSubscribeConfig();
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
      cached = {
        version: SUBSCRIBE_CONFIG_VERSION,
        autoRefreshOnOpen: Boolean(snap.autoRefreshOnOpen),
        foloDiscoverEnabled:
          snap.foloDiscoverEnabled === undefined
            ? DEFAULT_CONFIG.foloDiscoverEnabled
            : Boolean(snap.foloDiscoverEnabled),
        foloCloudAccountEnabled: Boolean(snap.foloCloudAccountEnabled),
      };
      await setStorage(SUBSCRIBE_CONFIG_STORAGE_KEY, cached);
      bumpSubscribeConfigRevision();
    },
  };
}

export function registerSubscribeConfigPersistDomain(): void {
  registerPersistDomain(createSubscribeConfigPersistDomain());
}
