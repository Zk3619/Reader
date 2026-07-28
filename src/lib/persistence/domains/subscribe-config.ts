import type { PersistDomain } from '@/lib/persistence/types';
import { registerPersistDomain } from '@/lib/persistence/registry';
import { getStorage, setStorage } from '@/lib/platform/storage';

export const SUBSCRIBE_CONFIG_DOMAIN_ID = 'subscribe.config';
export const SUBSCRIBE_CONFIG_STORAGE_KEY = 'subscribe_config_v1';
export const SUBSCRIBE_CONFIG_VERSION = 1;

export interface SubscribeConfigSnapshot {
  version: typeof SUBSCRIBE_CONFIG_VERSION;
  autoRefreshOnOpen: boolean;
}

const DEFAULT_CONFIG: SubscribeConfigSnapshot = {
  version: SUBSCRIBE_CONFIG_VERSION,
  autoRefreshOnOpen: false,
};

let cached = DEFAULT_CONFIG;

export async function getSubscribeConfig(): Promise<SubscribeConfigSnapshot> {
  const stored = await getStorage<SubscribeConfigSnapshot>(SUBSCRIBE_CONFIG_STORAGE_KEY);
  if (stored?.version === SUBSCRIBE_CONFIG_VERSION) {
    cached = {
      version: SUBSCRIBE_CONFIG_VERSION,
      autoRefreshOnOpen: Boolean(stored.autoRefreshOnOpen),
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
      };
      await setStorage(SUBSCRIBE_CONFIG_STORAGE_KEY, cached);
    },
  };
}

export function registerSubscribeConfigPersistDomain(): void {
  registerPersistDomain(createSubscribeConfigPersistDomain());
}
