/**
 * Reader yt-dlp-compatible TypeScript runtime.
 *
 * @example
 * ```ts
 * import { YoutubeDL } from '@/lib/download/ytdlp';
 * const ydl = new YoutubeDL({ format: 'bv*+ba/b' });
 * const info = await ydl.extract_info('https://www.youtube.com/watch?v=…', false);
 * ```
 */

import './extractors';

export type * from './types';
export { InfoExtractor, ExtractorError, SearchInfoExtractor } from './common';
export * as ytdlpUtils from './utils';
export { YoutubeDL, extractInfo, default as default } from './youtube-dl';
export {
  parseFormatSelector,
  selectFormats,
  selectBestFormat,
  mergeFormats,
  matchesFilters,
} from './format-selector';
export { sortFormats, applyFormatSort, parseFormatSort } from './format-sort';
export {
  parseNetscapeCookieText,
  buildCookieHeader,
  cookieHeaderFromNetscapeText,
  resolveCookieHeader,
  mergeCookieHeaders,
} from './cookies';
export {
  registerExtractor,
  getExtractorForUrl,
  getExtractorEntry,
  listExtractors,
  ensureBuiltinLoaded,
} from './registry';
export { GenericIE, YoutubeIE, BilibiliIE } from './extractors';
export { TwitterIE, TikTokIE, VimeoIE, TwitchVodIE, SoundcloudIE } from './extractors';
export {
  DouyinIE,
  BiliBangumiIE,
  InstagramIE,
  RedditIE,
  NiconicoIE,
  HAND_OVERRIDES,
} from './extractors';
export {
  FFmpegMergerPP,
  FFmpegExtractAudioPP,
  FFmpegEmbedSubtitlePP,
  FFmpegMetadataPP,
  SponsorBlockPP,
  runPostProcessors,
  remux,
} from './postprocessors';
