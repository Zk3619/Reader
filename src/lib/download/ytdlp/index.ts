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
export { InfoExtractor, ExtractorError, ExistingVideoReached, RejectedVideoReached, MaxDownloadsReached, ReExtractInfo, SearchInfoExtractor } from './common';
export * as ytdlpUtils from './utils';
export { YoutubeDL, extractInfo, default as default } from './youtube-dl';
export { DateRange, dateFromStr, resolveDateRange } from './utils/daterange';
export { matchEntry, matchFilterReject, evaluateMatchFilterSpec } from './match-entry';
export { processSubtitles } from './process-subtitles';
export {
  resolveDownloadRanges,
  applyRangeToInfo,
} from './download-ranges';
export type { DownloadRangeChapter } from './download-ranges';
export {
  parseCookiesFromBrowser,
  loadCookiefileIntoJar,
  loadCookiesFromBrowserIntoJar,
  bootstrapYtdlpCookies,
} from './cookies-browser';
export { cleanInfoJson } from './clean-infojson';
export { writeLinkSidecars } from './writelink';
export {
  attachDownloaderOptions,
  readDownloaderOptions,
} from './downloader-options';
export type { YtdlpDownloaderOptions } from './downloader-options';
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
  aesDecryptText,
  aes128CbcDecrypt,
  aesEcbEncrypt,
  aesEcbDecrypt,
  aesCtrEncrypt,
  aesCtrDecrypt,
  aes_ecb_encrypt,
  aes_ecb_decrypt,
  aes_ctr_encrypt,
  aes_ctr_decrypt,
} from './aes';
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
  ja3BuildStatus,
} from './networking/ja3-sites';
export type { Ja3RequiredSite } from './networking/ja3-sites';
export {
  normalizeProxyUrl,
  validateProxyUrl,
  resolveYtdlpProxy,
} from './networking/socks';
export type { NormalizedProxy, ProxyKind } from './networking/socks';
export { YtdlpCache, getYtdlpCache } from './cache';
export {
  parseWebVtt,
  serializeWebVtt,
  srtToVtt,
  parseVttTimestamp,
  formatVttTimestamp,
  parse_fragment,
  parseFragmentCues,
} from './webvtt';
export type { VttCue, VttFragmentBlock } from './webvtt';
export {
  runExternalDownload,
  parseExternalDownloader,
} from './external-downloader';
export {
  detectSpecialProtocol,
  downloadSpecialProtocol,
} from './special-protocols';
export {
  registerExtractor,
  getExtractorForUrl,
  getExtractorEntry,
  listExtractors,
  ensureBuiltinLoaded,
  hasSiteExtractorForUrl,
  isExtractorRegistryPopulated,
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
  EmbedThumbnailPP,
  FFmpegFixupM3u8PP,
  FFmpegFixupM4aPP,
  FFmpegSplitChaptersPP,
  FFmpegConcatPP,
  WriteInfoJsonPP,
  runPostProcessors,
  remux,
  removeRangesToKeepRanges,
  mergeRanges,
  chaptersToSplitRanges,
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
  isRtmpFfmpegProtocol,
  isWebsocketFragProtocol,
} from './protocol-policy';
export { prepareFilename, expandOuttmpl, DEFAULT_OUTTMPL } from './outtmpl';
export { YtdlpCookieJar, getSharedCookieJar } from './cookie-jar';
export { randomIpv4, listGeoCountries } from './geo-utils';
export {
  JSInterpreter,
  JSInterpreterError,
  callJsFunction,
  int_to_int32,
  js_number_to_string,
} from './jsinterp';
export { sanitize_filename, sanitize_path_segment } from './utils/sanitize-filename';
export {
  readF4mBootstrapInfo,
  buildF4mFragments,
  buildF4mFragmentUrls,
  extractF4mMdat,
  makeFlvHeader,
} from './f4m-native';
