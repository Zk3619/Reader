import { describe, expect, it, vi } from 'vitest';
import { runLegadoRuleScript } from '@/lib/js-engine/legado/rule-script-runner';
import { readFixture, readProjectFile } from '@/test/helpers/fixtures';

const CHAPTER_HTML = readFixture('bacha/chapter.html');
const CHAPTER_JS = readFixture('bacha/chapter.js');

vi.mock('@/lib/http', () => ({
  get: vi.fn(async (url: string) => {
    if (String(url).includes('352056.js')) return CHAPTER_JS;
    return CHAPTER_HTML;
  }),
  post: vi.fn(async () => ''),
}));

vi.mock('@/lib/platform/open-url', () => ({
  openLegadoBrowserInApp: vi.fn(async () => ({
    confirmed: true,
    cookies: 'qttoken=test',
    url: 'https://example.com/',
  })),
}));

describe('rule-script-runner', () => {
  it('八叉 content 规则可解析正文', async () => {
    const source = JSON.parse(readProjectFile('examples/shareBookSource.json')).find(
      (s: { bookSourceName?: string }) => s.bookSourceName?.includes('八叉'),
    );

    const code = source.ruleContent.content.replace(/^<js>|<\/js>$/gi, '').trim();
    const out = await runLegadoRuleScript(
      code,
      {
        result: CHAPTER_HTML,
        baseUrl: 'https://bachashuku.org/',
        ruleContent: CHAPTER_HTML,
        ruleContentType: 'html',
        source: {
          bookSourceComment: source.bookSourceComment,
          bookSourceUrl: source.bookSourceUrl,
          sourceUrl: source.bookSourceUrl,
        },
        book: { durChapterIndex: 10 },
        chapter: { index: 10, title: '第02章' },
        bookSource: source,
      },
      source,
    );

    expect(out).toBeTruthy();
    expect(String(out)).toContain('图书馆');
  });

  it('java.hexDecodeToString 可解码目录 data 载荷', async () => {
    const payload = { book_id: 'abc123', sources: '番茄', tab: '小说', url: '' };
    const hex = Array.from(new TextEncoder().encode(JSON.stringify(payload)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const out = await runLegadoRuleScript(
      'JSON.parse(java.hexDecodeToString(result)).book_id',
      {
        result: hex,
        baseUrl: 'https://v1.gyks.cf/',
        source: {},
      },
      {
        bookSourceName: 'test',
        sourceName: 'test',
        bookSourceUrl: 'test',
        sourceUrl: 'test',
      } as never,
    );

    expect(out).toBe('abc123');
  });

  it('getArguments 与 host 可在规则脚本中访问', async () => {
    const out = await runLegadoRuleScript(
      'getArguments(source.getVariable(), "server") || host[0]',
      {
        result: '',
        baseUrl: 'https://v1.gyks.cf/',
        source: {
          jsLib: "var host = ['https://v1.gyks.cf'];",
        },
      },
      {
        bookSourceName: 'test',
        sourceName: 'test',
        bookSourceUrl: 'test',
        sourceUrl: 'test',
        jsLib: "var host = ['https://v1.gyks.cf'];",
      } as never,
    );

    expect(out).toBe('https://v1.gyks.cf');
  });

  it('正文规则内 let title 不与绑定参数冲突', async () => {
    const code = `
let title = '章节名';
result = title + '-ok';
`.trim();

    const out = await runLegadoRuleScript(
      code,
      {
        result: 'hex-payload',
        baseUrl: 'https://v1.gyks.cf/',
        chapter: { title: '第1话' },
        source: {},
      },
      {
        bookSourceName: 'test',
        sourceName: 'test',
        bookSourceUrl: 'test',
        sourceUrl: 'test',
      } as never,
    );

    expect(out).toBe('章节名-ok');
  });

  it('processCatalogList 在 ajax 首轮为空时不抛错并在第二轮解析', async () => {
    const payload = { book_id: 'abc123', sources: '全面漫画', tab: '漫画', url: '' };
    const hex = Array.from(new TextEncoder().encode(JSON.stringify(payload)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const catalogBody = JSON.stringify({
      code: 0,
      data: [{ item_id: '1', title: '第1话', source: '全面漫画' }],
    });

    const { post } = await import('@/lib/http');
    vi.mocked(post).mockImplementation(async (url: string) => {
      if (String(url).includes('/catalog')) return catalogBody;
      return '';
    });

    const jsLib = `
function processCatalogList(data) {
  const parsed = JSON.parse(data);
  return parsed.data;
}
var host = ['https://v1.gyks.cf'];
function getArguments(open_argument, key) {
  try { open_argument = JSON.parse(open_argument); } catch (e) { open_argument = { server: host[0] }; }
  return key ? open_argument[key] : open_argument;
}
`.trim();

    const code = `
let res = JSON.parse(java.hexDecodeToString(result));
let base_url = getArguments(source.getVariable(), "server") || host[0];
let varia = JSON.stringify({ custom: '' });
let op = JSON.stringify({ method: "POST", body: { html: "" } });
let data = java.ajax(
  base_url + "/catalog?book_id=" + res.book_id + "&source=" + res.sources + "&tab=" + res.tab + "&variable=" + varia + "," + op
);
processCatalogList(data);
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
        bookSourceUrl: 'test',
        sourceUrl: 'test',
        jsLib,
      } as never,
    );

    expect(Array.isArray(out)).toBe(true);
    expect((out as { title: string }[])[0]?.title).toBe('第1话');
  });

  it('ajax 多轮重跑时保留 hex result 供 chapterList 解码', async () => {
    const payload = { book_id: 'abc123', sources: '番茄', tab: '小说', url: '' };
    const hex = Array.from(new TextEncoder().encode(JSON.stringify(payload)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const catalogBody = JSON.stringify({
      code: 0,
      data: [{ item_id: '1', title: '第一章' }],
    });

    const { post } = await import('@/lib/http');
    vi.mocked(post).mockImplementation(async (url: string) => {
      if (String(url).includes('/catalog')) return catalogBody;
      return '';
    });

    const code = `
let res = JSON.parse(java.hexDecodeToString(result));
let base_url = getArguments(source.getVariable(), "server") || host[0];
let varia = JSON.stringify({ custom: '' });
let op = JSON.stringify({ method: "POST", body: { html: "" } });
let data = java.ajax(
  base_url + "/catalog?book_id=" + res.book_id + "&source=" + res.sources + "&tab=" + res.tab + "&variable=" + varia + "," + op
);
data;
`.trim();

    const out = await runLegadoRuleScript(
      code,
      {
        result: hex,
        baseUrl: 'https://v1.gyks.cf/',
        source: {
          jsLib: "var host = ['https://v1.gyks.cf'];",
        },
      },
      {
        bookSourceName: 'test',
        sourceName: 'test',
        bookSourceUrl: 'test',
        sourceUrl: 'test',
        jsLib: "var host = ['https://v1.gyks.cf'];",
      } as never,
    );

    expect(JSON.parse(String(out)).data[0].title).toBe('第一章');
  });

  it('java.put(sources) 在 let sources 之前时不触发 TDZ', async () => {
    const payload = {
      item_id: 'ch1',
      sources: '全面漫画',
      tab: '漫画',
      title: '第1话',
      url: '',
    };
    const hex = Array.from(new TextEncoder().encode(JSON.stringify(payload)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const code = `
result = String(java.hexDecodeToString(result));
let res = JSON.parse(result);
java.put('sources',sources);
let sources = res.sources;
let tab = res.tab;
sources + '|' + tab;
`.trim();

    const out = await runLegadoRuleScript(
      code,
      {
        result: hex,
        baseUrl: 'https://example.com/',
        source: {},
      },
      undefined,
    );

    expect(out).toBe('全面漫画|漫画');
  });

  it('ajax 缓存键区分 POST body（/content 不同章节）', async () => {
    const { post } = await import('@/lib/http');
    vi.mocked(post).mockImplementation(async (_url: string, body?: string | FormData) => {
      const raw = typeof body === 'string' ? body : '{}';
      const parsed = JSON.parse(raw) as { item_id?: string };
      if (parsed.item_id === 'ch1') {
        return JSON.stringify({ code: 0, data: { content: '<img src="a.jpg">' } });
      }
      return JSON.stringify({ code: 0, data: { content: '<img src="b.jpg">' } });
    });

    const code = `
let op = JSON.stringify({ method: "POST", body: JSON.stringify({ item_id: "ch1" }) });
let a = java.ajax("https://v1.gyks.cf/content," + op);
op = JSON.stringify({ method: "POST", body: JSON.stringify({ item_id: "ch2" }) });
let b = java.ajax("https://v1.gyks.cf/content," + op);
JSON.stringify({ a: JSON.parse(a).data.content, b: JSON.parse(b).data.content });
`.trim();

    const out = await runLegadoRuleScript(
      code,
      { result: '', baseUrl: 'https://v1.gyks.cf/', source: {} },
      {
        bookSourceName: 'test',
        sourceName: 'test',
        bookSourceUrl: 'test',
        sourceUrl: 'test',
      } as never,
    );

    const parsed = JSON.parse(String(out));
    expect(parsed.a).toContain('a.jpg');
    expect(parsed.b).toContain('b.jpg');
  });

  it('chapterUrl 规则 content_url 赋值会隐式 return', async () => {
    const code = `
let tab = result.tab;
let sources = result.source;
let title = result.title;
let item_id = result.item_id;
let book_id = java.get("book_id");
java.put("book_id", "bk1");
let qtcontent = java.base64Encode(JSON.stringify({ book_id, item_id, title, sources, tab }));
if (sources == '卷') {
  content_url = item_id;
} else {
  content_url = \`data:;base64,\${qtcontent},{"type":"qingtian3"}\`;
}
`.trim();

    const out = await runLegadoRuleScript(
      code,
      {
        result: {
          tab: '漫画',
          source: '全面漫画',
          title: '第1话',
          item_id: 'ch1',
        },
        baseUrl: 'https://v1.gyks.cf/',
        variables: { book_id: 'bk1' },
        source: {},
      },
      undefined,
    );

    expect(String(out)).toMatch(/^data:;base64,/);
    expect(String(out)).toContain('qingtian3');
  });

  it('聚合 /content 顶层 content 可被规则脚本读取', async () => {
    const payload = {
      item_id: 'ch1',
      sources: '全面漫画',
      tab: '漫画',
      title: '第1话',
      book_id: 'b1',
      url: '',
    };
    const hex = Array.from(new TextEncoder().encode(JSON.stringify(payload)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const jsLib = `
var host = ['https://v1.gyks.cf'];
function getArguments(open_argument, key) {
  try { open_argument = JSON.parse(open_argument); } catch (e) { open_argument = { server: host[0] }; }
  return key ? open_argument[key] : open_argument;
}
`.trim();

    const { post } = await import('@/lib/http');
    vi.mocked(post).mockResolvedValue(
      JSON.stringify({
        code: 0,
        content: '<img src="https://cdn.example/m1.jpg">',
      }),
    );

    const code = `
result = String(java.hexDecodeToString(result));
let res = JSON.parse(result);
let sources = res.sources;
let tab = res.tab;
let item_id = res.item_id;
let base_url = getArguments(source.getVariable(), "server") || host[0];
let op = JSON.stringify({
  method: "POST",
  body: JSON.stringify({ html: "", item_id, source: sources, tab, variable: "{\\"custom\\":\\"\\"}" }),
  headers: { "Content-Type": "application/json", cookie: "" },
});
let data = java.ajax(base_url + "/content," + op);
try { data = JSON.parse(data); } catch (e) {}
content = data.content;
JSON.stringify({ content: content });
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
        bookSourceUrl: 'test',
        sourceUrl: 'test',
        jsLib,
      } as never,
    );

    const parsed = JSON.parse(String(out));
    expect(parsed.content).toContain('<img');
  });
});

describe('ruleContent $.content 规则链', () => {
  it('ruleContent 链：content=data.content 后 $.content 取 HTML', async () => {
    const { analyzeString } = await import('@/lib/rule-engine');
    const { post } = await import('@/lib/http');
    vi.mocked(post).mockResolvedValue(
      JSON.stringify({
        code: 0,
        content: '<img src="https://cdn.example/m1.jpg">',
      }),
    );

    const payload = {
      item_id: 'ch1',
      sources: '全面漫画',
      tab: '漫画',
      title: '第1话',
      book_id: 'b1',
      url: '',
    };
    const hex = Array.from(new TextEncoder().encode(JSON.stringify(payload)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const jsLib = `
var host = ['https://v1.gyks.cf'];
function getArguments(open_argument, key) {
  try { open_argument = JSON.parse(open_argument); } catch (e) { open_argument = { server: host[0] }; }
  return key ? open_argument[key] : open_argument;
}
`.trim();

    const source = {
      bookSourceName: 'test',
      sourceName: 'test',
      bookSourceUrl: 'test',
      sourceUrl: 'test',
      jsLib,
      header: '{"User-Agent":"Mozilla/5.0"}',
    };

    const rule = `
<js>
result = String(java.hexDecodeToString(result));
let res = JSON.parse(result);
let sources = res.sources;
let tab = res.tab;
let item_id = res.item_id;
let base_url = getArguments(source.getVariable(), "server") || host[0];
let op = JSON.stringify({
  method: "POST",
  body: JSON.stringify({
    html: "",
    item_id,
    source: sources,
    tab,
    tone_id: "4",
    variable: "{\\"custom\\":\\"\\"}",
    version: "4.11.5.1",
  }),
  headers: { cookie: "", "Content-Type": "application/json" },
});
let data = java.ajax(base_url + "/content," + op);
try { data = JSON.parse(data); } catch (e) {}
content = data.content;
JSON.stringify({ content: content });
</js>$.content`.trim();

    const out = await analyzeString(rule, {
      content: hex,
      contentType: 'text',
      baseUrl: 'https://v1.gyks.cf/',
      result: hex,
      source: source as never,
      book: { variable: '{"custom":""}' },
    });

    expect(out).toContain('<img');
  });

  it('content=data.content 时仅取顶层 content 字段', async () => {
    const { analyzeString } = await import('@/lib/rule-engine');
    const { post } = await import('@/lib/http');
    vi.mocked(post).mockResolvedValue(
      JSON.stringify({
        code: 0,
        content:
          '<img src="https://cdn.example/1.webp"><img src="https://cdn.example/3.webp">',
        contents: [
          'https://cdn.example/1.webp',
          'https://cdn.example/2.webp',
          'https://cdn.example/3.webp',
          'https://cdn.example/4.webp',
        ],
        data: {
          content:
            '<img src="https://cdn.example/1.webp"><img src="https://cdn.example/3.webp">',
        },
      }),
    );

    const payload = {
      item_id: 'ch1',
      sources: 'G社漫画',
      tab: '漫画',
      title: '第5话',
      book_id: 'b1',
      url: '',
    };
    const hex = Array.from(new TextEncoder().encode(JSON.stringify(payload)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const jsLib = `
var host = ['https://v1.gyks.cf'];
function getArguments(open_argument, key) {
  try { open_argument = JSON.parse(open_argument); } catch (e) { open_argument = { server: host[0] }; }
  return key ? open_argument[key] : open_argument;
}
`.trim();

    const source = {
      bookSourceName: 'test',
      sourceName: 'test',
      bookSourceUrl: 'test',
      sourceUrl: 'test',
      jsLib,
      header: '{"User-Agent":"Mozilla/5.0"}',
    };

    const rule = `
<js>
result = String(java.hexDecodeToString(result));
let res = JSON.parse(result);
let sources = res.sources;
let tab = res.tab;
let item_id = res.item_id;
let base_url = getArguments(source.getVariable(), "server") || host[0];
let op = JSON.stringify({
  method: "POST",
  body: JSON.stringify({
    html: "",
    item_id,
    source: sources,
    tab,
    tone_id: "4",
    variable: "{\\"custom\\":\\"\\"}",
    version: "4.11.5.1",
  }),
  headers: { cookie: "", "Content-Type": "application/json" },
});
let data = java.ajax(base_url + "/content," + op);
try { data = JSON.parse(data); } catch (e) {}
content = data.content;
JSON.stringify({ content: content });
</js>$.content`.trim();

    const out = await analyzeString(rule, {
      content: hex,
      contentType: 'text',
      baseUrl: 'https://v1.gyks.cf/',
      result: hex,
      source: source as never,
      book: { variable: '{"custom":""}' },
    });

    expect(out).toContain('1.webp');
    expect(out).toContain('3.webp');
    expect(out).not.toContain('2.webp');
    expect(out).not.toContain('4.webp');
    expect((out.match(/<img\b/gi) ?? []).length).toBe(2);
  });

  it('startBrowserAwait 挂起恢复后 StrResponse.body() 可用', async () => {
    const { openLegadoBrowserInApp } = await import('@/lib/platform/open-url');
    const openMock = vi.mocked(openLegadoBrowserInApp);
    openMock.mockClear();

    const code = `
let html = java.startBrowserAwait('https://example.com/verify', '验证').body();
html + '-ok';
`.trim();

    const out = await runLegadoRuleScript(
      code,
      { result: '', baseUrl: 'https://v1.gyks.cf/', source: {} },
      {
        bookSourceName: 'test',
        sourceName: 'test',
        bookSourceUrl: 'https://v1.gyks.cf/',
        sourceUrl: 'https://v1.gyks.cf/',
      } as never,
    );

    expect(out).toBe('-ok');
    expect(openMock).toHaveBeenCalledTimes(1);
    expect(openMock.mock.calls[0]?.[3]).toMatchObject({ awaitClose: true });
  });

  it('java.deviceID 抛错后走 androidId，device_type 为安卓（对齐 Legado Android）', async () => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });

    const code = `
let device, device_type;
try {
  device = java.deviceID();
  device_type = "苹果";
} catch (e) {
  try {
    device = java.androidId();
    device_type = "安卓";
  } catch (e2) {
    device = "";
    device_type = "安卓";
  }
}
JSON.stringify({ device_type, device: String(device) });
`.trim();

    const out = await runLegadoRuleScript(
      code,
      { result: '', baseUrl: 'https://v1.gyks.cf/', source: {} },
      {
        bookSourceName: 'test',
        sourceName: 'test',
        bookSourceUrl: 'test',
        sourceUrl: 'test',
      } as never,
    );

    const parsed = JSON.parse(String(out)) as { device_type: string; device: string };
    expect(parsed.device_type).toBe('安卓');
    expect(parsed.device.length).toBeGreaterThan(0);
    expect(parsed.device).not.toMatch(/^web_/);
  });

  it('光遇 request shim 可解析 BaseUrl 并拼接相对路径', async () => {
    const jsLib = `
var hosts = ['https://v1.gyks.cf'];
function getVariable(key) {
  if (key === '线路') return 'https://v1.gyks.cf';
  if (key === '云端配置') return { hosts: hosts };
  if (key === '自动切换') return 'true';
  return '5';
}
function BaseUrl() {
  return String(this.getVariable('线路') || hosts[0]).replace(/\\/$/, '');
}
function getToken() {
  return 'test-token';
}
function request() {
  return '';
}
`.trim();

    const out = await runLegadoRuleScript(
      'result = request("/catalog", "POST", { html: "" }, false);',
      {
        result: '',
        baseUrl: 'https://v1.gyks.cf/',
        source: { jsLib },
      },
      {
        bookSourceName: 'test',
        sourceName: 'test',
        bookSourceUrl: 'test',
        sourceUrl: 'test',
        jsLib,
      } as never,
    );

    expect(String(out)).toMatch(/^https:\/\/v1\.gyks\.cf\/catalog,/);
    expect(String(out)).toContain('test-token');
  });
});
