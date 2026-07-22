/**
 * MusicFree 风格 WebDAV 备份（歌单 + 插件清单 + 关联歌词）
 */

import {
  exportMfWebDavBackup,
  downloadMfBackupFromWebDav,
  uploadMfBackupToWebDav,
  type MfWebDavBackupPackage,
} from '@/lib/media/audio/online/mf-plugin/mf-webdav-backup';
import { importAudioLibrarySnapshot } from '@/lib/media/audio/sync/remote-snapshot';
import { exportLinkLyricStore, importLinkLyricStore } from '@/lib/media/audio/link-lyric';
import { getMfGlobalSettings } from '@/lib/media/audio/online/mf-plugin/global-settings';
import { importMfPluginFromUrl } from '@/lib/media/audio/online/mf-plugin';

const MF_BACKUP_PATH = 'music/sync/musicfree_backup.json';

export type MusicFreeStyleBackup = MfWebDavBackupPackage & {
  linkLyrics?: Record<string, unknown>;
};

export async function exportMusicFreeStyleBackup(): Promise<MusicFreeStyleBackup> {
  const base = await exportMfWebDavBackup();
  return {
    ...base,
    linkLyrics: exportLinkLyricStore(),
  };
}

async function restoreBackupPackage(
  backup: MusicFreeStyleBackup,
  options?: { merge?: boolean; reinstallPlugins?: boolean },
): Promise<void> {
  const merge = options?.merge !== false;
  await importAudioLibrarySnapshot(backup.snapshot, { merge });
  if (backup.linkLyrics) {
    importLinkLyricStore(backup.linkLyrics as never, merge);
  }
  if (options?.reinstallPlugins !== false && Array.isArray(backup.plugins)) {
    for (const hint of backup.plugins) {
      if (!hint.srcUrl?.trim()) continue;
      try {
        await importMfPluginFromUrl(hint.srcUrl);
      } catch {
        // skip
      }
    }
  }
}

export async function importMusicFreeStyleBackup(
  backup: MusicFreeStyleBackup,
  options?: { merge?: boolean; reinstallPlugins?: boolean },
): Promise<void> {
  const settings = getMfGlobalSettings();
  await restoreBackupPackage(backup, {
    merge: options?.merge ?? settings.webdavRestoreMode === 'merge',
    reinstallPlugins: options?.reinstallPlugins ?? settings.webdavReinstallPlugins,
  });
}

export async function uploadMusicFreeBackupToWebDav(): Promise<void> {
  const backup = await exportMusicFreeStyleBackup();
  const { WebDavClient } = await import('@/lib/remote-book/webdav-client');
  const { buildRootWebDavUrl, loadWebDavConfig } = await import(
    '@/lib/remote-book/webdav-config-storage'
  );
  const config = await loadWebDavConfig();
  if (!config?.url) throw new Error('未配置 WebDAV');
  const client = new WebDavClient(
    buildRootWebDavUrl(config),
    config.username ?? '',
    config.password ?? '',
  );
  await client.ensureDirectories(['music', 'music/sync']);
  await client.uploadFile(
    MF_BACKUP_PATH,
    new TextEncoder().encode(JSON.stringify(backup, null, 2)),
  );
}

export async function downloadMusicFreeBackupFromWebDav(): Promise<MusicFreeStyleBackup | null> {
  const pkg = await downloadMfBackupFromWebDav();
  if (!pkg) return null;
  try {
    const { WebDavClient } = await import('@/lib/remote-book/webdav-client');
    const { buildRootWebDavUrl, loadWebDavConfig } = await import(
      '@/lib/remote-book/webdav-config-storage'
    );
    const config = await loadWebDavConfig();
    if (config?.url) {
      const client = new WebDavClient(
        buildRootWebDavUrl(config),
        config.username ?? '',
        config.password ?? '',
      );
      const buf = await client.downloadFile(MF_BACKUP_PATH);
      const parsed = JSON.parse(new TextDecoder().decode(buf)) as MusicFreeStyleBackup;
      return parsed;
    }
  } catch {
    // fallback pkg only
  }
  return pkg;
}

export async function syncMusicFreeBackupViaWebDav(
  direction: 'upload' | 'download' | 'merge' | 'overwrite' = 'merge',
): Promise<void> {
  if (direction === 'upload') {
    await uploadMusicFreeBackupToWebDav();
    return;
  }
  const remote = await downloadMusicFreeBackupFromWebDav();
  if (!remote) throw new Error('WebDAV 上无 MusicFree 备份');
  const settings = getMfGlobalSettings();
  await restoreBackupPackage(remote, {
    merge: direction === 'merge',
    reinstallPlugins: settings.webdavReinstallPlugins,
  });
}

export { uploadMfBackupToWebDav };
