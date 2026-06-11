import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fetchByAnalyzeUrl } from '@/lib/book-source/analyze-url';
import { analyzeListElements, analyzeString } from '@/lib/rule-engine/analyze-rule';
import type { RuleContext } from '@/lib/rule-engine/analyze-rule';
import { rssAsBookSource } from '@/lib/rss-source/rss-as-book-source';
import type { RssSource } from '@/types';

const here = dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(
  readFileSync(join(here, '../../../../examples/软件分享-难受云.json'), 'utf8'),
)[0] as RssSource;

const warningItem = JSON.stringify({
  name_all: '‼️点击本链接获取永久软件地址。',
  time: '',
  uri1: '004.png',
  url: 'http://qqs888.xyz/free',
});

function itemContext(itemJson: string): RuleContext {
  return {
    content: itemJson,
    contentType: 'json',
    listItem: itemJson,
    listItemContentType: 'json',
    baseUrl:
      'http://www.baidu.com/?wd=https://0【】《💔本列表纯粹警示说明💔软件都在👉🏻》◎◎',
    source: source as unknown as Record<string, unknown>,
  };
}

describe('软件分享-难受云 RSS 规则', () => {
  it('fetchByAnalyzeUrl 蓝奏分类可绕过 acw 质询', async () => {
    const book = rssAsBookSource(source);
    const { body } = await fetchByAnalyzeUrl({
      ruleUrl: 'https://mby.lanzoub.com/b016iz5kgd',
      source: book,
      baseUrl: source.sourceUrl,
    });
    expect(body).toContain('var pgs');
  }, 30_000);

  it('ruleArticles 解析橙仁2号列表项', async () => {
    const book = rssAsBookSource(source);
    const url = 'https://mby.lanzoue.com/b016iz5kgd';
    const { body } = await fetchByAnalyzeUrl({
      ruleUrl: url,
      source: book,
      baseUrl: source.sourceUrl,
    });
    const items = await analyzeListElements(String(source.ruleArticles), {
      content: body,
      contentType: 'html',
      baseUrl: url,
      source: book as unknown as Record<string, unknown>,
    });
    expect(items.length).toBeGreaterThan(5);
  }, 60_000);

  it('ruleLink @js 无 id 时不抛语法错并返回 url', async () => {
    const link = await analyzeString(String(source.ruleLink), itemContext(warningItem));
    expect(link).toBe('http://qqs888.xyz/free');
  });

  it('ruleImage @js 返回 agit 封面 URL', async () => {
    const image = await analyzeString(String(source.ruleImage), itemContext(warningItem));
    expect(image).toBe('https://agit.ai/yd/08black/raw/branch/o/004.png');
  });
});
