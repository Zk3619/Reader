import { describe, expect, it } from 'vitest';
import { fetchByAnalyzeUrl } from '@/lib/book-source/analyze-url';

describe('AnalyzeUrl data: URL', () => {
  it('带 type 选项时返回 hex 载荷（AI风月 sortUrl）', async () => {
    const { body, usedWebView } = await fetchByAnalyzeUrl({
      ruleUrl: 'data:;base64,MA==,{"type":0}',
    });
    expect(usedWebView).toBe(false);
    expect(body).toBe('30');
  });

  it('MQ== 解码为索引 1', async () => {
    const { body } = await fetchByAnalyzeUrl({
      ruleUrl: 'data:;base64,MQ==,{"type":0}',
    });
    expect(body).toBe('31');
  });
});
