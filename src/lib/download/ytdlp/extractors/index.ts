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
import { BilibiliCheeseIE, BilibiliCheeseSeasonIE, BilibiliCheeseBaseIE } from './bilibili-cheese';
import { BilibiliBaseIE } from './bilibili-base';
import {
  BilibiliSpaceBaseIE,
  BilibiliSpaceListBaseIE,
  BilibiliSpaceVideoIE,
  BilibiliSpaceAudioIE,
  BilibiliCollectionListIE,
  BilibiliSeriesListIE,
  BilibiliFavoritesListIE,
  BilibiliWatchlaterIE,
  BilibiliPlaylistIE,
} from './bilibili-space';
import { BilibiliAudioBaseIE, BilibiliAudioIE, BilibiliAudioAlbumIE } from './bilibili-audio';
import {
  BilibiliCategoryIE,
  BiliBiliSearchIE,
  BiliBiliPlayerIE,
  BiliBiliDynamicIE,
} from './bilibili-misc';
import { BiliIntlBaseIE, BiliIntlIE, BiliIntlSeriesIE } from './bilibili-intl';
import { BiliLiveIE } from './bilibili-live';
import { TwitterIE, TwitterShortenerIE } from './twitter';
import { TikTokIE } from './tiktok';
import {
  VimeoIE,
  TwitchVodIE,
  TwitchStreamIE,
  TwitchClipsIE,
  TwitchCollectionIE,
  TwitchVideosIE,
  SoundcloudIE,
} from './sites';
import {
  DouyinIE,
  InstagramIE,
  RedditIE,
  NiconicoIE,
} from './more-sites';
import { FacebookIE, FacebookReelIE } from './facebook';
import {
  PornHubIE,
  PornHubUserIE,
  PornHubPlaylistIE,
  PornHubPagedVideoListIE,
  PornHubUserVideosUploadIE,
  PornHubBaseIE,
  PornHubPlaylistBaseIE,
  PornHubPagedPlaylistBaseIE,
} from './pornhub';
import { BrightcoveNewIE, BrightcoveLegacyIE, BrightcoveNewBaseIE } from './brightcove';
import { KalturaIE } from './kaltura';
import { VQQVideoIE, VQQSeriesIE } from './tencent';
import { XiaoHongShuIE } from './xiaohongshu';
import { WeiboIE, WeiboVideoIE } from './weibo';
import { AcFunVideoIE, AcFunBangumiIE, AcFunVideoBaseIE } from './acfun';
import { YoukuIE, YoukuShowIE } from './youku';
import { IqiyiIE } from './iqiyi';
import { HAND_A_IES } from './hand-a';
import { HAND_B_IES } from './hand-b';
import { HAND_C_IES } from './hand-c';
import { HAND_D_IES } from './hand-d';
import { HAND_E_IES } from './hand-e';
import { HAND_F_IES } from './hand-f';
import { HAND_G_IES } from './hand-g';
import { HAND_H_IES } from './hand-h';
import { HAND_I_IES } from './hand-i';
import { HAND_J_IES } from './hand-j';
import { HAND_K_IES } from './hand-k';
import { HAND_L_IES } from './hand-l';
import { HAND_M_IES } from './hand-m';
import { HAND_N_IES } from './hand-n';
import { HAND_O_IES } from './hand-o';
import { HAND_P_IES } from './hand-p';
import { HAND_Q_IES } from './hand-q';
import { HAND_R_IES } from './hand-r';
import { HAND_S_IES } from './hand-s';
import { HAND_T_IES } from './hand-t';
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
  registerExtractor(entryFromIE(BilibiliCheeseIE, 'BilibiliCheese'));
  registerExtractor(entryFromIE(BilibiliCheeseSeasonIE, 'BilibiliCheeseSeason'));
  registerExtractor(entryFromIE(BilibiliBaseIE, 'BilibiliBase'));
  registerExtractor(entryFromIE(BilibiliCheeseBaseIE, 'BilibiliCheeseBase'));
  registerExtractor(entryFromIE(BilibiliSpaceBaseIE, 'BilibiliSpaceBase'));
  registerExtractor(entryFromIE(BilibiliSpaceListBaseIE, 'BilibiliSpaceListBase'));
  registerExtractor(entryFromIE(BilibiliSpaceVideoIE, 'BilibiliSpaceVideo'));
  registerExtractor(entryFromIE(BilibiliSpaceAudioIE, 'BilibiliSpaceAudio'));
  registerExtractor(entryFromIE(BilibiliCollectionListIE, 'BilibiliCollectionList'));
  registerExtractor(entryFromIE(BilibiliSeriesListIE, 'BilibiliSeriesList'));
  registerExtractor(entryFromIE(BilibiliFavoritesListIE, 'BilibiliFavoritesList'));
  registerExtractor(entryFromIE(BilibiliWatchlaterIE, 'BilibiliWatchlater'));
  registerExtractor(entryFromIE(BilibiliPlaylistIE, 'BilibiliPlaylist'));
  registerExtractor(entryFromIE(BilibiliCategoryIE, 'BilibiliCategory'));
  registerExtractor(entryFromIE(BilibiliAudioBaseIE, 'BilibiliAudioBase'));
  registerExtractor(entryFromIE(BilibiliAudioIE, 'BilibiliAudio'));
  registerExtractor(entryFromIE(BilibiliAudioAlbumIE, 'BilibiliAudioAlbum'));
  registerExtractor(entryFromIE(BiliBiliPlayerIE, 'BiliBiliPlayer'));
  registerExtractor(entryFromIE(BiliBiliDynamicIE, 'BiliBiliDynamic'));
  registerExtractor(entryFromIE(BiliIntlBaseIE, 'BiliIntlBase'));
  registerExtractor(entryFromIE(BiliIntlIE, 'BiliIntl'));
  registerExtractor(entryFromIE(BiliIntlSeriesIE, 'BiliIntlSeries'));
  registerExtractor(entryFromIE(BiliLiveIE, 'BiliLive'));
  registerExtractor(entryFromIE(BiliBiliSearchIE, 'BiliBiliSearch'));
  registerExtractor(entryFromIE(TwitterIE, 'Twitter'));
  registerExtractor(entryFromIE(TwitterShortenerIE, 'TwitterShortener'));
  registerExtractor(entryFromIE(TikTokIE, 'TikTok'));
  registerExtractor(entryFromIE(VimeoIE, 'Vimeo'));
  registerExtractor(entryFromIE(TwitchVodIE, 'TwitchVod'));
  registerExtractor(entryFromIE(TwitchClipsIE, 'TwitchClips'));
  registerExtractor(entryFromIE(TwitchCollectionIE, 'TwitchCollection'));
  registerExtractor(entryFromIE(TwitchVideosIE, 'TwitchVideos'));
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
  registerExtractor(entryFromIE(PornHubPagedVideoListIE, 'PornHubPagedVideoList'));
  registerExtractor(entryFromIE(PornHubUserVideosUploadIE, 'PornHubUserVideosUpload'));
  registerExtractor(entryFromIE(PornHubBaseIE, 'PornHubBase'));
  registerExtractor(entryFromIE(PornHubPlaylistBaseIE, 'PornHubPlaylistBase'));
  registerExtractor(entryFromIE(PornHubPagedPlaylistBaseIE, 'PornHubPagedPlaylistBase'));
  registerExtractor(entryFromIE(BrightcoveNewIE, 'BrightcoveNew'));
  registerExtractor(entryFromIE(BrightcoveLegacyIE, 'BrightcoveLegacy'));
  registerExtractor(entryFromIE(BrightcoveNewBaseIE, 'BrightcoveNewBase'));
  registerExtractor(entryFromIE(KalturaIE, 'Kaltura'));
  registerExtractor(entryFromIE(VQQVideoIE, 'VQQVideo'));
  registerExtractor(entryFromIE(VQQSeriesIE, 'VQQSeries'));
  registerExtractor(entryFromIE(XiaoHongShuIE, 'XiaoHongShu'));
  registerExtractor(entryFromIE(WeiboIE, 'Weibo'));
  registerExtractor(entryFromIE(WeiboVideoIE, 'WeiboVideo'));
  registerExtractor(entryFromIE(AcFunVideoIE, 'AcFunVideo'));
  registerExtractor(entryFromIE(AcFunBangumiIE, 'AcFunBangumi'));
  registerExtractor(entryFromIE(AcFunVideoBaseIE, 'AcFunVideoBase'));
  registerExtractor(entryFromIE(YoukuIE, 'Youku'));
  registerExtractor(entryFromIE(YoukuShowIE, 'YoukuShow'));
  registerExtractor(entryFromIE(IqiyiIE, 'Iqiyi'));

  // hand-a batch: abc → azmedien（对照上游主 IE）
  for (const { IE, ie_key } of HAND_A_IES) {
    registerExtractor(entryFromIE(IE as IEConstructor, ie_key));
  }

  // hand-b batch: baidu → byutv
  for (const { IE, ie_key } of HAND_B_IES) {
    registerExtractor(entryFromIE(IE as IEConstructor, ie_key));
  }

  // hand-c batch: c56 → cybrary
  for (const { IE, ie_key } of HAND_C_IES) {
    registerExtractor(entryFromIE(IE as IEConstructor, ie_key));
  }

  // hand-d batch: dacast → dw
  for (const { IE, ie_key } of HAND_D_IES) {
    registerExtractor(entryFromIE(IE as IEConstructor, ie_key));
  }

  // hand-e batch: ebaumsworld → expressen
  for (const { IE, ie_key } of HAND_E_IES) {
    registerExtractor(entryFromIE(IE as IEConstructor, ie_key));
  }

  // hand-f batch: facebook extras + fancode → fuyintv
  for (const { IE, ie_key } of HAND_F_IES) {
    registerExtractor(entryFromIE(IE as IEConstructor, ie_key));
  }

  // hand-g batch: gab → groupon
  for (const { IE, ie_key } of HAND_G_IES) {
    registerExtractor(entryFromIE(IE as IEConstructor, ie_key));
  }

  // hand-h batch: harpodeon → hytale
  for (const { IE, ie_key } of HAND_H_IES) {
    registerExtractor(entryFromIE(IE as IEConstructor, ie_key));
  }

  // hand-i batch: icareus → ixigua（跳过已有 Instagram / Iqiyi）
  for (const { IE, ie_key } of HAND_I_IES) {
    registerExtractor(entryFromIE(IE as IEConstructor, ie_key));
  }

  // hand-j batch: jamendo → jwplatform
  for (const { IE, ie_key } of HAND_J_IES) {
    registerExtractor(entryFromIE(IE as IEConstructor, ie_key));
  }

  // hand-k batch: kakao → kuwo（跳过已有 Kaltura）
  for (const { IE, ie_key } of HAND_K_IES) {
    registerExtractor(entryFromIE(IE as IEConstructor, ie_key));
  }

  // hand-l batch: la7 → lumni
  for (const { IE, ie_key } of HAND_L_IES) {
    registerExtractor(entryFromIE(IE as IEConstructor, ie_key));
  }

  // hand-m batch: maariv → mzaalo
  for (const { IE, ie_key } of HAND_M_IES) {
    registerExtractor(entryFromIE(IE as IEConstructor, ie_key));
  }

  // hand-n batch: n1 → nzz（跳过已有 Niconico）
  for (const { IE, ie_key } of HAND_N_IES) {
    registerExtractor(entryFromIE(IE as IEConstructor, ie_key));
  }

  // hand-o batch: odkmedia → owncloud
  for (const { IE, ie_key } of HAND_O_IES) {
    registerExtractor(entryFromIE(IE as IEConstructor, ie_key));
  }

  // hand-p batch: packtpub → pyvideo（跳过已有 PornHub）
  for (const { IE, ie_key } of HAND_P_IES) {
    registerExtractor(entryFromIE(IE as IEConstructor, ie_key));
  }

  // hand-q batch: qdance → qqmusic
  for (const { IE, ie_key } of HAND_Q_IES) {
    registerExtractor(entryFromIE(IE as IEConstructor, ie_key));
  }

  // hand-r batch: r7 → ruv（跳过已有 Reddit）
  for (const { IE, ie_key } of HAND_R_IES) {
    registerExtractor(entryFromIE(IE as IEConstructor, ie_key));
  }

  // hand-s batch: s4c → sztvhu（跳过已有 Soundcloud）
  for (const { IE, ie_key } of HAND_S_IES) {
    registerExtractor(entryFromIE(IE as IEConstructor, ie_key));
  }

  // hand-t batch: tagesschau → txxx（跳过 VQQ/Douyin/TikTok/Twitch×5/Twitter×2）
  for (const { IE, ie_key } of HAND_T_IES) {
    registerExtractor(entryFromIE(IE as IEConstructor, ie_key));
  }

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
  BilibiliCheeseIE,
  BilibiliCheeseSeasonIE,
  BilibiliCheeseBaseIE,
  BilibiliBaseIE,
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
  TwitterIE,
  TwitterShortenerIE,
  TikTokIE,
  VimeoIE,
  TwitchVodIE,
  TwitchStreamIE,
  TwitchClipsIE,
  TwitchCollectionIE,
  TwitchVideosIE,
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
  PornHubPagedVideoListIE,
  PornHubUserVideosUploadIE,
  BrightcoveNewIE,
  BrightcoveLegacyIE,
  BrightcoveNewBaseIE,
  KalturaIE,
  VQQVideoIE,
  VQQSeriesIE,
  XiaoHongShuIE,
  WeiboIE,
  WeiboVideoIE,
  AcFunVideoIE,
  AcFunBangumiIE,
  AcFunVideoBaseIE,
  YoukuIE,
  YoukuShowIE,
  IqiyiIE,
};
export { GENERATED_EXTRACTOR_DEFS, buildGeneratedExtractorEntries, HAND_OVERRIDES, IMPLEMENTED_IE_KEYS } from './generated-registry';
