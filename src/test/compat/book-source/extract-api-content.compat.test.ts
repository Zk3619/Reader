import { describe, expect, it } from 'vitest';
import {
  apiContentsToHtml,
  extractApiContent,
  isApiErrorText,
  resolveApiImageContent,
} from '@/lib/book-source/extract-api-content';
import { scanImgTags } from '@/lib/media/text/scan-img-tags';

describe('extractApiContent', () => {
  it('无顶层 content 时回退 data.data.content', () => {
    const html = extractApiContent(
      JSON.stringify({
        code: 0,
        data: { content: '<img src="https://cdn.example/a.jpg">' },
      }),
    );
    expect(html).toContain('a.jpg');
  });

  it('顶层 content 优先于 data.data.content（同 img 数时）', () => {
    const html = extractApiContent(
      JSON.stringify({
        code: 0,
        content: '<img src="https://cdn.example/full.jpg">',
        data: { content: '<img src="https://cdn.example/partial.jpg">' },
      }),
    );
    expect(html).toContain('full.jpg');
    expect(html).not.toContain('partial.jpg');
  });

  it('顶层 content 优先于 contents（对齐 content = data.content）', () => {
    const oddOnly = [
      'https://cdn.example/1.webp',
      'https://cdn.example/3.webp',
    ];
    const full = [
      'https://cdn.example/1.webp',
      'https://cdn.example/2.webp',
      'https://cdn.example/3.webp',
      'https://cdn.example/4.webp',
    ];
    const html = extractApiContent(
      JSON.stringify({
        code: 0,
        content: oddOnly.map((u) => `<img src="${u}">`).join(''),
        contents: full,
      }),
    );
    expect(html).toContain('1.webp');
    expect(html).toContain('3.webp');
    expect(html).not.toContain('2.webp');
    expect(html).not.toContain('4.webp');
    expect((html.match(/<img\b/gi) ?? []).length).toBe(2);
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

  it('hex 编码 content 解码为 HTML', () => {
    const html = '<img src="https://cdn.example/a.jpg"><img src="https://cdn.example/b.jpg">';
    const hex = Array.from(new TextEncoder().encode(html))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const out = extractApiContent(JSON.stringify({ code: 0, content: hex }));
    expect((out.match(/<img\b/gi) ?? []).length).toBe(2);
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

  it('resolveApiImageContent 保留 Legado 内嵌 headers 的全部 img（G社 13 页场景）', () => {
    const base =
      'https://f40-1-4.g-mh.online/kk/moshirenhuangfanyouqinggeweinturuzuo-ir660596/1';
    const hdr = ',{"headers":{"User-Agent":"LegadoUA","Referer":"https://g.example/"}}';
    const html = Array.from({ length: 13 }, (_, i) => {
      const n = i + 1;
      return `<img src="${base}/MjFjOGExM2RfMV8x_${n}.webp${hdr}">`;
    }).join('\n');
    const out = resolveApiImageContent(html, 'https://v1.gyks.cf');
    expect(scanImgTags(out)).toHaveLength(13);
    expect(out).toContain('data-legado-headers=');
    expect(out).toContain('_13.webp');
  });

  it('isApiErrorText 识别 Go panic 文案', () => {
    expect(
      isApiErrorText(
        '正文处理异常："invalid memory address or nil pointer dereference"',
      ),
    ).toBe(true);
  });
});
