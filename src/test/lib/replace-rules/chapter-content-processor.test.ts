import { describe, expect, it } from 'vitest';
import { processChapterContentForDisplay } from '@/lib/replace-rules/chapter-content-processor';
import { removeDuplicateChapterTitle } from '@/lib/replace-rules/remove-duplicate-chapter-title';
import { shieldUseHtmlBlocks, restoreUseHtmlBlocks } from '@/lib/replace-rules/adapt-special-style';
import { reSegmentContent } from '@/lib/replace-rules/content-resegment';
import type { Book, BookChapter } from '@/types';

const book = {
  name: '测试书',
  origin: 'https://example.com',
  readConfig: { useReplaceRule: true },
} as Book;

const chapter = {
  title: '第一章 开端',
} as BookChapter;

describe('remove-duplicate-chapter-title', () => {
  it('removes duplicated chapter title prefix', async () => {
    const raw = '第一章 开端\n\n正文开始';
    const result = await removeDuplicateChapterTitle(raw, book, chapter);
    expect(result.removed).toBe(true);
    expect(result.content).toContain('正文开始');
    expect(result.content).not.toContain('第一章');
  });
});

describe('adapt-special-style', () => {
  it('shields and restores usehtml blocks', () => {
    const raw = '前<usehtml><b>x</b></usehtml>后';
    const { text, placeholders } = shieldUseHtmlBlocks(raw);
    expect(text).not.toContain('<usehtml>');
    const restored = restoreUseHtmlBlocks(text, placeholders);
    expect(restored).toContain('<usehtml><b>x</b></usehtml>');
    expect(restored).toMatch(/^前[\s\S]*后$/);
  });
});

describe('content-resegment', () => {
  it('merges lines after sentence end markers', () => {
    const raw = '他说。\n“你好。”\n继续';
    const out = reSegmentContent(raw, '第一章', { random: () => 0.99 });
    expect(out).toContain('他说。');
    expect(out).toContain('“你好。”');
  });
});

describe('processChapterContentForDisplay options', () => {
  it('skips duplicate title removal when disabled', async () => {
    const raw = '第一章 开端\n\n正文';
    const result = await processChapterContentForDisplay(raw, book, null, chapter, {
      removeDuplicateTitle: false,
      useReplace: false,
    });
    expect(result.sameTitleRemoved).toBe(false);
    expect(result.content).toContain('第一章');
  });
});