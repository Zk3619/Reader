import {
  MUSIC_SETTINGS_SCHEMA_VERSION,
  getMusicSettings,
  importMusicSettings,
} from '@/lib/media/audio/music-settings';
import {
  exportAudioLibrarySnapshot,
  importAudioLibrarySnapshot,
  type AudioLibrarySnapshot,
} from '@/lib/media/audio/sync/remote-snapshot';
import {
  dumpPersistDomains,
  importPersistDomains,
} from '@/lib/persistence/registry';
import { MUSIC_CONFIG_DOMAIN_ID } from '@/lib/persistence/domains/music-config';
import { MUSIC_SESSION_DOMAIN_ID } from '@/lib/persistence/domains/music-session';
import { MUSIC_UI_DOMAIN_ID } from '@/lib/persistence/domains/music-ui';
import { bootstrapPersistenceRegistry } from '@/lib/persistence';

export const MUSIC_BACKUP_VERSION = 1;

export interface MusicBackupPackage {
  kind: 'reader-music-backup';
  version: 1;
  settingsSchemaVersion: number;
  exportedAt: number;
  settings: ReturnType<typeof getMusicSettings>;
  sidecarStorage: Record<string, string>;
  /** 统一持久化域快照（music.session 等） */
  persistDomains?: Record<string, unknown>;
  snapshot: AudioLibrarySnapshot;
}

export interface MusicBackupImportResult {
  storageKeys: number;
  tracks: number;
  playlists: number;
  mode: 'merge' | 'overwrite';
}

export function isMusicSidecarStorageKey(key: string): boolean {
  return (
    key.startsWith('reader_music_') ||
    key.startsWith('reader_audio_') ||
    key.startsWith('reader_netease_pl_') ||
    key.startsWith('reader.music.') ||
    key.startsWith('reader.lx.sync.') ||
    key === 'reader_web_audio_gain'
  );
}

export function exportMusicSidecarStorage(): Record<string, string> {
  const values: Record<string, string> = {};
  if (typeof localStorage === 'undefined') return values;
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key || key === 'reader_music_settings' || !isMusicSidecarStorageKey(key)) continue;
    const value = localStorage.getItem(key);
    if (value != null) values[key] = value;
  }
  return values;
}

export async function createMusicBackup(): Promise<MusicBackupPackage> {
  bootstrapPersistenceRegistry();
  const persistDomains = await dumpPersistDomains([
    MUSIC_CONFIG_DOMAIN_ID,
    MUSIC_SESSION_DOMAIN_ID,
    MUSIC_UI_DOMAIN_ID,
  ]);
  return {
    kind: 'reader-music-backup',
    version: MUSIC_BACKUP_VERSION,
    settingsSchemaVersion: MUSIC_SETTINGS_SCHEMA_VERSION,
    exportedAt: Date.now(),
    settings: getMusicSettings(),
    sidecarStorage: exportMusicSidecarStorage(),
    persistDomains,
    snapshot: await exportAudioLibrarySnapshot(),
  };
}

export function parseMusicBackup(text: string): MusicBackupPackage {
  const value = JSON.parse(text) as Partial<MusicBackupPackage>;
  if (value.kind !== 'reader-music-backup') throw new Error('不是 Reader 音乐备份');
  if (value.version !== MUSIC_BACKUP_VERSION) throw new Error(`不支持的音乐备份版本：${value.version}`);
  if (
    typeof value.settingsSchemaVersion !== 'number' ||
    value.settingsSchemaVersion > MUSIC_SETTINGS_SCHEMA_VERSION
  ) {
    throw new Error('备份设置版本高于当前程序，无法安全导入');
  }
  if (!value.settings || !value.snapshot || value.snapshot.version !== 1) {
    throw new Error('音乐备份缺少设置或曲库数据');
  }
  return value as MusicBackupPackage;
}

export async function importMusicBackup(
  backup: MusicBackupPackage,
  mode: 'merge' | 'overwrite',
): Promise<MusicBackupImportResult> {
  bootstrapPersistenceRegistry();
  if (mode === 'overwrite' && typeof localStorage !== 'undefined') {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter((key): key is string => !!key && isMusicSidecarStorageKey(key));
    for (const key of keys) localStorage.removeItem(key);
  }
  importMusicSettings(JSON.stringify(backup.settings));
  for (const [key, value] of Object.entries(backup.sidecarStorage ?? {})) {
    if (isMusicSidecarStorageKey(key)) localStorage.setItem(key, value);
  }
  if (backup.persistDomains) {
    await importPersistDomains(backup.persistDomains);
  }
  await importAudioLibrarySnapshot(backup.snapshot, { merge: mode === 'merge' });
  return {
    storageKeys: Object.keys(backup.sidecarStorage ?? {}).length,
    tracks: backup.snapshot.tracks.length,
    playlists: backup.snapshot.playlists.length,
    mode,
  };
}
