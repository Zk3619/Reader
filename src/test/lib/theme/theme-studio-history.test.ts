import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultThemePack } from '@/lib/theme/schema/theme-pack-v1';
import { themeStudioHistory } from '@/stores/theme-studio-history';

describe('theme-studio-history', () => {
  beforeEach(() => {
    themeStudioHistory.clear();
  });

  it('supports undo after pushBeforeChange', () => {
    const previous = createDefaultThemePack({ name: 'Before' });
    const current = createDefaultThemePack({ name: 'After' });
    themeStudioHistory.pushBeforeChange(previous);
    const undone = themeStudioHistory.undo(current);
    expect(undone?.name).toBe('Before');
    expect(themeStudioHistory.canRedo).toBe(true);
  });

  it('deduplicates consecutive identical snapshots', () => {
    const pack = createDefaultThemePack();
    themeStudioHistory.pushBeforeChange(pack);
    themeStudioHistory.pushBeforeChange(pack);
    expect(themeStudioHistory.state.past).toHaveLength(1);
  });

  it('redo restores undone state', () => {
    const previous = createDefaultThemePack({ name: 'Before' });
    const current = createDefaultThemePack({ name: 'After' });
    themeStudioHistory.pushBeforeChange(previous);
    themeStudioHistory.undo(current);
    const redone = themeStudioHistory.redo(previous);
    expect(redone?.name).toBe('After');
    expect(themeStudioHistory.canUndo).toBe(true);
  });

  it('clears future stack on new change', () => {
    const a = createDefaultThemePack({ name: 'A' });
    const b = createDefaultThemePack({ name: 'B' });
    const c = createDefaultThemePack({ name: 'C' });
    themeStudioHistory.pushBeforeChange(a);
    themeStudioHistory.undo(b);
    expect(themeStudioHistory.canRedo).toBe(true);
    themeStudioHistory.pushBeforeChange(b);
    expect(themeStudioHistory.canRedo).toBe(false);
    expect(themeStudioHistory.undo(c)?.name).toBe('B');
  });
});
