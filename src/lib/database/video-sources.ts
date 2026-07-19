/**
 * 影视配置包源引擎 DAO（对齐 audio_sources）
 * 一行 = 一份 api.json / 配置 URL，不是拆 sites[]
 */

import { getDatabase } from '@/lib/database/database-core';
import { VideoTables } from '@/lib/database/table-names';

export type VideoSourceKind = 'url' | 'local' | 'paste';

export interface VideoSourceRow {
  id: string;
  kind: VideoSourceKind;
  name: string;
  enabled: boolean;
  script?: string;
  scriptUrl?: string;
  version?: string;
  customOrder: number;
  metaJson: string;
  createdAt: number;
  updatedAt: number;
}

export interface VideoSourceMeta {
  type?: number;
  /** 对齐 fongmi Config.home：该配置上次选用的站点 key */
  home?: string;
}

function mapRow(row: Record<string, unknown>): VideoSourceRow {
  return {
    id: String(row.id),
    kind: (String(row.kind) as VideoSourceKind) || 'url',
    name: String(row.name ?? ''),
    enabled: Boolean(row.enabled ?? 1),
    script: row.script != null ? String(row.script) : undefined,
    scriptUrl: row.script_url != null ? String(row.script_url) : undefined,
    version: row.version != null ? String(row.version) : undefined,
    customOrder: Number(row.custom_order ?? 0),
    metaJson: String(row.meta_json ?? '{}'),
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
  };
}

export function parseVideoSourceMeta(metaJson: string): VideoSourceMeta {
  try {
    const o = JSON.parse(metaJson || '{}') as VideoSourceMeta;
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

export function videoSourceType(row: VideoSourceRow): number {
  const t = parseVideoSourceMeta(row.metaJson).type;
  return typeof t === 'number' ? t : 0;
}

export function inferVideoSourceKind(url: string): VideoSourceKind {
  const u = (url || '').trim().toLowerCase();
  if (!u || u.startsWith('pasted:') || u === 'pasted') return 'paste';
  if (u.startsWith('file:') || u.startsWith('/') || /^[a-z]:[\\/]/i.test(u)) return 'local';
  if (u.startsWith('http://') || u.startsWith('https://')) return 'url';
  return 'local';
}

/** 稳定 id：有 url 时由 url 派生，便于 upsert */
export function videoSourceIdForUrl(url: string): string {
  const u = (url || '').trim();
  if (!u) return `vs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  let h = 2166136261;
  for (let i = 0; i < u.length; i++) {
    h ^= u.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `vs_${(h >>> 0).toString(36)}`;
}

export async function listVideoSources(opts?: {
  enabledOnly?: boolean;
  kind?: VideoSourceKind;
}): Promise<VideoSourceRow[]> {
  const db = await getDatabase();
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts?.enabledOnly) {
    where.push('enabled = 1');
  }
  if (opts?.kind) {
    where.push('kind = ?');
    params.push(opts.kind);
  }
  const sql = `SELECT * FROM ${VideoTables.sources}${
    where.length ? ` WHERE ${where.join(' AND ')}` : ''
  } ORDER BY custom_order ASC, updated_at DESC, name ASC`;
  const rows = await db.select<Record<string, unknown>>(sql, params);
  return rows.map(mapRow);
}

export async function getVideoSource(id: string): Promise<VideoSourceRow | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${VideoTables.sources} WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findVideoSourceByUrl(url: string): Promise<VideoSourceRow | null> {
  const u = (url || '').trim();
  if (!u) return null;
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${VideoTables.sources} WHERE script_url = ? LIMIT 1`,
    [u],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function upsertVideoSource(
  source: Omit<VideoSourceRow, 'createdAt' | 'updatedAt'> & {
    createdAt?: number;
    updatedAt?: number;
  },
): Promise<VideoSourceRow> {
  const db = await getDatabase();
  const now = Date.now();
  const scriptUrl = (source.scriptUrl || '').trim() || null;
  let id = source.id;

  if (scriptUrl) {
    const existing = await findVideoSourceByUrl(scriptUrl);
    if (existing) id = existing.id;
    else if (!id) id = videoSourceIdForUrl(scriptUrl);
  } else if (!id) {
    id = videoSourceIdForUrl('');
  }

  const createdAt = source.createdAt ?? now;
  const updatedAt = source.updatedAt ?? now;

  await db.execute(
    `INSERT INTO ${VideoTables.sources}
      (id, kind, name, enabled, script, script_url, version, custom_order, meta_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       kind = excluded.kind,
       name = excluded.name,
       enabled = excluded.enabled,
       script = excluded.script,
       script_url = excluded.script_url,
       version = excluded.version,
       custom_order = excluded.custom_order,
       meta_json = excluded.meta_json,
       updated_at = excluded.updated_at`,
    [
      id,
      source.kind,
      source.name,
      source.enabled ? 1 : 0,
      source.script ?? null,
      scriptUrl,
      source.version ?? null,
      source.customOrder,
      source.metaJson || '{}',
      createdAt,
      updatedAt,
    ],
  );

  const row = await getVideoSource(id);
  if (!row) throw new Error('upsertVideoSource failed');
  return row;
}

export async function deleteVideoSource(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM ${VideoTables.sources} WHERE id = ?`, [id]);
}

export async function setVideoSourceEnabled(id: string, enabled: boolean): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `UPDATE ${VideoTables.sources} SET enabled = ?, updated_at = ? WHERE id = ?`,
    [enabled ? 1 : 0, Date.now(), id],
  );
}
