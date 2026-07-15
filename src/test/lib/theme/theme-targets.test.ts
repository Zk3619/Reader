import { describe, expect, it } from 'vitest';
import {
  getThemeTargetChain,
  isThemePackApplicableToTarget,
  isThemePresetActive,
  isThemePresetActiveForTarget,
  normalizeActiveThemePresetByTarget,
  replaceDeletedThemePresetTargets,
  resolveActiveThemePresetId,
} from '@/lib/theme/theme-targets';
import {
  getActiveThemeTargetPackSnapshot,
  publishActiveThemeTargetPack,
} from '@/stores/theme-active-pack';
import { MUSIC_MODULE_BUILTIN_THEME_PRESETS } from '@/lib/theme/music-module-theme-presets';

describe('theme targets', () => {
  it('resolves the exact target before module and app fallbacks', () => {
    const active = {
      app: 'app-pack',
      'module.music': 'music-pack',
      'music.playDetail': 'detail-pack',
    } as const;

    expect(resolveActiveThemePresetId('music.playDetail', active)).toEqual({
      target: 'music.playDetail',
      presetId: 'detail-pack',
    });
    expect(resolveActiveThemePresetId('music.desktopLyric', active)).toEqual({
      target: 'module.music',
      presetId: 'music-pack',
    });
    expect(resolveActiveThemePresetId('viewer.video', active)).toEqual({
      target: 'app',
      presetId: 'app-pack',
    });
  });

  it('returns the complete inheritance chain', () => {
    expect(getThemeTargetChain('viewer.text')).toEqual([
      'viewer.text',
      'module.reading',
      'app',
    ]);
  });

  it('lets music child targets inherit module.music when explicit overrides are absent', () => {
    const active = {
      app: 'app-pack',
      'module.music': 'music-pack',
    } as const;

    expect(resolveActiveThemePresetId('music.playDetail', active)).toEqual({
      target: 'module.music',
      presetId: 'music-pack',
    });
    expect(resolveActiveThemePresetId('music.desktopLyric', active)).toEqual({
      target: 'module.music',
      presetId: 'music-pack',
    });
  });

  it('migrates legacy app and viewer selections and removes unknown targets', () => {
    expect(
      normalizeActiveThemePresetByTarget(
        {
          'module.music': ' music ',
          unknown: 'ignored',
          'viewer.text': '',
        },
        {
          activeThemePresetId: 'app',
          activeViewerThemePresetId: 'reader',
        },
      ),
    ).toEqual({
      app: 'app',
      'module.reading': 'reader',
      'module.music': 'music',
    });
  });

  it('detects presets active on any target', () => {
    const active = { app: 'one', 'viewer.text': 'two' } as const;
    expect(isThemePresetActive('two', active)).toBe(true);
    expect(isThemePresetActive('missing', active)).toBe(false);
  });

  it('keeps quick-switch applicability and selection target-specific', () => {
    const musicOnly = {
      scopes: { app: false, viewer: false },
      targets: { 'module.music': {} },
    };
    expect(isThemePackApplicableToTarget(musicOnly, 'module.music')).toBe(true);
    expect(isThemePackApplicableToTarget(musicOnly, 'app')).toBe(false);
    expect(isThemePackApplicableToTarget(musicOnly, 'module.reading')).toBe(false);

    const active = { app: 'app-pack', 'module.music': 'music-pack' } as const;
    expect(isThemePresetActiveForTarget('music-pack', 'module.music', active)).toBe(true);
    expect(isThemePresetActiveForTarget('music-pack', 'app', active)).toBe(false);
  });

  it('falls back safely when a preset active on multiple targets is deleted', () => {
    expect(
      replaceDeletedThemePresetTargets(
        {
          app: 'deleted',
          'module.reading': 'deleted',
          'viewer.text': 'deleted',
          'module.music': 'kept',
        },
        'deleted',
        'builtin',
      ),
    ).toEqual({
      app: 'builtin',
      'module.reading': 'builtin',
      'module.music': 'kept',
    });
  });

  it('publishes and clears an immediate module target pack snapshot', () => {
    const pack = MUSIC_MODULE_BUILTIN_THEME_PRESETS[0]!;
    publishActiveThemeTargetPack('module.music', pack);
    expect(getActiveThemeTargetPackSnapshot('module.music')).toBe(pack);

    publishActiveThemeTargetPack('module.music', null);
    expect(getActiveThemeTargetPackSnapshot('module.music')).toBeNull();
  });
});
