import { describe, expect, it } from 'vitest';
import {
  apiContentsToHtml,
  extractApiContent,
  isApiErrorText,
  resolveApiImageContent,
} from '@/lib/book-source/extract-api-content';

describe('extractApiContent', () => {
  it('成功响应优先 data.data.content', () => {
    const html = extractApiContent(
      JSON.stringify({
        code: 0,
        data: { content: '<img src="https://cdn.example/a.jpg">' },
      }),
    );
    expect(html).toContain('a.jpg');
  });

  it('失败响应不把 content/msg 当作正文', () => {
    expect(
      extractApiContent(
        JSON.stringify({
          code: -1,
          msg: '正文处理异常："invalid memory address or nil pointer dereference"',
          content:
            '正文处理异常："invalid memory address or nil pointer dereference"',
        }),
      ),
    ).toBe('');
  });

  it('contents 数组转为 img 标签', () => {
    expect(
      extractApiContent(
        JSON.stringify({
          code: 0,
          contents: ['https://cdn.example/1.jpg', 'https://cdn.example/2.jpg'],
        }),
      ),
    ).toContain('1.jpg');
  });

  it('apiContentsToHtml 支持对象项', () => {
    expect(
      apiContentsToHtml([{ url: 'https://cdn.example/x.jpg' }]),
    ).toContain('x.jpg');
  });

  it('resolveApiImageContent 补全相对路径与 ident', () => {
    const out = resolveApiImageContent(
      '<img src="/proxy/a.jpg">ident="/static/b.jpg"',
      'https://v1.gyks.cf',
    );
    expect(out).toContain('https://v1.gyks.cf/proxy/a.jpg');
    expect(out).toContain('ident="https://v1.gyks.cf/static/b.jpg');
  });

  it('isApiErrorText 识别 Go panic 文案', () => {
    expect(
      isApiErrorText(
        '正文处理异常："invalid memory address or nil pointer dereference"',
      ),
    ).toBe(true);
  });
});
