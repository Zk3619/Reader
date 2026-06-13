import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetPageNavigationScopeForTests,
  bumpPageNavigationScope,
  getPageNavigationRevision,
  getPageNavigationScopeKey,
  getPageNavigationSignal,
  withIgnoredPageNavigationAbort,
} from '@/lib/navigation/page-navigation-scope';

describe('page-navigation-scope', () => {
  beforeEach(() => {
    __resetPageNavigationScopeForTests();
  });

  it('bump aborts prior signal and increments revision', () => {
    const first = getPageNavigationSignal();
    expect(first.aborted).toBe(false);
    bumpPageNavigationScope('bookshelf\0shell');
    expect(getPageNavigationScopeKey()).toBe('bookshelf\0shell');
    expect(getPageNavigationRevision()).toBe(1);
    bumpPageNavigationScope('sources\0shell');
    expect(first.aborted).toBe(true);
    expect(getPageNavigationRevision()).toBe(2);
    expect(getPageNavigationSignal().aborted).toBe(false);
  });

  it('same scope key does not abort again', () => {
    bumpPageNavigationScope('explore\0shell');
    const signal = getPageNavigationSignal();
    bumpPageNavigationScope('explore\0shell');
    expect(getPageNavigationRevision()).toBe(1);
    expect(signal.aborted).toBe(false);
  });

  it('withIgnoredPageNavigationAbort shields HTTP from page abort', async () => {
    bumpPageNavigationScope('bookshelf\0shell');
    const pageSignal = getPageNavigationSignal();
    await withIgnoredPageNavigationAbort(async () => {
      expect(getPageNavigationSignal().aborted).toBe(false);
      bumpPageNavigationScope('sources\0shell');
      expect(pageSignal.aborted).toBe(true);
      expect(getPageNavigationSignal().aborted).toBe(false);
    });
  });
});
