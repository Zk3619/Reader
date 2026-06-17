import { describe, expect, it } from 'vitest';

import { resolveShellLayout } from '@/lib/shell/layout';

describe('resolveShellLayout', () => {
  it('uses mobile shell for mobile preference below 480px on desktop', () => {
    const layout = resolveShellLayout({
      windowWidth: 400,
      preference: 'mobile',
      isMobileDevice: false,
    });
    expect(layout.useMobileShell).toBe(true);
    expect(layout.showBottomBar).toBe(true);
    expect(layout.showTopNavigation).toBe(false);
  });

  it('uses desktop top nav for desktop preference below 480px on desktop', () => {
    const layout = resolveShellLayout({
      windowWidth: 400,
      preference: 'desktop',
      isMobileDevice: false,
    });
    expect(layout.useMobileShell).toBe(false);
    expect(layout.showBottomBar).toBe(false);
    expect(layout.showTopNavigation).toBe(true);
  });

  it('forces mobile shell for compact mobile device regardless of desktop preference', () => {
    const layout = resolveShellLayout({
      windowWidth: 400,
      preference: 'desktop',
      isMobileDevice: true,
    });
    expect(layout.useMobileShell).toBe(true);
    expect(layout.showTopNavigation).toBe(false);
  });

  it('uses mobile shell for auto on mobile device at wide width', () => {
    const layout = resolveShellLayout({
      windowWidth: 600,
      preference: 'auto',
      isMobileDevice: true,
    });
    expect(layout.useMobileShell).toBe(true);
    expect(layout.showTopNavigation).toBe(false);
  });
});
