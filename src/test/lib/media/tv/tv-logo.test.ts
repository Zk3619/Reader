import { describe, expect, it } from 'vitest';
import { tvSafeDisplayLogoUrl } from '@/lib/media/tv/config/tv-logo';

describe('tvSafeDisplayLogoUrl', () => {
  it('skips remote GIF on Android WebView', () => {
    expect(
      tvSafeDisplayLogoUrl(
        'https://cdn.example/logo.gif',
        'https://qist.wyfc.qzz.io/fty.json',
        { skipAnimatedGif: true },
      ),
    ).toBe('');
  });

  it('keeps static logos', () => {
    expect(
      tvSafeDisplayLogoUrl(
        'https://cdn.example/logo.png',
        'https://qist.wyfc.qzz.io/fty.json',
        { skipAnimatedGif: true },
      ),
    ).toBe('https://cdn.example/logo.png');
  });
});
