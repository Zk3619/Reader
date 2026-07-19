/** 音频模块数据库 API（M4 目录边界） */
export * from '@/lib/database/audio-library';
export * from '@/lib/database/audio-sources';
export * from '@/lib/database/music-playback-state';
export {
  upsertAudioSearchKeyword,
  searchAudioSearchKeywords,
  deleteAudioSearchKeyword,
  clearAudioSearchKeywords,
  importAudioSearchHistoryWords,
} from '@/lib/database/module-search-keywords';
export { AudioTables } from '@/lib/database/table-names';
