/**
 * 拉取并持久化 RSS 文章列表
 */

import { getRssArticles, toNewRssArticle } from '@/lib/rss-source';
import { parseSortUrls } from '@/lib/rss-source/sort-urls';
import * as rssArticlesDb from '@/lib/database/rss-articles';
import * as rssSourcesDb from '@/lib/database/rss-sources';
import type { RssSource } from '@/types';
import { rssError, rssLog, rssWarn } from '@/lib/rss-source/rss-source-logger';

export async function refreshRssArticlesForSource(
  source: RssSource,
  sortName?: string,
  page = 1,
): Promise<number> {
  const startTime = Date.now();
  rssLog(source, '开始刷新文章', { sortName: sortName ?? '(默认)', page });

  const sorts = await parseSortUrls(source);
  const sort =
    sortName != null
      ? sorts.find((s) => s.name === sortName) ?? sorts[0]
      : sorts[0];
  if (!sort) {
    rssWarn(source, '刷新中止：无可用分类地址');
    return 0;
  }

  if (sortName != null && !sorts.some((s) => s.name === sortName)) {
    rssWarn(source, '指定分类不存在，已改用首个分类', {
      requested: sortName,
      used: sort.name || '默认',
    });
  }

  const { articles } = await getRssArticles(source, sort.name, sort.url, page);
  for (const article of articles) {
    await rssArticlesDb.insertRssArticle(toNewRssArticle(article));
  }

  await rssSourcesDb.updateRssSource({
    ...source,
    lastUpdateTime: Date.now(),
  });

  rssLog(source, '刷新完成', {
    sort: sort.name || '默认',
    fetched: articles.length,
    persisted: articles.length,
    totalMs: Date.now() - startTime,
  });

  return articles.length;
}

export async function refreshAllEnabledRssSources(): Promise<{
  sources: number;
  articles: number;
}> {
  const sources = await rssSourcesDb.getEnabledRssSources();
  rssLog('批量刷新', `开始，共 ${sources.length} 个已启用源`);
  const startTime = Date.now();
  let articleCount = 0;
  let failed = 0;
  for (const source of sources) {
    try {
      articleCount += await refreshRssArticlesForSource(source);
    } catch (e) {
      failed += 1;
      rssError(source, '刷新失败', e);
    }
  }
  rssLog('批量刷新', '结束', {
    sources: sources.length,
    articles: articleCount,
    failed,
    totalMs: Date.now() - startTime,
  });
  return { sources: sources.length, articles: articleCount };
}
