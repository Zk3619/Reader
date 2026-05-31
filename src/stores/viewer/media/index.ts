/**
 * media 模块：统一 Viewer 状态 + 五类 MediaKind 实现
 *
 * - state / chapter：公用层
 * - text / image / audio / video / file：各 kind 特化
 * - store：统一调度入口 viewerStore
 */

export { state, setState, resetViewerState, initialViewerState } from '@/stores/viewer/media/state';
export {
  clampChapterIndex,
  loadChapterRaw,
  persistCatalogToDb,
  resetMediaChapterSession,
  saveMediaProgress,
} from '@/stores/viewer/media/chapter';
export {
  viewerStore,
} from '@/stores/viewer/media/store';
export {
  textViewerTextApi,
  bookProgress,
  openTextBook,
  loadTextChapter,
  saveTextProgress,
  setTextBookInitialState,
  resetTextViewerSession,
} from '@/stores/viewer/media/text';
export {
  openImageBook,
  loadImageChapter,
  setImageBookInitialState,
  applyImageFromRaw,
} from '@/stores/viewer/media/image';
export {
  openAudioBook,
  loadAudioChapter,
  setAudioBookInitialState,
  applyAudioFromRaw,
} from '@/stores/viewer/media/audio';
export {
  openVideoBook,
  loadVideoChapter,
  setVideoBookInitialState,
  applyVideoFromRaw,
} from '@/stores/viewer/media/video';
export {
  openFileBook,
  loadFileChapter,
  setFileBookInitialState,
  applyFileFromRaw,
} from '@/stores/viewer/media/file';
