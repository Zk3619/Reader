/**
 * TV/Video 模块持久化 DAO
 * 媒资权威：video_tracks + video_groups / video_group_items
 * 配置包源引擎：video_sources（见 @/lib/database/video-sources）
 * （history / keep 已收敛为内置 listId=recent|keep）
 */

import { getDatabase } from '@/lib/database/database-core';
import { VideoTables } from '@/lib/database/table-names';
import {
  deleteVideoSource,
  findVideoSourceByUrl,
  getVideoSource,
  inferVideoSourceKind,
  listVideoSources,
  parseVideoSourceMeta,
  setVideoSourceEnabled,
  upsertVideoSource,
  videoSourceIdForUrl,
  videoSourceType,
  type VideoSourceRow,
} from '@/lib/database/video-sources';
import { MediaGroupId } from '@/types/book-group';
import type { TvConfigRow, TvHistoryRow, TvKeepRow } from '../types';

export {
  deleteVideoSource,
  findVideoSourceByUrl,
  getVideoSource,
  listVideoSources,
  setVideoSourceEnabled,
  upsertVideoSource,
  type VideoSourceRow,
};

const RECENT_MAX = 200;

function sourceToConfigRow(row: VideoSourceRow): TvConfigRow {
  return {
    id: row.id,
    url: row.scriptUrl ?? '',
    name: row.name,
    type: videoSourceType(row),
    json: row.script ?? '',
    updatedAt: row.updatedAt,
    enabled: row.enabled,
    kind: row.kind,
    customOrder: row.customOrder,
  };
}

function trackToHistory(row: Record<string, unknown>): TvHistoryRow {
  return {
    key: String(row.id),
    siteKey: String(row.site_key ?? ''),
    vodId: String(row.vod_id ?? ''),
    vodName: String(row.name ?? ''),
    vodPic: String(row.cover_url ?? ''),
    flag: String(row.flag ?? ''),
    episode: String(row.episode ?? ''),
    position: Number(row.position ?? 0),
    duration: Number(row.duration ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
    cid: Number(row.cid ?? 0),
  };
}

function trackToKeep(row: Record<string, unknown>): TvKeepRow {
  return {
    key: String(row.id),
    siteKey: String(row.site_key ?? ''),
    vodId: String(row.vod_id ?? ''),
    vodName: String(row.name ?? ''),
    vodPic: String(row.cover_url ?? ''),
    kind: (String(row.kind ?? 'vod') as 'vod' | 'live') || 'vod',
    cid: Number(row.cid ?? 0),
    createdAt: Number(row.created_at ?? 0),
  };
}

async function upsertTrackMeta(
  id: string,
  fields: {
    name: string;
    siteKey: string;
    vodId: string;
    coverUrl?: string;
    kind?: string;
    cid: number;
    flag?: string;
    episode?: string;
    position?: number;
    duration?: number;
    updatedAt: number;
    createdAt?: number;
    /** 是否写入播放进度字段（history）；keep 只更新元数据 */
    touchProgress?: boolean;
  },
): Promise<void> {
  const db = await getDatabase();
  const created = fields.createdAt ?? fields.updatedAt;
  if (fields.touchProgress) {
    await db.execute(
      `INSERT INTO ${VideoTables.tracks}
        (id, name, site_key, vod_id, cover_url, kind, cid, flag, episode, position, duration, meta_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, site_key=excluded.site_key, vod_id=excluded.vod_id,
         cover_url=excluded.cover_url, kind=excluded.kind, cid=excluded.cid,
         flag=excluded.flag, episode=excluded.episode,
         position=excluded.position, duration=excluded.duration,
         updated_at=excluded.updated_at`,
      [
        id,
        fields.name,
        fields.siteKey,
        fields.vodId,
        fields.coverUrl ?? null,
        fields.kind ?? 'vod',
        fields.cid,
        fields.flag ?? '',
        fields.episode ?? '',
        fields.position ?? 0,
        fields.duration ?? 0,
        created,
        fields.updatedAt,
      ],
    );
    return;
  }
  await db.execute(
    `INSERT INTO ${VideoTables.tracks}
      (id, name, site_key, vod_id, cover_url, kind, cid, flag, episode, position, duration, meta_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '', '', 0, 0, '{}', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, site_key=excluded.site_key, vod_id=excluded.vod_id,
       cover_url=excluded.cover_url, kind=excluded.kind, cid=excluded.cid,
       updated_at=excluded.updated_at`,
    [
      id,
      fields.name,
      fields.siteKey,
      fields.vodId,
      fields.coverUrl ?? null,
      fields.kind ?? 'vod',
      fields.cid,
      created,
      fields.updatedAt,
    ],
  );
}

async function addToGroupFront(groupId: number, itemId: string, now: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `UPDATE ${VideoTables.groupItems} SET sort_order = sort_order + 1 WHERE group_id = ? AND item_id <> ?`,
    [groupId, itemId],
  );
  await db.execute(
    `INSERT INTO ${VideoTables.groupItems} (group_id, item_id, sort_order, created_at)
     VALUES (?, ?, 0, ?)
     ON CONFLICT(group_id, item_id) DO UPDATE SET sort_order = 0, created_at = excluded.created_at`,
    [groupId, itemId, now],
  );
  if (groupId === MediaGroupId.VideoRecent) {
    await db.execute(
      `DELETE FROM ${VideoTables.groupItems}
       WHERE group_id = ? AND sort_order >= ?`,
      [groupId, RECENT_MAX],
    );
  }
}

