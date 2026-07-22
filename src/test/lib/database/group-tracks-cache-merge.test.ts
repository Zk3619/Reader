import { describe, expect, it } from 'vitest';
import {
  mergeTrackPreserveListMeta,
  prependTrackInGroupTracksCache,
  peekGroupTracksCache,
  setGroupTracksCache,
  resetGroupTracksCacheForTests,
} from '@/lib/database/group-tracks-cache';
import type { AudioTrack } from '@/lib/media/audio/track-types';

function track(partial: Partial<AudioTrack> & Pick<AudioTrack, 'id' | 'name'>): AudioTrack {
  return {
    artist: 'a',
    source: 'mf:x',
    duration: '00:00',
    meta: {},
    ...partial,
  };
}

describe('mergeTrackPreserveListMeta', () => {
  it('keeps cacheTier when incoming omits it', () => {
    const existing = track({
      id: '1',
      name: 'old',
      duration: '03:35',
      meta: { cacheTier: 'auto', cachePath: 'music-tracks/abc' },
    });
    const incoming = track({
      id: '1',
      name: 'new',
      duration: '00:00',
      meta: { coverUrl: 'https://x' },
    });
    const merged = mergeTrackPreserveListMeta(existing, incoming);
    expect(merged.name).toBe('new');
    expect(merged.meta.cacheTier).toBe('auto');
    expect(merged.meta.cachePath).toBe('music-tracks/abc');
    expect(merged.meta.coverUrl).toBe('https://x');
    expect(merged.duration).toBe('03:35');
  });

  it('prefers incoming cacheTier when present', () => {
    const existing = track({
      id: '1',
      name: 'old',
      meta: { cacheTier: 'auto' },
    });
    const incoming = track({
      id: '1',
      name: 'new',
      meta: { cacheTier: 'manual' },
    });
    expect(mergeTrackPreserveListMeta(existing, incoming).meta.cacheTier).toBe('manual');
  });
});

describe('prependTrackInGroupTracksCache', () => {
  it('does not drop cache badge when prepending plain track', () => {
    resetGroupTracksCacheForTests();
    const gid = 42;
    setGroupTracksCache(gid, [
      track({
        id: '1',
        name: 'song',
        meta: { cacheTier: 'auto' },
      }),
      track({ id: '2', name: 'other' }),
    ]);
    prependTrackInGroupTracksCache(
      gid,
      track({ id: '1', name: 'song', meta: { coverUrl: 'c' } }),
      200,
    );
    const list = peekGroupTracksCache(gid)!;
    expect(list[0]?.id).toBe('1');
    expect(list[0]?.meta.cacheTier).toBe('auto');
    expect(list[0]?.meta.coverUrl).toBe('c');
  });
});
