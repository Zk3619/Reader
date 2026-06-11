/**
 * RSS 源本地调试（对齐 Legado Debug.startDebug RSS 分支）
 */

import { get } from '@/lib/http';
import { buildUrl, parseHeaders } from '@/lib/book-source/utils';
import { getRssArticles, getRssContent } from '@/lib/rss-source';
import { parseSortUrls } from '@/lib/rss-source/sort-urls';
import type { RssArticle, RssSource } from '@/types';

export const RSS_DEBUG_HTML = {
  LIST: 10,
  CONTENT: 20,
} as const;

export type RssDebugAppendLog = (state: number, text: string) => void;

export interface RssSourceDebugSnapshots {
  listHtml?: string;
  contentHtml?: string;
}

let debugCancelled = false;

export function cancelRssSourceDebug(): void {
  debugCancelled = true;
}

function isAbsUrl(key: string): boolean {
  return /^https?:\/\//i.test(key.trim());
}

function formatElapsed(start: number): string {
  const ms = Date.now() - start;
  const mm = Math.floor(ms / 60_000);
  const ss = Math.floor((ms % 60_000) / 1000);
  const sss = ms % 1000;
  return `[${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(sss).padStart(3, '0')}]`;
}

function log(
  onLog: RssDebugAppendLog,
  start: number,
  msg: string,
  state = 1,
  showTime = true,
): void {
  if (debugCancelled) return;
  if (!msg && state === 1) {
    onLog(state, '');
    return;
  }
  const line = showTime ? `${formatElapsed(start)} ${msg}` : msg;
  onLog(state, line);
}

function parseSortKeyword(keyword: string): { name: string; url: string } | null {
  const trimmed = keyword.trim();
  const sep = trimmed.indexOf('::');
  if (sep < 0) return null;
  const name = trimmed.slice(0, sep).trim();
  const url = trimmed.slice(sep + 2).trim();
  if (!url) return null;
  return { name, url };
}

async function debugSortList(
  source: RssSource,
  sortName: string,
  sortUrl: string,
  onLog: RssDebugAppendLog,
  start: number,
  snapshots: RssSourceDebugSnapshots,
): Promise<void> {
  log(onLog, start, `拉取文章列表 [${sortName || '默认'}]…`, 0, false);
  log(onLog, start, `URL: ${sortUrl.slice(0, 160)}`);

  try {
    const headers = parseHeaders(source.header);
    const url = buildUrl(sortUrl, { page: '1' });
    const html = await get(url, {
      ...headers,
      enableCookieJar: source.enabledCookieJar,
      concurrentRate: source.concurrentRate,
      timeout: 30_000,
    });
    snapshots.listHtml = html;
    onLog(RSS_DEBUG_HTML.LIST, html);
  } catch (e) {
    log(onLog, start, `列表请求失败: ${e instanceof Error ? e.message : String(e)}`, -1);
    return;
  }

  const { articles } = await getRssArticles(source, sortName, sortUrl, 1);

  if (articles.length === 0) {
    log(onLog, start, '列表页解析成功，为空', 1000);
    return;
  }

  log(onLog, start, `获取到 ${articles.length} 篇文章`, 1000);
  for (const article of articles.slice(0, 20)) {
    log(onLog, start, article.title);
    log(onLog, start, `  ${article.link}`);
  }
  if (articles.length > 20) {
    log(onLog, start, `… 还有 ${articles.length - 20} 篇`);
  }

  if (source.ruleDescription?.trim()) {
    log(onLog, start, '存在描述规则，不继续解析内容页');
    return;
  }

  if (!source.ruleContent?.trim()) {
    log(onLog, start, '未配置内容规则，列表调试结束');
    return;
  }

  const first = articles[0];
  if (!first?.link) return;

  log(onLog, start, `继续解析首篇文章正文: ${first.title.slice(0, 60)}`);
  await debugArticleContent(source, first, onLog, start, snapshots);
}

async function debugArticleContent(
  source: RssSource,
  article: RssArticle,
  onLog: RssDebugAppendLog,
  start: number,
  snapshots: RssSourceDebugSnapshots,
): Promise<void> {
  if (!source.ruleContent?.trim()) {
    const desc = article.description?.trim();
    if (desc) {
      log(onLog, start, `无 ruleContent，使用描述（${desc.length} 字）`, 1000);
      log(onLog, start, desc.slice(0, 500) + (desc.length > 500 ? '…' : ''));
    } else {
      log(onLog, start, '未配置内容规则且无描述', -1);
    }
    return;
  }

  try {
    const headers = parseHeaders(source.header);
    const html = await get(article.link, {
      ...headers,
      enableCookieJar: source.enabledCookieJar,
      concurrentRate: source.concurrentRate,
      timeout: 60_000,
    });
    snapshots.contentHtml = html;
    onLog(RSS_DEBUG_HTML.CONTENT, html);
  } catch (e) {
    log(onLog, start, `正文请求失败: ${e instanceof Error ? e.message : String(e)}`, -1);
    return;
  }

  const content = await getRssContent(source, article);
  if (content?.trim()) {
    log(onLog, start, `正文解析成功，长度 ${content.length} 字符`, 1000);
    log(onLog, start, content.slice(0, 500) + (content.length > 500 ? '…' : ''));
  } else {
    log(onLog, start, '正文解析为空', -1);
  }
}

async function debugSearch(
  source: RssSource,
  keyword: string,
  onLog: RssDebugAppendLog,
  start: number,
  snapshots: RssSourceDebugSnapshots,
): Promise<void> {
  const searchUrl = source.searchUrl?.trim();
  if (!searchUrl) {
    log(onLog, start, '未配置 searchUrl，无法进行搜索调试', -1);
    return;
  }

  const url = buildUrl(searchUrl, { key: keyword, page: '1' });
  log(onLog, start, `搜索调试: ${keyword}`, 0, false);
  log(onLog, start, `URL: ${url.slice(0, 160)}`);
  await debugSortList(source, keyword, url, onLog, start, snapshots);
}

export async function startRssSourceDebug(
  source: RssSource,
  keyword: string,
  onLog: RssDebugAppendLog,
): Promise<RssSourceDebugSnapshots> {
  debugCancelled = false;
  const start = Date.now();
  const snapshots: RssSourceDebugSnapshots = {};
  const kw = keyword.trim();

  log(onLog, start, `开始调试: ${source.sourceName}`, 0, false);

  if (!kw) {
    log(onLog, start, '解析分类地址…', 0, false);
    const sorts = await parseSortUrls(source);
    log(onLog, start, `共 ${sorts.length} 个分类`, 1000);
    for (const sort of sorts) {
      log(onLog, start, `${sort.name || '默认'} :: ${sort.url}`);
    }
    return snapshots;
  }

  const sortKw = parseSortKeyword(kw);
  if (sortKw) {
    await debugSortList(source, sortKw.name, sortKw.url, onLog, start, snapshots);
    return snapshots;
  }

  if (isAbsUrl(kw)) {
    log(onLog, start, '内容页调试…', 0, false);
    const article: RssArticle = {
      origin: source.sourceUrl,
      link: kw,
      sort: '',
      title: kw,
      order: 0,
      group: '默认分组',
      read: false,
      type: 0,
      durPos: 0,
    };
    await debugArticleContent(source, article, onLog, start, snapshots);
    return snapshots;
  }

  await debugSearch(source, kw, onLog, start, snapshots);
  return snapshots;
}
