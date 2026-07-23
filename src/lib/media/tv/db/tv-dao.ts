/**
 * TV/Video 模块持久化 DAO
 * - 媒资库：video_tracks（library=1 为书架收藏）
 * - 分组：video_groups / video_group_items（系统组虚拟过滤 + 用户组成员）
 * - 观看记录：video_play_record（独立于分组）
 * - 配置包源：video_sources
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
import {
  MediaGroupId,
  isVideoSystemGroupId,
  VIDEO_SYSTEM_GROUP_IDS,
} from '@/types/book-group';
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

const PLAY_RECORD_MAX = 200;

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

function rowToHistory(row: Record<string, unknown>): TvHistoryRow {
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
    kind: (String(row.kind ?? 'vod') as TvKeepRow['kind']) || 'vod',
    cid: Number(row.cid ?? 0),
    createdAt: Number(row.created_at ?? 0),
    flag: String(row.flag ?? ''),
    episode: String(row.episode ?? ''),
    position: Number(row.position ?? 0),
    duration: Number(row.duration ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
  };
}

function kindFilterSql(groupId: number): { sql: string; params: unknown[] } {
  switch (groupId) {
    case MediaGroupId.VideoVod:
      return { sql: `AND t.kind = ?`, params: ['vod'] };
    case MediaGroupId.VideoLive:
      return { sql: `AND t.kind = ?`, params: ['live'] };
    case MediaGroupId.VideoLocal:
      return { sql: `AND t.kind = ?`, params: ['local'] };
    case MediaGroupId.VideoAll:
    default:
      return { sql: '', params: [] };
  }
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
    /** 是否写入播放进度字段 */
    touchProgress?: boolean;
    /** 是否标记为书架收藏 */
    setLibrary?: boolean;
  },
): Promise<void> {
  const db = await getDatabase();
  const created = fields.createdAt ?? fields.updatedAt;
  if (fields.touchProgress) {
    await db.execute(
      `INSERT INTO ${VideoTables.tracks}
        (id, name, site_key, vod_id, cover_url, kind, cid, flag, episode, position, duration, meta_json, created_at, updated_at, library, library_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, 0)
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
        fields.setLibrary ? 1 : 0,
      ],
    );
    if (fields.setLibrary) {
      await db.execute(
        `UPDATE ${VideoTables.tracks} SET library = 1 WHERE id = ?`,
        [id],
      );
    }
    return;
  }
  await db.execute(
    `INSERT INTO ${VideoTables.tracks}
      (id, name, site_key, vod_id, cover_url, kind, cid, flag, episode, position, duration, meta_json, created_at, updated_at, library, library_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, '', '', 0, 0, '{}', ?, ?, ?, 0)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, site_key=excluded.site_key, vod_id=excluded.vod_id,
       cover_url=excluded.cover_url, kind=excluded.kind, cid=excluded.cid,
       updated_at=excluded.updated_at,
       library = CASE WHEN ? = 1 THEN 1 ELSE ${VideoTables.tracks}.library END`,
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
      fields.setLibrary ? 1 : 0,
      fields.setLibrary ? 1 : 0,
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
}

async function trimPlayRecords(db: Awaited<ReturnType<typeof getDatabase>>): Promise<void> {
  await db.execute(
    `DELETE FROM ${VideoTables.playRecord}
     WHERE id IN (
       SELECT id FROM ${VideoTables.playRecord}
       ORDER BY updated_at DESC
       LIMIT -1 OFFSET ?
     )`,
    [PLAY_RECORD_MAX],
  );
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
  const existing = url
    ? await findVideoSourceByUrl(url)
    : row.id
      ? await getVideoSource(row.id)
      : null;
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

export async function findTvConfigLibraryByUrl(url: string): Promise<TvConfigRow | null> {
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

/** 写入观看记录（独立表）；若已在书架则同步进度到 tracks */
export async function upsertHistory(row: TvHistoryRow): Promise<void> {
  const db = await getDatabase();
  const createdRows = await db.select<{ created_at: number }>(
    `SELECT created_at FROM ${VideoTables.playRecord} WHERE id = ? LIMIT 1`,
    [row.key],
  );
  const createdAt = Number(createdRows?.[0]?.created_at ?? row.updatedAt);
  await db.execute(
    `INSERT INTO ${VideoTables.playRecord}
      (id, name, site_key, vod_id, cover_url, kind, cid, flag, episode, position, duration, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, site_key=excluded.site_key, vod_id=excluded.vod_id,
       cover_url=excluded.cover_url, kind=excluded.kind, cid=excluded.cid,
       flag=excluded.flag, episode=excluded.episode,
       position=excluded.position, duration=excluded.duration,
       updated_at=excluded.updated_at`,
    [
      row.key,
      row.vodName,
      row.siteKey,
      row.vodId,
      row.vodPic || null,
      'vod',
      row.cid,
      row.flag,
      row.episode,
      row.position,
      row.duration,
      createdAt,
      row.updatedAt,
    ],
  );
  await trimPlayRecords(db);

  // 书架内条目同步进度，便于收藏卡展示
  const lib = await db.select<{ library: number }>(
    `SELECT library FROM ${VideoTables.tracks} WHERE id = ? LIMIT 1`,
    [row.key],
  );
  if (lib?.[0] && Number(lib[0].library) === 1) {
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
  }
}

export async function listHistory(limit = 100): Promise<TvHistoryRow[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${VideoTables.playRecord}
     ORDER BY updated_at DESC
     LIMIT ?`,
    [limit],
  );
  return (rows ?? []).map(rowToHistory);
}

export async function upsertKeep(row: TvKeepRow): Promise<void> {
  const db = await getDatabase();
  const orderRows = await db.select<{ minOrder: number | null }>(
    `SELECT MIN(library_order) as minOrder FROM ${VideoTables.tracks} WHERE library = 1`,
  );
  const nextOrder = Number(orderRows?.[0]?.minOrder ?? 0) - 1;
  await upsertTrackMeta(row.key, {
    name: row.vodName,
    siteKey: row.siteKey,
    vodId: row.vodId,
    coverUrl: row.vodPic,
    kind: row.kind,
    cid: row.cid,
    updatedAt: row.createdAt,
    createdAt: row.createdAt,
    setLibrary: true,
  });
  await db.execute(
    `UPDATE ${VideoTables.tracks} SET library = 1, library_order = ? WHERE id = ?`,
    [nextOrder, row.key],
  );
}

/** 仅更新收藏展示名 / 封面，不改排序 */
export async function updateKeepDisplay(
  key: string,
  fields: { vodName: string; vodPic?: string },
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `UPDATE ${VideoTables.tracks} SET name = ?, cover_url = ?, updated_at = ? WHERE id = ?`,
    [fields.vodName.trim(), fields.vodPic?.trim() || null, Date.now(), key],
  );
}

export async function removeKeep(key: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE ${VideoTables.tracks} SET library = 0 WHERE id = ?`, [key]);
  // 移出所有用户自定义分组
  await db.execute(
    `DELETE FROM ${VideoTables.groupItems}
     WHERE item_id = ? AND group_id NOT IN (${VIDEO_SYSTEM_GROUP_IDS.map(() => '?').join(',')})`,
    [key, ...VIDEO_SYSTEM_GROUP_IDS],
  );
  // 系统组无成员行；再清掉一切残留成员
  await db.execute(`DELETE FROM ${VideoTables.groupItems} WHERE item_id = ?`, [key]);
}

export async function listKeep(): Promise<TvKeepRow[]> {
  return listKeepByGroup(MediaGroupId.VideoAll);
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
  await db.execute(`DELETE FROM ${VideoTables.playRecord} WHERE id = ?`, [key]);
}

export async function clearHistory(): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM ${VideoTables.playRecord}`);
}

