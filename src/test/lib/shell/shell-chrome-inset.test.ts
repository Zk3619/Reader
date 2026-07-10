import { describe, expect, it } from 'vitest';

import {
  resolveShellContentLeft,
  shellContentLeftClass,
} from '@/lib/shell/shell-chrome-inset';

describe('resolveShellContentLeft', () => {
  it('returns 0 when no sidebars', () => {
    expect(
      resolveShellContentLeft({
        showSidebar: false,
        sidebarExpanded: true,
        showModuleRail: false,
        moduleRailExpanded: true,
      }),
    ).toBe('0px');
  });

  it('offsets by sidebar width when expanded', () => {
    expect(
      resolveShellContentLeft({
        showSidebar: true,
        sidebarExpanded: true,
        showModuleRail: false,
        moduleRailExpanded: true,
      }),
    ).toBe('var(--sidebar-width)');
  });

  it('offsets by sidebar and module rail when both expanded', () => {
    expect(
      resolveShellContentLeft({
        showSidebar: true,
        sidebarExpanded: true,
        showModuleRail: true,
        moduleRailExpanded: true,
      }),
    ).toBe('calc(var(--sidebar-width) + var(--sidebar-width))');
  });

  it('uses independent icon widths when both collapsed', () => {
    expect(
      resolveShellContentLeft({
        showSidebar: true,
        sidebarExpanded: false,
        showModuleRail: true,
        moduleRailExpanded: false,
      }),
    ).toBe('calc(var(--sidebar-width-icon) + var(--sidebar-width-icon))');
  });

  it('uses independent widths when main collapsed and module expanded', () => {
    expect(
      resolveShellContentLeft({
        showSidebar: true,
        sidebarExpanded: false,
        showModuleRail: true,
        moduleRailExpanded: true,
      }),
    ).toBe('calc(var(--sidebar-width-icon) + var(--sidebar-width))');
  });

  it('uses independent widths when main expanded and module collapsed', () => {
    expect(
      resolveShellContentLeft({
        showSidebar: true,
        sidebarExpanded: true,
        showModuleRail: true,
        moduleRailExpanded: false,
      }),
    ).toBe('calc(var(--sidebar-width) + var(--sidebar-width-icon))');
  });

  it('maps to tailwind left class', () => {
    expect(
      shellContentLeftClass({
        showSidebar: false,
        sidebarExpanded: true,
        showModuleRail: false,
        moduleRailExpanded: true,
      }),
    ).toBe('left-0');
  });
});
