import { describe, expect, it } from 'vitest';
import {
  applyPaletteToThemePack,
  generateSemanticPalette,
} from '@/lib/theme/generation/theme-palette-generator';
import {
  THEME_STYLE_PRESET_IDS,
  getThemeGenerationPreset,
} from '@/lib/theme/generation/theme-generation-presets';
import { colorToHex, meetsContrast } from '@/lib/theme/quality/contrast-checker';
import { createDefaultThemePack } from '@/lib/theme/schema/theme-pack-v1';

describe('theme-palette-generator', () => {
  it('exposes 7 style presets', () => {
    expect(THEME_STYLE_PRESET_IDS).toHaveLength(7);
    expect(THEME_STYLE_PRESET_IDS).toEqual([
      'default',
      'minimal',
      'md3',
      'glass',
      'paper',
      'highContrast',
      'cyber',
    ]);
  });

  for (const presetId of THEME_STYLE_PRESET_IDS) {
    it(`generates light and dark palettes for preset "${presetId}"`, () => {
      const result = generateSemanticPalette({
        primarySeed: '#3b82f6',
        mode: 'dual',
        stylePresetId: presetId,
        contrastLevel: 'AA',
      });
      expect(result.light.background).toBeTruthy();
      expect(result.dark.background).toBeTruthy();
      expect(getThemeGenerationPreset(presetId).id).toBe(presetId);
    });
  }

  it('meets AA contrast for core foreground/background pairs', () => {
    const { light, dark } = generateSemanticPalette({
      primarySeed: '#6366f1',
      backgroundSeed: '#fafafa',
      mode: 'dual',
      stylePresetId: 'default',
      contrastLevel: 'AA',
    });

    expect(
      meetsContrast(colorToHex(light.foreground), colorToHex(light.background), 'AA'),
    ).toBe(true);
    expect(meetsContrast(colorToHex(dark.foreground), colorToHex(dark.background), 'AA')).toBe(
      true,
    );
    expect(meetsContrast(colorToHex(light.cardForeground), colorToHex(light.card), 'AA')).toBe(
      true,
    );
    expect(meetsContrast(colorToHex(dark.mutedForeground), colorToHex(dark.muted), 'AA')).toBe(
      true,
    );
  });

  it('writes generation metadata via applyPaletteToThemePack', () => {
    const pack = createDefaultThemePack();
    const next = applyPaletteToThemePack(pack, {
      primarySeed: '#2563eb',
      mode: 'dual',
      stylePresetId: 'glass',
    });
    expect(next.generation?.primarySeed).toBe('#2563eb');
    expect(next.generation?.stylePresetId).toBe('glass');
    expect(next.generation?.generatedAt).toBeTruthy();
    expect(next.app?.tokens.light).toBeTruthy();
    expect(next.app?.tokens.dark).toBeTruthy();
  });
});
