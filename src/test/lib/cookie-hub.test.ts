import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  describeCookieSource,
  getModuleCookieOverride,
  peekSharedCookies,
  setModuleCookieOverride,
  VIDEO_BILI_OVERRIDE_KEY,
  LEGACY_VIDEO_BILI_COOKIE_KEY,
} from '@/lib/cookie-hub';

describe('cookie-hub module override', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    });
  });

  it('setModuleCookieOverride writes video override key', () => {
    setModuleCookieOverride('bili', 'SESSDATA=abc; bili_jct=1');
    expect(getModuleCookieOverride('bili')).toContain('SESSDATA=abc');
    expect(localStorage.getItem(VIDEO_BILI_OVERRIDE_KEY)).toContain('SESSDATA');
    expect(localStorage.getItem(LEGACY_VIDEO_BILI_COOKIE_KEY)).toContain('SESSDATA');
    expect(peekSharedCookies('bili')).toContain('SESSDATA');
  });

  it('clear override empties peek until warm/resolve', () => {
    setModuleCookieOverride('bili', 'SESSDATA=abc');
    setModuleCookieOverride('bili', '');
    expect(getModuleCookieOverride('bili')).toBe('');
  });

  it('describeCookieSource labels', () => {
    expect(describeCookieSource('platform-auth')).toContain('音乐');
    expect(describeCookieSource('module-override')).toContain('影视');
    expect(describeCookieSource('site-pool')).toContain('书源');
  });
});
