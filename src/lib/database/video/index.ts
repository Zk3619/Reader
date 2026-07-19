/** 视频模块数据库 API（M4 目录边界） */
export * from '@/lib/media/tv/db/tv-dao';
export {
  upsertVideoSearchKeyword,
  searchVideoSearchKeywords,
  deleteVideoSearchKeyword,
  clearVideoSearchKeywords,
} from '@/lib/database/module-search-keywords';
export {
  listVideoSources,
  getVideoSource,
  findVideoSourceByUrl,
  upsertVideoSource,
  deleteVideoSource,
  setVideoSourceEnabled,
  type VideoSourceRow,
  type VideoSourceKind,
} from '@/lib/database/video-sources';
export { VideoTables } from '@/lib/database/table-names';
