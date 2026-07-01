/**
 * 书源评分配置（对齐 Legado SourceConfig.kt）
 */

const STORAGE_KEY = 'reader_source_config';

type ScoreStore = Record<string, number>;

function loadStore(): ScoreStore {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ScoreStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveStore(store: ScoreStore): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function normalizeAuthor(author: string | undefined): string {
  return author ?? '';
}

/** 换源列表按 bookUrl 独立评分；无 bookUrl 时回退 Legado 的 origin+书名+作者 */
function resolveBookScoreKey(
  origin: string,
  name: string,
  author: string | undefined,
  bookUrl?: string,
): string {
  const url = bookUrl?.trim();
  if (url) return `bu:${url}`;
  return `${origin}_${name}_${normalizeAuthor(author)}`;
}

export function setBookScore(
  origin: string,
  name: string,
  author: string,
  score: number,
  bookUrl?: string,
): void {
  const store = loadStore();
  const key = resolveBookScoreKey(origin, name, author, bookUrl);
  const prevScore = store[key] ?? 0;
  let delta = score;
  if (prevScore !== 0) {
    delta = score - prevScore;
  }
  store[origin] = (store[origin] ?? 0) + delta;
  store[key] = score;
  saveStore(store);
}

export function getBookScore(
  origin: string,
  name: string,
  author: string,
  bookUrl?: string,
): number {
  const store = loadStore();
  const key = resolveBookScoreKey(origin, name, author, bookUrl);
  return store[key] ?? 0;
}

export function getSourceScore(origin: string): number {
  return loadStore()[origin] ?? 0;
}

export function removeSource(origin: string): void {
  const store = loadStore();
  const next: ScoreStore = {};
  for (const [key, value] of Object.entries(store)) {
    if (!key.startsWith(origin)) {
      next[key] = value;
    }
  }
  saveStore(next);
}
