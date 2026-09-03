import { describe, expect, it } from 'vitest';

import { resolveShellLayout } from '@/lib/shell/layout';
import {
  getModuleNavItems,
  hasModuleSidebarRailContent,
  navigateModuleNav,
} from '@/lib/modules/module-nav-registry';
import { readerInternalTabValue } from '@/stores/reader-internal-tab';

describe('resolveShellLayout', () => {
  it('uses mobile shell with topBar navigation by default', () => {
    const layout = resolveShellLayout({
      windowWidth: 400,
      preference: 'mobile',
      isMobileDevice: false,
      mobileShellNavStyle: 'topBar',
    });
    expect(layout.useMobileShell).toBe(true);
    expect(layout.showBottomBar).toBe(true);
    expect(layout.showTopNavigation).toBe(true);
    expect(layout.insetTopSafeArea).toBe(false);
  });

  it('uses module sidebar nav when mobileShellNavStyle is moduleSidebar', () => {
    const layout = resolveShellLayout({
      windowWidth: 400,
      preference: 'mobile',
      isMobileDevice: true,
      mobileShellNavStyle: 'moduleSidebar',
    });
    expect(layout.showTopNavigation).toBe(false);
    expect(layout.showModuleSidebarNav).toBe(true);
    expect(layout.insetTopSafeArea).toBe(true);
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

  it('shows module sidebar rail in desktop independent mode', () => {
    const layout = resolveShellLayout({
      windowWidth: 1024,
      preference: 'desktop',
      isMobileDevice: false,
      desktopSidebarMode: 'independent',
    });
    expect(layout.showSidebar).toBe(true);
    expect(layout.showModuleSidebarRail).toBe(true);
    expect(layout.showFusedModuleNav).toBe(false);
  });

  it('shows fused module nav in desktop fused mode', () => {
    const layout = resolveShellLayout({
      windowWidth: 1024,
      preference: 'desktop',
      isMobileDevice: false,
      desktopSidebarMode: 'fused',
    });
    expect(layout.showFusedModuleNav).toBe(true);
    expect(layout.showModuleSidebarRail).toBe(false);
    expect(layout.sidebarUseSheet).toBe(false);
  });

  it('shows fused module nav on narrow desktop via sheet sidebar', () => {
    const layout = resolveShellLayout({
      windowWidth: 640,
      preference: 'desktop',
      isMobileDevice: false,
      desktopSidebarMode: 'fused',
    });
    expect(layout.showSidebar).toBe(false);
    expect(layout.showFusedModuleNav).toBe(true);
    expect(layout.sidebarUseSheet).toBe(true);
  });

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
});

describe('module-nav-registry', () => {
  it('lists reader internal tabs', () => {
    const items = getModuleNavItems('reader');
    expect(items.map((i) => i.id)).toEqual([
      'shelf',
      'explore',
      'sources',
      'bookmark',
      'record',
      'rss',
      'settings',
    ]);
  });

  it('navigates reader internal tab', () => {
    navigateModuleNav('reader', 'sources');
    expect(readerInternalTabValue()).toBe('sources');
  });

  it('settings module has no independent sidebar rail', () => {
    expect(hasModuleSidebarRailContent('settings')).toBe(false);
    expect(hasModuleSidebarRailContent('reader')).toBe(true);
  });

  it('uses a custom sidebar rail for subscribe without generic nav items', () => {
    expect(getModuleNavItems('subscribe')).toEqual([]);
    expect(hasModuleSidebarRailContent('subscribe')).toBe(true);
  });
});
