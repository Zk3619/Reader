/**
 * Built-in extractors：手写覆盖层优先，再注册全量转译 IE（generated-registry）。
 */

import { registerExtractor, markRegistryLoaded } from '../registry';
import type { ExtractorEntry } from '../types';
import { InfoExtractor } from '../common';
import { GenericIE } from './generic';
import { YoutubeIE } from './youtube';
import { YoutubeTabIE, YoutubePlaylistIE } from './youtube/tab';
import { BilibiliIE } from './bilibili';
import {
  BiliBangumiIE,
  BiliBangumiSeasonIE,
  BiliBangumiMediaIE,
} from './bilibili-bangumi';
import { TwitterIE } from './twitter';
import { TikTokIE } from './tiktok';
import { VimeoIE, TwitchVodIE, TwitchStreamIE, TwitchClipsIE, SoundcloudIE } from './sites';
import {
  DouyinIE,
  InstagramIE,
  RedditIE,
  NiconicoIE,
} from './more-sites';
import { FacebookIE, FacebookReelIE } from './facebook';
import { PornHubIE, PornHubUserIE, PornHubPlaylistIE } from './pornhub';
import { BrightcoveNewIE, BrightcoveLegacyIE } from './brightcove';
import { KalturaIE } from './kaltura';
import { VQQVideoIE, VQQSeriesIE } from './tencent';
import { XiaoHongShuIE } from './xiaohongshu';
import { WeiboIE, WeiboVideoIE } from './weibo';
import { AcFunVideoIE, AcFunBangumiIE } from './acfun';
import { YoukuIE, YoukuShowIE } from './youku';
import { IqiyiIE } from './iqiyi';
import { buildGeneratedExtractorEntries } from './generated-registry';

type IEConstructor = {
  new (): InfoExtractor;
  IE_NAME: string;
  _VALID_URL?: RegExp | string | Array<RegExp | string> | false | null;
  suitable(url: string): boolean;
};

function entryFromIE(IE: IEConstructor, ie_key: string): ExtractorEntry {
  const valid = IE._VALID_URL ?? null;
  return {
    ie_key,
    ie_name: IE.IE_NAME,
    valid_url:
      valid instanceof RegExp
        ? valid.source
        : typeof valid === 'string'
          ? valid
          : Array.isArray(valid)
            ? valid.map((item) => (item instanceof RegExp ? item.source : String(item)))
            : valid === false
              ? false
              : null,
    valid_url_re: valid instanceof RegExp ? valid : undefined,
    matchesUrl: (url: string) => IE.suitable(url),
    implemented: true,
    create: () => new IE(),
  };
}

/** Concrete implementations — registered first (higher priority than stubs). */
export function registerBuiltinExtractors(): void {
  // Site-specific before generic (Tab/Playlist before single-video Youtube)
  registerExtractor(entryFromIE(YoutubeTabIE, 'YoutubeTab'));
  registerExtractor(entryFromIE(YoutubePlaylistIE, 'YoutubePlaylist'));
  registerExtractor(entryFromIE(YoutubeIE, 'Youtube'));
  registerExtractor(entryFromIE(BilibiliIE, 'BiliBili'));
  registerExtractor(entryFromIE(BiliBangumiIE, 'BiliBiliBangumi'));
  registerExtractor(entryFromIE(BiliBangumiSeasonIE, 'BiliBiliBangumiSeason'));
  registerExtractor(entryFromIE(BiliBangumiMediaIE, 'BiliBiliBangumiMedia'));
  registerExtractor(entryFromIE(TwitterIE, 'Twitter'));
  registerExtractor(entryFromIE(TikTokIE, 'TikTok'));
  registerExtractor(entryFromIE(VimeoIE, 'Vimeo'));
  registerExtractor(entryFromIE(TwitchVodIE, 'TwitchVod'));
  registerExtractor(entryFromIE(TwitchClipsIE, 'TwitchClips'));
  registerExtractor(entryFromIE(TwitchStreamIE, 'TwitchStream'));
  registerExtractor(entryFromIE(SoundcloudIE, 'Soundcloud'));
  registerExtractor(entryFromIE(DouyinIE, 'Douyin'));
  registerExtractor(entryFromIE(InstagramIE, 'Instagram'));
  registerExtractor(entryFromIE(RedditIE, 'Reddit'));
  registerExtractor(entryFromIE(NiconicoIE, 'Niconico'));
  registerExtractor(entryFromIE(FacebookIE, 'Facebook'));
  registerExtractor(entryFromIE(FacebookReelIE, 'FacebookReel'));
  registerExtractor(entryFromIE(PornHubIE, 'PornHub'));
  registerExtractor(entryFromIE(PornHubUserIE, 'PornHubUser'));
  registerExtractor(entryFromIE(PornHubPlaylistIE, 'PornHubPlaylist'));
  registerExtractor(entryFromIE(BrightcoveNewIE, 'BrightcoveNew'));
  registerExtractor(entryFromIE(BrightcoveLegacyIE, 'BrightcoveLegacy'));
  registerExtractor(entryFromIE(KalturaIE, 'Kaltura'));
  registerExtractor(entryFromIE(VQQVideoIE, 'VQQVideo'));
  registerExtractor(entryFromIE(VQQSeriesIE, 'VQQSeries'));
  registerExtractor(entryFromIE(XiaoHongShuIE, 'XiaoHongShu'));
  registerExtractor(entryFromIE(WeiboIE, 'Weibo'));
  registerExtractor(entryFromIE(WeiboVideoIE, 'WeiboVideo'));
  registerExtractor(entryFromIE(AcFunVideoIE, 'AcFunVideo'));
  registerExtractor(entryFromIE(AcFunBangumiIE, 'AcFunBangumi'));
  registerExtractor(entryFromIE(YoukuIE, 'Youku'));
  registerExtractor(entryFromIE(YoukuShowIE, 'YoukuShow'));
  registerExtractor(entryFromIE(IqiyiIE, 'Iqiyi'));

  // 全量转译 IE（HAND_OVERRIDES 内的 key 已跳过，不会覆盖手写）
  for (const entry of buildGeneratedExtractorEntries()) {
    registerExtractor(entry);
  }

  // Generic 垫底
  registerExtractor(entryFromIE(GenericIE, 'Generic'));

  markRegistryLoaded();
}

// Auto-register on import
registerBuiltinExtractors();

export {
  GenericIE,
  YoutubeIE,
  YoutubeTabIE,
  YoutubePlaylistIE,
  BilibiliIE,
  BiliBangumiIE,
  BiliBangumiSeasonIE,
  BiliBangumiMediaIE,
  TwitterIE,
  TikTokIE,
  VimeoIE,
  TwitchVodIE,
  TwitchStreamIE,
  TwitchClipsIE,
  SoundcloudIE,
  DouyinIE,
  InstagramIE,
  RedditIE,
  NiconicoIE,
  FacebookIE,
  FacebookReelIE,
  PornHubIE,
  PornHubUserIE,
  PornHubPlaylistIE,
  BrightcoveNewIE,
  BrightcoveLegacyIE,
  KalturaIE,
  VQQVideoIE,
  VQQSeriesIE,
  XiaoHongShuIE,
  WeiboIE,
  WeiboVideoIE,
  AcFunVideoIE,
  AcFunBangumiIE,
  YoukuIE,
  YoukuShowIE,
  IqiyiIE,
};
export { GENERATED_EXTRACTOR_DEFS, buildGeneratedExtractorEntries, HAND_OVERRIDES, IMPLEMENTED_IE_KEYS } from './generated-registry';
