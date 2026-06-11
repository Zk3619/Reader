import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyzeListElements, analyzeString } from '@/lib/rule-engine';
import { splitSourceRule } from '@/lib/rule-engine/legado-source-rule';
import type { RuleContext } from '@/lib/rule-engine/analyze-rule';
import { extractExploreScript } from '@/lib/js-engine';
import { ensureExploreScriptSetsResult } from '@/lib/js-engine/legado/source-script-shared';
import { runExploreScriptRawValue } from '@/lib/js-engine/legado/explore-script-runner';
import { resolveLegadoRuleUrl } from '@/lib/book-source/analyze-search-url';
import { parseSortUrlLines } from '@/lib/rss-source/sort-urls';
import type { RssSource } from '@/types';

const here = dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(
  readFileSync(join(here, '../../../../examples/阅读订阅.json'), 'utf8'),
)[0] as RssSource;

describe('阅读订阅 sortUrl', () => {
  it('ensureExploreScriptSetsResult 同步 result 到 globalThis', () => {
    const script = extractExploreScript(source.sortUrl);
    expect(script).toBeTruthy();
    const bundled = ensureExploreScriptSetsResult(script!);
    expect(bundled).toContain('globalThis.result = result;');
  });

  it('sortUrl JS 从 loginUrl 产出多个分类', async () => {
    const script = extractExploreScript(source.sortUrl);
    expect(script).toBeTruthy();
    const raw = await runExploreScriptRawValue(script!, source as never);
    expect(typeof raw).toBe('string');
    const text = String(raw);
    expect(text).toContain('书源仓库和论坛::http://www.baidu.com?wd=');
    expect(text).toContain('大佬发布页::http://www.baidu.com?wd=');

    const entries = parseSortUrlLines(text, 'http://www.baidu.com/');
    expect(entries.length).toBeGreaterThanOrEqual(7);
    expect(entries.some((e) => e.name === '书源仓库和论坛')).toBe(true);
    expect(entries[0]?.url.startsWith('http://www.baidu.com?wd=')).toBe(true);
  });

  it('resolveLegadoRuleUrl forRuleBase 保留 wd 明文', async () => {
    const sortUrl =
      'http://www.baidu.com?wd=【https://yckceo.vip/】《源仓库》@https://gitee.com/yc-sy/yd/raw/master/dy/yd/yck.png@『阅读书源仓库』•';
    const encoded = await resolveLegadoRuleUrl(sortUrl, source as never, { page: 1 });
    const ruleBase = await resolveLegadoRuleUrl(sortUrl, source as never, {
      page: 1,
      forRuleBase: true,
    });
    expect(encoded).toContain('%E3%80%90');
    expect(ruleBase).toContain('【https://yckceo.vip/】');
    expect(ruleBase).not.toContain('%E3%80%90');
  });

  it('ruleArticles 从 sortUrl（未编码 baseUrl）解析文章', async () => {
    const sortUrl =
      'http://www.baidu.com?wd=【https://yckceo.vip/】《源仓库》@https://gitee.com/yc-sy/yd/raw/master/dy/yd/yck.png@『阅读书源仓库』•【https://shuyuan.yiove.com】《Yiove 书源仓库》@https://shuyuan.yiove.com/favicon.ico@『三千书源』•';
    const encodedSortUrl =
      'http://www.baidu.com/?wd=%E3%80%90https%3A%2F%2Fyckceo.vip%2F%E3%80%91%E3%80%8A%E6%BA%90%E4%BB%93%E5%BA%93%E3%80%8B';

    const items = await analyzeListElements(String(source.ruleArticles), {
      content: '<html></html>',
      contentType: 'html',
      baseUrl: sortUrl,
      source: source as unknown as Record<string, unknown>,
    });
    expect(items.length).toBeGreaterThanOrEqual(2);
    const first = items.find((i) => i.content.includes('源仓库'));
    expect(first?.content).toContain('"text":"源仓库"');

    const encodedItems = await analyzeListElements(String(source.ruleArticles), {
      content: '<html></html>',
      contentType: 'html',
      baseUrl: encodedSortUrl,
      source: source as unknown as Record<string, unknown>,
    });
    expect(encodedItems.length).toBe(0);

    const title = await analyzeString(String(source.ruleTitle), {
      content: first!.content,
      contentType: 'json',
      baseUrl: sortUrl,
      source: source as unknown as Record<string, unknown>,
    });
    expect(title).toBe('源仓库');
  });

  it('ruleArticles JS 返回数组对象时 $.[*] 只产出 4 条（勿拆字段）', async () => {
    const sortUrl =
      'http://www.baidu.com?wd=【https://yckceo.vip/】《源仓库》@https://gitee.com/yc-sy/yd/raw/master/dy/yd/yck.png@『阅读书源仓库』•【https://shuyuan.yiove.com】《Yiove 书源仓库》@https://shuyuan.yiove.com/favicon.ico@『三千书源』•【http://fabu.yihulove.top】《YX源仓库》@http://yx.ccute.xyz/assets/iframe/images/logo.png@『来自书源爱好者的收集小站』•【https://ysqbbs.com】《源社区》@https://ysqbbs.com/data/attachment/common/template/boardimg_20241216d6f4lsl6.png@『第三方论坛』•';
    const segs = splitSourceRule(String(source.ruleArticles), true);
    expect(segs.map((s) => s.mode)).toEqual(['js', 'default']);

    const items = await analyzeListElements(String(source.ruleArticles), {
      content: '<html></html>',
      contentType: 'html',
      baseUrl: sortUrl,
      source: source as unknown as Record<string, unknown>,
    });
    expect(items.map((i) => i.content.slice(0, 60))).toMatchInlineSnapshot(`
      [
        "{"index":"https://yckceo.vip/","src":"https://gitee.com/yc-s",
        "{"index":"https://shuyuan.yiove.com","src":"https://shuyuan.",
        "{"index":"http://fabu.yihulove.top","src":"http://yx.ccute.x",
        "{"index":"https://ysqbbs.com","src":"https://ysqbbs.com/data",
      ]
    `);
    expect(items).toHaveLength(4);
    const titles = await Promise.all(
      items.map((item) =>
        analyzeString(String(source.ruleTitle), {
          content: item.content,
          contentType: 'json',
          baseUrl: sortUrl,
          source: source as unknown as Record<string, unknown>,
        }),
      ),
    );
    expect(titles).toEqual(['源仓库', 'Yiove 书源仓库', 'YX源仓库', '源社区']);
    const images = await Promise.all(
      items.map((item) =>
        analyzeString(String(source.ruleImage), {
          content: item.content,
          contentType: 'json',
          baseUrl: sortUrl,
          source: source as unknown as Record<string, unknown>,
        }),
      ),
    );
    expect(images).toEqual([
      'https://gitee.com/yc-sy/yd/raw/master/dy/yd/yck.png',
      'https://shuyuan.yiove.com/favicon.ico',
      'http://yx.ccute.xyz/assets/iframe/images/logo.png',
      'https://ysqbbs.com/data/attachment/common/template/boardimg_20241216d6f4lsl6.png',
    ]);
  });
});

