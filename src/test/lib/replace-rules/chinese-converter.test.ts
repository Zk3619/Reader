import { describe, expect, it } from 'vitest';
import { convertChineseText, preloadChineseConverter } from '@/lib/replace-rules/chinese-converter';

describe('chinese-converter', () => {
  it('converts traditional to simplified', async () => {
    await preloadChineseConverter(1);
    const out = await convertChineseText('臺灣', 1);
    expect(out).toContain('台湾');
  });

  it('converts simplified to traditional', async () => {
    await preloadChineseConverter(2);
    const out = await convertChineseText('台湾', 2);
    expect(out).toContain('臺');
  });

  it('returns original when type is 0', async () => {
    const out = await convertChineseText('测试', 0);
    expect(out).toBe('测试');
  });
});
