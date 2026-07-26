/**
 * Bilibili 平台源导出
 */

export {
  biliSearch,
  getBiliSongUrl,
  getBiliSongStream,
  listBiliFavoriteFolders,
  listBiliCollectedFolders,
  isBiliLoggedInForFavorites,
  getBiliFavoriteTracks,
  type BiliFavoriteFolder,
} from '@/lib/media/audio/platform/api/bili/client';

export {
  computeMixinKeyFromUrls,
  signWbiParams,
  clearWbiCache,
} from '@/lib/media/audio/platform/api/bili/wbi';

export {
  parseBiliDashAudio,
  selectBiliAudioStream,
  type BiliAudioStreamInfo,
} from '@/lib/media/audio/platform/api/bili/audio-select';