export async function upsertTvConfig(
  row: Omit<TvConfigRow, 'id' | 'enabled' | 'kind' | 'customOrder'> & {
    id?: string;
    enabled?: boolean;
    kind?: string;
    customOrder?: number;
  },
): Promise<void> {
  const url = (row.url || '').trim();
  const existing = url ? await findVideoSourceByUrl(url) : row.id ? await getVideoSource(row.id) : null;
  const id = existing?.id ?? row.id ?? videoSourceIdForUrl(url);
  const metaType = row.type ?? (existing ? videoSourceType(existing) : 0);
  const meta = {
    ...parseVideoSourceMeta(existing?.metaJson ?? '{}'),
    type: metaType,
  };
  await upsertVideoSource({
    id,
    kind: (row.kind as ReturnType<typeof inferVideoSourceKind>) || inferVideoSourceKind(url),
    name: row.name || url || id,
    enabled: row.enabled ?? existing?.enabled ?? true,
    script: row.json,
    scriptUrl: url || undefined,
    version: existing?.version,
    customOrder: row.customOrder ?? existing?.customOrder ?? 0,
    metaJson: JSON.stringify(meta),
    updatedAt: row.updatedAt ?? Date.now(),
    createdAt: existing?.createdAt,
  });
}

export async function deleteTvConfig(id: string | number): Promise<void> {
  await deleteVideoSource(String(id));
}

export async function activateTvConfig(id: string | number): Promise<TvConfigRow | null> {
  const row = await getVideoSource(String(id));
  if (!row) return null;
  const updated = await upsertVideoSource({
    ...row,
    updatedAt: Date.now(),
  });
  return sourceToConfigRow(updated);
}

export async function listTvConfigs(type?: number): Promise<TvConfigRow[]> {
  const all = (await listVideoSources()).map(sourceToConfigRow);
  if (type == null) return all;
  return all.filter((r) => r.type === type);
}

/** 单一源库（video_sources；url 唯一由索引保证） */
export async function listTvConfigLibrary(opts?: {
  enabledOnly?: boolean;
}): Promise<TvConfigRow[]> {
  return (await listVideoSources({ enabledOnly: opts?.enabledOnly })).map(sourceToConfigRow);
}

export async function findTvConfigLibraryByUrl(
  url: string,
): Promise<TvConfigRow | null> {
  const row = await findVideoSourceByUrl(url);
  return row ? sourceToConfigRow(row) : null;
}

export async function getLatestTvConfig(type = 0): Promise<TvConfigRow | null> {
  if (type === 0) {
    const lib = await listTvConfigLibrary();
    return lib[0] ?? null;
  }
  const list = await listTvConfigs(type);
  return list[0] ?? null;
}

export async function findTvConfigByUrl(
  url: string,
  type?: number,
): Promise<TvConfigRow | null> {
  const row = await findTvConfigLibraryByUrl(url);
  if (!row) return null;
  if (type != null && row.type !== type) return null;
  return row;
}

