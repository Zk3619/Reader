import { describe, expect, it } from 'vitest';
import { analyzeRule } from '@/lib/rule-engine/analyze-rule';
import type { RuleContext } from '@/lib/rule-engine';

describe('analyzeRule empty content', () => {
  it('纯 <js> 规则在 content 为空时仍会执行', async () => {
    const rule = '<js>result = "hello-from-js";</js>';
    const context: RuleContext = {
      content: '',
      contentType: 'text',
      baseUrl: 'https://v1.gyks.cf/',
      result: '',
    };
    const results = await analyzeRule(rule, context);
    expect(results.join('')).toContain('hello-from-js');
  });

  it('非脚本规则在 content 为空时仍返回空', async () => {
    const results = await analyzeRule('$.content', {
      content: '',
      contentType: 'json',
      baseUrl: '',
      result: '',
    });
    expect(results).toEqual([]);
  });
});
