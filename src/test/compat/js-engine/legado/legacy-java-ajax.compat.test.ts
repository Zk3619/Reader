import { describe, expect, it } from 'vitest';
import { createLegacyJavaAjax } from '@/lib/js-engine/legado/host/legacy-java-ajax';
import { LEGADO_AJAX_PENDING_JSON } from '@/lib/js-engine/legado/source-script-shared';

describe('createLegacyJavaAjax', () => {
  it('parses legado url,options comma format and returns pending json on miss', () => {
    const cache = new Map<string, string>();
    const pending: Promise<unknown>[] = [];
    const requests: string[] = [];

    const ajax = createLegacyJavaAjax({
      baseUrl: 'https://v1.gyks.cf',
      resolveUrl: (_base, rel) => rel,
      getCookie: () => '',
      cache,
      durationCache: new Map(),
      pending,
      request: (url) => {
        requests.push(url);
        return Promise.resolve('{"code":0,"data":[{"title":"x"}]}');
      },
    });

    const url =
      'https://v1.gyks.cf/discovestyle?source=a&tab=b,{"method":"GET","headers":{"cookie":"qttoken=tok;"}}';
    const out = ajax(url);

    expect(out).toBe(LEGADO_AJAX_PENDING_JSON);
    expect(requests).toEqual(['https://v1.gyks.cf/discovestyle?source=a&tab=b']);
  });

  it('returns cached body on second call', async () => {
    const cache = new Map<string, string>();
    const pending: Promise<unknown>[] = [];
    let calls = 0;

    const ajax = createLegacyJavaAjax({
      baseUrl: 'https://v1.gyks.cf',
      resolveUrl: (_base, rel) => rel,
      getCookie: () => '',
      cache,
      durationCache: new Map(),
      pending,
      request: () => {
        calls += 1;
        return Promise.resolve('{"code":0,"data":[1,2,3]}');
      },
    });

    const url = 'https://v1.gyks.cf/discovestyle?source=a';
    expect(ajax(url)).toBe(LEGADO_AJAX_PENDING_JSON);
    await Promise.all(pending.splice(0));

    const cached = ajax(url);
    expect(calls).toBe(1);
    expect(JSON.parse(cached).data).toHaveLength(3);
  });
});
