/**
 * RSS订阅源引擎统一导出
 * 对应 legado 项目的 Rss.kt
 */

// 文章列表功能
export { getRssArticles, toNewRssArticle } from '@/lib/rss-source/articles';

// 文章内容功能
export { getRssContent } from '@/lib/rss-source/content';
export { fetchRssPage } from '@/lib/rss-source/fetch-rss-page';
export {
  prepareRssReadSession,
  fetchRssArticleContent,
  type RssReadSession,
  type RssReadLoadMode,
} from '@/lib/rss-source/rss-read-session';
export { wrapRssHtmlForWebView, wrapRssStartHtml } from '@/lib/rss-source/rss-html';
export {
  handleRssJavaOpen,
  buildRssJavaOpenShim,
  buildRssResourceGuardScript,
  RSS_READ_CHANNEL,
  type RssJavaOpenHandlers,
} from '@/lib/rss-source/rss-java-bridge';

// RSS解析器
export { parseRssDefault } from '@/lib/rss-source/rss-parser-default';

// 分类地址
export {
  parseSortUrls,
  parseSortUrlLines,
  clearSortUrlCache,
  type SortUrlEntry,
} from '@/lib/rss-source/sort-urls';

// 刷新文章
export {
  refreshRssArticlesForSource,
  refreshAllEnabledRssSources,
} from '@/lib/rss-source/refresh-articles';

// 规则订阅
export {
  RULE_SUB_TYPE_BOOK,
  RULE_SUB_TYPE_RSS,
  RULE_SUB_TYPE_REPLACE,
  isRuleSubDue,
  fetchRuleSubRssSources,
  applyRuleSubUpdate,
  runAutoRuleSubUpdates,
} from '@/lib/rss-source/rule-update';

// 编辑配置
export {
  RSS_SOURCE_EDIT_SECTIONS,
  type RssSourceEditField,
  type RssSourceEditSection,
} from '@/lib/rss-source/rss-source-edit-config';

export {
  createEmptyRssEditSource,
  loadRssEditSource,
  saveRssEditSource,
  serializeRssEditSource,
  parseRssEditFromText,
  getRssEditFieldValue,
  setRssEditFieldValue,
  rssEditSnapshot,
  applyRssRuleComplete,
  readRssSourceAutoCompleteEnabled,
  writeRssSourceAutoCompleteEnabled,
} from '@/lib/rss-source/legado-rss-source-editor';
