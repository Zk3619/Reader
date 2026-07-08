/**
 * 主题预设 CRUD（SQLite theme_presets）
 */

import { getDatabase } from '@/lib/database/database-core';
import {
  createDefaultThemePack,
  type ReaderThemePackV1,
  type ThemePresetKind,
  type ThemePresetRecord,
} from '@/lib/theme/schema/theme-pack-v1';
import { parseThemePackJson } from '@/lib/theme/schema/validate-theme-pack';

function mapRow(row: Record<string, unknown>): ThemePresetRecord {
  const manifest = parseThemePackJson(JSON.parse(String(row.manifest_json ?? '{}'))).pack;
  if (!manifest) {
    throw new Error(`Invalid theme preset manifest: ${row.id}`);
  }
  return {
    id: String(row.id),
    name: String(row.name),
    kind: (row.kind as ThemePresetKind) ?? 'user',
    scopesApp: Number(row.scopes_app ?? 1) === 1,
    scopesViewer: Number(row.scopes_viewer ?? 1) === 1,
    manifest,
    thumbnailPath: row.thumbnail_path != null ? String(row.thumbnail_path) : null,
    createdAt: Number(row.created_at ?? Date.now()),
    updatedAt: Number(row.updated_at ?? Date.now()),
  };
}

export async function listThemePresets(): Promise<ThemePresetRecord[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM theme_presets ORDER BY updated_at DESC',
  );
  return rows.map(mapRow);
}

export async function getThemePreset(id: string): Promise<ThemePresetRecord | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM theme_presets WHERE id = ?',
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function upsertThemePreset(
  manifest: ReaderThemePackV1,
  kind: ThemePresetKind = 'user',
): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  const existing = await getThemePreset(manifest.id);
  await db.execute(
    `INSERT OR REPLACE INTO theme_presets
      (id, name, kind, scopes_app, scopes_viewer, manifest_json, thumbnail_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      manifest.id,
      manifest.name,
      kind,
      manifest.scopes.app ? 1 : 0,
      manifest.scopes.viewer ? 1 : 0,
      JSON.stringify(manifest),
      existing?.thumbnailPath ?? null,
      existing?.createdAt ?? now,
      now,
    ],
  );
}

export async function deleteThemePreset(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM theme_presets WHERE id = ?', [id]);
}

export async function ensureBuiltinThemePresets(): Promise<void> {
  const db = await getDatabase();
  const rows = await db.select<{ count: number }>(
    "SELECT COUNT(*) as count FROM theme_presets WHERE kind = 'builtin'",
  );
  if (Number(rows[0]?.count ?? 0) > 0) return;

  const pack = createDefaultThemePack({ name: '默认主题', scopes: { app: true, viewer: true } });
  pack.id = 'builtin-default';
  await upsertThemePreset(pack, 'builtin');
}

export async function duplicateThemePreset(id: string, newName?: string): Promise<ReaderThemePackV1 | null> {
  const source = await getThemePreset(id);
  if (!source) return null;
  const copy = structuredClone(source.manifest);
  const { createThemePackId, touchThemePack } = await import('@/lib/theme/schema/theme-pack-v1');
  copy.id = createThemePackId();
  copy.name = newName ?? `${copy.name} 副本`;
  const touched = touchThemePack(copy);
  await upsertThemePreset(touched, 'user');
  return touched;
}
