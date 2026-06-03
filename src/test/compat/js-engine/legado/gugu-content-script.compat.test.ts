import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runLegadoRuleScript } from '@/lib/js-engine/legado/rule-script-runner';
import sourceList from '../../../../../examples/1780106748.json';
import type { BookSource } from '@/types';

const CHAPTER_HTML = `<!DOCTYPE html><html><body><script>var player={"url":"abc123-vid","from":"gugu"};</script></body></html>`;

vi.mock('@/lib/http', () => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('@/lib/platform/open-url', () => ({
  openLegadoBrowserInApp: vi.fn(async () => ({
    confirmed: false,
    cookies: '',
    url: '',
  })),
}));

import { post } from '@/lib/http';

describe('咕咕番正文 rule-script', () => {
  const source = (sourceList as unknown as BookSource[])[0];
  const contentRule = source.ruleContent?.content ?? '';

  beforeEach(() => {
    vi.mocked(post).mockReset();
    vi.mocked(post).mockResolvedValue(JSON.stringify({ url: 'https://vod.example/play.m3u8' }));
  });

  it('java.post 返回 StrResponse.body() 且脚本可执行', async () => {
    const { openLegadoBrowserInApp } = await import('@/lib/platform/open-url');
    const openMock = vi.mocked(openLegadoBrowserInApp);
    openMock.mockClear();

    const variables: Record<string, unknown> = {};
    const out = await runLegadoRuleScript(
      contentRule.replace(/^@js:\n/, ''),
      {
        result: CHAPTER_HTML,
        baseUrl: 'https://www.gugu3.com/index.php/vod/play/id/4973/sid/1/nid/1.html',
        ruleContent: CHAPTER_HTML,
        ruleContentType: 'html',
        source: { bookSourceUrl: 'https://www.gugu3.com/' },
        book: { name: '测试番剧' },
        variables,
      },
      source,
    );

    expect(vi.mocked(post).mock.calls.some(([url]) => String(url).includes('mizhi_json.php'))).toBe(
      true,
    );
    expect(String(out)).toContain('请刷新尝试播放');
    expect(openMock).toHaveBeenCalled();
    expect(openMock.mock.calls[0]?.[3]).toMatchObject({ awaitClose: true });
    expect(String(variables.__readerLastBrowserUrl ?? '')).toMatch(/artplayer\.php/i);
  });

  it('正文 nonBlockingBrowserAwait 不挂起且仍打开播放页', async () => {
    const { openLegadoBrowserInApp } = await import('@/lib/platform/open-url');
    const openMock = vi.mocked(openLegadoBrowserInApp);
    openMock.mockClear();

    const out = await runLegadoRuleScript(
      contentRule.replace(/^@js:\n/, ''),
      {
        result: CHAPTER_HTML,
        baseUrl: 'https://www.gugu3.com/index.php/vod/play/id/4973/sid/1/nid/1.html',
        ruleContent: CHAPTER_HTML,
        ruleContentType: 'html',
        source: { bookSourceUrl: 'https://www.gugu3.com/' },
        book: { name: '测试番剧' },
        variables: {},
        nonBlockingBrowserAwait: true,
      },
      source,
    );

    expect(String(out)).toContain('请刷新尝试播放');
    expect(openMock).toHaveBeenCalled();
    expect(openMock.mock.calls[0]?.[3]).not.toMatchObject({ awaitClose: true });
  });

  it('书源 try/catch 包裹 startBrowserAwait 仍会打开内嵌页', async () => {
    const { openLegadoBrowserInApp } = await import('@/lib/platform/open-url');
    const openMock = vi.mocked(openLegadoBrowserInApp);
    openMock.mockClear();

    const scriptWithTryCatch = `
const vid = "abc123-vid";
const purl = "https://vod.example/play.m3u8";
const play = "https://api.nxvav.cn/api/m3u8/artplayer.php?pip=false&url=";
try {
  java.startBrowserAwait(play + java.encodeURI(purl), book.name);
} catch {
  "兜底";
}
"请刷新尝试播放";
`.trim();

    const out = await runLegadoRuleScript(
      scriptWithTryCatch,
      {
        result: CHAPTER_HTML,
        baseUrl: 'https://www.gugu3.com/',
        ruleContent: CHAPTER_HTML,
        book: { name: '测试' },
        variables: {},
      },
      source,
    );

    expect(String(out)).toContain('请刷新尝试播放');
    expect(openMock).toHaveBeenCalled();
    expect(openMock.mock.calls[0]?.[3]).toMatchObject({ awaitClose: true });
  });

  it('脚本抛错时不应把章节 HTML 当作正文输出', async () => {
    const badHtml = '<html><body><p>no player json</p></body></html>';
    const out = await runLegadoRuleScript(
      'const x = result.match(/"url":"([a-z0-9-]+)"/)[1]; x;',
      {
        result: badHtml,
        baseUrl: 'https://www.gugu3.com/',
        ruleContent: badHtml,
        ruleContentType: 'html',
        source: { bookSourceUrl: 'https://www.gugu3.com/' },
      },
      source,
    );
    expect(out).toBeNull();
  });
});
