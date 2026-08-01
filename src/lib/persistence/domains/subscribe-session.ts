/**
 * subscribe.session：订阅模块偏好 → settings.json（subscribe_prefs_v1）
 */

import type { PersistDomain } from '@/lib/persistence/types';
import { registerPersistDomain } from '@/lib/persistence/registry';
import { getStorage, setStorage } from '@/lib/platform/storage';
import { getSessionDoc } from '@/lib/persistence/backends/session-store';
import {
  normalizeSubscribeFeedViewKind,
  type SubscribeFeedViewKind,
} from '@/lib/subscribe/feed-view';

export const SUBSCRIBE_SESSION_DOMAIN_ID = 'subscribe.session';
/** settings.json 权威键 */
export const SUBSCRIBE_PREFS_STORAGE_KEY = 'subscribe_prefs_v1';
/** 旧 session.json 文档键（仅迁移） */
export const SUBSCRIBE_SESSION_DOC_KEY = 'subscribe.session';
export const SUBSCRIBE_SESSION_VERSION = 6;

export type SubscribeHubSection = 'home' | 'discover' | 'settings' | 'manage';
export type SubscribeTimelineKind = 'all' | 'today' | 'unread' | 'starred';
export type { SubscribeFeedViewKind };

export interface SubscribeSessionSnapshot {
  version: typeof SUBSCRIBE_SESSION_VERSION;
  section: SubscribeHubSection;
  activeSourceId: string;
  activeEntryId: string;
  entryQuery: string;
  timeline: SubscribeTimelineKind;
  /** FeedView：内容频道；与 timeline（读状态）正交 */
  feedView: SubscribeFeedViewKind;
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
  const raw = snap as SubscribeSessionSnapshot & {
    timeline?: unknown;
    unreadOnly?: unknown;
    starredOnly?: unknown;
    feedView?: unknown;
  };
  return {
    version: SUBSCRIBE_SESSION_VERSION,
    section: normalizeSection(snap.section),
    activeSourceId: String((snap as { activeSourceId?: unknown }).activeSourceId ?? ''),
    activeEntryId: String((snap as { activeEntryId?: unknown }).activeEntryId ?? ''),
    entryQuery: String((snap as { entryQuery?: unknown }).entryQuery ?? ''),
    timeline: normalizeTimeline(
      raw.starredOnly ? 'starred' : raw.unreadOnly ? 'unread' : raw.timeline,
    ),
    feedView: normalizeSubscribeFeedViewKind(raw.feedView),
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
  if (!snap) return;
  cached = normalizeSnap(snap);
  // 立刻写入最新缓存，避免连续多次 schedule 时旧快照后写覆盖（如先清源再选源）
  void setStorage(SUBSCRIBE_PREFS_STORAGE_KEY, cached);
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

  if (
    stored?.version === 1 ||
    stored?.version === 2 ||
    stored?.version === 3 ||
    stored?.version === 4 ||
    stored?.version === 5
  ) {
    const normalized = normalizeSnap({
      version: SUBSCRIBE_SESSION_VERSION,
      section: normalizeSection((stored as { section?: unknown }).section),
      activeSourceId: String((stored as { activeSourceId?: unknown }).activeSourceId ?? ''),
      activeEntryId: String((stored as { activeEntryId?: unknown }).activeEntryId ?? ''),
      entryQuery: String((stored as { entryQuery?: unknown }).entryQuery ?? ''),
      timeline: (stored as { starredOnly?: unknown }).starredOnly
        ? 'starred'
        : (stored as { unreadOnly?: unknown }).unreadOnly
          ? 'unread'
          : normalizeTimeline((stored as { timeline?: unknown }).timeline),
      feedView: normalizeSubscribeFeedViewKind((stored as { feedView?: unknown }).feedView),
    });
    await persistSubscribeSessionSnapshot(normalized);
    return normalized;
  }

  return null;
}

const EMPTY_SNAP: SubscribeSessionSnapshot = {
  version: SUBSCRIBE_SESSION_VERSION,
  section: 'home',
  activeSourceId: '',
  activeEntryId: '',
  entryQuery: '',
  timeline: 'all',
  feedView: 'all',
};

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
      EMPTY_SNAP,
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
