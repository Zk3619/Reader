/**
 * music.ui：搜索历史（music.config）+ 列表滚动（ephemeral sessionStorage）
 */

import type { PersistDomain } from '@/lib/persistence/types';
import { registerPersistDomain } from '@/lib/persistence/registry';
import {
  getEphemeral,
  setEphemeral,
} from '@/lib/persistence/backends/ephemeral-store';
import {
  patchMusicConfig,
  peekMusicConfigSync,
} from '@/lib/media/audio/music-config-storage';

export const MUSIC_UI_DOMAIN_ID = 'music.ui';
export const MUSIC_UI_DOC_KEY = 'music.ui';
export const MUSIC_UI_VERSION = 1;

const LIST_SCROLL_EPHEMERAL_KEY = 'music.listScroll';
const LEGACY_LIST_SCROLL_KEY = 'reader_music_list_scroll_positions';

export interface MusicUiSnapshot {
  version: typeof MUSIC_UI_VERSION;
  searchHistory: string[];
  listScrollPositions: Record<string, number>;
}

function readLegacyListScroll(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LEGACY_LIST_SCROLL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (e): e is [string, number] =>
          typeof e[1] === 'number' && Number.isFinite(e[1]),
      ),
    );
  } catch {
    return {};
  }
}

function readListScrollPositions(): Record<string, number> {
  const fromEphemeral = getEphemeral<Record<string, number>>(LIST_SCROLL_EPHEMERAL_KEY);
  if (fromEphemeral && typeof fromEphemeral === 'object') {
    return Object.fromEntries(
      Object.entries(fromEphemeral).filter(
        (e): e is [string, number] =>
          typeof e[1] === 'number' && Number.isFinite(e[1]),
      ),
    );
  }
  const legacy = readLegacyListScroll();
  if (Object.keys(legacy).length > 0) {
    setEphemeral(LIST_SCROLL_EPHEMERAL_KEY, legacy);
    try {
      localStorage.removeItem(LEGACY_LIST_SCROLL_KEY);
    } catch {
      /* */
    }
  }
  return legacy;
}

function captureSnapshot(): MusicUiSnapshot {
  return {
    version: MUSIC_UI_VERSION,
    searchHistory: [...(peekMusicConfigSync().searchHistory ?? [])],
    listScrollPositions: readListScrollPositions(),
  };
}

let cached: MusicUiSnapshot = captureSnapshot();

export function getMusicUiSnapshot(): MusicUiSnapshot {
  return {
    ...cached,
    searchHistory: [...(peekMusicConfigSync().searchHistory ?? [])],
    listScrollPositions: { ...cached.listScrollPositions },
  };
}

export function patchMusicUiSnapshot(
  partial: Partial<Omit<MusicUiSnapshot, 'version'>>,
): void {
  if (partial.searchHistory !== undefined) {
    patchMusicConfig({ searchHistory: partial.searchHistory });
  }
  if (partial.listScrollPositions !== undefined) {
    cached = {
      ...cached,
      listScrollPositions: partial.listScrollPositions,
      version: MUSIC_UI_VERSION,
    };
    setEphemeral(LIST_SCROLL_EPHEMERAL_KEY, cached.listScrollPositions);
  } else {
    cached = {
      ...cached,
      version: MUSIC_UI_VERSION,
    };
  }
}

export function createMusicUiPersistDomain(): PersistDomain {
  return {
    id: MUSIC_UI_DOMAIN_ID,
    version: MUSIC_UI_VERSION,
    priority: 'deferred',
    hydrate: async () => {
      cached = captureSnapshot();
      void import('@/stores/music-hub/search')
        .then((m) => m.syncSearchHistoryFromPersist(cached.searchHistory))
        .catch(() => undefined);
    },
    persist: async () => {
      setEphemeral(LIST_SCROLL_EPHEMERAL_KEY, cached.listScrollPositions);
    },
    flush: async () => {
      setEphemeral(LIST_SCROLL_EPHEMERAL_KEY, cached.listScrollPositions);
    },
    exportSnapshot: async () => captureSnapshot(),
    importSnapshot: async (data: unknown) => {
      if (!data || typeof data !== 'object') return;
      const snap = data as MusicUiSnapshot;
      if (snap.version !== MUSIC_UI_VERSION) return;
      if (Array.isArray(snap.searchHistory)) {
        patchMusicConfig({ searchHistory: snap.searchHistory });
      }
      if (snap.listScrollPositions && typeof snap.listScrollPositions === 'object') {
        cached = {
          version: MUSIC_UI_VERSION,
          searchHistory: snap.searchHistory ?? [],
          listScrollPositions: snap.listScrollPositions,
        };
        setEphemeral(LIST_SCROLL_EPHEMERAL_KEY, cached.listScrollPositions);
      }
    },
  };
}

export function registerMusicUiPersistDomain(): void {
  registerPersistDomain(createMusicUiPersistDomain());
}
