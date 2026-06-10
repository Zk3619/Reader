import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { BookSource } from '@/types';
import { resolveBookSourceServerUrl } from '@/lib/book-source/source-http';
import { getSourceArgsKey } from '@/lib/js-engine/legado/source-script-shared';
import { extractHostListFromJsLib } from '@/lib/book-source/utils';

const GYKS_JS_LIB = `
let hosts = [
  'https://v1.gyks.cf',
  'https://v2.gyks.cf',
];
const defaultConfig = { 线路: hosts[0] };
`;

describe('resolveBookSourceServerUrl', () => {
  const sourceUrl = 'test-gyks-resolve-server';

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

  it('从 let hosts 解析 jsLib 默认线路', () => {
    const hosts = extractHostListFromJsLib({ jsLib: GYKS_JS_LIB });
    expect(hosts[0]).toBe('https://v1.gyks.cf');

    const url = resolveBookSourceServerUrl({
      sourceUrl,
      sourceName: 'test',
      jsLib: GYKS_JS_LIB,
    } as BookSource);
    expect(url).toBe('https://v1.gyks.cf');
  });

  it('从书源变量 JSON 的 线路 字段解析', () => {
    localStorage.setItem(
      getSourceArgsKey({ sourceUrl } as BookSource),
      JSON.stringify({ 线路: 'https://v3.gyks.cf' }),
    );
    const url = resolveBookSourceServerUrl({
      sourceUrl,
      sourceName: 'test',
      jsLib: GYKS_JS_LIB,
    } as BookSource);
    expect(url).toBe('https://v3.gyks.cf');
  });

  it('server 与 线路 不一致时优先 线路（登录切线仅写 线路）', () => {
    const ip = 'http://101.35.133.34:8888';
    localStorage.setItem(
      getSourceArgsKey({ sourceUrl } as BookSource),
      JSON.stringify({
        server: 'https://v1.gyks.cf',
        线路: ip,
        deviceId: '715526ded4651ef6',
      }),
    );
    const url = resolveBookSourceServerUrl({
      sourceUrl,
      sourceName: 'test',
      jsLib: GYKS_JS_LIB,
    } as BookSource);
    expect(url).toBe(ip);
  });
});
