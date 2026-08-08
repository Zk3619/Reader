import { describe, expect, it } from 'vitest';
import '@/lib/download/ytdlp/extractors';
import { ensureBuiltinLoaded, getExtractorForUrl, listExtractors } from '@/lib/download/ytdlp/registry';

describe('Toutiao URL matching', () => {
  it('resolves ToutiaoIE and not NBCStations', () => {
    ensureBuiltinLoaded();
    const url = 'https://www.toutiao.com/video/7505382061495176511/';
    const ie = getExtractorForUrl(url);
    expect(ie?.IE_NAME).toBe('toutiao');

    const hits = listExtractors()
      .filter((e) => e.ie_key !== 'generic')
      .filter((e) => {
        const re = e.valid_url_re;
        if (!re) return false;
        const list = Array.isArray(re) ? re : [re];
        return list.some((r) => r.test(url));
      })
      .map((e) => e.ie_key);

    expect(hits).toContain('Toutiao');
    expect(hits).not.toContain('NBCStations');
  });
});
