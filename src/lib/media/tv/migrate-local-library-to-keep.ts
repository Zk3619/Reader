/**
 * 将旧片库扫描结果（localLibrary.v1）一次性迁入收藏
 */

import { addLocalKeepFromPath } from '@/lib/media/tv/tv-keep-export';

const HISTORY_KEY = 'reader.video.localLibrary.v1';
const MIGRATED_KEY = 'reader.video.localLibrary.migratedToKeep.v1';

type LegacyLocalLibraryState = {
  items?: Array<{ path?: string; name?: string }>;
};

export async function migrateLocalLibraryScanToKeep(): Promise<{
  migrated: boolean;
  added: number;
}> {
  try {
    if (localStorage.getItem(MIGRATED_KEY) === '1') {
      return { migrated: false, added: 0 };
    }
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) {
      localStorage.setItem(MIGRATED_KEY, '1');
      return { migrated: false, added: 0 };
    }
    let state: LegacyLocalLibraryState = {};
    try {
      state = JSON.parse(raw) as LegacyLocalLibraryState;
    } catch {
      localStorage.setItem(MIGRATED_KEY, '1');
      return { migrated: false, added: 0 };
    }
    const items = Array.isArray(state.items) ? state.items : [];
    let added = 0;
    for (const it of items) {
      const path = (it.path || '').trim();
      if (!path) continue;
      const name = (it.name || path.split(/[/\\]/).pop() || path).replace(/\.[^.]+$/, '');
      await addLocalKeepFromPath(path, name);
      added += 1;
    }
    localStorage.setItem(MIGRATED_KEY, '1');
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      /* */
    }
    return { migrated: true, added };
  } catch {
    return { migrated: false, added: 0 };
  }
}
