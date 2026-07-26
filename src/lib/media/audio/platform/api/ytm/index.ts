/**
 * YouTube Music 平台源导出
 */

export { ytmSearch } from '@/lib/media/audio/platform/api/ytm/search';
export { getYtmSongUrl, getYtmSongStream } from '@/lib/media/audio/platform/api/ytm/player';
export { getYtmLyricBundle } from '@/lib/media/audio/platform/api/ytm/lyrics';
export {
  listYtmLibraryPlaylists,
  listYtmHomeRecommendPlaylists,
  getYtmPlaylistTracks,
  type YtmPlaylistSummary,
} from '@/lib/media/audio/platform/api/ytm/browse';
export {
  buildSidAuthorization,
  resolveSapisidAuthorization,
  buildInnertubeHeaders,
} from '@/lib/media/audio/platform/api/ytm/auth-headers';
export {
  extractPlayerJsUrl,
  parseSignatureCipher,
  decipherSignature,
} from '@/lib/media/audio/platform/api/ytm/sig-solver';
