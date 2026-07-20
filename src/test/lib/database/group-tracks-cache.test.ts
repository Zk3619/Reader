import { describe, expect, it, beforeEach } from 'vitest';
import {
  invalidateGroupTracksCache,
  loadGroupTracksThroughCache,
  peekGroupTracksCache,
  prependTrackInGroupTracksCache,
  resetGroupTracksCacheForTests,
  setGroupTracksCache,
} from '@/lib/database/group-tracks-cache';
import type { AudioTrack } from '@/lib/media/audio/track-types';

function track(id: string): AudioTrack {
  return {
    id,
    name: id,
    artist: '',
    source: 'local',
    duration: '00:00',
    meta: {},
  };
}

describe('group-tracks-cache', () => {
  beforeEach(() => {
    resetGroupTracksCacheForTests();
  });

  it('returns cache hit without querying', async () => {
    setGroupTracksCache(1, [track('a'), track('b')]);
    let queries = 0;
    const result = await loadGroupTracksThroughCache(1, async () => {
      queries += 1;
      return [track('x')];
    });
    expect(queries).toBe(0);
    expect(result.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('does not let an in-flight query overwrite a newer setGroupTracksCache order', async () => {
    let release!: (tracks: AudioTrack[]) => void;
    const slow = new Promise<AudioTrack[]>((resolve) => {
      release = resolve;
    });

    const pending = loadGroupTracksThroughCache(7, () => slow);
    setGroupTracksCache(7, [track('b'), track('a')]);
    release([track('a'), track('b')]);

    const result = await pending;
    expect(result.map((t) => t.id)).toEqual(['b', 'a']);
    expect(peekGroupTracksCache(7)?.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('does not let an in-flight query refill after invalidate', async () => {
    let release!: (tracks: AudioTrack[]) => void;
    const slow = new Promise<AudioTrack[]>((resolve) => {
      release = resolve;
    });

    const pending = loadGroupTracksThroughCache(3, () => slow);
    invalidateGroupTracksCache(3);
    setGroupTracksCache(3, [track('z')]);
    release([track('stale')]);

    const result = await pending;
    expect(result.map((t) => t.id)).toEqual(['z']);
    expect(peekGroupTracksCache(3)?.map((t) => t.id)).toEqual(['z']);
  });

  it('prependTrackInGroupTracksCache moves track to front without touching other groups', () => {
    setGroupTracksCache(1, [track('a'), track('b'), track('c')]);
    setGroupTracksCache(2, [track('x')]);
    prependTrackInGroupTracksCache(1, track('c'), 200);
    expect(peekGroupTracksCache(1)?.map((t) => t.id)).toEqual(['c', 'a', 'b']);
    expect(peekGroupTracksCache(2)?.map((t) => t.id)).toEqual(['x']);
  });
});
