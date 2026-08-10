import { describe, expect, it } from 'vitest';
import '@/lib/download/ytdlp/extractors';
import { NineGagIE } from '@/lib/download/ytdlp/extractors/hand-n/ninegag';
import { ensureBuiltinLoaded, getExtractorForUrl } from '@/lib/download/ytdlp/registry';
import { detectProtocol } from '@/lib/download/gopeed/resolve';
import { isJa3RequiredIeKey } from '@/lib/download/ytdlp/networking/ja3-sites';

describe('NineGagIE', () => {
  it('matches gag URLs', () => {
    const url = 'https://9gag.com/gag/ae5Ag7B';
    expect(NineGagIE.suitable(url)).toBe(true);
    ensureBuiltinLoaded();
    expect(getExtractorForUrl(url)?.IE_NAME).toBe('9gag');
    expect(detectProtocol(url)).toBe('ytdlp');
  });

  it('is not hard-blocked by JA3 site list', () => {
    expect(isJa3RequiredIeKey('NineGag')).toBe(false);
    expect(isJa3RequiredIeKey('9gag')).toBe(false);
  });
});
