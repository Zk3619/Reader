import { describe, expect, it } from 'vitest';
import {
  MUSIC_SDK_SOURCES,
  assertMusicSdkSource,
  getSongListSorts,
  getLeaderboardBoards,
  getSongListTags,
  browseSongLists,
  hotSearchKeywords,
  tipSearchKeywords,
} from '@/lib/media/audio/music-sdk';
import {
  pickLyricText,
  hasLyricContent,
  resolveEffectiveLyricTrack,
} from '@/lib/media/audio/lyric-types';
import { qualityFallbackChain } from '@/lib/media/audio/music-quality';

describe('music-sdk', () => {
  it('exports all builtin sources', () => {
    expect(MUSIC_SDK_SOURCES).toEqual(['kw', 'kg', 'tx', 'wy', 'mg']);
  });

  it('assertMusicSdkSource validates source id', () => {
    expect(assertMusicSdkSource('wy')).toBe('wy');
    expect(() => assertMusicSdkSource('invalid')).toThrow();
  });

  it('each source has song list sorts', () => {
    for (const source of MUSIC_SDK_SOURCES) {
      const sorts = getSongListSorts(source);
      expect(sorts.length).toBeGreaterThan(0);
    }
  });

  it('each source has leaderboard boards', async () => {
    for (const source of MUSIC_SDK_SOURCES) {
      const boards = await getLeaderboardBoards(source);
      expect(boards.length).toBeGreaterThan(0);
    }
  });

  it('each source module exposes searchPlaylists', async () => {
    const modules = await Promise.all([
      import('@/lib/media/audio/music-sdk/sources/kw/song-list'),
      import('@/lib/media/audio/music-sdk/sources/wy/song-list'),
      import('@/lib/media/audio/music-sdk/sources/kg/song-list'),
      import('@/lib/media/audio/music-sdk/sources/tx/song-list'),
      import('@/lib/media/audio/music-sdk/sources/mg/song-list'),
    ]);
    for (const mod of modules) {
      expect(typeof mod.searchPlaylists).toBe('function');
    }
  });
});

describe('lyric-types', () => {
  it('pickLyricText prefers selected track', () => {
    expect(
      pickLyricText({ lyric: '原', tlyric: '译' }, 'tlyric'),
    ).toBe('译');
  });

  it('hasLyricContent detects any track', () => {
    expect(hasLyricContent({ tlyric: 'x' })).toBe(true);
    expect(hasLyricContent({})).toBe(false);
  });

  it('resolveEffectiveLyricTrack prefers lxlyric when karaoke enabled', () => {
    const bundle = { lyric: '原', lxlyric: '[00:01.00]<0,100>字' };
    expect(resolveEffectiveLyricTrack(bundle, 'lyric', true)).toBe('lxlyric');
    expect(resolveEffectiveLyricTrack(bundle, 'lxlyric', true)).toBe('lxlyric');
    expect(resolveEffectiveLyricTrack(bundle, 'lyric', false)).toBe('lyric');
    expect(resolveEffectiveLyricTrack(bundle, 'lxlyric', false)).toBe('lyric');
    expect(resolveEffectiveLyricTrack(bundle, 'tlyric', true)).toBe('tlyric');
    expect(resolveEffectiveLyricTrack({ lyric: '原' }, 'lyric', true)).toBe('lyric');
    // 假逐字（无标签）不得切入
    expect(
      resolveEffectiveLyricTrack({ lyric: '原', lxlyric: '[00:01.00]字' }, 'lyric', true),
    ).toBe('lyric');
  });
});

describe('music-quality', () => {
  it('qualityFallbackChain degrades from preferred', () => {
    const chain = qualityFallbackChain('320k');
    expect(chain[0]).toBe('320k');
    expect(chain).toContain('128k');
  });
});

/** 需网络；CI 无网时可 skip */
describe.skipIf(process.env.CI === 'true')('music-sdk discovery live smoke', () => {
  for (const source of MUSIC_SDK_SOURCES) {
    it.skip(`${source} hotSearch returns keywords`, async () => {
      const words = await hotSearchKeywords(source);
      expect(words.length).toBeGreaterThan(0);
    }, 20_000);

    it(`${source} tipSearch returns suggestions`, async () => {
      const words = await tipSearchKeywords(source, '周');
      expect(Array.isArray(words)).toBe(true);
      // 咪咕 suggest 接口当前常返回 HTML；其余源应对齐 lx 有结果
      if (source !== 'mg') {
        expect(words.length).toBeGreaterThan(0);
      }
    }, 20_000);
  }
});

/** 需网络；CI 无网时可 skip */
describe.skipIf(process.env.CI === 'true')('music-sdk song list live smoke', () => {
  for (const source of MUSIC_SDK_SOURCES) {
    it(`${source} getTags returns groups`, async () => {
      const tags = await getSongListTags(source);
      expect(tags.length).toBeGreaterThan(0);
    }, 30_000);

    it(`${source} getList returns playlists`, async () => {
      const sorts = getSongListSorts(source);
      const result = await browseSongLists(source, sorts[0]!.id, null, 1);
      expect(result.list.length).toBeGreaterThan(0);
      expect(result.source).toBe(source);
    }, 30_000);
  }
});
