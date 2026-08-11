import { describe, expect, it, vi } from 'vitest';
import {
  isLikelyMangaAntiHotlinkPlaceholder,
  looksLikeCloudflareChallengeHtml,
  verifyFetchedImageBytes,
} from '@/lib/http/cf-protected-cdn';

describe('cf-protected-cdn', () => {
  it('识别 CF 挑战 HTML', () => {
    expect(
      looksLikeCloudflareChallengeHtml(
        '<!DOCTYPE html><title>Just a moment...</title>',
      ),
    ).toBe(true);
  });

  it('正文仅出现 cloudflare 字样不视为挑战页', () => {
    expect(
      looksLikeCloudflareChallengeHtml(
        '<html><script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js"></script><body>Watch on YouTube</body></html>',
      ),
    ).toBe(false);
  });

  it('仅将 <64 字节视为非图片空响应', () => {
    expect(isLikelyMangaAntiHotlinkPlaceholder(new ArrayBuffer(32), 'image/webp')).toBe(
      true,
    );
    expect(isLikelyMangaAntiHotlinkPlaceholder(new ArrayBuffer(218), 'image/webp')).toBe(
      false,
    );
  });

  it('不按尺寸拒绝大图', async () => {
    vi.stubGlobal('createImageBitmap', async () => ({
      width: 1200,
      height: 900,
      close: () => undefined,
    }));
    const ok = await verifyFetchedImageBytes(
      new ArrayBuffer(4096),
      'image/webp',
    );
    expect(ok).toBe(true);
    vi.unstubAllGlobals();
  });
});
