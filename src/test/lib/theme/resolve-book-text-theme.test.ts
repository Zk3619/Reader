import { describe, expect, it } from 'vitest';
import {
  isBookTextThemeCustom,
  normalizeBookTextThemeOverride,
  resolveBookTextThemeConfig,
} from '@/lib/theme/resolve-book-text-theme';
import type { Book } from '@/types/book';

function minimalBook(overrides?: Partial<Book>): Book {
  return {
    name: 'Test Book',
    author: 'Author',
    bookUrl: 'local://test',
    tocUrl: '',
    origin: '',
    originName: 'Test',
    type: 0,
    group: 0,
    latestChapterTime: 0,
    lastCheckTime: 0,
    lastCheckCount: 0,
    totalChapterNum: 0,
    durChapterIndex: 0,
    durChapterPos: 0,
    durVolumeIndex: 0,
    chapterInVolumeIndex: 0,
    durChapterTime: 0,
    canUpdate: false,
    order: 0,
    originOrder: 0,
    syncTime: 0,
    ...overrides,
  };
}

describe('resolve-book-text-theme', () => {
  it('uses book custom palette and surface when mode is custom', () => {
    const book = minimalBook({
      readConfig: {
        themeOverride: {
          mode: 'custom',
          paletteId: 'custom',
          customPalette: {
            bg: '#f5f0e6',
            text: '#333',
            accent: '#c00',
            border: '#ddd',
          },
          surfaceAppearance: { chrome: { opacity: 70, blurPx: 4 } },
        },
      },
    });
    const resolved = resolveBookTextThemeConfig(book, { theme: 0 });
    expect(resolved.source).toBe('book');
    expect(resolved.customPalette?.bg).toBe('#f5f0e6');
    expect(resolved.bookSurfaceOverride?.chrome?.opacity).toBe(70);
    expect(isBookTextThemeCustom(book.readConfig?.themeOverride)).toBe(true);
  });

  it('falls back to global theme and surface', () => {
    const resolved = resolveBookTextThemeConfig(minimalBook(), {
      theme: 2,
      themeSurfaceAppearance: { content: { opacity: 88 } },
    });
    expect(resolved.source).toBe('global');
    expect(resolved.theme).toBe(2);
    expect(resolved.themeSurfaceAppearance?.content?.opacity).toBe(88);
  });

  it('uses viewer preset surface when global surface is absent', () => {
    const resolved = resolveBookTextThemeConfig(
      minimalBook(),
      { theme: 1 },
      {
        viewerPresetText: {
          paletteId: 1,
          surfaceAppearance: { chrome: { opacity: 92, blurPx: 6 } },
        },
      },
    );
    expect(resolved.source).toBe('preset');
    expect(resolved.themeSurfaceAppearance?.chrome?.opacity).toBe(92);
  });

  it('normalizes book text theme override from raw JSON', () => {
    const normalized = normalizeBookTextThemeOverride({
      mode: 'custom',
      paletteId: 'custom',
      customPalette: {
        bg: '#fff',
        text: '#000',
        accent: '#00f',
        border: '#ccc',
      },
      surfaceAppearance: { pageTip: { opacity: 90 } },
      presetId: '  my-preset  ',
    });
    expect(normalized?.mode).toBe('custom');
    expect(normalized?.paletteId).toBe('custom');
    expect(normalized?.customPalette?.bg).toBe('#fff');
    expect(normalized?.presetId).toBe('my-preset');
  });

  it('returns undefined for invalid override payload', () => {
    expect(normalizeBookTextThemeOverride(null)).toBeUndefined();
    expect(normalizeBookTextThemeOverride({ mode: 'invalid' })).toBeUndefined();
  });
});
