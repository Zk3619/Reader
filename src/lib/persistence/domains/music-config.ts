/**
 * music.config critical 域 → settings.json
 */

import type { PersistDomain } from '@/lib/persistence/types';
import { registerPersistDomain } from '@/lib/persistence/registry';
import {
  getMusicConfigCache,
  patchMusicConfig,
  saveMusicConfigSnapshot,
  warmMusicConfigCache,
  MUSIC_CONFIG_VERSION as SNAP_VER,
  type MusicConfigSnapshot,
} from '@/lib/media/audio/music-config-storage';

export const MUSIC_CONFIG_DOMAIN_ID = 'music.config';
export const MUSIC_CONFIG_VERSION = 1;

export function createMusicConfigPersistDomain(): PersistDomain {
  return {
    id: MUSIC_CONFIG_DOMAIN_ID,
    version: MUSIC_CONFIG_VERSION,
    priority: 'critical',
    hydrate: async () => {
      await warmMusicConfigCache();
      void import('@/stores/music-hub/music-discover-ui')
        .then((m) => m.syncMusicDiscoverUiFromSettings())
        .catch(() => undefined);
      void import('@/stores/music-hub/discover-lists')
        .then((m) => m.syncDiscoverListSourcesFromSettings())
        .catch(() => undefined);
    },
    persist: async () => {},
    flush: async () => {},
    exportSnapshot: async () => getMusicConfigCache(),
    importSnapshot: async (data: unknown) => {
      if (!data || typeof data !== 'object') return;
      const snap = data as MusicConfigSnapshot;
      if (snap.version !== SNAP_VER) return;
      patchMusicConfig(snap);
      await saveMusicConfigSnapshot(getMusicConfigCache());
    },
  };
}

export function registerMusicConfigPersistDomain(): void {
  registerPersistDomain(createMusicConfigPersistDomain());
}
