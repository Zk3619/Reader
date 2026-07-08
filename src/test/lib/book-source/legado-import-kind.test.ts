import { describe, expect, it } from 'vitest';
import { parseBookSourceJson } from '@/lib/book-source/source-import';
import { parseRssSourceJson } from '@/lib/book-source/import-rss-source';
import { parseReplaceRuleJson } from '@/lib/book-source/import-replace-rule';
import { parseDictRuleJson } from '@/lib/book-source/import-dict-rule';
import { parseTxtTocRuleJson } from '@/lib/book-source/import-txt-toc-rule';
import {
  classifyLegadoImportItem,
  classifyLegadoImportJson,
  matchesLegadoImportKind,
} from '@/lib/book-source/legado-import-kind';

const bookSourceJson = JSON.stringify([
  {
    bookSourceName: '测试书源',
    bookSourceUrl: 'https://book.example.com',
    searchUrl: '/search?q={{key}}',
    ruleSearch: { bookList: '.item', name: '.title', bookUrl: 'a@href' },
    ruleToc: { chapterList: 'li', chapterName: 'a', chapterUrl: 'a@href' },
    ruleContent: { content: '#content' },
  },
]);

const rssSourceJson = JSON.stringify([
  {
    sourceName: '测试订阅',
    sourceUrl: 'https://rss.example.com',
    ruleArticles: '@css:.item',
    sortUrl: 'https://rss.example.com/list',
  },
]);

const replaceRuleJson = JSON.stringify([
  {
    name: '去广告',
    pattern: '广告',
    replacement: '',
  },
]);

const dictRuleJson = JSON.stringify([
  {
    name: '百度',
    urlRule: 'https://www.baidu.com/s?wd={{key}}',
    showRule: '@css:#content',
  },
]);

const txtTocRuleJson = JSON.stringify([
  {
    name: '章节',
    rule: '^第.+章',
    replacement: '',
    example: '第一章 开始',
    serialNumber: 1,
    enable: true,
  },
]);

describe('legado-import-kind', () => {
  it('classifies book and rss sources separately', () => {
    expect(classifyLegadoImportJson(bookSourceJson).dominant).toBe('bookSource');
    expect(classifyLegadoImportJson(rssSourceJson).dominant).toBe('rssSource');
    expect(classifyLegadoImportJson(replaceRuleJson).dominant).toBe('replaceRule');
    expect(classifyLegadoImportJson(dictRuleJson).dominant).toBe('dictRule');
    expect(classifyLegadoImportJson(txtTocRuleJson).dominant).toBe('txtTocRule');
  });

  it('detects rss markers on shared sourceUrl/sourceName fields', () => {
    const rssItem = JSON.parse(rssSourceJson)[0] as Record<string, unknown>;
    expect(classifyLegadoImportItem(rssItem)).toBe('rssSource');
    expect(matchesLegadoImportKind(rssItem, 'bookSource')).toBe(false);
    expect(matchesLegadoImportKind(rssItem, 'rssSource')).toBe(true);
  });

  it('blocks cross-type parsing', () => {
    expect(parseBookSourceJson(rssSourceJson)).toHaveLength(0);
    expect(parseRssSourceJson(bookSourceJson)).toHaveLength(0);
    expect(parseReplaceRuleJson(bookSourceJson)).toHaveLength(0);
    expect(parseDictRuleJson(bookSourceJson)).toHaveLength(0);
    expect(parseTxtTocRuleJson(bookSourceJson)).toHaveLength(0);
  });

  it('parses each type only through its own parser', () => {
    expect(parseBookSourceJson(bookSourceJson)).toHaveLength(1);
    expect(parseRssSourceJson(rssSourceJson)).toHaveLength(1);
    expect(parseReplaceRuleJson(replaceRuleJson)).toHaveLength(1);
    expect(parseDictRuleJson(dictRuleJson)).toHaveLength(1);
    expect(parseTxtTocRuleJson(txtTocRuleJson)).toHaveLength(1);
  });
});
