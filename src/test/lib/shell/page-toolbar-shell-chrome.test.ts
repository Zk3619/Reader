import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/platform/detect', () => ({
  isTauri: vi.fn(() => true),
  isMobile: vi.fn(() => false),
}));

import { isMobile, isTauri } from '@/lib/platform/detect';
import { resolveShellLayout } from '@/lib/shell/layout';
import {
  shouldShowPageToolbarShellChrome,
  shouldShowPageToolbarSidebarTrigger,
} from '@/lib/shell/page-toolbar-shell-chrome';

describe('page-toolbar-shell-chrome', () => {
  beforeEach(() => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(isMobile).mockReturnValue(false);
  });
  it('shows sidebar trigger in module sidebar mode without top nav', () => {
    const layout = resolveShellLayout({
      windowWidth: 1280,
      preference: 'mobile',
      isMobileDevice: false,
      mobileShellNavStyle: 'moduleSidebar',
    });
    expect(layout.showTopNavigation).toBe(false);
    expect(layout.showModuleSidebarNav).toBe(true);
    expect(shouldShowPageToolbarSidebarTrigger(layout)).toBe(true);
  });

  it('hides sidebar trigger when top nav owns it', () => {
    const layout = resolveShellLayout({
      windowWidth: 1280,
      preference: 'mobile',
      isMobileDevice: false,
      mobileShellNavStyle: 'topBar',
    });
    expect(layout.showTopNavigation).toBe(true);
    expect(shouldShowPageToolbarSidebarTrigger(layout)).toBe(false);
  });

  it('shows shell chrome on desktop forced mobile without top nav', () => {
    const layout = resolveShellLayout({
      windowWidth: 1280,
      preference: 'mobile',
      isMobileDevice: false,
      mobileShellNavStyle: 'moduleSidebar',
    });
    expect(shouldShowPageToolbarShellChrome(layout)).toBe(true);
  });

  it('hides shell chrome when top nav is visible', () => {
    const layout = resolveShellLayout({
      windowWidth: 1280,
      preference: 'mobile',
      isMobileDevice: false,
      mobileShellNavStyle: 'topBar',
    });
    expect(shouldShowPageToolbarShellChrome(layout)).toBe(false);
  });

  it('hides shell chrome on real mobile device', () => {
    vi.mocked(isMobile).mockReturnValue(true);
    const layout = resolveShellLayout({
      windowWidth: 400,
      preference: 'mobile',
      isMobileDevice: true,
      mobileShellNavStyle: 'moduleSidebar',
    });
    expect(shouldShowPageToolbarShellChrome(layout)).toBe(false);
    expect(shouldShowPageToolbarSidebarTrigger(layout)).toBe(true);
  });
});
