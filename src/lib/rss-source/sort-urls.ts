/**
 * 解析 RSS 源分类地址（对齐 Legado RssSourceExtensions.sortUrls）
 */

import {
  extractExploreScript,
  runExploreScript,
  runExploreScriptRawValue,
} from '@/lib/js-engine';
import type { BookSource, RssSource } from '@/types';
import type { ExploreSection } from '@/lib/book-source/explore-sections';
import { rssError, rssLog, rssWarn } from '@/lib/rss-source/rss-source-logger';

export interface SortUrlEntry {
  name: string;
  url: string;
}

const jsSortUrlCache = new Map<string, SortUrlEntry[]>();

function cacheKey(source: RssSource): string {
  return `${source.sourceUrl}\0${source.sortUrl ?? ''}`;
}

function rssAsBookSource(source: RssSource): BookSource {
  return source as unknown as BookSource;
}

/** 解析静态 sortUrl 文本（名称::链接，多行或 && 分隔） */
export function parseSortUrlLines(text: string, fallbackUrl: string): SortUrlEntry[] {
  const entries: SortUrlEntry[] = [];
  const parts = text.split(/(?:&&|\n)+/);
  for (const part of parts) {
    const sort = part.trim();
    if (!sort) continue;
    const sep = sort.indexOf('::');
    if (sep >= 0) {
      const name = sort.slice(0, sep).trim();
      const url = sort.slice(sep + 2).trim();
      if (url) entries.push({ name, url });
    }
  }
  if (entries.length === 0) {
    return [{ name: '', url: fallbackUrl }];
  }
  return entries;
}

function sectionsToEntries(sections: ExploreSection[]): SortUrlEntry[] {
  const entries: SortUrlEntry[] = [];
  for (const section of sections) {
    if (section.url?.trim()) {
      entries.push({ name: section.title?.trim() ?? '', url: section.url.trim() });
    }
    if (section.children?.length) {
      entries.push(...sectionsToEntries(section.children));
    }
  }
  return entries;
}

function resolveRawSortUrl(raw: unknown, fallbackUrl: string): SortUrlEntry[] {
  if (typeof raw === 'string' && raw.trim()) {
    return parseSortUrlLines(raw, fallbackUrl);
  }
  if (Array.isArray(raw)) {
    const entries: SortUrlEntry[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const url = String(rec.url ?? rec.link ?? '').trim();
      if (!url) continue;
      entries.push({
        name: String(rec.title ?? rec.name ?? rec.label ?? '').trim(),
        url,
      });
    }
    if (entries.length > 0) return entries;
  }
  return [];
}

async function resolveJsSortUrls(source: RssSource): Promise<SortUrlEntry[]> {
  const script = extractExploreScript(source.sortUrl);
  if (!script) return [];

  const key = cacheKey(source);
  const cached = jsSortUrlCache.get(key);
  if (cached) {
    rssLog(source, 'sortUrl JS 缓存命中', { count: cached.length });
    return cached;
  }

  rssLog(source, '执行 sortUrl JS', { scriptLength: script.length });

  try {
    const bookSource = rssAsBookSource(source);
    const sections = await runExploreScript(script, bookSource);
    let entries = sectionsToEntries(sections);

    if (entries.length === 0) {
      const raw = await runExploreScriptRawValue(script, bookSource);
      entries = resolveRawSortUrl(raw, source.sourceUrl);
    }

    if (entries.length > 0) {
      jsSortUrlCache.set(key, entries);
      rssLog(source, 'sortUrl JS 解析完成', {
        count: entries.length,
        names: entries.map((e) => e.name || '默认').slice(0, 8),
      });
    } else {
      rssWarn(source, 'sortUrl JS 未产出分类，将回退 sourceUrl');
    }
    return entries;
  } catch (error) {
    rssError(source, 'sortUrl JS 执行失败', error);
    return [];
  }
}

/** 清除 sortUrl JS 缓存（编辑源后调用） */
export function clearSortUrlCache(source: RssSource): void {
  jsSortUrlCache.delete(cacheKey(source));
}

/** 进入源时的默认分类：跳过「搜索」等需源变量的项，对齐用户从首页浏览的习惯 */
export function pickDefaultSortEntry(
  entries: SortUrlEntry[],
  preferredName?: string,
): SortUrlEntry {
  if (entries.length === 0) {
    return { name: '', url: '' };
  }
  if (preferredName?.trim()) {
    const hit = entries.find((e) => e.name === preferredName.trim());
    if (hit) return hit;
  }
  const home = entries.find(
    (e) => e.name === '首页' || e.url === '/' || e.url.trim() === '/',
  );
  if (home) return home;
  const browsable = entries.find(
    (e) =>
      e.name !== '搜索' &&
      !/\{\{[\s\S]*?getVariable[\s\S]*?\}\}/i.test(e.url) &&
      !e.url.includes('getVariable()'),
  );
  return browsable ?? entries[0]!;
}

/** 解析 sortUrl 字段为分类列表 */
export async function parseSortUrls(source: RssSource): Promise<SortUrlEntry[]> {
  const raw = source.sortUrl?.trim();

  if (!raw) {
    rssLog(source, '无 sortUrl，使用 sourceUrl 作为唯一分类');
    return [{ name: '', url: source.sourceUrl }];
  }

  if (raw.startsWith('<js>') || raw.startsWith('@js:')) {
    const entries = await resolveJsSortUrls(source);
    if (entries.length > 0) return entries;
    rssWarn(source, 'sortUrl JS 无结果，回退 sourceUrl');
    return [{ name: '', url: source.sourceUrl }];
  }

  const entries = parseSortUrlLines(raw, source.sourceUrl);
  rssLog(source, '静态 sortUrl 解析完成', {
    count: entries.length,
    names: entries.map((e) => e.name || '默认').slice(0, 8),
  });
  return entries;
}
