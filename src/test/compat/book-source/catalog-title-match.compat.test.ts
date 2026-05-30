import { describe, expect, it } from 'vitest';
import { catalogChapterTitleMatches } from '@/lib/book-source/chapters';

describe('catalogChapterTitleMatches', () => {
  it('匹配来源前缀与纯目录标题', () => {
    expect(
      catalogChapterTitleMatches('番茄:第11章 【审判】', '第11章 【审判】'),
    ).toBe(true);
  });

  it('相同完整标题仍匹配', () => {
    expect(catalogChapterTitleMatches('第9章 爸，我饿', '第9章 爸，我饿')).toBe(
      true,
    );
  });
});
