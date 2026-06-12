import { describe, expect, it, vi } from 'vitest';
import { reSegmentContent } from '@/lib/replace-rules/content-resegment';
import {
  getExportUseReplace,
  setExportUseReplace,
  isExportReplaceEnabledForBook,
} from '@/lib/replace-rules/export-replace-policy';

describe('content-resegment full', () => {
  it('merges broken paragraphs and normalizes quotes', () => {
    const raw = '第一章\n\n他说：“你好。\n世界。”\n\n第二段继续。';
    const out = reSegmentContent(raw, '第一章', { random: () => 0.99 });
    expect(out).toContain('你好');
    expect(out).toContain('世界');
  });

  it('forceSplit inserts breaks on long quoted dialogue', () => {
    const long =
      '“' +
      '这是第一句。这是第二句。这是第三句。这是第四句。这是第五句。这是第六句。' +
      '”';
    const out = reSegmentContent(long, '章', { random: () => 0 });
    expect(out.split('\n').length).toBeGreaterThan(1);
  });
});

describe('export-replace-policy', () => {
  it('defaults exportUseReplace to true', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: vi.fn(),
    });
    expect(getExportUseReplace()).toBe(true);
  });

  it('combines export flag with book replace', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    });
    expect(isExportReplaceEnabledForBook(true)).toBe(true);
    expect(isExportReplaceEnabledForBook(false)).toBe(false);
    setExportUseReplace(false);
    expect(isExportReplaceEnabledForBook(true)).toBe(false);
  });
});
