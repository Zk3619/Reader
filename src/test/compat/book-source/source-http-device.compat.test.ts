import { describe, expect, it, beforeEach, vi } from 'vitest';
import { legadoCookieGetKey } from '@/lib/js-engine/legado/login-script-runner';
import {
  getOrCreateAndroidId,
  resolveLegadoDeviceId,
} from '@/lib/book-source/source-http';

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
});