export async function getHistory(key: string): Promise<TvHistoryRow | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${VideoTables.playRecord} WHERE id = ? LIMIT 1`,
    [key],
  );
  if (rows?.[0]) return rowToHistory(rows[0]);
  // 兼容：书架条目上的进度
  const alone = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${VideoTables.tracks} WHERE id = ? LIMIT 1`,
    [key],
  );
  return alone?.[0] ? rowToHistory(alone[0]) : null;
}

export async function clearKeep(): Promise<void> {
  const db = await getDatabase();
  await db.execute(`UPDATE ${VideoTables.tracks} SET library = 0 WHERE library = 1`);
  await db.execute(`DELETE FROM ${VideoTables.groupItems}`);
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

function mapGroupRow(r: Record<string, unknown>) {
  return {
    groupId: Number(r.groupId),
    groupName: String(r.groupName ?? ''),
    order: Number(r.order ?? 0),
    show: r.show === undefined || r.show === null ? true : Boolean(Number(r.show)),
    listId: r.listId != null ? String(r.listId) : undefined,
    source: r.source != null ? String(r.source) : undefined,
    cover: r.cover != null ? String(r.cover) : undefined,
    description: r.description != null ? String(r.description) : undefined,
  };
}

/** 列出影视分组；默认含系统组 + 用户组 */
export async function listVideoGroups(opts?: {
  includeBuiltin?: boolean;
  /** 仅用户自定义 */
  userOnly?: boolean;
}): Promise<import('../types').TvVideoGroupRow[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT groupId, groupName, cover, "order", show, listId, source, description
     FROM ${VideoTables.groups}
     ORDER BY "order" ASC, groupId DESC`,
  );
  const mapped = (rows ?? []).map(mapGroupRow);
  if (opts?.userOnly) {
    return mapped.filter(
      (g) =>
        !isVideoSystemGroupId(g.groupId) &&
        g.groupId !== MediaGroupId.VideoKeep &&
        g.groupId !== MediaGroupId.VideoRecent &&
        (g.source === 'user' || g.groupId < MediaGroupId.VideoUserStart),
    );
  }
  if (opts?.includeBuiltin === false) {
    return mapped.filter(
      (g) =>
        !isVideoSystemGroupId(g.groupId) &&
        (g.source === 'user' || g.groupId < MediaGroupId.VideoUserStart),
    );
  }
  // 默认：系统组 + 用户组（过滤废弃 keep/recent）
  return mapped.filter(
    (g) =>
      isVideoSystemGroupId(g.groupId) ||
      ((g.source === 'user' || g.groupId < MediaGroupId.VideoUserStart) &&
        g.groupId !== MediaGroupId.VideoKeep &&
        g.groupId !== MediaGroupId.VideoRecent),
  );
}

export async function getNextVideoUserGroupId(): Promise<number> {
  const db = await getDatabase();
  const rows = await db.select<{ minId: number | null }>(
    `SELECT MIN(groupId) as minId FROM ${VideoTables.groups}
     WHERE groupId < ?`,
    [MediaGroupId.VideoUserStart],
  );
  const min = rows?.[0]?.minId;
  if (min == null || min >= MediaGroupId.VideoUserStart) {
    return MediaGroupId.VideoUserStart - 1;
  }
  return Number(min) - 1;
}

export async function insertVideoGroup(input: {
  groupName: string;
  cover?: string;
  description?: string;
}): Promise<import('../types').TvVideoGroupRow> {
  const db = await getDatabase();
  const groupId = await getNextVideoUserGroupId();
  const name = input.groupName.trim() || '未命名分组';
  const orderRows = await db.select<{ maxOrder: number | null }>(
    `SELECT MAX("order") as maxOrder FROM ${VideoTables.groups}`,
  );
  const order = Math.max(1, Number(orderRows?.[0]?.maxOrder ?? 0) + 1);
  await db.execute(
    `INSERT INTO ${VideoTables.groups}
      (groupId, groupName, cover, "order", enableRefresh, show, bookSort, onlyUpdateRead, listId, source, description)
     VALUES (?, ?, ?, ?, 0, 1, -1, 0, ?, 'user', ?)`,
    [groupId, name, input.cover ?? null, order, `user_${groupId}`, input.description ?? null],
  );
  return {
    groupId,
    groupName: name,
    order,
    show: true,
    listId: `user_${groupId}`,
    source: 'user',
    cover: input.cover,
    description: input.description,
  };
}

export async function updateVideoGroup(input: {
  groupId: number;
  groupName?: string;
  cover?: string | null;
  description?: string | null;
  show?: boolean;
  order?: number;
}): Promise<void> {
  if (isVideoSystemGroupId(input.groupId)) {
    throw new Error('系统分组不可修改');
  }
  const db = await getDatabase();
  const cur = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${VideoTables.groups} WHERE groupId = ? LIMIT 1`,
    [input.groupId],
  );
  const row = cur?.[0];
  if (!row) throw new Error('分组不存在');
  await db.execute(
    `UPDATE ${VideoTables.groups} SET
      groupName = ?, cover = ?, description = ?, show = ?, "order" = ?
     WHERE groupId = ?`,
    [
      input.groupName?.trim() || String(row.groupName ?? ''),
      input.cover === undefined ? row.cover ?? null : input.cover,
      input.description === undefined ? row.description ?? null : input.description,
      input.show === undefined ? Number(row.show ?? 1) : input.show ? 1 : 0,
      input.order === undefined ? Number(row.order ?? 0) : input.order,
      input.groupId,
    ],
  );
}

