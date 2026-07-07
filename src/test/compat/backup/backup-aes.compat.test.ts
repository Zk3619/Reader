import { describe, expect, it } from 'vitest';
import {
  backupAesDecrypt,
  backupAesEncrypt,
  looksLikeBackupAesPayload,
} from '@/lib/backup/backup-aes';

describe('backup-aes', () => {
  it('encrypts and decrypts with password', () => {
    const plain = JSON.stringify([{ id: 1, name: 'test' }]);
    const encrypted = backupAesEncrypt(plain, 'my-secret');
    expect(encrypted).not.toBe(plain);
    expect(looksLikeBackupAesPayload(encrypted)).toBe(true);
    const decrypted = backupAesDecrypt(encrypted, 'my-secret');
    expect(decrypted).toBe(plain);
  });

  it('returns plain text when password empty', () => {
    const plain = '{"a":1}';
    expect(backupAesEncrypt(plain, '')).toBe(plain);
    expect(backupAesDecrypt(plain, '')).toBe(plain);
  });
});
