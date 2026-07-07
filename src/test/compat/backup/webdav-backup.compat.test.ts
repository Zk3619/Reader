import { describe, expect, it } from 'vitest';
import {
  formatLegadoStyleBackupFileName,
  isRemoteBackupFileName,
} from '@/lib/backup/backup-filename';
import { buildRootWebDavUrl } from '@/lib/remote-book/webdav-config-storage';

describe('backup filename', () => {
  it('formats legado style backup name', () => {
    const name = formatLegadoStyleBackupFileName('My Device');
    expect(name).toMatch(/^backup\d{4}-\d{2}-\d{2}-My-Device\.zip$/);
  });

  it('detects remote backup file names', () => {
    expect(isRemoteBackupFileName('backup2026-07-07-Reader.zip')).toBe(true);
    expect(isRemoteBackupFileName('reader-backup-2026.zip')).toBe(true);
    expect(isRemoteBackupFileName('books.zip')).toBe(false);
  });
});

describe('webdav config url', () => {
  it('builds root url with sub directory', () => {
    const url = buildRootWebDavUrl({
      url: 'https://dav.example.com/dav',
      username: 'u',
      password: 'p',
      webDavDir: 'legado',
    });
    expect(url).toBe('https://dav.example.com/dav/legado/');
  });
});
