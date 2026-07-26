/**
 * tv.config：默认解析、网络偏好 → settings.json（tv_config_v1）
 * 自 session.json `tv.ui` 与 LS 一次性迁移。
 */

import type { PersistDomain } from '@/lib/persistence/types';
import { registerPersistDomain } from '@/lib/persistence/registry';
import { getStorage, setStorage } from '@/lib/platform/storage';
import { getSessionDoc } from '@/lib/persistence/backends/session-store';
import {
  applyTvNetSettingsLocal,
  getTvNetSettings,
  type TvNetSettings,
} from '@/lib/media/tv/net/rules';

export const TV_CONFIG_DOMAIN_ID = 'tv.config';
/** @deprecated 兼容旧域名；权威域 id 为 tv.config */
export const TV_UI_DOMAIN_ID = TV_CONFIG_DOMAIN_ID;
export const TV_CONFIG_STORAGE_KEY = 'tv_config_v1';
/** 旧 session.json 文档键（仅迁移） */
export const TV_UI_DOC_KEY = 'tv.ui';
export const TV_CONFIG_VERSION = 1;
export const TV_UI_VERSION = TV_CONFIG_VERSION;

export interface TvConfigSnapshot {
  version: typeof TV_CONFIG_VERSION;
  defaultParseName: string;
  net: TvNetSettings;
}

/** @deprecated 使用 TvConfigSnapshot */
export type TvUiSnapshot = TvConfigSnapshot;

type TvUiAppliers = {
  applyDefaultParse: (name: string) => void;
  captureDefaultParse: () => string;
};

let appliers: TvUiAppliers | null = null;
let cached: TvConfigSnapshot | null = null;

export function bindTvUiPersistAppliers(next: TvUiAppliers): void {
  appliers = next;
}

function captureSnapshot(): TvConfigSnapshot {
  return {
    version: TV_CONFIG_VERSION,
    defaultParseName: appliers?.captureDefaultParse() ?? cached?.defaultParseName ?? '',
    net: getTvNetSettings(),
  };
}

function mirrorLegacyLocal(snap: TvConfigSnapshot): void {
  try {
    if (snap.defaultParseName) {
      localStorage.setItem('tv.defaultParse', snap.defaultParseName);
    } else {
      localStorage.removeItem('tv.defaultParse');
    }
  } catch {
    /* */
  }
  applyTvNetSettingsLocal(snap.net);
}

async function writeSnapshot(snap: TvConfigSnapshot): Promise<void> {
  const normalized: TvConfigSnapshot = {
    ...snap,
    version: TV_CONFIG_VERSION,
  };
  cached = normalized;
  await setStorage(TV_CONFIG_STORAGE_KEY, normalized);
  mirrorLegacyLocal(normalized);
}

function readLegacyFromLocalStorage(): TvConfigSnapshot {
  let defaultParseName = '';
  try {
    defaultParseName = localStorage.getItem('tv.defaultParse') ?? '';
  } catch {
    /* */
  }
  return {
    version: TV_CONFIG_VERSION,
    defaultParseName,
    net: getTvNetSettings(),
  };
}

async function loadOrMigrate(): Promise<TvConfigSnapshot> {
  const stored = await getStorage<TvConfigSnapshot>(TV_CONFIG_STORAGE_KEY);
  if (stored?.version === TV_CONFIG_VERSION) {
    cached = stored;
    return stored;
  }

  // 一次性：session.json tv.ui → settings.json
  const fromSession = await getSessionDoc<TvConfigSnapshot>(TV_UI_DOC_KEY);
  if (fromSession?.version === TV_CONFIG_VERSION) {
    await writeSnapshot(fromSession);
    return fromSession;
  }

  const legacy = readLegacyFromLocalStorage();
  await writeSnapshot(legacy);
  return legacy;
}

export async function persistTvUiNow(): Promise<void> {
  await writeSnapshot(captureSnapshot());
}

export function createTvConfigPersistDomain(): PersistDomain {
  return {
    id: TV_CONFIG_DOMAIN_ID,
    version: TV_CONFIG_VERSION,
    priority: 'deferred',
    hydrate: async () => {
      const snap = await loadOrMigrate();
      appliers?.applyDefaultParse(snap.defaultParseName ?? '');
      applyTvNetSettingsLocal(snap.net);
    },
    persist: async () => {
      await writeSnapshot(captureSnapshot());
    },
    flush: async () => {
      await writeSnapshot(captureSnapshot());
    },
    exportSnapshot: async () =>
      cached ??
      (await getStorage<TvConfigSnapshot>(TV_CONFIG_STORAGE_KEY)) ??
      captureSnapshot(),
    importSnapshot: async (data: unknown) => {
      if (!data || typeof data !== 'object') return;
      const snap = data as TvConfigSnapshot;
      if (snap.version !== TV_CONFIG_VERSION) return;
      await writeSnapshot(snap);
      appliers?.applyDefaultParse(snap.defaultParseName ?? '');
    },
  };
}

/** @deprecated 使用 createTvConfigPersistDomain */
export function createTvUiPersistDomain(): PersistDomain {
  return createTvConfigPersistDomain();
}

export function registerTvConfigPersistDomain(): void {
  registerPersistDomain(createTvConfigPersistDomain());
}

/** @deprecated 使用 registerTvConfigPersistDomain */
export function registerTvUiPersistDomain(): void {
  registerTvConfigPersistDomain();
}
