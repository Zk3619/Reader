/**
 * 换源偏好（对齐 Legado AppConfig.changeSource* / searchGroup）
 */

import type { SourceListFilterCriteria } from '@/lib/sources/source-list-filter';
import { EMPTY_SOURCE_LIST_FILTER } from '@/lib/sources/source-list-filter';

const STORAGE_KEY = 'reader_change_source_prefs';

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

function normalizeLoadedPrefs(parsed: Partial<ChangeSourcePrefs> & { searchGroup?: string }): ChangeSourcePrefs {
  const groupNames =
    parsed.groupNames ??
    (parsed.searchGroup?.trim() ? [parsed.searchGroup.trim()] : []);
  return {
    ...DEFAULT_PREFS,
    ...parsed,
    groupNames,
  };
}

export function loadChangeSourcePrefs(): ChangeSourcePrefs {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<ChangeSourcePrefs> & { searchGroup?: string };
    return normalizeLoadedPrefs(parsed);
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveChangeSourcePrefs(patch: Partial<ChangeSourcePrefs>): ChangeSourcePrefs {
  const next = { ...loadChangeSourcePrefs(), ...patch };
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function changeSourceGroupFilterCriteria(prefs: ChangeSourcePrefs): SourceListFilterCriteria {
  return {
    ...EMPTY_SOURCE_LIST_FILTER,
    groupNames: [...prefs.groupNames],
  };
}
