import { describe, expect, it } from 'vitest';
import {
  getMissingMusicModuleBuiltinPresets,
  isThemePresetApplicableToMusicModule,
  LX_MUSIC_MODULE_THEME_SEEDS,
  MUSIC_MODULE_BUILTIN_THEME_PRESETS,
} from '@/lib/theme/music-module-theme-presets';
import { applyThemeTargetToElement } from '@/lib/theme/theme-runtime';

describe('music module builtin theme presets', () => {
  it('generates the ten LX-inspired presets as isolated V3 music targets', () => {
    expect(LX_MUSIC_MODULE_THEME_SEEDS).toHaveLength(10);
    expect(MUSIC_MODULE_BUILTIN_THEME_PRESETS).toHaveLength(10);

    for (const preset of MUSIC_MODULE_BUILTIN_THEME_PRESETS) {
      expect(preset.schemaVersion).toBe(3);
      expect(preset.scopes).toEqual({ app: false, viewer: false });
      expect(preset.app).toBeUndefined();
      expect(preset.viewer).toBeUndefined();
      expect(Object.keys(preset.targets ?? {})).toEqual(['module.music']);
      expect(preset.targets?.['module.music']?.tokens?.light.primary).toMatch(
        /^\d+ \d+% \d+%$/,
      );
      expect(preset.targets?.['module.music']?.tokens?.dark.primary).toBe(
        preset.targets?.['module.music']?.tokens?.light.primary,
      );
    }
  });

  it('keeps LX names and derives the expected primary hues', () => {
    expect(MUSIC_MODULE_BUILTIN_THEME_PRESETS.map((preset) => preset.name)).toEqual([
      '绿意盎然',
      '蓝田生玉',
      '蛋雅深蓝',
      '橙黄橘绿',
      '热情似火',
      '粉装玉琢',
      '重斤球紫',
      '灰常美丽',
      '青出于黑',
      '清热板蓝',
    ]);
    expect(
      MUSIC_MODULE_BUILTIN_THEME_PRESETS[0]?.targets?.['module.music']?.tokens?.light.primary,
    ).toBe('149 39% 49%');
  });

  it('derives theme-specific readable foreground and surface colors', () => {
    const lightForegrounds = MUSIC_MODULE_BUILTIN_THEME_PRESETS.map(
      (preset) => preset.targets?.['module.music']?.tokens?.light.foreground,
    );
    const darkForegrounds = MUSIC_MODULE_BUILTIN_THEME_PRESETS.map(
      (preset) => preset.targets?.['module.music']?.tokens?.dark.foreground,
    );
    expect(new Set(lightForegrounds).size).toBeGreaterThan(5);
    expect(new Set(darkForegrounds).size).toBeGreaterThan(5);
    for (const preset of MUSIC_MODULE_BUILTIN_THEME_PRESETS) {
      const tokens = preset.targets?.['module.music']?.tokens;
      expect(tokens?.light.background).not.toBe(tokens?.light.foreground);
      expect(tokens?.dark.background).not.toBe(tokens?.dark.foreground);
    }
  });

  it('returns only missing builtin records for database registration', () => {
    const first = MUSIC_MODULE_BUILTIN_THEME_PRESETS[0]!;
    const second = MUSIC_MODULE_BUILTIN_THEME_PRESETS[1]!;
    const missing = getMissingMusicModuleBuiltinPresets([first.id, second.id]);

    expect(missing).toHaveLength(8);
    expect(missing.some((preset) => preset.id === first.id)).toBe(false);
    expect(missing.some((preset) => preset.id === second.id)).toBe(false);
  });

  it('only exposes V3 presets with a module.music target as applicable', () => {
    expect(
      isThemePresetApplicableToMusicModule({
        manifest: MUSIC_MODULE_BUILTIN_THEME_PRESETS[0]!,
      }),
    ).toBe(true);
    expect(
      isThemePresetApplicableToMusicModule({
        manifest: {
          ...MUSIC_MODULE_BUILTIN_THEME_PRESETS[0]!,
          targets: { app: MUSIC_MODULE_BUILTIN_THEME_PRESETS[0]!.targets?.['module.music'] },
        },
      }),
    ).toBe(false);
  });

  it('writes the selected music palette to the module host', () => {
    const values = new Map<string, string>();
    const attributes = new Map<string, string>();
    const element = {
      style: {
        cssText: '',
        setProperty: (name: string, value: string) => values.set(name, value),
      },
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      querySelector: () => null,
      children: [],
    } as unknown as HTMLElement;
    const preset = MUSIC_MODULE_BUILTIN_THEME_PRESETS[0]!;

    applyThemeTargetToElement(element, preset, 'module.music', 'light');

    expect(values.get('--primary')).toBe('149 39% 49%');
    expect(values.get('--color-primary')).toBe('hsl(149 39% 49%)');
    expect(values.get('--accent')).toBe('149 39% 92%');
    expect(values.get('--foreground')).toBe('149 28% 12%');
    expect(values.get('--color-foreground')).toBe('hsl(149 28% 12%)');
    expect(values.get('--color-background')).toBe(
      `hsl(${preset.targets?.['module.music']?.tokens?.light.background})`,
    );
    expect(attributes.get('data-theme-pack-id')).toBe(preset.id);
  });
});
