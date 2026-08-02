/**
 * Smoke test for newly hand-written Bilibili family extractors (URL routing only, no network).
 */
import { describe, expect, it } from 'vitest';
import '@/lib/download/ytdlp/extractors';
import { HAND_OVERRIDES } from '@/lib/download/ytdlp/extractors/generated-registry';
import {
  BilibiliBaseIE,
  BilibiliCheeseBaseIE,
  BilibiliSpaceBaseIE,
  BilibiliSpaceListBaseIE,
  BilibiliSpaceVideoIE,
  BilibiliSpaceAudioIE,
  BilibiliCollectionListIE,
  BilibiliSeriesListIE,
  BilibiliFavoritesListIE,
  BilibiliWatchlaterIE,
  BilibiliPlaylistIE,
  BilibiliCategoryIE,
  BilibiliAudioBaseIE,
  BilibiliAudioIE,
  BilibiliAudioAlbumIE,
  BiliBiliPlayerIE,
  BiliBiliDynamicIE,
  BiliIntlBaseIE,
  BiliIntlIE,
  BiliIntlSeriesIE,
  BiliLiveIE,
  BiliBiliSearchIE,
} from '@/lib/download/ytdlp/extractors';

describe('new Bilibili family URL matching', () => {
  it('bases never match a URL', () => {
    for (const Base of [
      BilibiliBaseIE,
      BilibiliCheeseBaseIE,
      BilibiliSpaceBaseIE,
      BilibiliSpaceListBaseIE,
      BilibiliAudioBaseIE,
      BiliIntlBaseIE,
    ]) {
      expect(Base.suitable('https://www.bilibili.com/video/BV1xx411c7mD')).toBe(false);
    }
  });

  it('BilibiliSpaceVideoIE / SpaceAudioIE', () => {
    expect(BilibiliSpaceVideoIE.suitable('https://space.bilibili.com/3985676/video')).toBe(true);
    expect(BilibiliSpaceVideoIE.suitable('https://space.bilibili.com/3985676')).toBe(true);
    expect(
      BilibiliSpaceAudioIE.suitable('https://space.bilibili.com/313580179/upload/audio'),
    ).toBe(true);
  });

  it('BilibiliCollectionListIE defers to BilibiliSeriesListIE on type=series', () => {
    expect(
      BilibiliCollectionListIE.suitable('https://space.bilibili.com/2142762/lists/3662502?type=season'),
    ).toBe(true);
    expect(
      BilibiliCollectionListIE.suitable(
        'https://space.bilibili.com/1958703906/lists/547718?type=series',
      ),
    ).toBe(false);
    expect(
      BilibiliSeriesListIE.suitable('https://space.bilibili.com/1958703906/lists/547718?type=series'),
    ).toBe(true);
  });

  it('BilibiliFavoritesListIE / WatchlaterIE / PlaylistIE / CategoryIE', () => {
    expect(
      BilibiliFavoritesListIE.suitable('https://space.bilibili.com/84912/favlist?fid=1103407912'),
    ).toBe(true);
    expect(
      BilibiliFavoritesListIE.suitable('https://www.bilibili.com/medialist/detail/ml1103407912'),
    ).toBe(true);
    expect(BilibiliWatchlaterIE.suitable('https://www.bilibili.com/watchlater/#/list')).toBe(true);
    expect(BilibiliPlaylistIE.suitable('https://www.bilibili.com/list/1958703906?sid=547718')).toBe(
      true,
    );
    expect(BilibiliCategoryIE.suitable('https://www.bilibili.com/v/kichiku/mad')).toBe(true);
  });

  it('BilibiliAudioIE / AudioAlbumIE', () => {
    expect(BilibiliAudioIE.suitable('https://www.bilibili.com/audio/au1003142')).toBe(true);
    expect(BilibiliAudioAlbumIE.suitable('https://www.bilibili.com/audio/am10624')).toBe(true);
  });

  it('BiliBiliPlayerIE / DynamicIE', () => {
    expect(
      BiliBiliPlayerIE.suitable('http://player.bilibili.com/player.html?aid=92494333&cid=1'),
    ).toBe(true);
    expect(BiliBiliDynamicIE.suitable('https://t.bilibili.com/998134289197432852')).toBe(true);
    expect(BiliBiliDynamicIE.suitable('https://www.bilibili.com/opus/998134289197432852')).toBe(
      true,
    );
  });

  it('BiliIntlIE / SeriesIE / BiliLiveIE', () => {
    expect(BiliIntlIE.suitable('https://www.bilibili.tv/en/play/34613/341736')).toBe(true);
    expect(BiliIntlIE.suitable('https://bilibili.tv/en/video/2019955076')).toBe(true);
    expect(BiliIntlSeriesIE.suitable('https://www.bilibili.tv/en/play/34613')).toBe(true);
    expect(BiliIntlSeriesIE.suitable('https://www.bilibili.tv/en/media/1048837')).toBe(true);
    expect(BiliLiveIE.suitable('https://live.bilibili.com/196')).toBe(true);
    expect(BiliLiveIE.suitable('https://live.bilibili.com/blanc/196')).toBe(true);
  });

  it('BiliBiliSearchIE is a working base (no direct URL match)', () => {
    expect(BiliBiliSearchIE.suitable('https://www.bilibili.com/video/BV1xx411c7mD')).toBe(false);
  });

  it('HAND_OVERRIDES covers every new key', () => {
    for (const key of [
      'BilibiliBase',
      'BilibiliCheeseBase',
      'BilibiliSpaceBase',
      'BilibiliSpaceListBase',
      'BilibiliSpaceVideo',
      'BilibiliSpaceAudio',
      'BilibiliCollectionList',
      'BilibiliSeriesList',
      'BilibiliFavoritesList',
      'BilibiliWatchlater',
      'BilibiliPlaylist',
      'BilibiliCategory',
      'BilibiliAudioBase',
      'BilibiliAudio',
      'BilibiliAudioAlbum',
      'BiliBiliPlayer',
      'BiliBiliDynamic',
      'BiliIntlBase',
      'BiliIntl',
      'BiliIntlSeries',
      'BiliLive',
      'BiliBiliSearch',
    ]) {
      expect(HAND_OVERRIDES.has(key)).toBe(true);
    }
  });
});
