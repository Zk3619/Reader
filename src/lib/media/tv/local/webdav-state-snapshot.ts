/**
 * 影视 keep + history → WebDAV JSON 快照（轻量）
 */

import * as TvDao from '@/lib/media/tv/db/tv-dao';
import type { TvHistoryRow, TvKeepRow } from '@/lib/media/tv/types';

export type TvStateSnapshot = {
  version: 1;
  exportedAt: number;
  keep: TvKeepRow[];
  history: TvHistoryRow[];
};

export async function buildTvStateSnapshot(): Promise<TvStateSnapshot> {
  const [keep, history] = await Promise.all([TvDao.listKeep(), TvDao.listHistory(500)]);
  return {
    version: 1,
    exportedAt: Date.now(),
    keep,
    history,
  };
}

export async function applyTvStateSnapshot(
  raw: unknown,
  mode: 'merge' | 'overwrite',
): Promise<{ keep: number; history: number }> {
  if (!raw || typeof raw !== 'object') throw new Error('无效快照');
  const o = raw as Partial<TvStateSnapshot>;
  if (o.version !== 1) throw new Error('不支持的快照版本');
  const keep = Array.isArray(o.keep) ? o.keep : [];
  const history = Array.isArray(o.history) ? o.history : [];
  if (mode === 'overwrite') {
    await TvDao.clearKeep();
    await TvDao.clearHistory();
  }
  for (const row of keep) {
    await TvDao.upsertKeep(row);
  }
  for (const row of history) {
    await TvDao.upsertHistory(row);
  }
  return { keep: keep.length, history: history.length };
}

export function snapshotToJson(snap: TvStateSnapshot): string {
  return JSON.stringify(snap, null, 2);
}
