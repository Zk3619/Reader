import { describe, expect, it } from 'vitest';
import {
  buildNeteaseScanLoginUrl,
  describeNeteaseQrStatus,
  parseNeteaseSetCookieHeader,
} from '@/lib/media/audio/platform/auth/netease-qr-login';

describe('netease-qr-login helpers', () => {
  it('builds scanlogin URL with codekey and chainId', () => {
    const url = buildNeteaseScanLoginUrl('KEY123', 'v1_device_web_login_1');
    expect(url).toContain('https://music.163.com/st/platform/scanlogin');
    expect(url).toContain('codekey=KEY123');
    expect(url).toContain('chainId=v1_device_web_login_1');
    expect(url).toContain('hdw_device=web');
  });

  it('parses joined Set-Cookie headers without treating Expires commas as separators', () => {
    const header =
      'MUSIC_U=abc123; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT, __csrf=csrfval; Path=/; Domain=.music.163.com';
    const map = parseNeteaseSetCookieHeader(header);
    expect(map.MUSIC_U).toBe('abc123');
    expect(map.__csrf).toBe('csrfval');
  });

  it('describes QR status codes', () => {
    expect(describeNeteaseQrStatus(801)).toContain('扫码');
    expect(describeNeteaseQrStatus(803)).toContain('成功');
    expect(describeNeteaseQrStatus(800)).toContain('过期');
  });
});
