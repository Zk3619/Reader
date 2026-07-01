import { describe, expect, it } from 'vitest';
import {
  resolveTextMenuBuiltinOrder,
  resolveTextMenuEntries,
  splitTextMenuEntriesForCollapsed,
} from '@/lib/media/text/reader-text-menu-config';

describe('reader text menu config', () => {
  it('uses Legado default primary items when collapsed', () => {
    const entries = resolveTextMenuEntries({
      contentSelectSpeakMod: 0,
      textMenuVisibleItems: undefined,
      textMenuHiddenProcessTextItems: [],
    });
    const split = splitTextMenuEntriesForCollapsed(entries);
    expect(split.primary.map((e) => (e.kind === 'builtin' ? e.id : e.key))).toEqual([
      'replace',
      'copy',
      'bookmark',
      'speakSelection',
      'dict',
    ]);
    expect(split.more.length).toBeGreaterThan(0);
  });

  it('inserts speakFromHere after speakSelection when mod enabled', () => {
    const order = resolveTextMenuBuiltinOrder({
      contentSelectSpeakMod: 1,
      textMenuVisibleItems: [
        'replace',
        'copy',
        'bookmark',
        'speakSelection',
        'speakFromHere',
        'dict',
        'searchContent',
        'browser',
        'share',
      ],
    });
    expect(order.indexOf('speakFromHere')).toBe(order.indexOf('speakSelection') + 1);
  });

  it('shows all entries in expanded layout', () => {
    const entries = resolveTextMenuEntries({
      contentSelectSpeakMod: 0,
      textMenuVisibleItems: undefined,
      textMenuHiddenProcessTextItems: [],
    });
    expect(entries.length).toBeGreaterThanOrEqual(8);
  });
});
