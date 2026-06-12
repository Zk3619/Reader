import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { BookSource } from '@/types';
import {
  clearSourceCookieAndCfRecord,
  collectBookSourceKeyAliases,
  purgeBookSourceSession,
} from '@/lib/book-source/purge-source-session';
import {
  getLegadoSourceKey,
  storageKey,
  STORAGE_PREFIX_ARGS,
  STORAGE_PREFIX_CF_ORIGIN,
  STORAGE_PREFIX_COOKIES,
  STORAGE_PREFIX_LOGIN,
} from '@/lib/js-engine/legado/source-script-shared';
import { getExploreSourceArgsVersion } from '@/stores/explore-source-args';

vi.mock('@/lib/http/cookie-manager', () => ({
  deleteCookie: vi.fn().mockResolvedValue(undefined),
}));

const SOURCE = {
  bookSourceUrl: '晴天融合VIP4.0',
  sourceUrl: 'https://v1.example.com',
  sourceName: '晴天聚合',
  bookSourceType: 0,
  jsLib: 'var host = ["https://v1.example.com"];',
} as unknown as BookSource;

describe('purgeBookSourceSession', () => {
  const ls = new Map<string, string>();

  beforeEach(() => {
    ls.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => ls.get(k) ?? null,
      setItem: (k: string, v: string) => {
        ls.set(k, v);
      },
      removeItem: (k: string) => {
        ls.delete(k);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('collectBookSourceKeyAliases 包含 bookSourceUrl 与 sourceUrl', () => {
    const aliases = collectBookSourceKeyAliases(SOURCE);
    expect(aliases).toContain('晴天融合VIP4.0');
    expect(aliases).toContain('https://v1.example.com');
  });

  it('清除 args/cookies/login 及参数版本', async () => {
    const legadoKey = getLegadoSourceKey(SOURCE);
    ls.set(storageKey(STORAGE_PREFIX_ARGS, legadoKey), '{"server":"https://v1.example.com"}');
    ls.set(storageKey(STORAGE_PREFIX_COOKIES, legadoKey), '{"https://v1.example.com/control":"qttoken=x"}');
    ls.set(storageKey(STORAGE_PREFIX_LOGIN, legadoKey), '{"email":"a@b.c"}');

    const { bumpExploreSourceArgsVersion } = await import('@/stores/explore-source-args');
    bumpExploreSourceArgsVersion(legadoKey);
    expect(getExploreSourceArgsVersion(legadoKey)).toBe(1);

    await purgeBookSourceSession(SOURCE);

    expect(ls.has(storageKey(STORAGE_PREFIX_ARGS, legadoKey))).toBe(false);
    expect(ls.has(storageKey(STORAGE_PREFIX_COOKIES, legadoKey))).toBe(false);
    expect(ls.has(storageKey(STORAGE_PREFIX_LOGIN, legadoKey))).toBe(false);
    expect(getExploreSourceArgsVersion(legadoKey)).toBe(0);
  });

  it('仅清除 Cookie/CF 记录，保留登录与源变量', async () => {
    const legadoKey = getLegadoSourceKey(SOURCE);
    ls.set(storageKey(STORAGE_PREFIX_ARGS, legadoKey), '{"server":"https://v1.example.com"}');
    ls.set(storageKey(STORAGE_PREFIX_COOKIES, legadoKey), '{"https://v1.example.com/control":"qttoken=x"}');
    ls.set(storageKey(STORAGE_PREFIX_LOGIN, legadoKey), '{"email":"a@b.c"}');
    ls.set(storageKey(STORAGE_PREFIX_CF_ORIGIN, legadoKey), 'https://mirror.example.com');

    await clearSourceCookieAndCfRecord(SOURCE);

    expect(ls.has(storageKey(STORAGE_PREFIX_ARGS, legadoKey))).toBe(true);
    expect(ls.has(storageKey(STORAGE_PREFIX_LOGIN, legadoKey))).toBe(true);
    expect(ls.has(storageKey(STORAGE_PREFIX_COOKIES, legadoKey))).toBe(false);
    expect(ls.has(storageKey(STORAGE_PREFIX_CF_ORIGIN, legadoKey))).toBe(false);
  });
});
