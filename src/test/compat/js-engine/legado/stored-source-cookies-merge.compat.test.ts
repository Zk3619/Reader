import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { BookSource } from '@/types';
import {
  getStoredSourceCookiesForInnerWeb,
  getStoredSourceCookiesMerged,
} from '@/lib/js-engine/legado/login-script-runner';
import {
  getLegadoSourceKey,
  storageKey,
  STORAGE_PREFIX_COOKIES,
} from '@/lib/js-engine/legado/source-script-shared';

const SOURCE = {
  bookSourceUrl: 'https://test.local/gyks',
  bookSourceName: 'test',
  bookSourceType: 0,
  loginUrl: '',
} as unknown as BookSource;

describe('getStoredSourceCookiesMerged', () => {
  const key = storageKey(STORAGE_PREFIX_COOKIES, getLegadoSourceKey(SOURCE));
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('合并多域 Cookie 时保留 mem_tab 等设置键', () => {
    localStorage.setItem(
      key,
      JSON.stringify({
        'https://v1.gyks.cf': 'qttoken=abc12345678901234567890123456789012; deviceId=d1',
        'https://v1.gyks.cf/control':
          'mem_tab=小说; mem_server=线路1; qttoken=abc12345678901234567890123456789012; deviceId=d1',
      }),
    );
    const merged = getStoredSourceCookiesMerged(SOURCE);
    expect(merged).toMatch(/mem_tab=小说/);
    expect(merged).toMatch(/mem_server=线路1/);
    expect(merged).toMatch(/qttoken=abc12345678901234567890123456789012/);
  });

  it('打开 control 时合并全表与当前 URL 键', () => {
    localStorage.setItem(
      key,
      JSON.stringify({
        'https://v1.gyks.cf': 'qttoken=abc12345678901234567890123456789012; deviceId=d1',
        'https://v1.gyks.cf/control': 'mem_tab=漫画; qttoken=abc12345678901234567890123456789012',
      }),
    );
    const cookies = getStoredSourceCookiesForInnerWeb(
      SOURCE,
      'https://v1.gyks.cf/control',
    );
    expect(cookies).toMatch(/mem_tab=漫画/);
    expect(cookies).toMatch(/qttoken=abc12345678901234567890123456789012/);
  });
});
