import { describe, expect, it, vi } from 'vitest';
import {
  isHttpFetchableUrl,
  shouldUseWebHttpProxy,
} from '@/lib/http/web-http-proxy';

describe('web-http-proxy data:', () => {
  it('data: 不可代理', () => {
    vi.stubGlobal('window', {
      location: { origin: 'http://127.0.0.1:5173' },
    });
    const dataUrl =
      'data:;base64,eyJib29rX2lkIjoiMSJ9,{"type":"qingtian"}';
    expect(isHttpFetchableUrl(dataUrl)).toBe(false);
    expect(
      shouldUseWebHttpProxy(dataUrl, {
        Cookie: 'qttoken=x;',
      }),
    ).toBe(false);
    vi.unstubAllGlobals();
  });
});
