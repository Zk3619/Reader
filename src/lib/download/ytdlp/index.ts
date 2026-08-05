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
export { InfoExtractor, ExtractorError, ExistingVideoReached, RejectedVideoReached, SearchInfoExtractor } from './common';
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
export { aesDecryptText, aes128CbcDecrypt } from './aes';
export {
  downloadFragmentsConcat,
  writeFragmentsToFile,
  collectFragments,
} from './fragment-downloader';
export {
  parseHlsMediaPlaylist,
  downloadHlsMediaNative,
  mediaPlaylistNeedsNativeAes,
  isHlsMediaPlaylist,
} from './hls-native';
export {
  resolveImpersonateProfile,
  impersonateHeaders,
} from './networking/impersonate';
export type { ImpersonateProfile } from './networking/impersonate';
export { tryImpersonateFetch } from './networking/curl-impersonate';
export type { ImpersonateFetchResult } from './networking/curl-impersonate';
export {
  JA3_REQUIRED_SITES,
  isTlsImpersonateBuild,
  isJa3RequiredIeKey,
  unsupportedJa3SiteMessage,
} from './networking/ja3-sites';
export type { Ja3RequiredSite } from './networking/ja3-sites';
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
  XAttrMetadataPP,
  MoveFilesAfterDownloadPP,
  ExecPP,
  runPostProcessors,
  remux,
} from './postprocessors';
export {
  makeArchiveId,
  makeArchiveIdFromInfo,
  DownloadArchive,
} from './archive';
export {
  parsePlaylistItems,
  resolvePlaylistIndices,
  selectPlaylistEntries,
} from './playlist-items';
export {
  UNSUPPORTED_PROTOCOLS,
  unsupportedProtocolMessage,
  isUnsupportedProtocol,
  normalizeProtocol,
} from './protocol-policy';
export {
  readF4mBootstrapInfo,
  buildF4mFragments,
  buildF4mFragmentUrls,
  extractF4mMdat,
  makeFlvHeader,
} from './f4m-native';
