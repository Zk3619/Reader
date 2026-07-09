/**
 * 主题预设 CRUD — 内置默认走 SQLite，用户/导入预设走 {appData}/Themes/*.json
 */

import { getDatabase } from '@/lib/database/database-core';
import { deleteThemePresetAssets } from '@/lib/theme/theme-asset-storage';
import {
  BUILTIN_DEFAULT_PRESET_ID,
  deleteThemePresetFile,
  listThemePresetFiles,
  readThemePresetFile,
  writeThemePresetFile,
} from '@/lib/theme/theme-preset-file-storage';
import { emitThemePresetsChanged } from '@/lib/theme/theme-preset-events';
import {
  createDefaultThemePack,
  type ReaderThemePackV1,
  type ThemePresetKind,
  type ThemePresetRecord,
} from '@/lib/theme/schema/theme-pack-v1';
import { parseThemePackJson } from '@/lib/theme/schema/validate-theme-pack';
import { settingsStore } from '@/stores/settings';

function mapSqliteRow(row: Record<string, unknown>): ThemePresetRecord {
  const manifest = parseThemePackJson(JSON.parse(String(row.manifest_json ?? '{}'))).pack;
  if (!manifest) {
    throw new Error(`Invalid theme preset manifest: ${row.id}`);
  }
  return {
    id: String(row.id),
    name: String(row.name),
    kind: (row.kind as ThemePresetKind) ?? 'builtin',
    scopesApp: Number(row.scopes_app ?? 1) === 1,
    scopesViewer: Number(row.scopes_viewer ?? 1) === 1,
    manifest,
    thumbnailPath: row.thumbnail_path != null ? String(row.thumbnail_path) : null,
    createdAt: Number(row.created_at ?? Date.now()),
    updatedAt: Number(row.updated_at ?? Date.now()),
  };
}

async function getBuiltinThemePreset(): Promise<ThemePresetRecord | null> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    'SELECT * FROM theme_presets WHERE id = ?',
    [BUILTIN_DEFAULT_PRESET_ID],
  );
  return rows[0] ? mapSqliteRow(rows[0]) : null;
}

/** 将 SQLite 中的用户预设迁移到 Themes 目录（一次性） */
async function migrateUserPresetsToFiles(): Promise<void> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>>(
    "SELECT * FROM theme_presets WHERE kind != 'builtin'",
  );
  for (const row of rows) {
    try {
      const record = mapSqliteRow(row);
      const existing = await readThemePresetFile(record.id);
      if (!existing) {
        await writeThemePresetFile(record.manifest, record.kind, record);
      }
      await db.execute('DELETE FROM theme_presets WHERE id = ?', [record.id]);
    } catch (error) {
      console.warn('迁移主题预设失败:', row.id, error);
    }
  }
}

export async function listThemePresets(): Promise<ThemePresetRecord[]> {
  await migrateUserPresetsToFiles();
  const builtin = await getBuiltinThemePreset();
  const files = await listThemePresetFiles();
  const merged = [...(builtin ? [builtin] : []), ...files];
  return merged.sort((a, b) => {
    if (a.kind === 'builtin') return -1;
    if (b.kind === 'builtin') return 1;
    return b.updatedAt - a.updatedAt;
  });
}

export async function getThemePreset(id: string): Promise<ThemePresetRecord | null> {
  if (id === BUILTIN_DEFAULT_PRESET_ID) {
    return getBuiltinThemePreset();
  }
  return readThemePresetFile(id);
}

