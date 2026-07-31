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
export const SUBSCRIBE_SESSION_VERSION = 3;

export type SubscribeHubSection = 'home' | 'discover' | 'settings' | 'manage';
export type SubscribeTimelineKind = 'all' | 'today' | 'unread' | 'starred';

export interface SubscribeSessionSnapshot {
  version: typeof SUBSCRIBE_SESSION_VERSION;
  section: SubscribeHubSection;
  activeSourceId: string;
  activeEntryId: string;
  entryQuery: string;
  timeline: SubscribeTimelineKind;
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
  if (section === 'settings' || section === 'discover' || section === 'manage') return section;
  return 'home';
}

function normalizeTimeline(value: unknown): SubscribeTimelineKind {
  return value === 'today' || value === 'unread' || value === 'starred' ? value : 'all';
}

function normalizeSnap(snap: SubscribeSessionSnapshot): SubscribeSessionSnapshot {
  return {
    version: SUBSCRIBE_SESSION_VERSION,
    section: normalizeSection(snap.section),
    activeSourceId: String((snap as { activeSourceId?: unknown }).activeSourceId ?? ''),
    activeEntryId: String((snap as { activeEntryId?: unknown }).activeEntryId ?? ''),
    entryQuery: String((snap as { entryQuery?: unknown }).entryQuery ?? ''),
    timeline: normalizeTimeline(
      (snap as { timeline?: unknown; unreadOnly?: unknown; starredOnly?: unknown }).starredOnly
        ? 'starred'
        : (snap as { timeline?: unknown; unreadOnly?: unknown }).unreadOnly
          ? 'unread'
          : (snap as { timeline?: unknown }).timeline,
    ),
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

  if (stored?.version === 1 || stored?.version === 2) {
    const normalized = normalizeSnap({
      version: SUBSCRIBE_SESSION_VERSION,
      section: normalizeSection((stored as { section?: unknown }).section),
      activeSourceId: String((stored as { activeSourceId?: unknown }).activeSourceId ?? ''),
      activeEntryId: '',
      entryQuery: String((stored as { entryQuery?: unknown }).entryQuery ?? ''),
      timeline: (stored as { starredOnly?: unknown }).starredOnly
        ? 'starred'
        : (stored as { unreadOnly?: unknown }).unreadOnly
          ? 'unread'
          : 'all',
    });
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
        activeSourceId: '',
        activeEntryId: '',
        entryQuery: '',
        timeline: 'all',
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
