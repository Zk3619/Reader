import { describe, expect, it } from 'vitest';
import { gzipSync } from 'fflate';
import {
  audioTrackToLxMusicInfo,
  encodeLxmcBytes,
  lxMusicInfoToAudioTrack,
  playlistShareToLxPart,
  tryParseLxmcOrPlaylistJson,
} from '@/lib/media/audio/list/playlist-lxmc';
import type { PlaylistSharePayload } from '@/lib/media/audio/list/playlist-share';
import type { AudioTrack } from '@/lib/media/audio/track-types';

const sampleTrack: AudioTrack = {
  id: 'wy_123',
  name: '媚人',
  artist: '薛之谦',
  source: 'wy',
  duration: '03:46',
  meta: { songId: '123', albumName: '天外来物' },
};

describe('playlist-lxmc', () => {
  it('round-trips AudioTrack through LX music info', () => {
    const lx = audioTrackToLxMusicInfo(sampleTrack);
    const back = lxMusicInfoToAudioTrack(lx);
    expect(back?.name).toBe('媚人');
    expect(back?.artist).toBe('薛之谦');
    expect(back?.source).toBe('wy');
    expect(back?.meta.albumName).toBe('天外来物');
  });

  it('encodes and decodes gzip lxmc playListPart_v2', () => {
    const payload: PlaylistSharePayload = {
      v: 1,
      type: 'playListPart',
      id: 'pl_1',
      name: '测试列表',
      tracks: [sampleTrack],
    };
    const bytes = encodeLxmcBytes(playlistShareToLxPart(payload));
    expect(bytes[0]).toBe(0x1f);
    expect(bytes[1]).toBe(0x8b);
    const parsed = tryParseLxmcOrPlaylistJson(bytes);
    expect(parsed.name).toBe('测试列表');
    expect(parsed.tracks).toHaveLength(1);
    expect(parsed.tracks[0]?.name).toBe('媚人');
  });

  it('reads plain LX playListPart json (ungzipped)', () => {
    const json = JSON.stringify({
      type: 'playListPart',
      data: {
        id: 'default',
        name: '播放列表',
        list: [
          {
            id: 'kw_1',
            name: 'A',
            singer: 'B',
            source: 'kw',
            interval: '01:00',
            meta: { songId: '1' },
          },
        ],
      },
    });
    const parsed = tryParseLxmcOrPlaylistJson(json);
    expect(parsed.tracks[0]?.artist).toBe('B');
  });

  it('reads gzipped bytes that are not Reader share JSON', () => {
    const raw = new TextEncoder().encode(
      JSON.stringify({
        type: 'playListPart_v2',
        data: {
          id: 'pl_x',
          name: 'X',
          list: [audioTrackToLxMusicInfo(sampleTrack)],
        },
      }),
    );
    const gz = gzipSync(raw);
    const parsed = tryParseLxmcOrPlaylistJson(gz);
    expect(parsed.id).toBe('pl_x');
  });
});
