import { describe, expect, it } from 'vitest';
import { weapiEncrypt } from '@/lib/media/audio/platform/api/weapi-crypto';

describe('weapi-crypto', () => {
  it('produces params and 256-char hex encSecKey', () => {
    const { params, encSecKey } = weapiEncrypt({ s: 'test', type: 1 });
    expect(params.length).toBeGreaterThan(10);
    expect(encSecKey).toMatch(/^[0-9a-f]{256}$/);
  });

  it('generates different encSecKey each call', () => {
    const a = weapiEncrypt({ id: 1 }).encSecKey;
    const b = weapiEncrypt({ id: 1 }).encSecKey;
    expect(a).not.toBe(b);
  });
});
