import { describe, expect, it } from 'vitest';
import { sanitizeLegadoCookieValueForStore } from '@/lib/js-engine/legado/login-script-runner';

describe('sanitizeLegadoCookieValueForStore', () => {
  it('多键设置 Cookie 持久化时保留 fqpara/info 等非登录键', () => {
    const raw =
      'qttoken=abc12345678901234567890123456789012; deviceId=d1; fqpara=off; info=off; tab=novel; proxy=云端';
    const out = sanitizeLegadoCookieValueForStore(raw, 'd1');
    expect(out).toMatch(/fqpara=off/);
    expect(out).toMatch(/info=off/);
    expect(out).toMatch(/tab=novel/);
    expect(out).toMatch(/proxy=云端/);
    expect(out).toMatch(/qttoken=abc12345678901234567890123456789012/);
    expect(out).not.toMatch(/fqpara=on/);
  });

  it('仅 qttoken/deviceId 时仍规范为登录态串', () => {
    const raw = 'qttoken=abc12345678901234567890123456789012; deviceId=d1';
    const out = sanitizeLegadoCookieValueForStore(raw, 'd1');
    expect(out).toMatch(/qttoken=abc12345678901234567890123456789012/);
    expect(out).toMatch(/deviceId=d1/);
    expect(out).not.toMatch(/fqpara=/);
  });
});