describe('阅读订阅 ruleDescription', () => {
  const articleJson =
    '{"index":"https://yckceo.vip/","src":"https://gitee.com/yc-sy/yd/raw/master/dy/yd/yck.png","text":"源仓库","intro":"阅读书源仓库"}';

  it('splitSourceRule 拆为 HTML 模板 + 尾段 JS', () => {
    const segs = splitSourceRule(String(source.ruleDescription));
    expect(segs.length).toBeGreaterThanOrEqual(2);
    expect(segs[segs.length - 1]?.mode).toBe('js');
    expect(segs[0]?.mode).toBe('default');
    expect(segs[0]?.ruleStr).toContain('❗️0、3、开始❗️');
    expect(segs[segs.length - 1]?.ruleStr).toContain("index='{{$.index}}'");
  });

  it('链接型 index 无序号块时 description 为空（不抛 JS 错）', async () => {
    const ctx: RuleContext = {
      content: articleJson,
      contentType: 'json',
      baseUrl: 'http://www.baidu.com/',
      source: source as unknown as Record<string, unknown>,
    };
    const description = await analyzeString(String(source.ruleDescription), ctx);
    expect(description).toBe('');
  });

  it('序号型 index 选取对应 HTML 片段作为 description', async () => {
    const ctx: RuleContext = {
      content: JSON.stringify({
        index: '0、3、',
        src: 'https://example.com/icon.png',
        text: '导入页',
        intro: '测试',
      }),
      contentType: 'json',
      baseUrl: 'http://www.baidu.com/',
      source: source as unknown as Record<string, unknown>,
    };
    const description = await analyzeString(String(source.ruleDescription), ctx);
    expect(description).toContain('legado://import/auto');
    expect(description).not.toContain('❗️0、1、开始❗️');
    expect(description).not.toContain('格式化发现[旧]');
  });
});
