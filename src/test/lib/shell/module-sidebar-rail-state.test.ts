import { describe, expect, it } from 'vitest';

import {
  moduleSidebarRailState,
  readModuleSidebarRailExpanded,
} from '@/lib/shell/module-sidebar-rail-state';

describe('module-sidebar-rail-state', () => {
  it('defaults to expanded when cookie is absent', () => {
    expect(readModuleSidebarRailExpanded()).toBe(true);
    expect(readModuleSidebarRailExpanded(false)).toBe(false);
  });

  it('maps boolean to rail state', () => {
    expect(moduleSidebarRailState(true)).toBe('expanded');
    expect(moduleSidebarRailState(false)).toBe('collapsed');
  });
});
