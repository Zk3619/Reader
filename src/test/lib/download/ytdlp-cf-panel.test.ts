import { beforeEach, describe, expect, it } from 'vitest';
import {
  _testOnlyShouldUseYtdlpPanelFetch,
  _testOnlySiteSource,
} from '@/lib/download/ytdlp/networking/cf-challenge';
import {
  clearCfActiveRequestOrigin,
  setCfActiveRequestOrigin,
} from '@/lib/book-source/source-http';

/** node 环境无 localStorage / window；CF 门闸依赖它们 */
function ensureBrowserGlobals(): void {
  if (typeof globalThis.window === 'undefined') {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: globalThis,
    });
  }
  if (typeof globalThis.localStorage !== 'undefined') return;
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(String(k), String(v));
      },
      removeItem: (k: string) => {
        store.delete(String(k));
      },
      clear: () => store.clear(),
    },
  });
}

describe('ytdlp CF panel fetch gate', () => {
  const url = 'https://9gag.com/v1/post?id=ae5Ag7B';

  beforeEach(() => {
    ensureBrowserGlobals();
    const source = _testOnlySiteSource(url);
    clearCfActiveRequestOrigin(source);
  });

  it('forcePanel 时即使无 cf_clearance 也走 panel', () => {
    const source = _testOnlySiteSource(url);
    expect(_testOnlyShouldUseYtdlpPanelFetch(source, 'session=abc', true)).toBe(true);
  });

  it('有 CF 活跃域但无 cf_clearance 时不走 panel（对齐书源门闸）', () => {
    const source = _testOnlySiteSource(url);
    setCfActiveRequestOrigin(source, 'https://9gag.com');
    expect(_testOnlyShouldUseYtdlpPanelFetch(source, 'foo=1; bar=2', false)).toBe(false);
  });

  it('无活跃域且无 clearance 时不走 panel', () => {
    const source = _testOnlySiteSource(url);
    expect(_testOnlyShouldUseYtdlpPanelFetch(source, 'foo=1', false)).toBe(false);
  });

  it('有 cf_clearance + 活跃域时走 panel', () => {
    const source = _testOnlySiteSource(url);
    setCfActiveRequestOrigin(source, 'https://9gag.com');
    expect(
      _testOnlyShouldUseYtdlpPanelFetch(source, 'cf_clearance=xyz; session=1', false),
    ).toBe(true);
  });
});
