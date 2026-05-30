import { describe, expect, it } from 'vitest';
import { extractContentFromRuleOutput } from '@/lib/book-source/extract-rule-content';

describe('extractContentFromRuleOutput', () => {
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
});
