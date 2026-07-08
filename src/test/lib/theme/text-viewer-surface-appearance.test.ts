import { describe, expect, it } from 'vitest';
import {
  mergeTextViewerSurfaceAppearanceStyle,
  resolveTextViewerSurfaceAppearance,
  TEXT_VIEWER_SURFACE_APPEARANCE_DEFAULT,
  TEXT_VIEWER_THEME_SURFACE_APPEARANCE_BY_ID,
} from '@/lib/theme/text-viewer-surface-appearance';

describe('text-viewer-surface-appearance', () => {
  it('defaults content surface to opaque with no blur', () => {
    expect(resolveTextViewerSurfaceAppearance(0, 'content')).toEqual(
      TEXT_VIEWER_SURFACE_APPEARANCE_DEFAULT,
    );
  });

  it('merges user config override over theme preset', () => {
    TEXT_VIEWER_THEME_SURFACE_APPEARANCE_BY_ID[2] = {
      chrome: { opacity: 90, blurPx: 4 },
    };
    const resolved = resolveTextViewerSurfaceAppearance(2, 'chrome', {
      config: { themeSurfaceAppearance: { chrome: { opacity: 75 } } },
    });
    expect(resolved.opacity).toBe(75);
    expect(resolved.blurPx).toBe(4);
    delete TEXT_VIEWER_THEME_SURFACE_APPEARANCE_BY_ID[2];
  });

  it('pageTip inherits chrome preset layers before its own override', () => {
    TEXT_VIEWER_THEME_SURFACE_APPEARANCE_BY_ID[1] = {
      chrome: { opacity: 88, blurPx: 6 },
      pageTip: { opacity: 92 },
    };
    const resolved = resolveTextViewerSurfaceAppearance(1, 'pageTip');
    expect(resolved.opacity).toBe(92);
    expect(resolved.blurPx).toBe(6);
    delete TEXT_VIEWER_THEME_SURFACE_APPEARANCE_BY_ID[1];
  });

  it('applies opacity and blur to inline background style', () => {
    const style = mergeTextViewerSurfaceAppearanceStyle(
      { 'background-color': '#f5f0e6', color: '#5b4636' },
      { opacity: 80, blurPx: 12 },
    );
    expect(style['background-color']).toContain('color-mix');
    expect(style['backdrop-filter']).toBe('blur(12px)');
    expect(style.color).toBe('#5b4636');
  });
});
