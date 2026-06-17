/**
 * Viewer 状态管理（MediaKind: text / image / audio / video / file）
 *
 * 结构：media/ 为顶级模块，下设 text / image / audio / video / file 五个子模块
 * UI 配置类型见@/lib/media/text/reader-ui-config
 */

import { MediaKind } from '@/lib/book-source/book-type';
import { textViewerTextApi, viewerStore } from '@/stores/viewer/media';
import type { Book, BookChapter } from '@/types';

export type {
  BaseViewerState,
  BaseViewerStoreApi,
  ViewerState,
} from '@/stores/viewer/base-state';

export {
  viewerStore,
  textViewerTextApi,
  bookProgress,
  openTextBook,
  loadTextChapter,
  fetchProcessedChapterContent,
  saveTextProgress,
  setTextBookInitialState,
} from '@/stores/viewer/media';

/** text 专用 API + 共享 viewer 能力 */
export const textViewerStore = {
  ...textViewerTextApi,
  get state() {
    return viewerStore.state;
  },
  openBook: (book: Book, options?: { initialCatalog?: BookChapter[] }) =>
    viewerStore.openBook(book, MediaKind.text, options),
  loadChapter: (index: number, options?: { forceRefresh?: boolean }) =>
    viewerStore.loadChapter(index, options),
  refreshChapter: (index?: number) => viewerStore.refreshChapter(index),
  replaceChapterContent: (raw: string, chapterIndex?: number) =>
    textViewerTextApi.replaceChapterContent(raw, chapterIndex),
  saveProgress: () => viewerStore.saveProgress(),
  closeBook: () => viewerStore.closeBook(),
  loadCatalog: (bookUrl: string) => viewerStore.loadCatalog(bookUrl),
  setChapterPos: (pos: number) => viewerStore.setChapterPos(pos),
  setScrollReadingPosition: (chapterIndex: number, chapterPos: number) =>
    textViewerTextApi.setScrollReadingPosition(chapterIndex, chapterPos),
  isGuestReading: () => viewerStore.isGuestReading(),
};
