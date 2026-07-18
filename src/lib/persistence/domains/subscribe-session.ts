/**
 * subscribe.session：订阅模块偏好 → settings.json（subscribe_prefs_v1）
 */

import type { PersistDomain } from '@/lib/persistence/types';
import { registerPersistDomain } from '@/lib/persistence/registry';
import { getStorage, setStorage } from '@/lib/platform/storage';
import { getSessionDoc } from '@/lib/persistence/backends/session-store';

export const SUBSCRIBE_SESSION_DOMAIN_ID = 'subscribe.session';
/** settings.json 权威键 */
export const SUBSCRIBE_PREFS_STORAGE_KEY = 'subscribe_prefs_v1';
/** 旧 session.json 文档键（仅迁移） */
export const SUBSCRIBE_SESSION_DOC_KEY = 'subscribe.session';
export const SUBSCRIBE_SESSION_VERSION = 1;

export type SubscribeHubSection = 'home' | 'settings';

export interface SubscribeSessionSnapshot {
  version: typeof SUBSCRIBE_SESSION_VERSION;
  section: SubscribeHubSection;
}

type SubscribeAppliers = {
  apply: (snap: SubscribeSessionSnapshot) => void;
  capture: () => SubscribeSessionSnapshot;
};

let appliers: SubscribeAppliers | null = null;
let cached: SubscribeSessionSnapshot | null = null;

export function bindSubscribeSessionPersistAppliers(next: SubscribeAppliers): void {
  appliers = next;
}

function normalizeSection(section: unknown): SubscribeHubSection {
  return section === 'settings' ? 'settings' : 'home';
}

function normalizeSnap(snap: SubscribeSessionSnapshot): SubscribeSessionSnapshot {
  return {
    version: SUBSCRIBE_SESSION_VERSION,
    section: normalizeSection(snap.section),
  };
}

export async function persistSubscribeSessionSnapshot(
  snap: SubscribeSessionSnapshot,
): Promise<void> {
  const normalized = normalizeSnap(snap);
  cached = normalized;
  await setStorage(SUBSCRIBE_PREFS_STORAGE_KEY, normalized);
}

export function scheduleSubscribeSessionPersist(): void {
  const snap = appliers?.capture();
  if (snap) void persistSubscribeSessionSnapshot(snap);
}

async function loadOrMigrate(): Promise<SubscribeSessionSnapshot | null> {
  const stored = await getStorage<SubscribeSessionSnapshot>(SUBSCRIBE_PREFS_STORAGE_KEY);
  if (stored?.version === SUBSCRIBE_SESSION_VERSION) {
    cached = normalizeSnap(stored);
    return cached;
  }

  const fromSession = await getSessionDoc<SubscribeSessionSnapshot>(
    SUBSCRIBE_SESSION_DOC_KEY,
  );
  if (fromSession?.version === SUBSCRIBE_SESSION_VERSION) {
    const normalized = normalizeSnap(fromSession);
    await persistSubscribeSessionSnapshot(normalized);
    return normalized;
  }

  return null;
}

export function createSubscribeSessionPersistDomain(): PersistDomain {
  return {
    id: SUBSCRIBE_SESSION_DOMAIN_ID,
    version: SUBSCRIBE_SESSION_VERSION,
    priority: 'deferred',
    hydrate: async () => {
      const snap = await loadOrMigrate();
      if (!snap) return;
      appliers?.apply(snap);
    },
    persist: async () => {
      const snap = appliers?.capture();
      if (snap) await persistSubscribeSessionSnapshot(snap);
    },
    flush: async () => {
      const snap = appliers?.capture();
      if (snap) await persistSubscribeSessionSnapshot(snap);
    },
    exportSnapshot: async () =>
      cached ??
      (await getStorage<SubscribeSessionSnapshot>(SUBSCRIBE_PREFS_STORAGE_KEY)) ??
      appliers?.capture() ??
      ({
        version: SUBSCRIBE_SESSION_VERSION,
        section: 'home',
      } satisfies SubscribeSessionSnapshot),
    importSnapshot: async (data: unknown) => {
      if (!data || typeof data !== 'object') return;
      const snap = data as SubscribeSessionSnapshot;
      if (snap.version !== SUBSCRIBE_SESSION_VERSION) return;
      await persistSubscribeSessionSnapshot(snap);
      appliers?.apply(normalizeSnap(snap));
    },
  };
}

export function registerSubscribeSessionPersistDomain(): void {
  registerPersistDomain(createSubscribeSessionPersistDomain());
}
