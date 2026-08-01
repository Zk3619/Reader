/**
 * 观看历史
 */

import { getHistoryList, getHistorySearch } from './extras';
import type { MediaItem } from './types';

export type HistoryEntry = {
  title: string;
  cover: string;
  bvid?: string;
  cid?: number;
  oid?: number;
  progress?: number;
  duration?: number;
  author?: string;
  authorMid?: number;
  viewAt?: number;
  business?: string;
  url: string;
};

export async function fetchWatchHistory(viewAt = 0): Promise<{
  list: HistoryEntry[];
  nextViewAt: number;
}> {
  const data = await getHistoryList(viewAt, 20);
  const list: HistoryEntry[] = (data.list ?? []).map((row) => {
    const bvid = row.history?.bvid;
    return {
      title: row.title,
      cover: row.cover,
      bvid,
      cid: row.history?.cid,
      oid: row.history?.oid,
      progress: row.progress,
      duration: row.duration,
      author: row.author_name,
      authorMid: row.author_mid,
      viewAt: row.view_at,
      business: row.history?.business,
      url: bvid
        ? `https://www.bilibili.com/video/${bvid}`
        : `https://www.bilibili.com/`,
    };
  });
  return {
    list,
    nextViewAt: data.cursor?.view_at ?? 0,
  };
}

export async function searchWatchHistory(
  keyword: string,
  pn = 1,
): Promise<HistoryEntry[]> {
  const rows = await getHistorySearch({
    pn,
    keyword,
    business: 'all',
    add_time_start: 0,
    add_time_end: 0,
    arc_max_duration: 0,
    arc_min_duration: 0,
    device_type: 0,
  });
  return rows.map((row) => {
    const r = row as {
      title?: string;
      cover?: string;
      history?: { bvid?: string; cid?: number; oid?: number; business?: string };
      progress?: number;
      duration?: number;
      author_name?: string;
      author_mid?: number;
      view_at?: number;
    };
    const bvid = r.history?.bvid;
    return {
      title: r.title ?? '',
      cover: r.cover ?? '',
      bvid,
      cid: r.history?.cid,
      oid: r.history?.oid,
      progress: r.progress,
      duration: r.duration,
      author: r.author_name,
      authorMid: r.author_mid,
      viewAt: r.view_at,
      business: r.history?.business,
      url: bvid ? `https://www.bilibili.com/video/${bvid}` : 'https://www.bilibili.com/',
    };
  });
}

export function historyToMediaItem(entry: HistoryEntry, index: number): MediaItem {
  return {
    title: entry.title,
    cover: entry.cover,
    desc: '',
    url: entry.url,
    aid: entry.oid,
    bvid: entry.bvid,
    cid: entry.cid,
    duration: entry.duration ?? 0,
    pubtime: entry.viewAt ?? 0,
    type: 'video',
    isTarget: index === 0,
    index,
  };
}
