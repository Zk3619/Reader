import { describe, expect, it } from 'vitest';
import {
  mfMusicItemToTrack,
  mfLyricToBundle,
  lxQualityToMf,
  trackToMfMusicItem,
} from '@/lib/media/audio/online/mf-plugin/media-adapter';
import { loadMfPluginCode } from '@/lib/media/audio/online/mf-plugin/runtime';
import {
  mfSourceKey,
  parseMfPluginId,
} from '@/lib/media/audio/online/mf-plugin/types';

const FAKE_PLUGIN = `
module.exports = {
  platform: 'TestSource',
  version: '1.0.0',
  async search(query, page, type) {
    if (type !== 'music') return { isEnd: true, data: [] };
    return {
      isEnd: true,
      data: [{
        id: '1',
        platform: 'TestSource',
        title: query,
        artist: 'Artist',
        duration: 200,
        album: 'Album',
        artwork: 'https://example.com/cover.jpg',
      }],
    };
  },
  async getMediaSource(musicItem, quality) {
    return { url: 'https://example.com/' + musicItem.id + '.mp3', quality };
  },
  async getLyric(musicItem) {
    return { rawLrc: '[00:01.00]' + musicItem.title };
  },
};
`;

describe('mf-plugin media adapter', () => {
  it('maps mf source keys', () => {
    expect(mfSourceKey('abc123')).toBe('mf:abc123');
    expect(parseMfPluginId('mf:abc123')).toBe('abc123');
    expect(parseMfPluginId('wy')).toBeNull();
  });

  it('converts music item to track and back', () => {
    const track = mfMusicItemToTrack(
      {
        id: '99',
        platform: 'TestSource',
        title: 'Hello',
        artist: 'A',
        duration: 125,
        album: 'B',
        artwork: 'https://x/y.jpg',
        qualities: { standard: { size: '3MB' } },
      },
      'plugin1',
    );
    expect(track.source).toBe('mf:plugin1');
    expect(track.name).toBe('Hello');
    expect(track.meta.mfPluginId).toBe('plugin1');
    const back = trackToMfMusicItem(track);
    expect(back.id).toBe('99');
    expect(back.title).toBe('Hello');
  });

  it('converts lyric bundle', () => {
    expect(mfLyricToBundle({ rawLrc: '[00:00]hi', translation: 'en' })).toEqual({
      lyric: '[00:00]hi',
      tlyric: 'en',
    });
  });

  it('maps lx quality to mf', () => {
    expect(lxQualityToMf('320k')).toBe('standard');
    expect(lxQualityToMf('flac')).toBe('high');
  });
});

describe('mf-plugin runtime', () => {
  it('loads fake plugin and exposes methods', async () => {
    const loaded = loadMfPluginCode({
      code: FAKE_PLUGIN,
      pluginId: 'test',
    });
    expect(loaded.name).toBe('TestSource');
    expect(loaded.supportedMethods).toContain('search');
    const search = await loaded.instance.search!('keyword', 1, 'music');
    expect(search?.data?.[0]?.title).toBe('keyword');
    const url = await loaded.instance.getMediaSource!(
      search!.data![0] as never,
      'standard',
    );
    expect(url?.url).toContain('1.mp3');
    const lyric = await loaded.instance.getLyric!(search!.data![0] as never);
    expect(lyric?.rawLrc).toContain('keyword');
  });
});
