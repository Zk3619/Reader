import { fetchBookSourceJsonText } from '@/lib/book-source/import-booksource-fetch';
import { parseRssSourceJson } from '@/lib/book-source/import-rss-source';
import { importReplaceRulesFromJson } from '@/lib/book-source/import-replace-rule';
import { importRssSourcesFromList } from '@/lib/book-source/import-rss-batch';
import { parseBookSourceJson } from '@/lib/book-source/source-import';

/** 按内容自动识别网络 JSON（书源 / RSS / 替换规则） */
export async function importLegadoJsonFromNetworkUrl(
  url: string
): Promise<{ kind: 'book' | 'rss' | 'replace'; count: number }> {
  const text = await fetchBookSourceJsonText(url.trim());
  const books = parseBookSourceJson(text);
  if (books.length > 0) {
    return { kind: 'book', count: books.length };
  }
  const rss = parseRssSourceJson(text);
  if (rss.length > 0) {
    const n = await importRssSourcesFromList(rss);
    return { kind: 'rss', count: n };
  }
  const n = await importReplaceRulesFromJson(text);
  if (n > 0) {
    return { kind: 'replace', count: n };
  }
  throw new Error('未能识别网络 JSON 内容');
}

export async function importRssFromNetworkUrl(url: string): Promise<number> {
  const text = await fetchBookSourceJsonText(url.trim());
  const rss = parseRssSourceJson(text);
  if (rss.length === 0) throw new Error('未识别到 RSS 源 JSON');
  return importRssSourcesFromList(rss);
}

export async function importReplaceRulesFromNetworkUrl(url: string): Promise<number> {
  const text = await fetchBookSourceJsonText(url.trim());
  return importReplaceRulesFromJson(text);
}