export async function deleteVideoGroup(groupId: number): Promise<void> {
  if (isVideoSystemGroupId(groupId)) {
    throw new Error('系统分组不可删除');
  }
  const db = await getDatabase();
  await db.execute(`DELETE FROM ${VideoTables.groupItems} WHERE group_id = ?`, [groupId]);
  await db.execute(`DELETE FROM ${VideoTables.groups} WHERE groupId = ?`, [groupId]);
}

export async function reorderVideoGroups(groupIds: number[]): Promise<void> {
  const db = await getDatabase();
  for (let i = 0; i < groupIds.length; i++) {
    const id = groupIds[i]!;
    if (isVideoSystemGroupId(id)) continue;
    await db.execute(`UPDATE ${VideoTables.groups} SET "order" = ? WHERE groupId = ?`, [
      i + 1,
      id,
    ]);
  }
}

export async function listKeepByGroup(groupId: number): Promise<TvKeepRow[]> {
  const db = await getDatabase();
  if (isVideoSystemGroupId(groupId) || groupId === 0 || groupId === MediaGroupId.VideoKeep) {
    const resolved =
      groupId === 0 || groupId === MediaGroupId.VideoKeep
        ? MediaGroupId.VideoAll
        : groupId;
    const { sql, params } = kindFilterSql(resolved);
    const rows = await db.select<Record<string, unknown>>(
      `SELECT t.* FROM ${VideoTables.tracks} t
       WHERE t.library = 1 ${sql}
       ORDER BY t.library_order ASC, t.created_at DESC`,
      params,
    );
    return (rows ?? []).map(trackToKeep);
  }
  const rows = await db.select<Record<string, unknown>>(
    `SELECT t.* FROM ${VideoTables.tracks} t
     INNER JOIN ${VideoTables.groupItems} i
       ON i.item_id = t.id AND i.group_id = ?
     WHERE t.library = 1
     ORDER BY i.sort_order ASC, t.created_at DESC`,
    [groupId],
  );
  return (rows ?? []).map(trackToKeep);
}

