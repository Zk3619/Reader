/**
 * 书源引擎统一导出
 * 对应 legado 项目的 WebBook.kt
 */

// 搜索功能
export { searchBook } from '@/lib/book-source/search';

// 发现功能
export { exploreBook } from '@/lib/book-source/explore';
export { addSearchBookToShelf, saveBookToShelf } from '@/lib/bookshelf/save-book-to-shelf';
export { migrateBookProgress, getDurChapterIndex, isSameNameAndAuthor } from '@/lib/bookshelf/book-migrate';
export {
  addOnlineBookByUrl,
  resolveSourceForBookUrl,
  isLikelyDirectFileUrl,
} from '@/lib/book-source/add-by-url';
export { parseBookUrlWithOption, getNetworkBaseUrl } from '@/lib/book-source/url-option';

// 详情功能
export { getBookInfo } from '@/lib/book-source/detail';

// 章节列表功能
export { getChapterList, toNewBookChapter } from '@/lib/book-source/chapters';

// 书架更新目录
export { updateBookToc, syncBookPreserveProgress } from '@/lib/book-source/update-toc';
export {
  enqueueUpdateToc,
  isBookTocUpdating,
  getUpdateTocQueueSize,
  isUpdateTocRunning,
  type UpdateTocBatchResult,
  type UpdateTocQueueCallbacks,
} from '@/lib/book-source/update-toc-queue';

// 正文内容功能
export { getContent } from '@/lib/book-source/content';

// 内容处理功能
export { processContent, processTitle, processImageStyle } from '@/lib/book-source/content-processor';

// 工具函数
export { buildUrl, parseHeaders, resolveUrl, detectContentType } from '@/lib/book-source/utils';

// 书源导入解析（兼容 legado JSON 格式）
export { parseBookSourceJson } from '@/lib/book-source/source-import';

// 发现子项（分类、排行榜等）
export { getExploreSections, getExploreSectionsAsync, isExploreUrlScript, type ExploreSection } from '@/lib/book-source/explore-sections';
