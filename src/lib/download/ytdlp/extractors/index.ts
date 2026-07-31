/**
 * Built-in extractors：手写覆盖层优先，再注册全量转译 IE（generated-registry）。
 */

import { registerExtractor, markRegistryLoaded } from '../registry';
import type { ExtractorEntry } from '../types';
import { InfoExtractor } from '../common';
import { GenericIE } from './generic';
import { YoutubeIE } from './youtube';
import { BilibiliIE } from './bilibili';
import { TwitterIE } from './twitter';
import { TikTokIE } from './tiktok';
import { VimeoIE, TwitchVodIE, SoundcloudIE } from './sites';
import {
  DouyinIE,
  BiliBangumiIE,
  InstagramIE,
  RedditIE,
  NiconicoIE,
} from './more-sites';
import { buildGeneratedExtractorEntries } from './generated-registry';

type IEConstructor = {
  new (): InfoExtractor;
  IE_NAME: string;
  _VALID_URL?: RegExp | string | false | null;
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
          : valid === false
            ? false
            : null,
    valid_url_re: valid instanceof RegExp ? valid : undefined,
    implemented: true,
    create: () => new IE(),
  };
}

/** Concrete implementations — registered first (higher priority than stubs). */
export function registerBuiltinExtractors(): void {
  // Site-specific before generic
  registerExtractor(entryFromIE(YoutubeIE, 'Youtube'));
  registerExtractor(entryFromIE(BilibiliIE, 'BiliBili'));
  registerExtractor(entryFromIE(TwitterIE, 'Twitter'));
  registerExtractor(entryFromIE(TikTokIE, 'TikTok'));
  registerExtractor(entryFromIE(VimeoIE, 'Vimeo'));
  registerExtractor(entryFromIE(TwitchVodIE, 'TwitchVod'));
  registerExtractor(entryFromIE(SoundcloudIE, 'Soundcloud'));
  registerExtractor(entryFromIE(DouyinIE, 'Douyin'));
  registerExtractor(entryFromIE(BiliBangumiIE, 'BiliBiliBangumi'));
  registerExtractor(entryFromIE(InstagramIE, 'Instagram'));
  registerExtractor(entryFromIE(RedditIE, 'Reddit'));
  registerExtractor(entryFromIE(NiconicoIE, 'Niconico'));

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
  BilibiliIE,
  TwitterIE,
  TikTokIE,
  VimeoIE,
  TwitchVodIE,
  SoundcloudIE,
  DouyinIE,
  BiliBangumiIE,
  InstagramIE,
  RedditIE,
  NiconicoIE,
};
export { GENERATED_EXTRACTOR_DEFS, buildGeneratedExtractorEntries, HAND_OVERRIDES, IMPLEMENTED_IE_KEYS } from './generated-registry';
