/**
 * RSS订阅源引擎统一导出
 * 对应 legado 项目的 Rss.kt
 */

// 文章列表功能
export { getRssArticles, toNewRssArticle } from '@/lib/rss-source/articles';

// 文章内容功能
export { getRssContent } from '@/lib/rss-source/content';

// RSS解析器
export { parseRssDefault } from '@/lib/rss-source/rss-parser-default';
