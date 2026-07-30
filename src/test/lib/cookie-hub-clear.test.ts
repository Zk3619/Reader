import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/database/audio-library', () => ({
  getAuthSession: vi.fn(async () => null),
  saveAuthSession: vi.fn(async () => undefined),
}));

vi.mock('@/lib/http/cookie-jar', () => ({
  getPersistentCookie: vi.fn(async () => ''),
  setPersistentCookie: vi.fn(async () => undefined),
  removeJarCookies: vi.fn(async () => undefined),
}));

vi.mock('@/lib/media/audio/platform/auth/session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/media/audio/platform/auth/session')>(
    '@/lib/media/audio/platform/auth/session',
  );
  return {
    ...actual,
    persistAuthCookies: vi.fn(async () => undefined),
  };
});

import { removeJarCookies } from '@/lib/http/cookie-jar';
import {
  clearPlatformCookies,
  makeBangumiScope,
  makeDoubanScope,
  peekSharedCookies,
  setModuleCookieOverride,
  VIDEO_BILI_OVERRIDE_KEY,
  LEGACY_VIDEO_BILI_COOKIE_KEY,
} from '@/lib/cookie-hub';

describe('cookie-hub clear + video scopes', () => {
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
    vi.mocked(removeJarCookies).mockClear();
  });

  it('clearPlatformCookies clears bili override and jar urls', async () => {
    setModuleCookieOverride('bili', 'SESSDATA=x');
    expect(peekSharedCookies('bili')).toContain('SESSDATA');
    await clearPlatformCookies('bili');
    expect(peekSharedCookies('bili')).toBe('');
    expect(localStorage.getItem(VIDEO_BILI_OVERRIDE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_VIDEO_BILI_COOKIE_KEY)).toBeNull();
    expect(removeJarCookies).toHaveBeenCalled();
  });

  it('makeDoubanScope and makeBangumiScope isolate keys', () => {
    expect(makeDoubanScope().scopeKey).toBe('https://www.douban.com/#danmu-api');
    expect(makeBangumiScope('rule-1', 'https://example.com/path').scopeKey).toBe(
      'https://example.com/#bangumi:rule-1',
    );
    expect(makeBangumiScope('a', 'https://a.test').scopeKey).not.toBe(
      makeBangumiScope('b', 'https://a.test').scopeKey,
    );
  });
});
