import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetPageNavigationScopeForTests,
  bumpPageNavigationScope,
  getPageNavigationRevision,
  getPageNavigationScopeKey,
  getPageNavigationSignal,
  syncPageNavigationScopeStack,
  withIgnoredPageNavigationAbort,
} from '@/lib/navigation/page-navigation-scope';
import { normalizePageType } from '@/lib/media-shelf/compat-keys';
import { createOverlayStack } from '@/lib/navigation/overlay-stack';
import {
  prepareShellNavigation,
} from '@/lib/modules/shell-compat';
import {
  consumePendingReaderTab,
} from '@/stores/reader-internal-tab';

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

  it('keeps the underlying shell request alive while book info is pushed', () => {
    syncPageNavigationScopeStack([
      { key: 'reader\0shell', cancelExploreOnExit: true },
    ]);
    const exploreSignal = getPageNavigationSignal();

    syncPageNavigationScopeStack([
      { key: 'reader\0shell', cancelExploreOnExit: true },
      { key: 'book-info\0overlay-1' },
    ]);

    expect(exploreSignal.aborted).toBe(false);
    expect(getPageNavigationScopeKey()).toBe('book-info\0overlay-1');
    expect(getPageNavigationSignal()).not.toBe(exploreSignal);
  });

  it('aborts only book info requests when returning to the shell', () => {
    syncPageNavigationScopeStack([
      { key: 'reader\0shell', cancelExploreOnExit: true },
    ]);
    const exploreSignal = getPageNavigationSignal();
    syncPageNavigationScopeStack([
      { key: 'reader\0shell', cancelExploreOnExit: true },
      { key: 'book-info\0overlay-1' },
    ]);
    const detailSignal = getPageNavigationSignal();

    syncPageNavigationScopeStack([
      { key: 'reader\0shell', cancelExploreOnExit: true },
    ]);

    expect(detailSignal.aborted).toBe(true);
    expect(exploreSignal.aborted).toBe(false);
    expect(getPageNavigationSignal()).toBe(exploreSignal);
    expect(getPageNavigationScopeKey()).toBe('reader\0shell');
  });

  it('does not change the parent scope for a self-managed book info overlay', () => {
    syncPageNavigationScopeStack([
      { key: 'reader\0shell', cancelExploreOnExit: true },
    ]);
    const exploreSignal = getPageNavigationSignal();
    const revision = getPageNavigationRevision();

    syncPageNavigationScopeStack([
      { key: 'reader\0shell', cancelExploreOnExit: true },
      { key: 'book-info\0overlay-1', inheritParent: true },
    ]);
    syncPageNavigationScopeStack([
      { key: 'reader\0shell', cancelExploreOnExit: true },
    ]);

    expect(getPageNavigationSignal()).toBe(exploreSignal);
    expect(exploreSignal.aborted).toBe(false);
    expect(getPageNavigationRevision()).toBe(revision);
  });

  it('aborts the shell request when switching shell pages', () => {
    syncPageNavigationScopeStack([
      { key: 'reader\0shell', cancelExploreOnExit: true },
    ]);
    const exploreSignal = getPageNavigationSignal();

    syncPageNavigationScopeStack([
      { key: 'settings\0shell' },
    ]);

    expect(exploreSignal.aborted).toBe(true);
    expect(getPageNavigationSignal().aborted).toBe(false);
  });
});

describe('normalizePageType (shell route compat)', () => {
  it('maps legacy routes to new shell tabs', () => {
    expect(normalizePageType('bookshelf')).toBe('reader');
    expect(normalizePageType('bookshelf-cache')).toBe('media-cache');
    expect(normalizePageType('book-search')).toBe('reader');
    expect(normalizePageType('media-search')).toBe('reader');
    expect(normalizePageType('media')).toBe('reader');
    expect(normalizePageType('sources')).toBe('reader');
    expect(normalizePageType('scout')).toBe('reader');
    expect(normalizePageType('rss')).toBe('reader');
    expect(normalizePageType('subscription')).toBe('subscribe');
    expect(normalizePageType('music')).toBe('music');
  });
});

describe('prepareShellNavigation (reader internal tab compat)', () => {
  it('queues reader internal tab for legacy pages', () => {
    expect(prepareShellNavigation('sources')).toBe('reader');
    expect(consumePendingReaderTab()).toBe('sources');
  });

  it('queues search tab for book-search routes', () => {
    expect(prepareShellNavigation('book-search')).toBe('reader');
    expect(consumePendingReaderTab()).toBe('search');
  });
});

describe('createOverlayStack navigateShell (legacy route compat)', () => {
  it('normalizes bookshelf to reader when switching shell tab', () => {
    const nav = createOverlayStack('sources');
    nav.navigateShell('bookshelf');
    expect(nav.currentPage()).toBe('reader');
    expect(nav.shellTab()).toBe('reader');
  });
});
