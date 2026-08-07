/**
 * Hand-written IE URL routing + format shape smoke (no network).
 */
import { describe, expect, it } from 'vitest';
import '@/lib/download/ytdlp/extractors';
import { ensureBuiltinLoaded, getExtractorForUrl } from '@/lib/download/ytdlp/registry';
import { BilibiliIE } from '@/lib/download/ytdlp/extractors/bilibili';
import { BiliBangumiIE, BiliBangumiSeasonIE, BiliBangumiMediaIE } from '@/lib/download/ytdlp/extractors/bilibili-bangumi';
import { DouyinIE } from '@/lib/download/ytdlp/extractors/more-sites';
import { TwitchStreamIE, TwitchClipsIE, TwitchVodIE } from '@/lib/download/ytdlp/extractors/sites';
import { YoutubeTabIE, YoutubePlaylistIE } from '@/lib/download/ytdlp/extractors/youtube/tab';
import { BilibiliCheeseIE } from '@/lib/download/ytdlp/extractors/bilibili-cheese';
import { PatreonCampaignIE } from '@/lib/download/ytdlp/extractors/hand-p/patreon';
import { WeiboIE } from '@/lib/download/ytdlp/extractors/weibo';
import { detectProtocol } from '@/lib/download/gopeed/resolve';
import { HAND_OVERRIDES } from '@/lib/download/ytdlp/extractors/generated-registry';

function ieName(url: string): string {
  ensureBuiltinLoaded();
  const ie = getExtractorForUrl(url);
  return String(ie?.IE_NAME || ie?.constructor.name || '');
}