export async function countKeepByGroups(
  groupIds: number[],
): Promise<Record<number, number>> {
  const out: Record<number, number> = {};
  if (!groupIds.length) return out;
  for (const id of groupIds) out[id] = 0;

  const db = await getDatabase();
  const systemIds = groupIds.filter((id) => isVideoSystemGroupId(id));
  const userIds = groupIds.filter((id) => !isVideoSystemGroupId(id));

  for (const id of systemIds) {
    const { sql, params } = kindFilterSql(id);
    const rows = await db.select<{ c: number }>(
      `SELECT COUNT(*) as c FROM ${VideoTables.tracks} t WHERE t.library = 1 ${sql}`,
      params,
    );
    out[id] = Number(rows?.[0]?.c ?? 0);
  }

  if (userIds.length) {
    const placeholders = userIds.map(() => '?').join(',');
    const rows = await db.select<{ group_id: number; c: number }>(
      `SELECT i.group_id as group_id, COUNT(*) as c
       FROM ${VideoTables.groupItems} i
       INNER JOIN ${VideoTables.tracks} t ON t.id = i.item_id AND t.library = 1
       WHERE i.group_id IN (${placeholders})
       GROUP BY i.group_id`,
      userIds,
    );
    for (const r of rows ?? []) out[Number(r.group_id)] = Number(r.c ?? 0);
  }
  return out;
}

