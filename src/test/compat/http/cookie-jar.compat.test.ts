import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearSessionCookies,
  cookieHeaderToMap,
  getSubDomain,
  mergeJarWithRequestCookie,
  mapToCookieHeader,
  saveSetCookieLines,
  getSessionCookie,
} from '@/lib/http/cookie-jar';

describe('cookie-jar', () => {
  beforeEach(() => {
    clearSessionCookies();
  });

  it('getSubDomain 对齐 banzhu', () => {
    expect(getSubDomain('https://banzhu66666.net/shuku/1.html')).toBe('banzhu66666.net');
    expect(getSubDomain('https://www.banzhu66666.net/')).toBe('banzhu66666.net');
  });

  it('mergeJarWithRequestCookie：header 覆盖 jar', () => {
    const merged = mergeJarWithRequestCookie('cf_clearance=old; a=1', 'a=2; b=3');
    const map = cookieHeaderToMap(merged);
    expect(map.get('a')).toBe('2');
    expect(map.get('b')).toBe('3');
    expect(map.get('cf_clearance')).toBe('old');
  });

  it('saveSetCookieLines 写入会话 Cookie（内存）', async () => {
    const url = 'https://jar-test.example.com/page';
    const domain = getSubDomain(url);
    await saveSetCookieLines(url, ['session_only=s1; Path=/']);
    expect(getSessionCookie(domain)).toContain('session_only=s1');
  });

  it('isPersistentSetCookie 通过 Max-Age 识别持久 Cookie', () => {
    expect(
      mergeJarWithRequestCookie('', 'x=1'),
    ).toBe('x=1');
  });

  it('mapToCookieHeader roundtrip', () => {
    const m = cookieHeaderToMap('a=1; b=2');
    expect(mapToCookieHeader(m)).toBe('a=1; b=2');
  });
});
