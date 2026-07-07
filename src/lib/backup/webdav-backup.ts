/**
 * WebDAV 云备份（对齐 Legado AppWebDav）
 */

import { WebDavClient, type WebDavFileInfo } from '@/lib/remote-book/webdav-client';
import { isRemoteBackupFileName, formatLegadoStyleBackupFileName } from '@/lib/backup/backup-filename';
import {
  buildRootWebDavUrl,
  loadWebDavConfig,
  saveWebDavConfig,
  touchWebDavBackupMeta,
} from '@/lib/remote-book/webdav-config-storage';

import { createReaderBackupZip } from '@/lib/database/reader-backup';
import { restoreBackupFromBytes } from '@/lib/web-api/restore-backup';
import {
  uploadBackgroundImagesToWebDav,
  downloadBackgroundImagesFromWebDav,
} from '@/lib/backup/background-backup';
import { downloadAllBookProgressFromWebDav } from '@/lib/backup/webdav-book-progress';
import type { WebDavConfig } from '@/types/remote-book';

export interface RemoteBackupEntry {
  name: string;
  size: number;
  lastModify: number;
}

const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

function createClient(config: WebDavConfig): WebDavClient {
  const rootUrl = buildRootWebDavUrl(config);
  return new WebDavClient(rootUrl, config.username, config.password);
}

function sortBackupNames(files: WebDavFileInfo[]): RemoteBackupEntry[] {
  return files
    .filter((f) => !f.isDir && isRemoteBackupFileName(f.displayName))
    .map((f) => ({
      name: f.displayName,
      size: f.size,
      lastModify: f.lastModify,
    }))
    .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
}

export async function testWebDavConnection(config: WebDavConfig): Promise<void> {
  const client = createClient(config);
  await client.checkConnection();
  await client.ensureDirectories([
    config.rootBookPath || 'books',
    'bookProgress',
    'background',
  ]);
}

export async function listRemoteBackups(config?: WebDavConfig | null): Promise<RemoteBackupEntry[]> {
  const resolved = config ?? (await loadWebDavConfig());
  if (!resolved) throw new Error('请先配置 WebDAV');
  const client = createClient(resolved);
  const files = await client.listFiles('');
  return sortBackupNames(files);
}

export async function getLatestRemoteBackup(
  config?: WebDavConfig | null,
): Promise<RemoteBackupEntry | null> {
  const list = await listRemoteBackups(config);
  if (list.length === 0) return null;
  return list.reduce((latest, item) =>
    item.lastModify > latest.lastModify ? item : latest,
  );
}

export async function uploadReaderBackupToWebDav(options?: {
  config?: WebDavConfig;
  fileName?: string;
}): Promise<{ fileName: string; size: number }> {
  const config = options?.config ?? (await loadWebDavConfig());
  if (!config) throw new Error('请先配置 WebDAV');

  const { blob, filename } = await createReaderBackupZip();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const fileName =
    options?.fileName ?? formatLegadoStyleBackupFileName(config.deviceName) ?? filename;

  const client = createClient(config);
  await client.ensureDirectories([
    config.rootBookPath || 'books',
    'bookProgress',
    'background',
  ]);
  await client.uploadFile(fileName, bytes);

  try {
    await uploadBackgroundImagesToWebDav();
  } catch (error) {
    console.warn('[webdav-backup] background upload failed', error);
  }

  await touchWebDavBackupMeta({
    lastBackupTime: Date.now(),
    lastRemoteBackupName: fileName,
  });

  return { fileName, size: bytes.byteLength };
}

export async function downloadRemoteBackup(
  fileName: string,
  config?: WebDavConfig,
): Promise<Uint8Array> {
  const resolved = config ?? (await loadWebDavConfig());
  if (!resolved) throw new Error('请先配置 WebDAV');
  const client = createClient(resolved);
  const buffer = await client.downloadFile(fileName);
  return new Uint8Array(buffer);
}

export async function restoreReaderBackupFromWebDav(
  fileName: string,
  config?: WebDavConfig,
): Promise<{ summary: string[]; reloadRecommended: boolean }> {
  const bytes = await downloadRemoteBackup(fileName, config);
  const summary = await restoreBackupFromBytes(fileName, bytes, true);
  return {
    summary,
    reloadRecommended: summary.some((s) => s.includes('全量恢复')),
  };
}

export async function maybeAutoBackupToWebDav(): Promise<string | null> {
  const config = await loadWebDavConfig();
  if (!config?.autoBackupEnabled) return null;

  const now = Date.now();
  const last = config.lastBackupTime ?? 0;
  if (now - last < AUTO_BACKUP_INTERVAL_MS) return null;

  const todayName = formatLegadoStyleBackupFileName(config.deviceName);
  try {
    const existing = await listRemoteBackups(config);
    if (existing.some((item) => item.name === todayName)) {
      await saveWebDavConfig({ ...config, lastBackupTime: now, lastRemoteBackupName: todayName });
      return null;
    }
    const result = await uploadReaderBackupToWebDav({ config, fileName: todayName });
    return result.fileName;
  } catch (error) {
    console.warn('[webdav-backup] auto backup failed', error);
    return null;
  }
}

export async function findNewerRemoteBackup(): Promise<RemoteBackupEntry | null> {
  const config = await loadWebDavConfig();
  if (!config?.autoCheckNewBackup) return null;

  const latest = await getLatestRemoteBackup(config);
  if (!latest) return null;

  const localTime = config.lastBackupTime ?? 0;
  if (latest.lastModify > localTime + 60_000) return latest;
  return null;
}

export async function saveWebDavConfigAndInit(config: WebDavConfig): Promise<WebDavConfig> {
  const saved = await saveWebDavConfig(config);
  await testWebDavConnection(saved);
  return saved;
}

/** 同步阅读进度与背景图（打开设置页时可调用） */
export async function syncWebDavAssets(): Promise<{
  progressUpdated: number;
  bgUploaded: number;
  bgDownloaded: number;
}> {
  const [progressUpdated, bgUploaded, bgDownloaded] = await Promise.all([
    downloadAllBookProgressFromWebDav(),
    uploadBackgroundImagesToWebDav(),
    downloadBackgroundImagesFromWebDav(),
  ]);
  return { progressUpdated, bgUploaded, bgDownloaded };
}
