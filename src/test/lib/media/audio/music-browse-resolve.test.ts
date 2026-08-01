import { describe, expect, it } from 'vitest';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import {
  isUsableAlbumBrowseId,
  isUsableSingerBrowseId,
  normalizeMusicBrowseSource,
  pickAlbumIdFromTracks,
  pickSingerIdFromTracks,
  primaryArtistName,
  trackAlbumBrowseId,
} from '@/lib/media/audio/music-sdk/browse-resolve';

function track(partial: {
  artist: string;
  singerId?: string;
  albumId?: string;
  albumMid?: string;
  albumName?: string;
}): AudioTrack {
  return {
    id: 't1',
    name: 'Song',
    artist: partial.artist,
    source: 'wy',
    duration: '03:00',
    meta: {
      ...(partial.singerId != null ? { singerId: partial.singerId } : {}),
      ...(partial.albumId != null ? { albumId: partial.albumId } : {}),
      ...(partial.albumMid != null ? { albumMid: partial.albumMid } : {}),
      ...(partial.albumName != null ? { albumName: partial.albumName } : {}),
    },
  };
}

describe('music-browse-resolve', () => {
  it('maps netease platform source to wy for browse APIs', () => {
    expect(normalizeMusicBrowseSource('netease')).toBe('wy');
    expect(normalizeMusicBrowseSource('wy')).toBe('wy');
  });

  it('rejects artist display name used as singer id (context-menu bug)', () => {
    expect(isUsableSingerBrowseId('AGA', 'wy', 'AGA')).toBe(false);
    expect(isUsableSingerBrowseId('AGA', 'wy', 'AGA、Other')).toBe(false);
    expect(isUsableSingerBrowseId('12345', 'wy', 'AGA')).toBe(true);
    expect(isUsableSingerBrowseId('0', 'kg', 'Someone')).toBe(false);
    expect(isUsableSingerBrowseId('0025NhlN2yWrP4', 'tx', '邓紫棋')).toBe(true);
  });

  it('picks singerId from search hits by artist match', () => {
    const tracks = [
      track({ artist: 'Someone Else', singerId: '1' }),
      track({ artist: 'AGA、Feat', singerId: '9621' }),
      track({ artist: 'AGA', singerId: '9621' }),
    ];
    expect(pickSingerIdFromTracks(tracks, 'AGA')).toBe('9621');
    expect(pickSingerIdFromTracks(tracks, 'AGA、Other')).toBe('9621');
  });

  it('picks albumId / falls back to albumMid (tx)', () => {
    expect(
      pickAlbumIdFromTracks(
        [track({ artist: 'AGA', albumName: 'Wonderful U', albumId: '34720989' })],
        'Wonderful U',
        'AGA',
      ),
    ).toBe('34720989');
    expect(
      pickAlbumIdFromTracks(
        [track({ artist: 'G.E.M.', albumName: '新的心跳', albumMid: '00333SoF02PJWm' })],
        '新的心跳',
        'G.E.M.',
      ),
    ).toBe('00333SoF02PJWm');
  });

  it('trackAlbumBrowseId prefers albumId then albumMid', () => {
    expect(trackAlbumBrowseId({ meta: { albumId: '1', albumMid: 'mid' } })).toBe('1');
    expect(trackAlbumBrowseId({ meta: { albumMid: 'mid' } })).toBe('mid');
    expect(isUsableAlbumBrowseId('Wonderful U', 'wy', 'Wonderful U')).toBe(false);
    expect(primaryArtistName('AGA、Feat')).toBe('AGA');
  });
});
