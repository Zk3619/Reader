import { describe, expect, it, beforeEach, vi } from 'vitest';
import { legadoCookieGetKey } from '@/lib/js-engine/legado/login-script-runner';
import type { BookSource } from '@/types';
import {
  getOrCreateAndroidId,
  persistBookSourceDeviceId,
  readBookSourceArgsField,
  resolveLegadoDeviceId,
} from '@/lib/book-source/source-http';
import { getSourceArgsKey } from '@/lib/js-engine/legado/source-script-shared';
import { normalizeLegadoCookieHeader } from '@/lib/js-engine/legado/normalize-legado-ajax-body';

describe('source-http deviceId', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });
  });

  it('新设备 ID 为 16 位十六进制（对齐 ANDROID_ID 形态）', () => {
    const id = getOrCreateAndroidId();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('resolveLegadoDeviceId 优先使用 Cookie 中的 deviceId', () => {
    expect(resolveLegadoDeviceId('qttoken=abc;deviceId=fromlogin')).toBe('fromlogin');
    expect(resolveLegadoDeviceId('qttoken=abc;device=legacydev')).toBe('legacydev');
  });

  it('无 Cookie 时回落 getOrCreateAndroidId', () => {
    const id = getOrCreateAndroidId();
    expect(resolveLegadoDeviceId('')).toBe(id);
  });

  it('书源变量 deviceId 覆盖 Cookie 中的 deviceId（对齐 Legado）', () => {
    const source = { bookSourceUrl: 'test-qingtian' } as BookSource;
    const argsKey = getSourceArgsKey(source);
    localStorage.setItem(
      argsKey,
      JSON.stringify({ deviceId: '715526ded4651ef6', server: 'https://v1.gyks.cf' }),
    );
    expect(readBookSourceArgsField(source, 'deviceId')).toBe('715526ded4651ef6');
    expect(
      resolveLegadoDeviceId('qttoken=abc;deviceId=wrong000000000000', source),
    ).toBe('715526ded4651ef6');
    persistBookSourceDeviceId(source, '715526ded4651ef6');
    expect(JSON.parse(localStorage.getItem(argsKey) ?? '{}').deviceId).toBe(
      '715526ded4651ef6',
    );
  });

  it('normalizeLegadoCookieHeader 用书源变量 deviceId 覆盖脚本 Cookie', () => {
    const scriptCookie = 'qttoken=xGwAEAV8b0EZqdlO;deviceId=8627abcd12344ffb';
    const normalized = normalizeLegadoCookieHeader(scriptCookie, '715526ded4651ef6');
    expect(normalized).toBe('qttoken=xGwAEAV8b0EZqdlO; deviceId=715526ded4651ef6;');
  });

  it('legadoCookieGetKey(url, device) 对齐 cookie.getKey(device)→deviceId', () => {
    const store = new Map<string, string>();
    const getCookie = (url: string) =>
      store.get(url) ?? 'qttoken=tok123;deviceId=dev456';
    store.set('https://v1.gyks.cf', 'qttoken=tok123;deviceId=dev456');
    expect(legadoCookieGetKey(store, getCookie, 'https://v1.gyks.cf', 'device')).toBe(
      'dev456',
    );
    expect(legadoCookieGetKey(store, getCookie, 'https://v1.gyks.cf', 'qttoken')).toBe(
      'tok123',
    );
  });

  it('legadoCookieGetKey(device) 书源变量 deviceId 覆盖 Cookie（ruleContent qtcookie）', () => {
    const source = { bookSourceUrl: 'test-qingtian' } as BookSource;
    localStorage.setItem(
      getSourceArgsKey(source),
      JSON.stringify({ deviceId: '715526ded4651ef6' }),
    );
    const getCookie = () => 'qttoken=tok123;deviceId=wrong000000000000';
    expect(
      legadoCookieGetKey(new Map(), getCookie, 'https://v1.gyks.cf', 'device', source),
    ).toBe('715526ded4651ef6');
  });
});
