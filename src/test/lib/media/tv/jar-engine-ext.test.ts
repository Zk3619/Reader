import { describe, expect, it } from 'vitest';
import { siteExtForJar } from '@/lib/media/tv/spider/jar-engine';

describe('siteExtForJar', () => {
  it('resolves Cloud-drive relative paths inside JSON ext', () => {
    const ext = siteExtForJar(
      {
        ext: '{"Cloud-drive":"tvfan/Cloud-drive.txt"}',
      },
      'https://qist.wyfc.qzz.io/fty.json',
    );
    expect(JSON.parse(ext)).toEqual({
      'Cloud-drive': 'https://qist.wyfc.qzz.io/tvfan/Cloud-drive.txt',
    });
  });

  it('leaves encrypted string ext unchanged', () => {
    const raw = 'rfOIzPkSUkANv6AT2prC8en3+Trbx4j10CIoZMv3Ag4bdEYQqTMqu/Z3YPtC2NJv';
    expect(
      siteExtForJar(
        { ext: raw },
        'https://qist.wyfc.qzz.io/fty.json',
      ),
    ).toBe(raw);
  });

  it('resolves string token.json relative ext', () => {
    expect(
      siteExtForJar(
        { ext: './lib/token.json' },
        'https://cfg.example/vod.json',
      ),
    ).toBe('https://cfg.example/lib/token.json');
  });
});
