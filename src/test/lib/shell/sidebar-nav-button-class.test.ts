import { describe, expect, it } from 'vitest';
import { sidebarNavButtonClass } from '@/lib/shell/sidebar-nav-button-class';

describe('sidebarNavButtonClass', () => {
  it('applies icon-only sizing when collapsed', () => {
    const cls = sidebarNavButtonClass(true, { collapsed: true });
    expect(cls).toContain('!size-8');
    expect(cls).toContain('justify-center');
    expect(cls).not.toContain('border-l-primary');
  });

  it('keeps left border when expanded and active', () => {
    const cls = sidebarNavButtonClass(true, { collapsed: false });
    expect(cls).toContain('border-l-primary');
  });
});
