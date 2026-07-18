/**
 * 换源偏好（对齐 Legado AppConfig.changeSource* / searchGroup）
 * 权威：settings.json；LS 作迁移/镜像
 */

import type { SourceListFilterCriteria } from '@/lib/sources/source-list-filter';
import { EMPTY_SOURCE_LIST_FILTER } from '@/lib/sources/source-list-filter';
import { getStorage, setStorage } from '@/lib/platform/storage';

const STORAGE_KEY = 'reader_change_source_prefs';
const LS_KEY = 'reader_change_source_prefs';

export interface ChangeSourcePrefs {
  checkAuthor: boolean;
  loadInfo: boolean;
  loadToc: boolean;
  loadWordCount: boolean;
  /** 书源分组筛选（空数组 = 全部分组） */
  groupNames: string[];
}

const DEFAULT_PREFS: ChangeSourcePrefs = {
  checkAuthor: false,
  loadInfo: false,
  loadToc: false,
  loadWordCount: false,
  groupNames: [],
};

let cached: ChangeSourcePrefs | null = null;
let migrateStarted = false;

function normalizeLoadedPrefs(
  parsed: Partial<ChangeSourcePrefs> & { searchGroup?: string },
): ChangeSourcePrefs {
  const groupNames =
    parsed.groupNames ??
    (parsed.searchGroup?.trim() ? [parsed.searchGroup.trim()] : []);
  return {
    ...DEFAULT_PREFS,
    ...parsed,
    groupNames,
  };
}

function readLegacyLs(): ChangeSourcePrefs {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<ChangeSourcePrefs> & {
      searchGroup?: string;
    };
    return normalizeLoadedPrefs(parsed);
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function ensureMigrated(): void {
  if (migrateStarted) return;
  migrateStarted = true;
  void getStorage<ChangeSourcePrefs>(STORAGE_KEY).then((stored) => {
    if (stored && typeof stored === 'object') {
      cached = normalizeLoadedPrefs(stored);
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(cached));
      } catch {
        /* */
      }
    } else {
      const legacy = cached ?? readLegacyLs();
      cached = legacy;
      void setStorage(STORAGE_KEY, legacy);
    }
  });
}

export function loadChangeSourcePrefs(): ChangeSourcePrefs {
  if (cached) {
    ensureMigrated();
    return cached;
  }
  cached = readLegacyLs();
  ensureMigrated();
  return cached;
}

export function saveChangeSourcePrefs(patch: Partial<ChangeSourcePrefs>): ChangeSourcePrefs {
  const next = { ...loadChangeSourcePrefs(), ...patch };
  cached = next;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  }
  void setStorage(STORAGE_KEY, next);
  return next;
}

export function changeSourceGroupFilterCriteria(
  prefs: ChangeSourcePrefs,
): SourceListFilterCriteria {
  return {
    ...EMPTY_SOURCE_LIST_FILTER,
    groupNames: [...prefs.groupNames],
  };
}
