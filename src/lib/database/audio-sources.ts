/**
 * 音频源 DAO（builtin + user_api + mf_plugin）
 */

import { getDatabase } from '@/lib/database/database-core';
import { AudioTables } from '@/lib/database/table-names';

export type AudioSourceKind = 'builtin' | 'user_api' | 'mf_plugin';

export interface AudioSourceRow {
  id: string;
  kind: AudioSourceKind;
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

function mapRow(row: Record<string, unknown>): AudioSourceRow {
  return {
    id: String(row.id),
    kind: (String(row.kind) as AudioSourceKind) || 'builtin',
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

export async function listAudioSources(kind?: AudioSourceKind): Promise<AudioSourceRow[]> {
  const db = await getDatabase();
  const rows = kind
    ? await db.select<Record<string, unknown>>(
        `SELECT * FROM ${AudioTables.sources} WHERE kind = ? ORDER BY custom_order ASC, name ASC`,
        [kind],
      )
    : await db.select<Record<string, unknown>>(
        `SELECT * FROM ${AudioTables.sources} ORDER BY custom_order ASC, name ASC`,
      );
  return rows.map(mapRow);
}

export async function getAudioSource(id: string): Promise<AudioSourceRow | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${AudioTables.sources} WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function upsertAudioSource(
  source: Omit<AudioSourceRow, 'createdAt' | 'updatedAt'> & {
    createdAt?: number;
    updatedAt?: number;
  },
): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.execute(
    `INSERT INTO ${AudioTables.sources}
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
      source.id,
      source.kind,
      source.name,
      source.enabled ? 1 : 0,
      source.script ?? null,
      source.scriptUrl ?? null,
      source.version ?? null,
      source.customOrder,
      source.metaJson || '{}',
      source.createdAt ?? now,
      source.updatedAt ?? now,
    ],
  );
}

export async function deleteAudioSource(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(`DELETE FROM ${AudioTables.sources} WHERE id = ?`, [id]);
}

export async function setAudioSourceEnabled(id: string, enabled: boolean): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `UPDATE ${AudioTables.sources} SET enabled = ?, updated_at = ? WHERE id = ?`,
    [enabled ? 1 : 0, Date.now(), id],
  );
}
