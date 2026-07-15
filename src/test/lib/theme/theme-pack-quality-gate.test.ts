import { describe, expect, it } from 'vitest';
import { createDefaultThemePack } from '@/lib/theme/schema/theme-pack-v1';
import {
  ASSET_SIZE_LIMIT_BYTES,
  BLUR_LAYER_WARN_THRESHOLD,
  runThemePackQualityGate,
} from '@/lib/theme/quality/theme-pack-quality-gate';

describe('theme-pack-quality-gate', () => {
  it('passes default pack without blocking errors', () => {
    const pack = createDefaultThemePack({ name: '测试' });
    pack.meta = { author: 'Tester' };
    const result = runThemePackQualityGate(pack, { hasPreviewPng: true });
    expect(result.ok).toBe(true);
    expect(
      result.issues.filter((i) => i.severity === 'error' && !i.path.includes('tokens')),
    ).toHaveLength(0);
  });

  it('flags forbidden custom CSS patterns', () => {
    const pack = createDefaultThemePack();
    pack.advanced = {
      customCss: [{ scope: 'app', css: '@import url("evil.css");' }],
    };
    const result = runThemePackQualityGate(pack);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.path.includes('customCss') && i.severity === 'error')).toBe(
      true,
    );
  });

  it('warns when blur layers exceed threshold', () => {
    const pack = createDefaultThemePack();
    const blurSurface = { surfaceAppearance: { opacity: 80, blurPx: 8 } };
    pack.app = {
      ...pack.app!,
      components: {
        appShell: blurSurface,
        sidebar: blurSurface,
        topNav: blurSurface,
        bookshelfCard: blurSurface,
      },
    };
    const result = runThemePackQualityGate(pack);
    expect(
      result.issues.some(
        (i) => i.path === 'surfaceAppearance' && i.severity === 'warning' && i.message.includes(String(BLUR_LAYER_WARN_THRESHOLD)),
      ),
    ).toBe(true);
  });

  it('includes v3 target component blur layers in the performance gate', () => {
    const pack = createDefaultThemePack();
    const blurSurface = { surfaceAppearance: { opacity: 80, blurPx: 8 } };
    pack.targets = {
      'module.music': {
        components: {
          appShell: blurSurface,
          sidebar: blurSurface,
          topNav: blurSurface,
          button: blurSurface,
        },
      },
    };
    const result = runThemePackQualityGate(pack);
    expect(result.issues.some((issue) => issue.path === 'surfaceAppearance')).toBe(true);
  });

  it('blocks contrast errors when enforceOnExport is enabled', () => {
    const pack = createDefaultThemePack();
    pack.accessibility = { enforceOnExport: true, targetContrast: 'AA' };
    pack.app!.tokens.light = {
      ...pack.app!.tokens.light,
      foreground: '180 50% 50%',
      background: '180 50% 52%',
    };
    const result = runThemePackQualityGate(pack);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.path.includes('tokens') && i.severity === 'error')).toBe(
      true,
    );
  });

  it('errors when asset size exceeds limit', () => {
    const pack = createDefaultThemePack();
    pack.meta = { author: 'Tester' };
    const result = runThemePackQualityGate(pack, {
      assetSizeBytes: ASSET_SIZE_LIMIT_BYTES + 1,
      hasPreviewPng: true,
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.path === 'assets')).toBe(true);
  });
});
