/**
 * TV 模块持久化 DAO
 */

import { getDatabase } from '@/lib/database/database-core';
import type { TvConfigRow, TvHistoryRow, TvKeepRow } from '../types';

type HistoryDb = {
  key: string;
  site_key: string;
  vod_id: string;
  vod_name: string;
  vod_pic: string;
  flag: string;
  episode: string;
  position: number;
  duration: number;
  updated_at: number;
  cid: number;
};

type KeepDb = {
  key: string;
  site_key: string;
  vod_id: string;
  vod_name: string;
  vod_pic: string;
  kind: 'vod' | 'live';
  cid: number;
  created_at: number;
};

export async function upsertTvConfig(
  row: Omit<TvConfigRow, 'id'> & { id?: number },
): Promise<void> {
  const db = await getDatabase();
  if (row.id != null) {
    await db.execute(
      `UPDATE tv_config SET url=?, name=?, type=?, json=?, updated_at=? WHERE id=?`,
      [row.url, row.name, row.type, row.json, row.updatedAt, row.id],
    );
  } else {
    await db.execute(
      `INSERT INTO tv_config (url, name, type, json, updated_at) VALUES (?,?,?,?,?)`,
      [row.url, row.name, row.type, row.json, row.updatedAt],
    );
  }
}

export async function listTvConfigs(): Promise<TvConfigRow[]> {
  const db = await getDatabase();
  const rows = await db.select<{
    id: number;
    url: string;
    name: string;
    type: number;
    json: string;
    updated_at: number;
  }>(
    `SELECT id, url, name, type, json, updated_at FROM tv_config ORDER BY updated_at DESC`,
  );
  return (rows ?? []).map((r) => ({
    id: r.id,
    url: r.url,
    name: r.name,
    type: r.type,
    json: r.json,
    updatedAt: r.updated_at,
  }));
}

export async function getLatestTvConfig(): Promise<TvConfigRow | null> {
  const list = await listTvConfigs();
  return list[0] ?? null;
}

export async function upsertHistory(row: TvHistoryRow): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO tv_history (key, site_key, vod_id, vod_name, vod_pic, flag, episode, position, duration, updated_at, cid)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(key) DO UPDATE SET
       flag=excluded.flag, episode=excluded.episode, position=excluded.position,
       duration=excluded.duration, updated_at=excluded.updated_at, vod_name=excluded.vod_name, vod_pic=excluded.vod_pic`,
    [
      row.key,
      row.siteKey,
      row.vodId,
      row.vodName,
      row.vodPic,
      row.flag,
      row.episode,
      row.position,
      row.duration,
      row.updatedAt,
      row.cid,
    ],
  );
}

export async function listHistory(limit = 100): Promise<TvHistoryRow[]> {
  const db = await getDatabase();
  const rows = await db.select<HistoryDb>(
    `SELECT key, site_key, vod_id, vod_name, vod_pic, flag, episode, position, duration, updated_at, cid
     FROM tv_history ORDER BY updated_at DESC LIMIT ?`,
    [limit],
  );
  return (rows ?? []).map((r) => ({
    key: r.key,
    siteKey: r.site_key,
    vodId: r.vod_id,
    vodName: r.vod_name,
    vodPic: r.vod_pic,
    flag: r.flag,
    episode: r.episode,
    position: r.position,
    duration: r.duration,
    updatedAt: r.updated_at,
    cid: r.cid,
  }));
}

export async function upsertKeep(row: TvKeepRow): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO tv_keep (key, site_key, vod_id, vod_name, vod_pic, kind, cid, created_at)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(key) DO UPDATE SET vod_name=excluded.vod_name, vod_pic=excluded.vod_pic`,
    [
      row.key,
      row.siteKey,
      row.vodId,
      row.vodName,
      row.vodPic,
      row.kind,
      row.cid,
      row.createdAt,
    ],
  );
}

export async function removeKeep(key: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM tv_keep WHERE key=?`, [key]);
}

export async function listKeep(): Promise<TvKeepRow[]> {
  const db = await getDatabase();
  const rows = await db.select<KeepDb>(`SELECT * FROM tv_keep ORDER BY created_at DESC`);
  return (rows ?? []).map((r) => ({
    key: r.key,
    siteKey: r.site_key,
    vodId: r.vod_id,
    vodName: r.vod_name,
    vodPic: r.vod_pic,
    kind: r.kind,
    cid: r.cid,
    createdAt: r.created_at,
  }));
}

export async function setSitePref(
  key: string,
  searchable: number,
  changeable: number,
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO tv_site_pref (key, searchable, changeable) VALUES (?,?,?)
     ON CONFLICT(key) DO UPDATE SET searchable=excluded.searchable, changeable=excluded.changeable`,
    [key, searchable, changeable],
  );
}

export async function removeHistory(key: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM tv_history WHERE key=?`, [key]);
}

export async function clearHistory(): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM tv_history`);
}

export async function getHistory(key: string): Promise<TvHistoryRow | null> {
  const db = await getDatabase();
  const rows = await db.select<HistoryDb>(
    `SELECT key, site_key, vod_id, vod_name, vod_pic, flag, episode, position, duration, updated_at, cid
     FROM tv_history WHERE key=? LIMIT 1`,
    [key],
  );
  const r = rows?.[0];
  if (!r) return null;
  return {
    key: r.key,
    siteKey: r.site_key,
    vodId: r.vod_id,
    vodName: r.vod_name,
    vodPic: r.vod_pic,
    flag: r.flag,
    episode: r.episode,
    position: r.position,
    duration: r.duration,
    updatedAt: r.updated_at,
    cid: r.cid,
  };
}

export async function clearKeep(): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM tv_keep`);
}

export async function getSitePref(
  key: string,
): Promise<{ searchable: number; changeable: number } | null> {
  const db = await getDatabase();
  const rows = await db.select<{ searchable: number; changeable: number }>(
    `SELECT searchable, changeable FROM tv_site_pref WHERE key=?`,
    [key],
  );
  return rows?.[0] ?? null;
}

export async function listSitePrefs(): Promise<
  Array<{ key: string; searchable: number; changeable: number }>
> {
  const db = await getDatabase();
  return (
    (await db.select<{ key: string; searchable: number; changeable: number }>(
      `SELECT key, searchable, changeable FROM tv_site_pref`,
    )) ?? []
  );
}
