/**
 * 兼容旧导入路径：转发到 bili / ytm 模块
 * @deprecated 请改用 `@/lib/media/audio/platform/api/bili` 与 `.../ytm`
 */

export {
  biliSearch,
  getBiliSongUrl,
  getBiliSongStream,
} from '@/lib/media/audio/platform/api/bili/client';
export { ytmSearch } from '@/lib/media/audio/platform/api/ytm/search';
export {
  getYtmSongUrl,
  getYtmSongStream,
} from '@/lib/media/audio/platform/api/ytm/player';