describe('hand IE URL matching', () => {
  it('routes Youtube single vs Tab/Playlist', () => {
    expect(ieName('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toMatch(/youtube$/i);
    expect(ieName('https://www.youtube.com/playlist?list=PLrAXtmRdnEQy6nuLMOV8u4Ex9VE8eaNY8')).toMatch(
      /tab/i,
    );
    expect(YoutubeTabIE.suitable('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false);
    expect(
      YoutubeTabIE.suitable(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAXtmRdnEQy6nuLMOV8u4Ex9VE8eaNY8',
      ),
    ).toBe(true);
    expect(YoutubePlaylistIE.suitable('PLrAXtmRdnEQy6nuLMOV8u4Ex9VE8eaNY8')).toBe(true);
  });

  it('matches Bilibili family', () => {
    expect(BilibiliIE.suitable('https://www.bilibili.com/video/BV1xx411c7mD')).toBe(true);
    expect(BiliBangumiIE.suitable('https://www.bilibili.com/bangumi/play/ep21495')).toBe(true);
    expect(BiliBangumiSeasonIE.suitable('https://www.bilibili.com/bangumi/play/ss26801')).toBe(true);
    expect(BiliBangumiMediaIE.suitable('https://www.bilibili.com/bangumi/media/md24097891')).toBe(
      true,
    );
    expect(ieName('https://www.bilibili.com/bangumi/play/ss26801')).toMatch(/season/i);
    expect(ieName('https://www.bilibili.com/cheese/play/ep229832')).toMatch(/cheese/i);
    expect(BilibiliCheeseIE.suitable('https://www.bilibili.com/cheese/play/ep229832')).toBe(true);
  });

  it('matches Youtube tab shorts/c/user paths and bare channel', () => {
    expect(YoutubeTabIE.suitable('https://www.youtube.com/@MrBeast/shorts')).toBe(true);
    expect(YoutubeTabIE.suitable('https://www.youtube.com/@MrBeast/streams')).toBe(true);
    expect(YoutubeTabIE.suitable('https://www.youtube.com/c/MrBeast/videos')).toBe(true);
    expect(YoutubeTabIE.suitable('https://www.youtube.com/user/PewDiePie/videos')).toBe(true);
    expect(YoutubeTabIE.suitable('https://www.youtube.com/@MrBeast')).toBe(true);
    expect(YoutubeTabIE.suitable('https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA')).toBe(
      true,
    );
  });

  it('matches Douyin and Twitch stream/clips/vod', () => {
    expect(DouyinIE.suitable('https://www.douyin.com/video/6961737553342991651')).toBe(true);
    expect(DouyinIE.suitable('https://www.douyin.com/note/6961737553342991651')).toBe(true);
    expect(TwitchVodIE.suitable('https://www.twitch.tv/videos/123456789')).toBe(true);
    expect(TwitchClipsIE.suitable('https://clips.twitch.tv/AwkwardHelplessSalamanderSwiftRage')).toBe(
      true,
    );
    expect(TwitchStreamIE.suitable('https://www.twitch.tv/monstercat')).toBe(true);
    expect(TwitchStreamIE.suitable('https://www.twitch.tv/videos/123')).toBe(false);
    expect(ieName('https://www.twitch.tv/monstercat')).toMatch(/stream/i);
  });

  it('routes Zhihu zvideo and does not steal via PatreonCampaign', () => {
    const zhihuUrl = 'https://www.zhihu.com/zvideo/1342930761977176064';
    expect(ieName(zhihuUrl)).toMatch(/zhihu/i);
    expect(PatreonCampaignIE.suitable(zhihuUrl)).toBe(false);
    expect(PatreonCampaignIE.suitable('https://www.patreon.com/dissonancepod/')).toBe(true);
    expect(PatreonCampaignIE.suitable('https://www.patreon.com/m/80642')).toBe(true);
    expect(PatreonCampaignIE.suitable('https://xhamster.com/videos/foo-1509445')).toBe(false);
  });

  it('matches Weibo status URLs including layerid query', () => {
    expect(WeiboIE.suitable('https://weibo.com/7827771738/N4xlMvjhI')).toBe(true);
    expect(
      WeiboIE.suitable('https://weibo.com/7827771738/N4xlMvjhI?layerid=4910815147462302'),
    ).toBe(true);
    expect(WeiboIE.suitable('https://m.weibo.cn/status/4189191225395228')).toBe(true);
    expect(ieName('https://weibo.com/7827771738/N4xlMvjhI')).toMatch(/weibo/i);
  });

  it('HAND_OVERRIDES covers new hand keys', () => {
    for (const key of [
      'ABC',
      'AbemaTV',
      'AfreecaTV',
      'ArchiveOrg',
      'ArteTV',
      'AZMedien',
      'YoutubeTab',
      'YoutubePlaylist',
      'BiliBiliBangumiSeason',
      'BiliBiliBangumiMedia',
      'BilibiliCheese',
      'BilibiliCheeseSeason',
      'TwitchStream',
      'TwitchClips',
      'TwitchCollection',
      'TwitchVideos',
      'TwitterShortener',
      'VQQVideo',
      'XiaoHongShu',
      'Weibo',
      'AcFunVideo',
      'Youku',
      'Iqiyi',
      'Facebook',
      'PornHub',
      'BrightcoveNew',
      'Kaltura',
    ]) {
      expect(HAND_OVERRIDES.has(key)).toBe(true);
    }
  });
});

describe('YTDLP_HOST_HINT / detectProtocol', () => {
  it('selects ytdlp for CN and CDN hosts', () => {
    expect(detectProtocol('https://www.douyin.com/video/1')).toBe('ytdlp');
    expect(detectProtocol('https://v.qq.com/x/page/a.html')).toBe('ytdlp');
    expect(detectProtocol('https://www.xiaohongshu.com/explore/1')).toBe('ytdlp');
    expect(detectProtocol('https://weibo.com/tv/show/1')).toBe('ytdlp');
    expect(detectProtocol('https://www.acfun.cn/v/ac1')).toBe('ytdlp');
    expect(detectProtocol('https://www.zhihu.com/zvideo/1342930761977176064')).toBe('ytdlp');
    expect(detectProtocol('https://v.youku.com/v_show/id_1.html')).toBe('ytdlp');
    expect(detectProtocol('https://www.iqiyi.com/v_1.html')).toBe('ytdlp');
    expect(detectProtocol('https://www.pornhub.com/view_video.php?viewkey=1')).toBe('ytdlp');
    expect(
      detectProtocol(
        'https://players.brightcove.net/1/default_default/index.html?videoId=1',
      ),
    ).toBe('ytdlp');
  });
});

describe('playlist_result / url_result shape', () => {
  it('BilibiliIE playlist_result has entries with urls', () => {
    const ie = new BilibiliIE();
    const pl = ie.playlist_result(
      [
        ie.url_result('https://www.bilibili.com/video/BV1xx411c7mD?p=1', 'BiliBili', 'id1', 'P1'),
        ie.url_result('https://www.bilibili.com/video/BV1xx411c7mD?p=2', 'BiliBili', 'id2', 'P2'),
      ],
      'BV1xx411c7mD',
      'multi',
    );
    expect(pl._type).toBe('playlist');
    expect(pl.entries?.length).toBe(2);
    expect(pl.entries?.[0]?._type).toBe('url');
    expect(pl.entries?.[0]?.url).toContain('p=1');
  });
});
