import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { BookSource } from '@/types';
import { runSearchUrlScript } from '@/lib/book-source/search-script-runner';
import { ensureExploreScriptSetsResult } from '@/lib/js-engine/legado/source-script-shared';
import { runLegadoRuleScript } from '@/lib/js-engine/legado/rule-script-runner';
import { jsonToHex } from '@/lib/book-source/utils';

const GY_SEARCH_SCRIPT = `
let moreSettings = getVariable('更多设置');
let tab = (moreSettings && moreSettings['搜索模式']) || '小说';
let sourcesKey = (moreSettings && moreSettings[tab]) || '全部';
let disabled_sources = (moreSettings && moreSettings['强制搜索']) || '0';
let gysearch = {
  key: key,
  tab: tab,
  sourcesKey: sourcesKey,
  page: page,
  disabled_sources: disabled_sources,
};
gysearch = java.base64Encode(JSON.stringify(gysearch));
\`data:;base64,\${gysearch},{"type":"gysearch"}\`;
`.trim();

describe('search-script-runner', () => {
  it('ensureExploreScriptSetsResult 捕获末行 data URL 模板', () => {
    const patched = ensureExploreScriptSetsResult(GY_SEARCH_SCRIPT);
    expect(patched).toContain('globalThis.result = `data:;base64,${gysearch}');
  });

  it('光遇 searchUrl 脚本可 base64 编码并返回 data URL', async () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem: () => {} } });
    const source = {
      bookSourceUrl: 'https://v1.gyks.cf/',
      sourceUrl: 'https://v1.gyks.cf/',
      bookSourceName: '光遇测试',
      bookSourceType: 0,
      enabled: true,
      loginUrl: '',
      searchUrl: `<js>${GY_SEARCH_SCRIPT}</js>`,
      jsLib: "function getVariable(k){ if(k==='更多设置') return { '搜索模式':'小说', '小说':'全部', '强制搜索':'0' }; return ''; }",
    } as unknown as BookSource;
    const out = await runSearchUrlScript(GY_SEARCH_SCRIPT, source, '测试词', 1);
    expect(out.startsWith('data:;base64,')).toBe(true);
    expect(out).toContain('"type":"gysearch"');
  });
});

describe('rule-script-runner jsLib backtick', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('jsLib 含模板字符串时不破坏 Function 构造', async () => {
    const jsLib = `
function getCloudSettings() {
  java.longToast(\`\\n正在更新\`);
  return {};
}
var host = ['https://v1.gyks.cf'];
function request(path) { return '{"code":0,"data":[]}'; }
`.trim();

    const payload = {
      key: '测试',
      tab: '小说',
      sourcesKey: '全部',
      page: 1,
      disabled_sources: '0',
    };
    const hex = jsonToHex(JSON.stringify(payload));

    const code = `
const res = JSON.parse(java.hexDecodeToString(result));
res.key;
`.trim();

    const out = await runLegadoRuleScript(
      code,
      {
        result: hex,
        baseUrl: 'https://v1.gyks.cf/',
        source: { jsLib },
      },
      {
        bookSourceName: 'test',
        sourceName: 'test',
        bookSourceUrl: 'https://v1.gyks.cf/',
        sourceUrl: 'https://v1.gyks.cf/',
        jsLib,
      } as never,
    );

    expect(out).toBe('测试');
  });
});
