import { describe, expect, it, vi } from 'vitest';
import { patchLegadoRuleScript } from '@/lib/js-engine/legado/rule-script-patches';
import { runLegadoRuleScript } from '@/lib/js-engine/legado/rule-script-runner';
import {
  createSourceVariableHandlers,
  getSourceArgsKey,
} from '@/lib/js-engine/legado/source-script-shared';
import { readProjectFile } from '@/test/helpers/fixtures';
import type { BookSource, RssSource } from '@/types';

const API_URL =
  'https://m.weibo.cn/api/container/getIndex?containerid=1076033963004251_-_WEIBO_SECOND_PROFILE_WEIBO&page=1';

const LIST_JS = `
let search = String(source.getVariable());
let f = /page_type=searchall/.test(baseUrl);
let baseUrl = String(f?baseUrl:java.hexDecodeToString(result));
if(search!==""&search!=="null"&&!f){
  id = baseUrl.match(/107603(\\d+)/)[1];
  page = baseUrl.match(/page=(\\d+)/)[1]
  if(page==1)java.toast("搜索中")
  url = \`https://m.weibo.cn/api/container/getIndex?disable_sug=1&page=\${page}\`;
  result = java.ajax(url)
}else if(!f){
  result = java.ajax(baseUrl);
}
result
`.trim();

vi.mock('@/lib/http', () => ({
  get: vi.fn(async (url: string) => {
    if (String(url).includes('m.weibo.cn/api')) {
      return JSON.stringify({
        ok: 1,
        data: { cards: [{ card_group: [{ mblog: { id: '1', text: '测试' } }] }] },
      });
    }
    return '';
  }),
  post: vi.fn(async () => ''),
}));

describe('微博博主 ruleArticles', () => {
  it('patchLegadoRuleScript 将 let baseUrl 改为赋值', () => {
    const patched = patchLegadoRuleScript(LIST_JS);
    expect(patched).toContain('baseUrl = String(f?baseUrl:');
    expect(patched).not.toMatch(/\blet\s+baseUrl\s*=/);
  });

  it('未设置源变量时 getVariable 为空，不走搜索分支', () => {
    const sources = JSON.parse(readProjectFile('examples/微博博主.json')) as BookSource[];
    const source = sources[0]!;
    const handlers = createSourceVariableHandlers(source, getSourceArgsKey(source));
    expect(handlers.getVariable()).toBe('');
  });

  it('列表 js 可读取 scope.baseUrl 并 ajax 拉取', async () => {
    const sources = JSON.parse(readProjectFile('examples/微博博主.json')) as RssSource[];
    const source = sources[0]! as BookSource & RssSource;
    const jsBlock = source.ruleArticles!
      .replace(/^<js>/i, '')
      .split('</js>')[0]!
      .trim();

    const sourceVars = createSourceVariableHandlers(source, getSourceArgsKey(source));
    const out = await runLegadoRuleScript(
      jsBlock,
      {
        result: API_URL,
        baseUrl: API_URL,
        ruleContent: API_URL,
        ruleContentType: 'text',
        source: {
          sourceUrl: source.sourceUrl,
          bookSourceUrl: source.sourceUrl,
          getVariable: (key?: string) => sourceVars.getVariable(key),
        },
        variables: {},
      },
      source,
    );

    const parsed = JSON.parse(String(out)) as { ok?: number };
    expect(parsed.ok).toBe(1);
  });
});
