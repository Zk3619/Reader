import { describe, expect, it } from 'vitest';
import {
  describeBiliQrStatus,
  parseBiliSetCookieHeader,
} from '@/lib/media/audio/platform/auth/bili-qr-login';

describe('bili-qr-login helpers', () => {
  it('parses joined Set-Cookie headers without treating Expires commas as separators', () => {
    const header =
      'SESSDATA=abc123; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT, bili_jct=csrfval; Path=/; Domain=.bilibili.com';
    const map = parseBiliSetCookieHeader(header);
    expect(map.SESSDATA).toBe('abc123');
    expect(map.bili_jct).toBe('csrfval');
  });

  it('removes cookies with Max-Age=0', () => {
    const header = 'SESSDATA=gone; Max-Age=0; Path=/';
    const map = parseBiliSetCookieHeader(header);
    expect(map.SESSDATA).toBeUndefined();
  });

  it('describes QR status codes', () => {
    expect(describeBiliQrStatus(86101)).toContain('扫码');
    expect(describeBiliQrStatus(86090)).toContain('确认');
    expect(describeBiliQrStatus(0)).toContain('成功');
    expect(describeBiliQrStatus(86038)).toContain('过期');
  });
});
