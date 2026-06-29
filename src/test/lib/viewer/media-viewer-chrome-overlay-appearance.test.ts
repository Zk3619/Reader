import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEWER_CHROME_OVERLAY_BLUR_PX,
  DEFAULT_VIEWER_CHROME_OVERLAY_OPACITY,
  mergeViewerChromeThemedSurfaceStyle,
  normalizeViewerChromeOverlayBlurPx,
  normalizeViewerChromeOverlayOpacity,
  viewerChromeOverlayAppearanceApplies,
} from '@/lib/viewer/media-viewer-chrome-overlay-appearance';

describe('media-viewer-chrome-overlay-appearance', () => {
  it('defaults to opaque and no blur', () => {
    expect(normalizeViewerChromeOverlayOpacity(undefined)).toBe(
      DEFAULT_VIEWER_CHROME_OVERLAY_OPACITY,
    );
    expect(normalizeViewerChromeOverlayBlurPx(undefined)).toBe(
      DEFAULT_VIEWER_CHROME_OVERLAY_BLUR_PX,
    );
  });

  it('applies only to stacked and floating layouts', () => {
    expect(viewerChromeOverlayAppearanceApplies('stacked')).toBe(true);
    expect(viewerChromeOverlayAppearanceApplies('floating')).toBe(true);
    expect(viewerChromeOverlayAppearanceApplies('fixed')).toBe(false);
  });

  it('merges themed surface with opacity and blur', () => {
    const style = mergeViewerChromeThemedSurfaceStyle(
      { 'background-color': '#112233' },
      'stacked',
      80,
      8,
    );
    expect(style?.['background-color']).toContain('color-mix');
    expect(style?.['backdrop-filter']).toBe('blur(8px)');
  });

  it('fixed layout keeps base style unchanged', () => {
    const base = { 'background-color': '#112233' };
    expect(mergeViewerChromeThemedSurfaceStyle(base, 'fixed', 50, 12)).toEqual(base);
  });
});
