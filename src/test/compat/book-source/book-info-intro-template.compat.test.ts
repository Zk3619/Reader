import { describe, expect, it, vi, beforeEach } from 'vitest';
import { analyzeString } from '@/lib/rule-engine';
import type { BookSource } from '@/types';

vi.mock('@/lib/book-source/login-check', () => ({
  assertLoginCheckPassed: vi.fn(async () => {}),
}));

vi.mock('@/lib/http', () => ({
  get: vi.fn(),
  post: vi.fn(),
  HttpError: class HttpError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

import { get } from '@/lib/http';
import { getBookInfo } from '@/lib/book-source/detail';

const GUGU_INTRO_RULE =
  '{{book.name + "  简介:"}}\n{{//div[@id="height_limit"]/text()##。(?![\"\'“”‘’《》〈〉［］｛｝【】〖〗〔〕『』「」。])##。\n}}';

describe('ruleBookInfo intro {{book.name}}', () => {
  it('有 book 上下文时前缀为书名', async () => {
    const html = '<div id="height_limit">第一段落。第二段。</div>';
    const intro = await analyzeString(GUGU_INTRO_RULE, {
      content: html,
      contentType: 'html',
      baseUrl: 'https://www.gugu3.com/index.php/vod/detail/id/4973.html',
      book: { name: '埃罗芒阿老师', bookUrl: 'https://www.gugu3.com/index.php/vod/detail/id/4973.html' },
    });
    expect(intro.startsWith('埃罗芒阿老师  简介:')).toBe(true);
    expect(intro).toContain('第一段落');
  });

  it('无 book 字段时不抛 ReferenceError', async () => {
    const html = '<div id="height_limit">内容。</div>';
    const intro = await analyzeString('{{book.name + "  简介:"}}', {
      content: html,
      contentType: 'html',
      baseUrl: 'https://example.com/',
      book: {},
    });
    expect(intro).toContain('简介:');
  });
});

describe('咕咕番 ruleBookInfo 仅 intro', () => {
  const GUGU_SOURCE = {
    bookSourceName: '咕咕番',
    bookSourceUrl: 'https://www.gugu3.com/',
    sourceUrl: 'https://www.gugu3.com/',
    enabled: true,
    enabledCookieJar: true,
    ruleBookInfo: {
      intro: GUGU_INTRO_RULE,
    },
  } as unknown as BookSource;

  const DETAIL_HTML = `<html><head>
<meta property="og:title" content="关于我转生变成史莱姆这档事 第四季"/>
</head><body>
<h3>关于我转生变成史莱姆这档事 第四季</h3>
<div id="height_limit">魔国联邦繁荣发展。利姆路的下一场战斗即将开始。</div>
</body></html>`;

  beforeEach(() => {
    vi.mocked(get).mockReset();
    vi.mocked(get).mockResolvedValue(DETAIL_HTML);
  });

  it('无 name 规则时从 book 快照取书名并返回详情', async () => {
    const info = await getBookInfo(
      GUGU_SOURCE,
      'https://www.gugu3.com/index.php/vod/detail/id/4973.html',
      {
        book: {
          name: '关于我转生变成史莱姆这档事 第四季',
          bookUrl: 'https://www.gugu3.com/index.php/vod/detail/id/4973.html',
          coverUrl: 'https://img.example/cover.jpg',
        },
      },
    );
    expect(info).not.toBeNull();
    expect(info!.name).toBe('关于我转生变成史莱姆这档事 第四季');
    expect(info!.intro).toContain('简介:');
    expect(info!.coverUrl).toContain('cover.jpg');
  });

  it('无 book 快照时从 og:title 兜底书名', async () => {
    const info = await getBookInfo(
      GUGU_SOURCE,
      'https://www.gugu3.com/index.php/vod/detail/id/4973.html',
    );
    expect(info).not.toBeNull();
    expect(info!.name).toBe('关于我转生变成史莱姆这档事 第四季');
  });
});
