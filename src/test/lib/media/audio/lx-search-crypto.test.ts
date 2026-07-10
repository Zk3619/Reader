import { describe, expect, it } from 'vitest';
import { eapiEncrypt } from '@/lib/media/audio/platform/api/eapi-crypto';
import { zzcSign } from '@/lib/media/audio/platform/api/tx-sign';

describe('eapi-crypto', () => {
  it('produces uppercase hex params', () => {
    const { params } = eapiEncrypt('/api/search/song/list/page', {
      keyword: 'test',
      limit: 10,
    });
    expect(params.length).toBeGreaterThan(32);
    expect(params).toMatch(/^[0-9A-F]+$/);
  });
});

describe('tx-sign', () => {
  it('produces zzc-prefixed lowercase sign', () => {
    const sign = zzcSign('{"comm":{},"req":{}}');
    expect(sign.startsWith('zzc')).toBe(true);
    expect(sign).toBe(sign.toLowerCase());
  });

  it('is deterministic for same input', () => {
    const payload = '{"a":1}';
    expect(zzcSign(payload)).toBe(zzcSign(payload));
  });
});
