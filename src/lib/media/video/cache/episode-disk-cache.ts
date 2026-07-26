/**
 * @deprecated 请使用 `@/lib/media/video/cache/video-disk-cache`
 * 保留旧路径导出以兼容番剧播放写入与设置页。
 */

export {
  cacheBangumiEpisode,
  cacheVideoEpisode,
  clearAllVideoCaches as clearEpisodeCache,
  exportVideoCacheManifest as exportEpisodeCacheManifest,
  listVideoEpisodeCache as listEpisodeCache,
  type EpisodeCacheMeta,
  type VideoEpisodeCacheMeta,
} from '@/lib/media/video/cache/video-disk-cache';