/** 写入/更新观看进度，并置顶「最近观看」 */
export async function upsertHistory(row: TvHistoryRow): Promise<void> {
  await upsertTrackMeta(row.key, {
    name: row.vodName,
    siteKey: row.siteKey,
    vodId: row.vodId,
    coverUrl: row.vodPic,
    kind: 'vod',
    cid: row.cid,
    flag: row.flag,
    episode: row.episode,
    position: row.position,
    duration: row.duration,
    updatedAt: row.updatedAt,
    touchProgress: true,
  });
  await addToGroupFront(MediaGroupId.VideoRecent, row.key, row.updatedAt);
}

export async function listHistory(limit = 100): Promise<TvHistoryRow[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT t.* FROM ${VideoTables.tracks} t
     INNER JOIN ${VideoTables.groupItems} i ON i.item_id = t.id
     WHERE i.group_id = ?
     ORDER BY i.sort_order ASC, t.updated_at DESC
     LIMIT ?`,
    [MediaGroupId.VideoRecent, limit],
  );
  return (rows ?? []).map(trackToHistory);
}

export async function upsertKeep(row: TvKeepRow): Promise<void> {
  await upsertTrackMeta(row.key, {
    name: row.vodName,
    siteKey: row.siteKey,
    vodId: row.vodId,
    coverUrl: row.vodPic,
    kind: row.kind,
    cid: row.cid,
    updatedAt: row.createdAt,
    createdAt: row.createdAt,
  });
  await addToGroupFront(MediaGroupId.VideoKeep, row.key, row.createdAt);
}

export async function removeKeep(key: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `DELETE FROM ${VideoTables.groupItems} WHERE group_id = ? AND item_id = ?`,
    [MediaGroupId.VideoKeep, key],
  );
}

export async function listKeep(): Promise<TvKeepRow[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT t.* FROM ${VideoTables.tracks} t
     INNER JOIN ${VideoTables.groupItems} i ON i.item_id = t.id
     WHERE i.group_id = ?
     ORDER BY i.sort_order ASC, t.created_at DESC`,
    [MediaGroupId.VideoKeep],
  );
  return (rows ?? []).map(trackToKeep);
}

export async function setSitePref(
  key: string,
  searchable: number,
  changeable: number,
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO ${VideoTables.sitePref} (key, searchable, changeable) VALUES (?,?,?)
     ON CONFLICT(key) DO UPDATE SET searchable=excluded.searchable, changeable=excluded.changeable`,
    [key, searchable, changeable],
  );
}

export async function removeHistory(key: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `DELETE FROM ${VideoTables.groupItems} WHERE group_id = ? AND item_id = ?`,
    [MediaGroupId.VideoRecent, key],
  );
}

export async function clearHistory(): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM ${VideoTables.groupItems} WHERE group_id = ?`, [
    MediaGroupId.VideoRecent,
  ]);
}

export async function getHistory(key: string): Promise<TvHistoryRow | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT t.* FROM ${VideoTables.tracks} t
     INNER JOIN ${VideoTables.groupItems} i ON i.item_id = t.id
     WHERE i.group_id = ? AND t.id = ?
     LIMIT 1`,
    [MediaGroupId.VideoRecent, key],
  );
  const r = rows?.[0];
  if (!r) {
    // 有进度字段但未在 recent 时仍可读
    const alone = await db.select<Record<string, unknown>>(
      `SELECT * FROM ${VideoTables.tracks} WHERE id = ? LIMIT 1`,
      [key],
    );
    return alone?.[0] ? trackToHistory(alone[0]) : null;
  }
  return trackToHistory(r);
}

export async function clearKeep(): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM ${VideoTables.groupItems} WHERE group_id = ?`, [
    MediaGroupId.VideoKeep,
  ]);
}

export async function getSitePref(
  key: string,
): Promise<{ searchable: number; changeable: number } | null> {
  const db = await getDatabase();
  const rows = await db.select<{ searchable: number; changeable: number }>(
    `SELECT searchable, changeable FROM ${VideoTables.sitePref} WHERE key=?`,
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
      `SELECT key, searchable, changeable FROM ${VideoTables.sitePref}`,
    )) ?? []
  );
}

/** 用户自定义影视片单（预留 API） */
export async function listVideoGroups(): Promise<
  Array<{ groupId: number; groupName: string; listId?: string }>
> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT groupId, groupName, listId FROM ${VideoTables.groups} ORDER BY "order"`,
  );
  return (rows ?? []).map((r) => ({
    groupId: Number(r.groupId),
    groupName: String(r.groupName ?? ''),
    listId: r.listId != null ? String(r.listId) : undefined,
  }));
}
