import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { BookSource } from '@/types';
import {
  createLegadoScriptCookieApi,
  getCookieFromStore,
} from '@/lib/js-engine/legado/login-script-runner';
import {
  getLegadoSourceKey,
  storageKey,
  STORAGE_PREFIX_ARGS,
  STORAGE_PREFIX_COOKIES,
} from '@/lib/js-engine/legado/source-script-shared';

const SOURCE = {
  bookSourceUrl: '晴天融合VIP4.0',
  sourceUrl: 'https://legacy.example/wrong-key',
  bookSourceName: '晴天聚合',
  bookSourceType: 0,
} as unknown as BookSource;

describe('createLegadoScriptCookieApi', () => {
  const key = storageKey(STORAGE_PREFIX_COOKIES, getLegadoSourceKey(SOURCE));
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

  it('发现脚本可从 /control 键读取登录后 cookie（对齐登录脚本）', () => {
    const server = 'https://v1.gyks.cf';
    const token = 'qttoken=abc12345678901234567890123456789012; deviceId=d1';
    localStorage.setItem(
      key,
      JSON.stringify({
        [`${server}/control`]: token,
      }),
    );

    const store = new Map<string, string>();
    const api = createLegadoScriptCookieApi(SOURCE, server, store);
    expect(api.getCookie(server)).toMatch(/qttoken=abc12345678901234567890123456789012/);
    expect(api.getKey(api.getCookie(server))).toBe('abc12345678901234567890123456789012');
  });

  it('getCookieFromStore 回退 /control 路径', () => {
    const server = 'https://v1.gyks.cf';
    const token = 'qttoken=abc12345678901234567890123456789012';
    const store = new Map<string, string>([[`${server}/control`, token]]);

    expect(getCookieFromStore(store, server, server)).toBe(token);
  });

  it('Cookie 表为空时可从 args.qttoken 回退（登录后发现脚本）', () => {
    const server = 'https://v1.gyks.cf';
    const token = 'abc12345678901234567890123456789012';
    localStorage.setItem(
      storageKey(STORAGE_PREFIX_ARGS, getLegadoSourceKey(SOURCE)),
      JSON.stringify({ server, qttoken: token }),
    );
    const store = new Map<string, string>();
    const api = createLegadoScriptCookieApi(SOURCE, server, store);
    expect(api.getCookie(server)).toMatch(/qttoken=abc12345678901234567890123456789012/);
  });
});
