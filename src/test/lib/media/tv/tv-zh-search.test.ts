/**
 * Parse type4 / 繁简搜索 轻量单测
 */
import { describe, expect, it } from 'vitest';
import { convertChineseText, preloadChineseConverter } from '@/lib/replace-rules/chinese-converter';

describe('tv chinese search normalize', () => {
  it('t2s converts traditional to simplified', async () => {
    await preloadChineseConverter(1);
    const out = await convertChineseText('繁體測試', 1);
    expect(out.length).toBeGreaterThan(0);
    expect(out).toBe(await convertChineseText(out, 1)); // 已是简体则稳定
    expect(out).not.toBe('繁體測試');
  });
});
