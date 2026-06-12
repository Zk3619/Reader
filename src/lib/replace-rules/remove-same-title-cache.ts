/**
 * 去重复标题尝试缓存（对齐 Legado ContentProcessor.removeSameTitleCache）
 * 每章节仅尝试一次，避免重复正则开销。
 */

const STORAGE_KEY = 'reader_remove_same_title_cache_v1';
const MAX_ENTRIES = 4000;

let memory = new Set<string>();
let loaded = false;

function cacheKey(bookUrl: string, chapterIndex: number): string {
  return `${bookUrl}\0${chapterIndex}`;
}

function loadCache(): Set<string> {
  if (loaded) return memory;
  loaded = true;
  if (typeof localStorage === 'undefined') return memory;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return memory;
    const parsed = JSON.parse(raw) as string[];
    if (Array.isArray(parsed)) {
      memory = new Set(parsed.slice(-MAX_ENTRIES));
    }
  } catch {
    memory = new Set();
  }
  return memory;
}

function persistCache(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const arr = Array.from(loadCache()).slice(-MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {
    /* ignore quota */
  }
}

export function isSameTitleRemovalCached(bookUrl: string, chapterIndex: number): boolean {
  return loadCache().has(cacheKey(bookUrl, chapterIndex));
}

export function markSameTitleRemovalCached(bookUrl: string, chapterIndex: number): void {
  const set = loadCache();
  set.add(cacheKey(bookUrl, chapterIndex));
  if (set.size > MAX_ENTRIES) {
    const trimmed = Array.from(set).slice(-MAX_ENTRIES);
    memory = new Set(trimmed);
  }
  persistCache();
}

export function clearSameTitleRemovalCacheForBook(bookUrl?: string): void {
  if (!bookUrl) {
    memory = new Set();
    loaded = true;
    persistCache();
    return;
  }
  const prefix = `${bookUrl}\0`;
  memory = new Set(Array.from(loadCache()).filter((k) => !k.startsWith(prefix)));
  loaded = true;
  persistCache();
}

if (typeof window !== 'undefined') {
  window.addEventListener('replace-rules-refresh', () => {
    /* 规则变更不清理去重缓存；与 Legado 行为一致 */
  });
}
