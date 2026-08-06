import { describe, expect, it } from 'vitest';

import {
  resolveShellContentLeft,
  shellContentLeftClass,
  shellMediaPlayerBarInsetStyle,
  shellMediaPlayerBarTransitionClass,
  SHELL_SIDEBAR_CSS_VARS,
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

describe('shellMediaPlayerBarInsetStyle', () => {
  it('embeds sidebar CSS vars so Portal-to-body left:var(--sidebar-*) resolves', () => {
    const style = shellMediaPlayerBarInsetStyle('var(--sidebar-width-icon)');
    expect(style['--sidebar-width']).toBe(SHELL_SIDEBAR_CSS_VARS['--sidebar-width']);
    expect(style['--sidebar-width-icon']).toBe(SHELL_SIDEBAR_CSS_VARS['--sidebar-width-icon']);
    expect(style.left).toBe('var(--sidebar-width-icon)');
    expect(style.right).toBe('0px');
    expect(style.width).toBe('auto');
  });

  it('falls back to 0px left when unset', () => {
    expect(shellMediaPlayerBarInsetStyle().left).toBe('0px');
    expect(shellMediaPlayerBarInsetStyle('  ').left).toBe('0px');
  });
});

describe('shellMediaPlayerBarTransitionClass', () => {
  it('matches shell chrome duration and eases left with sidebar', () => {
    expect(shellMediaPlayerBarTransitionClass).toContain('duration-200');
    expect(shellMediaPlayerBarTransitionClass).toContain('ease-linear');
    expect(shellMediaPlayerBarTransitionClass).toContain('transition-[left]');
  });
});
