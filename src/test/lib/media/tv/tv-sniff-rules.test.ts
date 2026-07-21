/**
 * sniff-rules 单元测试
 */
import { describe, expect, it } from 'vitest';
import { extractMediaUrlsByRule } from '@/lib/media/tv/net/sniff-rules';

describe('extractMediaUrlsByRule', () => {
  it('uses default media regex when no rule', () => {
    const text = 'x https://cdn.example.com/a.m3u8?token=1 y';
    const hits = extractMediaUrlsByRule(text, null);
    expect(hits.some((u) => u.includes('.m3u8'))).toBe(true);
  });

  it('applies exclude', () => {
    const text = 'https://cdn.example.com/ad.m3u8 https://cdn.example.com/ok.mp4';
    const hits = extractMediaUrlsByRule(text, {
      exclude: ['ad\\.m3u8'],
    });
    expect(hits.every((u) => !u.includes('ad.m3u8'))).toBe(true);
    expect(hits.some((u) => u.includes('ok.mp4'))).toBe(true);
  });
});
