/**
 * shell.tabs 持久化域：媒体/来源顶栏 Tab → settings.json
 */

import type { PersistDomain } from '@/lib/persistence/types';
import { registerPersistDomain } from '@/lib/persistence/registry';
import { getStorage, setStorage } from '@/lib/platform/storage';
import { getSessionDoc } from '@/lib/persistence/backends/session-store';
import type { MediaKind } from '@/lib/book-source/book-type';

export const SHELL_TABS_DOMAIN_ID = 'shell.tabs';
/** settings.json 权威键 */
export const SHELL_TABS_STORAGE_KEY = 'shell_tabs_v1';
/** 旧 session.json 文档键（仅迁移） */
export const SHELL_TABS_DOC_KEY = 'shell.tabs';
export const SHELL_TABS_VERSION = 1;

const MEDIA_TAB_KEY = 'mediabox_media_kind_tab';
const AUDIO_MEDIA_SUB_KEY = 'mediabox_audio_media_sub_tab';
const SOURCE_TAB_KEY = 'mediabox_source_type_tab';
const AUDIO_SOURCE_SUB_KEY = 'mediabox_audio_source_sub_tab';

export type AudioMediaSubTab = 'audiobook' | 'music';
export type SourceTypeTab = 'text' | 'image' | 'audio' | 'video' | 'file';
export type AudioSourceSubTab = 'audiobook' | 'music';
export type MediaKindTab = MediaKind;

export interface ShellTabsSnapshot {
  version: typeof SHELL_TABS_VERSION;
  mediaKindTab: MediaKindTab;
  audioMediaSubTab: AudioMediaSubTab;
  sourceTypeTab: SourceTypeTab;
  audioSourceSubTab: AudioSourceSubTab;
}

type ShellTabsAppliers = {
  apply: (snap: ShellTabsSnapshot) => void;
  capture: () => ShellTabsSnapshot;
};

let appliers: ShellTabsAppliers | null = null;
let cached: ShellTabsSnapshot | null = null;

export function bindShellTabsPersistAppliers(next: ShellTabsAppliers): void {
  appliers = next;
}

function readLegacyFromLocalStorage(): ShellTabsSnapshot {
  const read = <T extends string>(key: string, fallback: T): T => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return raw as T;
    } catch {
      /* ignore */
    }
    return fallback;
  };
  let mediaKindTab = read<string>(MEDIA_TAB_KEY, 'text') as MediaKindTab;
  if ((mediaKindTab as string) === 'file') mediaKindTab = 'text';
  return {
    version: SHELL_TABS_VERSION,
    mediaKindTab,
    audioMediaSubTab: read(AUDIO_MEDIA_SUB_KEY, 'audiobook'),
    sourceTypeTab: read(SOURCE_TAB_KEY, 'text'),
    audioSourceSubTab: read(AUDIO_SOURCE_SUB_KEY, 'audiobook'),
  };
}

function mirrorToLocalStorage(snap: ShellTabsSnapshot): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MEDIA_TAB_KEY, snap.mediaKindTab);
    localStorage.setItem(AUDIO_MEDIA_SUB_KEY, snap.audioMediaSubTab);
    localStorage.setItem(SOURCE_TAB_KEY, snap.sourceTypeTab);
    localStorage.setItem(AUDIO_SOURCE_SUB_KEY, snap.audioSourceSubTab);
  } catch {
    // ignore
  }
}

function normalizeSnap(snap: ShellTabsSnapshot): ShellTabsSnapshot {
  return {
    ...snap,
    version: SHELL_TABS_VERSION,
    mediaKindTab:
      snap.mediaKindTab === ('file' as MediaKindTab) ? 'text' : snap.mediaKindTab,
  };
}

export async function persistShellTabsSnapshot(
  snap: ShellTabsSnapshot,
): Promise<void> {
  const normalized = normalizeSnap(snap);
  cached = normalized;
  mirrorToLocalStorage(normalized);
  await setStorage(SHELL_TABS_STORAGE_KEY, normalized);
}

async function loadOrMigrate(): Promise<ShellTabsSnapshot> {
  const stored = await getStorage<ShellTabsSnapshot>(SHELL_TABS_STORAGE_KEY);
  if (stored?.version === SHELL_TABS_VERSION) {
    cached = normalizeSnap(stored);
    return cached;
  }

  const fromSession = await getSessionDoc<ShellTabsSnapshot>(SHELL_TABS_DOC_KEY);
  if (fromSession?.version === SHELL_TABS_VERSION) {
    const normalized = normalizeSnap(fromSession);
    await persistShellTabsSnapshot(normalized);
    return normalized;
  }

  const legacy = readLegacyFromLocalStorage();
  await persistShellTabsSnapshot(legacy);
  return legacy;
}

export function createShellTabsPersistDomain(): PersistDomain {
  return {
    id: SHELL_TABS_DOMAIN_ID,
    version: SHELL_TABS_VERSION,
    priority: 'deferred',
    hydrate: async () => {
      const snap = await loadOrMigrate();
      mirrorToLocalStorage(snap);
      appliers?.apply(snap);
    },
    persist: async () => {
      const snap = appliers?.capture() ?? cached ?? readLegacyFromLocalStorage();
      await persistShellTabsSnapshot(snap);
    },
    flush: async () => {
      const snap = appliers?.capture() ?? cached ?? readLegacyFromLocalStorage();
      await persistShellTabsSnapshot(snap);
    },
    exportSnapshot: async () =>
      cached ??
      (await getStorage<ShellTabsSnapshot>(SHELL_TABS_STORAGE_KEY)) ??
      appliers?.capture() ??
      readLegacyFromLocalStorage(),
    importSnapshot: async (data: unknown) => {
      if (!data || typeof data !== 'object') return;
      const snap = data as ShellTabsSnapshot;
      if (snap.version !== SHELL_TABS_VERSION) return;
      await persistShellTabsSnapshot(snap);
      appliers?.apply(normalizeSnap(snap));
    },
  };
}

export function registerShellTabsPersistDomain(): void {
  registerPersistDomain(createShellTabsPersistDomain());
}
