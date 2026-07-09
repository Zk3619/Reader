/**
 * 用户主题预设 JSON 持久化 — {appData}/Themes/{id}.json
 */

import { join } from '@tauri-apps/api/path';
import { getAppDataDir } from '@/lib/platform/app-data-dir';
import { isTauri } from '@/lib/platform/detect';
import { fileExists } from '@/lib/platform/filesystem';
import type {
  ReaderThemePackV1,
  ThemePresetKind,
  ThemePresetRecord,
} from '@/lib/theme/schema/theme-pack-v1';
import { parseThemePackJson } from '@/lib/theme/schema/validate-theme-pack';

export const BUILTIN_DEFAULT_PRESET_ID = 'builtin-default';
export const THEMES_DIR_NAME = 'Themes';
const OPFS_PRESETS_DIR = 'reader-theme-presets';

let opfsPresetsRoot: FileSystemDirectoryHandle | null = null;

async function getOpfsPresetsRoot(): Promise<FileSystemDirectoryHandle> {
  if (!opfsPresetsRoot) {
    const root = await navigator.storage.getDirectory();
    opfsPresetsRoot = await root.getDirectoryHandle(OPFS_PRESETS_DIR, { create: true });
  }
  return opfsPresetsRoot;
}

async function getThemesDir(): Promise<string> {
  const appDir = await getAppDataDir();
  const dir = await join(appDir, THEMES_DIR_NAME);
  if (!(await fileExists(dir))) {
    const { mkdir } = await import('@tauri-apps/plugin-fs');
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

function presetFileName(id: string): string {
  return `${id}.json`;
}

function recordFromManifest(
  manifest: ReaderThemePackV1,
  kind: ThemePresetKind,
  meta?: { createdAt?: number; updatedAt?: number },
): ThemePresetRecord {
  const now = Date.now();
  return {
    id: manifest.id,
    name: manifest.name,
    kind,
    scopesApp: manifest.scopes.app !== false,
    scopesViewer: manifest.scopes.viewer !== false,
    manifest,
    thumbnailPath: null,
    createdAt: meta?.createdAt ?? now,
    updatedAt: meta?.updatedAt ?? now,
  };
}

async function iterateDirEntries(
  dir: FileSystemDirectoryHandle,
): Promise<Array<[string, FileSystemHandle]>> {
  const handle = dir as FileSystemDirectoryHandle & {
    entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
  };
  if (!handle.entries) return [];
  const out: Array<[string, FileSystemHandle]> = [];
  for await (const entry of handle.entries()) out.push(entry);
  return out;
}

export async function readThemePresetFile(id: string): Promise<ThemePresetRecord | null> {
  if (id === BUILTIN_DEFAULT_PRESET_ID) return null;
  try {
    if (isTauri()) {
      const dir = await getThemesDir();
      const filePath = await join(dir, presetFileName(id));
      if (!(await fileExists(filePath))) return null;
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const text = await readTextFile(filePath);
      const parsed = parseThemePackJson(text);
      if (!parsed.ok || !parsed.pack) return null;
      let meta: { createdAt?: number; updatedAt?: number } = {};
      try {
        const raw = JSON.parse(text) as { _meta?: { createdAt?: number; updatedAt?: number; kind?: ThemePresetKind } };
        meta = raw._meta ?? {};
        return recordFromManifest(parsed.pack, raw._meta?.kind ?? 'user', meta);
      } catch {
        return recordFromManifest(parsed.pack, 'user', meta);
      }
    }
    const root = await getOpfsPresetsRoot();
    const handle = await root.getFileHandle(presetFileName(id));
    const file = await handle.getFile();
    const text = await file.text();
    const parsed = parseThemePackJson(text);
    if (!parsed.ok || !parsed.pack) return null;
    const raw = JSON.parse(text) as { _meta?: { createdAt?: number; updatedAt?: number; kind?: ThemePresetKind } };
    return recordFromManifest(parsed.pack, raw._meta?.kind ?? 'user', raw._meta);
  } catch {
    return null;
  }
}

export async function writeThemePresetFile(
  manifest: ReaderThemePackV1,
  kind: ThemePresetKind,
  existing?: ThemePresetRecord | null,
): Promise<void> {
  if (manifest.id === BUILTIN_DEFAULT_PRESET_ID) {
    throw new Error('内置默认主题不可写入文件');
  }
  const now = Date.now();
  const payload = {
    _meta: {
      kind,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    },
    ...manifest,
  };
  const text = JSON.stringify(payload, null, 2);

  if (isTauri()) {
    const dir = await getThemesDir();
    const filePath = await join(dir, presetFileName(manifest.id));
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(filePath, text);
    return;
  }

  const root = await getOpfsPresetsRoot();
  const handle = await root.getFileHandle(presetFileName(manifest.id), { create: true });
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

export async function listThemePresetFiles(): Promise<ThemePresetRecord[]> {
  const records: ThemePresetRecord[] = [];

  if (isTauri()) {
    const dir = await getThemesDir();
    const { readDir } = await import('@tauri-apps/plugin-fs');
    const entries = await readDir(dir);
    for (const entry of entries) {
      if (!entry.name?.endsWith('.json')) continue;
      const id = entry.name.replace(/\.json$/i, '');
      const record = await readThemePresetFile(id);
      if (record) records.push(record);
    }
    return records.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  const root = await getOpfsPresetsRoot();
  for (const [name, handle] of await iterateDirEntries(root)) {
    if (handle.kind !== 'file' || !name.endsWith('.json')) continue;
    const id = name.replace(/\.json$/i, '');
    const record = await readThemePresetFile(id);
    if (record) records.push(record);
  }
  return records.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteThemePresetFile(id: string): Promise<void> {
  if (id === BUILTIN_DEFAULT_PRESET_ID) return;
  if (isTauri()) {
    const dir = await getThemesDir();
    const filePath = await join(dir, presetFileName(id));
    if (await fileExists(filePath)) {
      const { remove } = await import('@tauri-apps/plugin-fs');
      await remove(filePath);
    }
    return;
  }
  try {
    const root = await getOpfsPresetsRoot();
    await root.removeEntry(presetFileName(id));
  } catch {
    /* ignore */
  }
}
