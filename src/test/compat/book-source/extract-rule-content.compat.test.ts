import { describe, expect, it } from 'vitest';
import { extractContentFromRuleOutput } from '@/lib/book-source/extract-rule-content';

describe('extractContentFromRuleOutput', () => {
  it('hex 编码 HTML 规则输出解码后返回', () => {
    const html = '<img src="https://cdn.example/a.jpg"><img src="https://cdn.example/b.jpg">';
    const hex = Array.from(new TextEncoder().encode(html))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    expect(extractContentFromRuleOutput(hex)).toContain('a.jpg');
    expect((extractContentFromRuleOutput(hex).match(/<img\b/gi) ?? []).length).toBe(2);
  });

  it('HTML 规则输出直接返回，不再二次解析', () => {
    const html = '<img src="https://cdn.example/a.jpg"><img src="https://cdn.example/b.jpg">';
    expect(extractContentFromRuleOutput(html)).toBe(html);
  });

  it('提取顶层 content', () => {
    expect(extractContentFromRuleOutput(JSON.stringify({ content: '<img src="a">' }))).toContain(
      '<img',
    );
  });

  it('提取 data.content', () => {
    expect(
      extractContentFromRuleOutput(
        JSON.stringify({ code: 0, data: { content: 'hello' } }),
      ),
    ).toBe('hello');
  });

  it('无 content 时回退 msg', () => {
    expect(
      extractContentFromRuleOutput(JSON.stringify({ msg: '书源版本过低' })),
    ).toBe('书源版本过低');
  });

  it('startBrowserAwait 占位文案保留为可读段落', () => {
    const out = extractContentFromRuleOutput('请刷新尝试播放');
    expect(out).toContain('请刷新尝试播放');
    expect(out).toMatch(/^<p>/);
  });

  it('光遇短剧内嵌页占位正文识别', async () => {
    const { isLegadoBrowserPlaceholderContent } = await import(
      '@/lib/book-source/extract-rule-content'
    );
    expect(
      isLegadoBrowserPlaceholderContent(
        '【右上角刷新】开启播放(下一集请切换下一章刷新)\n播放直链：',
      ),
    ).toBe(true);
  });
});
