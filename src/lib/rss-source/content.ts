/**
 * RSS文章内容功能
 * 对应 legado 项目的 Rss.getContent
 */

import type { RssSource } from '@/types';
import type { RssArticle } from '@/types';
import { rssLog } from '@/lib/rss-source/rss-source-logger';
import { fetchRssArticleContent } from '@/lib/rss-source/rss-read-session';

/**
 * 获取RSS文章正文内容（规则解析后的 HTML 片段）
 */
export async function getRssContent(
  source: RssSource,
  article: RssArticle,
): Promise<string | null> {
  if (!source.ruleContent?.trim()) {
    rssLog(source, '无 ruleContent，使用摘要', {
      title: article.title.slice(0, 80),
      hasDescription: !!article.description?.trim(),
    });
    return article.description || null;
  }

  const content = await fetchRssArticleContent(source, article);
  if (content?.trim()) return content;

  rssLog(source, '正文不可用，回退摘要', {
    title: article.title.slice(0, 80),
    link: article.link.slice(0, 200),
  });
  return article.description || null;
}
