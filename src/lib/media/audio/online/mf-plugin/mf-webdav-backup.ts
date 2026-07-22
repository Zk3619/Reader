/**
 * MusicFree 风格 WebDAV 备份（歌单 + 插件 srcUrl/version）
 * 对齐 MusicFree backup.ts 形态，复用 Reader WebDAV 客户端
 */

import { WebDavClient } from '@/lib/remote-book/webdav-client';
import { buildRootWebDavUrl, loadWebDavConfig } from '@/lib/remote-book/webdav-config-storage';
import { listMfPlugins } from '@/lib/media/audio/online/mf-plugin';
import {
  exportAudioLibrarySnapshot,
  importAudioLibrarySnapshot,
  type AudioLibrarySnapshot,
} from '@/lib/media/audio/sync/remote-snapshot';

const MF_BACKUP_PATH = 'music/sync/musicfree_backup.json';

export interface MfWebDavBackupPackage {
  version: 1;
  exportedAt: number;
  /** 对齐 MusicFree：插件列表仅保留 srcUrl + version */
  plugins: Array<{ srcUrl?: string; version?: string; name: string; id: string }>;
  snapshot: AudioLibrarySnapshot;
}

export async function exportMfWebDavBackup(): Promise<MfWebDavBackupPackage> {
  const plugins = listMfPlugins().map((p) => ({
    id: p.id,
    name: p.name,
    srcUrl: p.srcUrl,
    version: p.version,
  }));
  return {
    version: 1,
    exportedAt: Date.now(),
    plugins,
    snapshot: await exportAudioLibrarySnapshot(),
  };
}

export function serializeMfWebDavBackup(pkg: MfWebDavBackupPackage): string {
  return JSON.stringify(pkg, null, 2);
}

export function parseMfWebDavBackup(json: string): MfWebDavBackupPackage {
  const data = JSON.parse(json) as MfWebDavBackupPackage;
  if (data.version !== 1) throw new Error('不支持的 MusicFree 备份版本');
  return data;
}

async function createWebDavClient(): Promise<WebDavClient> {
  const config = await loadWebDavConfig();
  if (!config?.url) throw new Error('未配置 WebDAV');
  return new WebDavClient(
    buildRootWebDavUrl(config),
    config.username ?? '',
    config.password ?? '',
  );
}

export async function uploadMfBackupToWebDav(pkg?: MfWebDavBackupPackage): Promise<void> {
  const client = await createWebDavClient();
  const body = serializeMfWebDavBackup(pkg ?? (await exportMfWebDavBackup()));
  await client.ensureDirectories(['music', 'music/sync']);
  await client.uploadFile(MF_BACKUP_PATH, new TextEncoder().encode(body));
}

export async function downloadMfBackupFromWebDav(): Promise<MfWebDavBackupPackage | null> {
  const client = await createWebDavClient();
  try {
    const buf = await client.downloadFile(MF_BACKUP_PATH);
    return parseMfWebDavBackup(new TextDecoder().decode(buf));
  } catch {
    return null;
  }
}

export async function restoreMfBackupFromWebDav(options?: {
  merge?: boolean;
  reinstallPlugins?: boolean;
}): Promise<{ pluginHints: number; tracks: number }> {
  const remote = await downloadMfBackupFromWebDav();
  if (!remote) throw new Error('WebDAV 上无 MusicFree 备份');
  await importAudioLibrarySnapshot(remote.snapshot, { merge: options?.merge !== false });
  let pluginHints = 0;
  if (options?.reinstallPlugins !== false && Array.isArray(remote.plugins)) {
    const { importMfPluginFromUrl } = await import('@/lib/media/audio/online/mf-plugin');
    for (const hint of remote.plugins) {
      if (!hint.srcUrl?.trim()) continue;
      try {
        const result = await importMfPluginFromUrl(hint.srcUrl);
        if (result.ok) pluginHints += 1;
      } catch {
        // skip single plugin
      }
    }
  }
  return {
    pluginHints,
    tracks: remote.snapshot.tracks.length,
  };
}
