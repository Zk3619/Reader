import { describe, expect, it } from 'vitest';
import {
  normalizeMfThemeZipEntries,
  opfsMfThemePackBase,
  parseOpfsMfThemePackBase,
} from '@/lib/media/audio/online/mf-plugin/mf-theme-opfs';
import {
  shouldUseMfThemeIframeEffect,
  shouldUseSakuraCanvasFallback,
} from '@/lib/media/audio/online/mf-plugin/theme-pack';

describe('mf-theme-opfs', () => {
  it('strips common zip root folder', () => {
    const normalized = normalizeMfThemeZipEntries({
      'sakura/index.css': new Uint8Array([1]),
      'sakura/config.json': new Uint8Array([2]),
      'sakura/iframes/app.html': new Uint8Array([3]),
    });
    expect(Object.keys(normalized).sort()).toEqual([
      'config.json',
      'iframes/app.html',
      'index.css',
    ]);
  });

  it('encodes opfs pack base url', () => {
    expect(opfsMfThemePackBase('my-theme')).toBe('opfs:my-theme');
    expect(parseOpfsMfThemePackBase('opfs:my-theme')).toBe('my-theme');
    expect(parseOpfsMfThemePackBase('/mf-themes/sakura')).toBeNull();
  });
});

describe('mf theme mobile fallback', () => {
  it('disables sakura iframe on mobile ua', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';
    Object.defineProperty(globalThis.navigator, 'userAgent', {
      value: ua,
      configurable: true,
    });
    expect(shouldUseMfThemeIframeEffect('sakura-iframe')).toBe(false);
    expect(shouldUseSakuraCanvasFallback('sakura-iframe')).toBe(true);
    expect(shouldUseMfThemeIframeEffect('iframe')).toBe(true);
  });
});
