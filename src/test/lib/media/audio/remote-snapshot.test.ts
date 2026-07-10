import { describe, expect, it } from 'vitest';
import {
  parseSnapshot,
  serializeSnapshot,
} from '@/lib/media/audio/sync/remote-snapshot';

describe('remote-snapshot', () => {
  it('round-trips snapshot json', () => {
    const snap = {
      version: 1 as const,
      exportedAt: 1,
      playlists: [
        {
          id: 'local',
          name: '本地',
          source: 'builtin' as const,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      tracks: [],
    };
    const parsed = parseSnapshot(serializeSnapshot(snap));
    expect(parsed.version).toBe(1);
    expect(parsed.playlists[0]?.id).toBe('local');
  });

  it('preserves playlistItems membership', () => {
    const snap = {
      version: 1 as const,
      exportedAt: 1,
      playlists: [
        {
          id: 'pl1',
          name: '测试歌单',
          source: 'local' as const,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      tracks: [
        {
          id: 'kw__1',
          name: 'A',
          artist: 'X',
          source: 'kw',
          duration: '03:00',
          meta: {},
        },
        {
          id: 'kw__2',
          name: 'B',
          artist: 'Y',
          source: 'kw',
          duration: '04:00',
          meta: {},
        },
      ],
      playlistItems: [
        { playlistId: 'pl1', trackId: 'kw__1', order: 0 },
      ],
    };
    const parsed = parseSnapshot(serializeSnapshot(snap));
    expect(parsed.playlistItems).toHaveLength(1);
    expect(parsed.playlistItems?.[0]?.trackId).toBe('kw__1');
  });
});
