import { describe, expect, it } from 'vitest';
import { SAKURA_THEME_PRESET } from '@/lib/media/audio/online/mf-plugin/mf-theme-presets/sakura';
import {
  getMfBuiltinThemePreset,
  listMfBuiltinThemePresets,
} from '@/lib/media/audio/online/mf-plugin/mf-theme-presets';
import { parseMfThemePackCss } from '@/lib/media/audio/online/mf-plugin/theme-pack';

describe('mf sakura theme preset', () => {
  it('registers sakura as builtin preset', () => {
    expect(listMfBuiltinThemePresets().map((p) => p.id)).toContain('sakura');
    expect(getMfBuiltinThemePreset('sakura')?.name).toBe('樱花');
  });

  it('includes MusicFree primary color variables', () => {
    expect(SAKURA_THEME_PRESET.css).toContain('--primaryColor: #ff7676');
    expect(SAKURA_THEME_PRESET.css).toContain('--backgroundColor: #686c75');
    expect(SAKURA_THEME_PRESET.effect).toBe('sakura-iframe');
    expect(SAKURA_THEME_PRESET.iframeUrl).toContain('/mf-themes/sakura/');
  });

  it('bridges Reader hub hsl tokens', () => {
    expect(SAKURA_THEME_PRESET.css).toContain('--primary: 0 100% 73%');
    expect(SAKURA_THEME_PRESET.css).toContain('--background: 225 7% 43%');
  });

  it('parses @config block like official theme css', () => {
    const sample = `/* @config {"name":"樱花","author":"猫头猫"} */
:root { --primaryColor: #ff7676; }`;
    const { meta, css } = parseMfThemePackCss(sample);
    expect(meta.name).toBe('樱花');
    expect(css).toContain('--primaryColor');
    expect(css).not.toContain('@config');
  });
});
