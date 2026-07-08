import { fetchBookSourceJsonText } from '@/lib/book-source/import-booksource-fetch';
import { importDictRulesFromJson } from '@/lib/book-source/import-dict-rule';
import { importReplaceRulesFromJson } from '@/lib/book-source/import-replace-rule';
import { importRssSourcesFromList } from '@/lib/book-source/import-rss-batch';
import { importTxtTocRulesFromJson } from '@/lib/book-source/import-txt-toc-rule';
import { parseRssSourceJson } from '@/lib/book-source/import-rss-source';
import {
  classifyLegadoImportJson,
  matchesLegadoImportKind,
  wrongLegadoImportKindMessage,
  type LegadoImportItemKind,
} from '@/lib/book-source/legado-import-kind';
import { parseBookSourceJson } from '@/lib/book-source/source-import';

export type LegadoNetworkImportKind = 'book' | 'rss' | 'replace' | 'dict' | 'txtToc';

export type LegadoNetworkImportResult =
  | { kind: 'book'; count: number }
  | { kind: 'rss'; count: number }
  | { kind: 'replace'; count: number }
  | { kind: 'dict'; count: number }
  | { kind: 'txtToc'; count: number };

function assertExpectedNetworkKind(
  text: string,
  expected: LegadoImportItemKind,
): void {
  const { dominant, counts, items } = classifyLegadoImportJson(text);
  if (
    dominant === expected ||
    (dominant === 'sourceUrlsEnvelope' && expected === 'bookSource')
  ) {
    return;
  }

  if (dominant === 'unknown' && items.length > 0) {
    if (items.every((item) => matchesLegadoImportKind(item, expected))) {
      return;
    }
  }

  const actual =
    dominant === 'unknown'
      ? ((Object.entries(counts).find(([, n]) => (n ?? 0) > 0)?.[0] as LegadoImportItemKind | undefined) ??
        'unknown')
      : dominant;

  throw new Error(wrongLegadoImportKindMessage(expected, actual));
}

/** 按内容自动识别网络 JSON（书源 / RSS / 替换规则 / 字典 / TXT 目录） */
export async function importLegadoJsonFromNetworkUrl(
  url: string,
): Promise<LegadoNetworkImportResult> {
  const text = await fetchBookSourceJsonText(url.trim());
  let { dominant, items } = classifyLegadoImportJson(text);

  if (dominant === 'unknown' && items.length > 0) {
    const candidates: LegadoImportItemKind[] = [
      'bookSource',
      'rssSource',
      'replaceRule',
      'dictRule',
      'txtTocRule',
    ];
    for (const kind of candidates) {
      if (items.every((item) => matchesLegadoImportKind(item, kind))) {
        dominant = kind;
        break;
      }
    }
  }

  switch (dominant) {
    case 'bookSource':
    case 'sourceUrlsEnvelope': {
      const books = parseBookSourceJson(text);
      if (books.length === 0) break;
      return { kind: 'book', count: books.length };
    }
    case 'rssSource': {
      const rss = parseRssSourceJson(text);
      if (rss.length === 0) break;
      const n = await importRssSourcesFromList(rss);
      return { kind: 'rss', count: n };
    }
    case 'replaceRule': {
      const n = await importReplaceRulesFromJson(text);
      if (n > 0) return { kind: 'replace', count: n };
      break;
    }
    case 'dictRule': {
      const n = await importDictRulesFromJson(text);
      if (n > 0) return { kind: 'dict', count: n };
      break;
    }
    case 'txtTocRule': {
      const n = await importTxtTocRulesFromJson(text);
      if (n > 0) return { kind: 'txtToc', count: n };
      break;
    }
    default:
      break;
  }

  throw new Error('未能识别网络 JSON 内容');
}

export async function importRssFromNetworkUrl(url: string): Promise<number> {
  const text = await fetchBookSourceJsonText(url.trim());
  assertExpectedNetworkKind(text, 'rssSource');
  const rss = parseRssSourceJson(text);
  if (rss.length === 0) throw new Error('未识别到 RSS 源 JSON');
  return importRssSourcesFromList(rss);
}

export async function importReplaceRulesFromNetworkUrl(url: string): Promise<number> {
  const text = await fetchBookSourceJsonText(url.trim());
  assertExpectedNetworkKind(text, 'replaceRule');
  const n = await importReplaceRulesFromJson(text);
  if (n === 0) throw new Error('未识别到替换规则 JSON');
  return n;
}

export async function importDictRulesFromNetworkUrl(url: string): Promise<number> {
  const text = await fetchBookSourceJsonText(url.trim());
  assertExpectedNetworkKind(text, 'dictRule');
  const n = await importDictRulesFromJson(text);
  if (n === 0) throw new Error('未识别到字典规则 JSON');
  return n;
}

export async function importTxtTocRulesFromNetworkUrl(url: string): Promise<number> {
  const text = await fetchBookSourceJsonText(url.trim());
  assertExpectedNetworkKind(text, 'txtTocRule');
  const n = await importTxtTocRulesFromJson(text);
  if (n === 0) throw new Error('未识别到 TXT 目录规则 JSON');
  return n;
}

export async function assertBookSourceNetworkJson(text: string): Promise<void> {
  assertExpectedNetworkKind(text, 'bookSource');
}

export async function assertRssSourceNetworkJson(text: string): Promise<void> {
  assertExpectedNetworkKind(text, 'rssSource');
}

export async function assertReplaceRuleNetworkJson(text: string): Promise<void> {
  assertExpectedNetworkKind(text, 'replaceRule');
}

export async function assertDictRuleNetworkJson(text: string): Promise<void> {
  assertExpectedNetworkKind(text, 'dictRule');
}

export async function assertTxtTocRuleNetworkJson(text: string): Promise<void> {
  assertExpectedNetworkKind(text, 'txtTocRule');
}