export async function addKeepToGroup(groupId: number, key: string): Promise<void> {
  if (isVideoSystemGroupId(groupId)) {
    throw new Error('系统分组为虚拟过滤，请使用收藏接口');
  }
  const db = await getDatabase();
  await db.execute(`UPDATE ${VideoTables.tracks} SET library = 1 WHERE id = ?`, [key]);
  await addToGroupFront(groupId, key, Date.now());
}

export async function removeKeepFromGroup(groupId: number, key: string): Promise<void> {
  if (isVideoSystemGroupId(groupId) || groupId === MediaGroupId.VideoKeep) {
    await removeKeep(key);
    return;
  }
  if (groupId === MediaGroupId.VideoRecent) {
    await removeHistory(key);
    return;
  }
  const db = await getDatabase();
  await db.execute(
    `DELETE FROM ${VideoTables.groupItems} WHERE group_id = ? AND item_id = ?`,
    [groupId, key],
  );
}

/** 移出全部用户自定义分组（仍保留收藏） */
export async function clearKeepUserGroups(key: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `DELETE FROM ${VideoTables.groupItems}
     WHERE item_id = ? AND group_id NOT IN (${VIDEO_SYSTEM_GROUP_IDS.map(() => '?').join(',')})`,
    [key, ...VIDEO_SYSTEM_GROUP_IDS],
  );
}

/** 加入多个自定义分组（不清空原有分组） */
export async function addKeepItemsToGroups(
  keys: string[],
  groupIds: number[],
): Promise<void> {
  const targets = groupIds.filter((id) => !isVideoSystemGroupId(id));
  if (!keys.length || !targets.length) return;
  for (const key of keys) {
    for (const gid of targets) {
      await addKeepToGroup(gid, key);
    }
  }
}

/** 移入：清空用户分组后加入所选分组 */
export async function replaceKeepItemGroups(
  keys: string[],
  groupIds: number[],
): Promise<void> {
  const targets = groupIds.filter((id) => !isVideoSystemGroupId(id));
  if (!keys.length || !targets.length) return;
  for (const key of keys) {
    await clearKeepUserGroups(key);
    for (const gid of targets) {
      await addKeepToGroup(gid, key);
    }
  }
}

/** 移除全部分组（保留收藏，仅清用户分组成员） */
export async function removeKeepItemsFromUserGroups(keys: string[]): Promise<void> {
  for (const key of keys) {
    await clearKeepUserGroups(key);
  }
}

/** @deprecated 语义为加入；移入请用 replaceKeepItemGroups */
export async function moveKeepItemsToGroup(
  keys: string[],
  targetGroupId: number,
): Promise<void> {
  await replaceKeepItemGroups(keys, [targetGroupId]);
}

export async function removeKeepItems(keys: string[]): Promise<void> {
  for (const key of keys) {
    await removeKeep(key);
  }
}
