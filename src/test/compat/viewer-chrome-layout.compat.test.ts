import { describe, expect, it } from 'vitest';
import { normalizeViewerChromeLayout } from '@/lib/viewer/viewer-chrome-layout';

describe('normalizeViewerChromeLayout', () => {
  it('maps legacy overlay to stacked', () => {
    expect(normalizeViewerChromeLayout('overlay')).toBe('stacked');
  });

  it('accepts fixed, stacked, floating', () => {
    expect(normalizeViewerChromeLayout('fixed')).toBe('fixed');
    expect(normalizeViewerChromeLayout('stacked')).toBe('stacked');
    expect(normalizeViewerChromeLayout('floating')).toBe('floating');
  });

  it('falls back to stacked default', () => {
    expect(normalizeViewerChromeLayout(undefined)).toBe('stacked');
    expect(normalizeViewerChromeLayout('invalid')).toBe('stacked');
  });
});
