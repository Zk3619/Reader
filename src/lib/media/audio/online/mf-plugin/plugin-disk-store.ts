/**
 * MusicFree 插件脚本落盘（对齐 Desktop userData/musicfree-plugins）
 * - Tauri：Media/Audio/musicfree-plugins/{id}.js
 * - Web：OPFS reader-mf-plugins/{id}.js
 * - 索引：localStorage（不含 script 正文）
 */

import { isTauri } from '@/lib/platform/detect';
import type { MfPluginMethodName, MfCacheControl, MfSupportMediaType } from '@/lib/media/audio/online/mf-plugin/types';
import type { MfUserVariable } from '@/lib/media/audio/online/mf-plugin/types';

export const MF_PLUGIN_INDEX_KEY = 'reader_audio_mf_plugins_index';
/** 旧版：整包含 script 的 localStorage */
export const MF_PLUGIN_LEGACY_STORAGE_KEY = 'reader_audio_mf_plugins';
export const OPFS_MF_PLUGINS_ROOT = 'reader-mf-plugins';
export const MF_PLUGIN_DISK_SUBDIR = 'musicfree-plugins';

export type MfPluginIndexRecord = {
  id: string;
  name: string;
  version?: string;
  author?: string;
  description?: string;
  srcUrl?: string;
  hash: string;
  enabled: boolean;
  order: number;
  supportedMethods: MfPluginMethodName[];
  primaryKey?: string[];
  userVariableDefs?: MfUserVariable[];
  supportedSearchType?: MfSupportMediaType[];
  cacheControl?: MfCacheControl;
  createdAt: number;
  updatedAt: number;
  builtin?: boolean;
};

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'plugin';
}

export function readMfPluginIndexSync(): MfPluginIndexRecord[] {
  try {
    const raw = localStorage.getItem(MF_PLUGIN_INDEX_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as MfPluginIndexRecord[];
    return Array.isArray(list) ? list.filter((p) => p?.id && p.hash) : [];
  } catch {
    return [];
  }
}

export function writeMfPluginIndexSync(list: MfPluginIndexRecord[]): void {
  try {
    localStorage.setItem(MF_PLUGIN_INDEX_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function readLegacyMfPluginsSync(): Array<MfPluginIndexRecord & { script?: string }> {
  try {
    const raw = localStorage.getItem(MF_PLUGIN_LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as Array<MfPluginIndexRecord & { script?: string }>;
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function clearLegacyMfPluginsSync(): void {
  try {
    localStorage.removeItem(MF_PLUGIN_LEGACY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

async function tauriPluginDir(): Promise<string> {
  const { resolveModuleMediaRoot, ensureDirectory } = await import('@/lib/media/media-root');
  const { join } = await import('@tauri-apps/api/path');
  const root = await resolveModuleMediaRoot('music');
  const dir = await join(root, MF_PLUGIN_DISK_SUBDIR);
  await ensureDirectory(dir);
  return dir;
}

async function tauriScriptPath(id: string): Promise<string> {
  const { join } = await import('@tauri-apps/api/path');
  const dir = await tauriPluginDir();
  return join(dir, `${sanitizeId(id)}.js`);
}

async function getOpfsRoot(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_MF_PLUGINS_ROOT, { create: true });
}

export async function writeMfPluginScript(id: string, script: string): Promise<void> {
  if (!script) return;
  const safe = sanitizeId(id);
  if (isTauri()) {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await tauriScriptPath(safe);
    await writeTextFile(path, script);
    return;
  }
  const dir = await getOpfsRoot();
  const handle = await dir.getFileHandle(`${safe}.js`, { create: true });
  const writable = await handle.createWritable();
  await writable.write(script);
  await writable.close();
}

export async function readMfPluginScript(id: string): Promise<string | null> {
  const safe = sanitizeId(id);
  try {
    if (isTauri()) {
      const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
      const path = await tauriScriptPath(safe);
      if (!(await exists(path))) return null;
      return await readTextFile(path);
    }
    const dir = await getOpfsRoot();
    const handle = await dir.getFileHandle(`${safe}.js`);
    const file = await handle.getFile();
    return await file.text();
  } catch {
    return null;
  }
}

export async function removeMfPluginScript(id: string): Promise<void> {
  const safe = sanitizeId(id);
  try {
    if (isTauri()) {
      const { remove, exists } = await import('@tauri-apps/plugin-fs');
      const path = await tauriScriptPath(safe);
      if (await exists(path)) await remove(path);
      return;
    }
    const dir = await getOpfsRoot();
    await dir.removeEntry(`${safe}.js`);
  } catch {
    // ignore
  }
}
