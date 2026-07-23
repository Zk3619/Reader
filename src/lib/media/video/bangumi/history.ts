/**
 * E6.2：番剧播放历史 / 续播（localStorage；表前缀约定 bangumi_*）
 */

export type BangumiPlayHistory = {
  id: string;
  ruleId: string;
  title: string;
  cover?: string;
  detailUrl: string;
  episodeName?: string;
  episodeUrl?: string;
  /** 续播秒数 */
  positionSec: number;
  updatedAt: number;
};

const HISTORY_KEY = 'reader.bangumi.history.v1';
const MAX_ITEMS = 80;

function loadAll(): BangumiPlayHistory[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is BangumiPlayHistory =>
        !!x &&
        typeof x === 'object' &&
        typeof (x as BangumiPlayHistory).id === 'string' &&
        typeof (x as BangumiPlayHistory).detailUrl === 'string',
    );
  } catch {
    return [];
  }
}

function saveAll(items: BangumiPlayHistory[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    /* */
  }
}

export function loadBangumiHistory(): BangumiPlayHistory[] {
  return loadAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function upsertBangumiHistory(
  entry: Omit<BangumiPlayHistory, 'updatedAt'> & { updatedAt?: number },
): BangumiPlayHistory[] {
  const list = loadAll().filter((h) => h.id !== entry.id);
  const next: BangumiPlayHistory = {
    ...entry,
    positionSec: Number.isFinite(entry.positionSec) ? entry.positionSec : 0,
    updatedAt: entry.updatedAt ?? Date.now(),
  };
  list.unshift(next);
  saveAll(list);
  return loadBangumiHistory();
}

export function getBangumiHistoryByDetail(detailUrl: string): BangumiPlayHistory | null {
  const u = detailUrl.trim();
  if (!u) return null;
  return loadAll().find((h) => h.detailUrl === u) ?? null;
}

export function clearBangumiHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* */
  }
}
