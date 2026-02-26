/**
 * 书源引擎统一导出
 * 对应 legado 项目的 WebBook.kt
 */

// 搜索功能
export { searchBook } from './search';

// 发现功能
export { exploreBook } from './explore';
export { addSearchBookToShelf } from './add-to-shelf';

// 详情功能
export { getBookInfo } from './detail';

// 章节列表功能
export { getChapterList, toNewBookChapter } from './chapters';

// 正文内容功能
export { getContent } from './content';

// 内容处理功能
export { processContent, processTitle, processImageStyle } from './content-processor';

// 工具函数
export { buildUrl, parseHeaders, resolveUrl, detectContentType } from './utils';

// 书源导入解析（兼容 legado JSON 格式）
export { parseBookSourceJson } from './source-import';

// 发现子项（分类、排行榜等）
export { getExploreSections, getExploreSectionsAsync, isExploreUrlScript, type ExploreSection } from './explore-sections';
