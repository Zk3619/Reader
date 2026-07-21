import { describe, expect, it } from 'vitest';
import { mobiSourceToEpubFileName } from '@/lib/local-book/mobi-file-name';
import { READER_BUILTIN_THEME_PRESETS } from '@/lib/theme/reader-builtin-theme-presets';

describe('mobiSourceToEpubFileName', () => {
  it('replaces mobi/azw3 extension', () => {
    expect(mobiSourceToEpubFileName('novel.mobi')).toBe('novel.epub');
    expect(mobiSourceToEpubFileName('book.azw3')).toBe('book.epub');
  });
});

describe('READER_BUILTIN_THEME_PRESETS', () => {
  it('seeds 8 day/night reader packs with app+viewer scopes', () => {
    expect(READER_BUILTIN_THEME_PRESETS).toHaveLength(8);
    for (const pack of READER_BUILTIN_THEME_PRESETS) {
      expect(pack.id.startsWith('builtin-reader-')).toBe(true);
      expect(pack.scopes.app).toBe(true);
      expect(pack.scopes.viewer).toBe(true);
      expect(pack.viewer?.text?.paletteId).toBeTypeOf('number');
      expect(pack.tags).toContain('local-only');
    }
  });
});