export async function upsertThemePreset(
  manifest: ReaderThemePackV1,
  kind: ThemePresetKind = 'user',
): Promise<void> {
  if (manifest.id === BUILTIN_DEFAULT_PRESET_ID || kind === 'builtin') {
    const db = await getDatabase();
    const now = Date.now();
    const existing = await getBuiltinThemePreset();
    await db.execute(
      `INSERT OR REPLACE INTO theme_presets
        (id, name, kind, scopes_app, scopes_viewer, manifest_json, thumbnail_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        manifest.id,
        manifest.name,
        'builtin',
        manifest.scopes.app ? 1 : 0,
        manifest.scopes.viewer ? 1 : 0,
        JSON.stringify(manifest),
        existing?.thumbnailPath ?? null,
        existing?.createdAt ?? now,
        now,
      ],
    );
    emitThemePresetsChanged();
    return;
  }

  const existing = await readThemePresetFile(manifest.id);
  await writeThemePresetFile(manifest, kind, existing);
  emitThemePresetsChanged();
}

export async function deleteThemePreset(id: string): Promise<void> {
  if (id === BUILTIN_DEFAULT_PRESET_ID) return;

  await deleteThemePresetFile(id);
  await deleteThemePresetAssets(id);

  const { applyActiveThemePackToDocument } = await import('@/lib/theme/theme-runtime');
  const { publishActiveThemePack, publishActiveViewerThemePack } = await import(
    '@/stores/theme-active-pack'
  );
  const builtin = await getBuiltinThemePreset();

  if (settingsStore.state.app.activeThemePresetId === id) {
    settingsStore.setActiveThemePresetId(BUILTIN_DEFAULT_PRESET_ID);
    if (builtin?.manifest.scopes.app) {
      applyActiveThemePackToDocument(builtin.manifest);
      publishActiveThemePack(builtin.manifest);
    }
  }
  if (settingsStore.state.app.activeViewerThemePresetId === id) {
    await settingsStore.setActiveViewerThemePresetId(BUILTIN_DEFAULT_PRESET_ID);
    if (builtin?.manifest.scopes.viewer) {
      publishActiveViewerThemePack(builtin.manifest);
    }
  }

  emitThemePresetsChanged();
}

export async function ensureBuiltinThemePresets(): Promise<void> {
  const db = await getDatabase();
  const rows = await db.select<{ count: number }>(
    "SELECT COUNT(*) as count FROM theme_presets WHERE id = ?",
    [BUILTIN_DEFAULT_PRESET_ID],
  );
  if (Number(rows[0]?.count ?? 0) > 0) {
    await migrateUserPresetsToFiles();
    return;
  }

  const pack = createDefaultThemePack({ name: '默认主题', scopes: { app: true, viewer: true } });
  pack.id = BUILTIN_DEFAULT_PRESET_ID;
  await upsertThemePreset(pack, 'builtin');
  await migrateUserPresetsToFiles();
}

export async function createThemePreset(options?: {
  name?: string;
  basedOnId?: string;
}): Promise<ReaderThemePackV1> {
  const { createThemePackId, touchThemePack, createDefaultThemePack } = await import(
    '@/lib/theme/schema/theme-pack-v1'
  );
  const name = options?.name?.trim() || '未命名主题';
  let pack: ReaderThemePackV1;
  if (options?.basedOnId) {
    const base = await getThemePreset(options.basedOnId);
    if (!base) {
      pack = createDefaultThemePack({ name });
    } else {
      pack = structuredClone(base.manifest);
      pack.id = createThemePackId();
      pack.name = name;
    }
  } else {
    pack = createDefaultThemePack({ name });
  }
  const touched = touchThemePack(pack);
  await upsertThemePreset(touched, 'user');
  return touched;
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

export async function renameThemePreset(id: string, name: string): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed || id === BUILTIN_DEFAULT_PRESET_ID) return false;
  const record = await getThemePreset(id);
  if (!record || record.kind === 'builtin') return false;
  const next = { ...record.manifest, name: trimmed };
  await upsertThemePreset(next, record.kind);
  return true;
}

export async function ensureDefaultThemePresetActive(): Promise<ThemePresetRecord | null> {
  const builtin = await getBuiltinThemePreset();
  if (!builtin) return null;

  const { applyActiveThemePackToDocument } = await import('@/lib/theme/theme-runtime');
  const { publishActiveThemePack, publishActiveViewerThemePack } = await import(
    '@/stores/theme-active-pack'
  );

  let changed = false;

  const appId = settingsStore.state.app.activeThemePresetId;
  const viewerId = settingsStore.state.app.activeViewerThemePresetId;

  const appMissing = !appId || (appId !== BUILTIN_DEFAULT_PRESET_ID && !(await getThemePreset(appId)));
  const viewerMissing =
    !viewerId || (viewerId !== BUILTIN_DEFAULT_PRESET_ID && !(await getThemePreset(viewerId)));

  if (appMissing) {
    settingsStore.setActiveThemePresetId(BUILTIN_DEFAULT_PRESET_ID);
    if (builtin.manifest.scopes.app) {
      applyActiveThemePackToDocument(builtin.manifest);
      publishActiveThemePack(builtin.manifest);
    }
    changed = true;
  }
  if (viewerMissing) {
    await settingsStore.setActiveViewerThemePresetId(BUILTIN_DEFAULT_PRESET_ID);
    if (builtin.manifest.scopes.viewer) {
      publishActiveViewerThemePack(builtin.manifest);
    }
    changed = true;
  }

  if (changed) emitThemePresetsChanged();
  return builtin;
}

export { BUILTIN_DEFAULT_PRESET_ID };
