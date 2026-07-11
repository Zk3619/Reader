import { describe, expect, it } from 'vitest';
import { createDefaultThemePack } from '@/lib/theme/schema/theme-pack-v1';
import {
  patchPackSurface,
  surfaceFromPack,
  surfaceToTextViewerKind,
} from '@/lib/theme/surface/theme-surface';

describe('theme-surface', () => {
  it('round-trips textViewer surface through patchPackSurface', () => {
    const pack = createDefaultThemePack();
    const patched = patchPackSurface(
      pack,
      { kind: 'textViewer', surfaceKind: 'chrome' },
      { opacity: 85, blurPx: 8 },
      'light',
    );
    const surface = surfaceFromPack(
      patched,
      { kind: 'textViewer', surfaceKind: 'chrome' },
      'light',
    );
    expect(surface.opacity).toBe(85);
    expect(surface.blurPx).toBe(8);
  });

  it('clears surfaceAppearance when opacity is 100 and blur is 0', () => {
    const pack = createDefaultThemePack();
    let patched = patchPackSurface(
      pack,
      { kind: 'textViewer', surfaceKind: 'content' },
      { opacity: 80, blurPx: 4 },
      'light',
    );
    patched = patchPackSurface(
      patched,
      { kind: 'textViewer', surfaceKind: 'content' },
      { opacity: 100, blurPx: 0 },
      'light',
    );
    expect(patched.viewer?.text?.surfaceAppearance?.content).toBeUndefined();
  });

  it('surfaceToTextViewerKind preserves other surface kinds', () => {
    const pack = createDefaultThemePack();
    const withChrome = patchPackSurface(
      pack,
      { kind: 'textViewer', surfaceKind: 'chrome' },
      { opacity: 90, blurPx: 6 },
      'light',
    );
    const current = surfaceFromPack(
      withChrome,
      { kind: 'textViewer', surfaceKind: 'content' },
      'light',
    );
    const withContent = surfaceToTextViewerKind('content', { ...current, opacity: 95 }, withChrome);
    expect(withContent.viewer?.text?.surfaceAppearance?.chrome?.opacity).toBe(90);
    expect(withContent.viewer?.text?.surfaceAppearance?.content?.opacity).toBe(95);
  });

  it('patches app component surfaceAppearance', () => {
    const pack = createDefaultThemePack();
    const patched = patchPackSurface(
      pack,
      { kind: 'component', componentId: 'sidebar' },
      { opacity: 78, blurPx: 10 },
      'light',
    );
    expect(patched.app?.components?.sidebar?.surfaceAppearance).toEqual({
      opacity: 78,
      blurPx: 10,
    });
  });
});
