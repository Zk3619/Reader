/**
 * 换源偏好（对齐 Legado AppConfig.changeSource* / searchGroup）
 */

const STORAGE_KEY = 'reader_change_source_prefs';

export interface ChangeSourcePrefs {
  checkAuthor: boolean;
  loadInfo: boolean;
  loadToc: boolean;
  loadWordCount: boolean;
  searchGroup: string;
}

const DEFAULT_PREFS: ChangeSourcePrefs = {
  checkAuthor: true,
  loadInfo: true,
  loadToc: true,
  loadWordCount: false,
  searchGroup: '',
};

export function loadChangeSourcePrefs(): ChangeSourcePrefs {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<ChangeSourcePrefs>;
    return { ...DEFAULT_PREFS, ...parsed };
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
