import { describe, expect, it, vi } from 'vitest';
import {
  isCloudflareHeavyCdnUrl,
  looksLikeCloudflareChallengeHtml,
  shouldPreferDirectBrowserImage,
} from '@/lib/http/cf-protected-cdn';

describe('cf-protected-cdn', () => {
  it('识别 g-mh 图床', () => {
    expect(
      isCloudflareHeavyCdnUrl(
        'https://f40-1-4.g-mh.online/kk/book/1/MjFjOGExM2RfMV81_5.webp',
      ),
    ).toBe(true);
  });

  it('纯 Web 下优先浏览器直连', () => {
    vi.stubGlobal('window', {
      location: { origin: 'http://127.0.0.1:5173' },
    });
    vi.stubGlobal('import', { meta: { env: {} } });
    expect(
      shouldPreferDirectBrowserImage(
        'https://f40-1-4.g-mh.online/kk/a.webp',
      ),
    ).toBe(true);
    vi.unstubAllGlobals();
  });

  it('识别 CF 挑战 HTML', () => {
    expect(
      looksLikeCloudflareChallengeHtml(
        '<!DOCTYPE html><title>Just a moment...</title>',
      ),
    ).toBe(true);
  });
});
