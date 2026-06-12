/**
 * 拉取并持久化 RSS 文章列表
 */

import { getRssArticles, toNewRssArticle } from '@/lib/rss-source';
import { parseSortUrls } from '@/lib/rss-source/sort-urls';
import * as rssArticlesDb from '@/lib/database/rss-articles';
import * as rssSourcesDb from '@/lib/database/rss-sources';
import type { RssArticle, RssSource } from '@/types';
import { rssError, rssLog, rssWarn } from '@/lib/rss-source/rss-source-logger';

export type FetchRssArticlesResult = {
  articles: RssArticle[];
  sortName: string;
};

async function resolveSortEntry(
  source: RssSource,
  sortName?: string,
): Promise<{ name: string; url: string } | null> {
  const sorts = await parseSortUrls(source);
  const sort =
    sortName != null
      ? sorts.find((s) => s.name === sortName) ?? sorts[0]
      : sorts[0];
  if (!sort) {
    return null;
  }

  if (sortName != null && !sorts.some((s) => s.name === sortName)) {
    rssWarn(source, '指定分类不存在，已改用首个分类', {
      requested: sortName,
      used: sort.name || '默认',
    });
  }

  return sort;
}

/** 仅网络拉取与规则解析，不写库 */
export async function fetchRssArticlesForSource(
  source: RssSource,
  sortName?: string,
  page = 1,
): Promise<FetchRssArticlesResult> {
  const startTime = Date.now();
  rssLog(source, '开始拉取文章', { sortName: sortName ?? '(默认)', page });

  const sort = await resolveSortEntry(source, sortName);
  if (!sort) {
    rssWarn(source, '拉取中止：无可用分类地址');
    return { articles: [], sortName: sortName ?? '' };
  }

  const { articles } = await getRssArticles(source, sort.name, sort.url, page);

  rssLog(source, '拉取完成', {
    sort: sort.name || '默认',
    fetched: articles.length,
    totalMs: Date.now() - startTime,
  });

  return { articles, sortName: sort.name ?? '' };
}

/** 将已解析文章写入本地库 */
export async function persistRssArticlesForSource(
  source: RssSource,
  sortName: string,
  articles: RssArticle[],
  page = 1,
): Promise<void> {
  const startTime = Date.now();

  if (page <= 1) {
    await rssArticlesDb.deleteRssArticlesByOriginAndSort(
      source.sourceUrl,
      sortName,
    );
  }

  await rssArticlesDb.insertRssArticles(articles.map(toNewRssArticle));

  await rssSourcesDb.updateRssSource({
    ...source,
    lastUpdateTime: Date.now(),
  });

  rssLog(source, '持久化完成', {
    sort: sortName || '默认',
    persisted: articles.length,
    totalMs: Date.now() - startTime,
  });
}

export async function refreshRssArticlesForSource(
  source: RssSource,
  sortName?: string,
  page = 1,
): Promise<number> {
  const { articles, sortName: resolvedSort } = await fetchRssArticlesForSource(
    source,
    sortName,
    page,
  );
  await persistRssArticlesForSource(source, resolvedSort, articles, page);
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
