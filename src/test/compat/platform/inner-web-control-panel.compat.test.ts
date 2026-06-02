import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { isBookSourceControlUrl, onInnerWebSessionEnded } from '@/lib/platform/inner-web-mode';

describe('book source control inner web', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
    onInnerWebSessionEnded();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    onInnerWebSessionEnded();
  });

  it('识别 /control 为书源设置页', () => {
    expect(isBookSourceControlUrl('https://v1.gyks.cf/control')).toBe(true);
    expect(isBookSourceControlUrl('https://v1.gyks.cf/control/')).toBe(true);
    expect(isBookSourceControlUrl('https://v1.gyks.cf/')).toBe(false);
  });
});
