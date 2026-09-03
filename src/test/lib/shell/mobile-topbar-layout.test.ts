import { describe, expect, it } from 'vitest';
import { resolveShellLayout } from '@/lib/shell/layout';
import navigation from '@/components/shell/Navigation.tsx?raw';

describe('mobile topBar shell layout', () => {
  it('does not use sheet sidebar for mobile topBar nav', () => {
    const layout = resolveShellLayout({
      windowWidth: 400,
      preference: 'mobile',
      isMobileDevice: true,
      mobileShellNavStyle: 'topBar',
    });
    expect(layout.showTopNavigation).toBe(true);
    expect(layout.showModuleSidebarNav).toBe(false);
    expect(layout.sidebarUseSheet).toBe(false);
    expect(layout.showFusedModuleNav).toBe(false);
  });

  it('uses sheet sidebar for mobile moduleSidebar nav', () => {
    const layout = resolveShellLayout({
      windowWidth: 400,
      preference: 'mobile',
      isMobileDevice: true,
      mobileShellNavStyle: 'moduleSidebar',
    });
    expect(layout.showTopNavigation).toBe(false);
    expect(layout.showModuleSidebarNav).toBe(true);
    expect(layout.sidebarUseSheet).toBe(true);
  });

  it('does not use sheet sidebar for forced mobile topBar on wide viewport', () => {
    const layout = resolveShellLayout({
      windowWidth: 1280,
      preference: 'mobile',
      isMobileDevice: false,
      mobileShellNavStyle: 'topBar',
    });
    expect(layout.showSidebar).toBe(false);
    expect(layout.sidebarUseSheet).toBe(false);
    expect(layout.showFusedModuleNav).toBe(false);
  });

  it('uses tap dropdown for topBar module nav instead of hover NavigationMenu', () => {
    expect(navigation).toMatch(/AppDropdownMenu/);
    expect(navigation).not.toMatch(/NavigationMenu/);
    expect(navigation).toMatch(/showTopNavigation && shell\(\)\.sidebarUseSheet/);
  });

  it('keeps sheet sidebar for narrow desktop fused nav', () => {
    const layout = resolveShellLayout({
      windowWidth: 640,
      preference: 'desktop',
      isMobileDevice: false,
      desktopSidebarMode: 'fused',
    });
    expect(layout.showFusedModuleNav).toBe(true);
    expect(layout.sidebarUseSheet).toBe(true);
  });
});
