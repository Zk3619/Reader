import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockApp = {
  enableVisualShadow: true,
  enableVisualTransparency: true,
  enableVisualBlur: true,
};

vi.mock('@/stores/settings', () => ({
  settingsState: {
    get app() {
      return mockApp;
    },
  },
}));

import {
  applyVisualEffectsToChromeAppearance,
  isVisualBlurEnabled,
  isVisualShadowEnabled,
  isVisualTransparencyEnabled,
  resolveVisualBoxShadow,
} from '@/lib/ui/visual-effects-settings';

describe('visual-effects-settings', () => {
  beforeEach(() => {
    mockApp.enableVisualShadow = true;
    mockApp.enableVisualTransparency = true;
    mockApp.enableVisualBlur = true;
  });

  it('defaults all visual effects to enabled', () => {
    expect(isVisualShadowEnabled()).toBe(true);
    expect(isVisualTransparencyEnabled()).toBe(true);
    expect(isVisualBlurEnabled()).toBe(true);
  });

  it('forces opaque and no blur when toggles are off', () => {
    mockApp.enableVisualTransparency = false;
    mockApp.enableVisualBlur = false;
    expect(applyVisualEffectsToChromeAppearance({ opacity: 70, blurPx: 12 })).toEqual({
      opacity: 100,
      blurPx: 0,
    });
  });

  it('returns none for box shadow when shadow disabled', () => {
    mockApp.enableVisualShadow = false;
    expect(resolveVisualBoxShadow('0 0 8px red')).toBe('none');
    expect(resolveVisualBoxShadow(undefined)).toBeUndefined();
    mockApp.enableVisualShadow = true;
    expect(resolveVisualBoxShadow('0 0 8px red')).toBe('0 0 8px red');
  });
});
