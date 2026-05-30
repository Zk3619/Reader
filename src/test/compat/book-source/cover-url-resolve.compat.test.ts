import { describe, expect, it } from 'vitest';
import { normalizeSearchDisplayFields } from '@/lib/book-source/search';
import {
  isLikelyUnresolvedRuleResult,
  resolveMediaUrl,
} from '@/lib/book-source/utils';
import { parseCss } from '@/lib/rule-engine/css-parser';
import { analyzeString, type RuleContext } from '@/lib/rule-engine';
import { isRuleExpression } from '@/lib/rule-engine/rule-expression';

describe('封面 URL 解析（Legado 对齐）', () => {
  it('isRuleExpression 识别未展开的 CSS @ 链', () => {
    expect(isRuleExpression('.cover_m@img@src')).toBe(true);
    expect(isRuleExpression('https://cdn.example/cover.jpg')).toBe(false);
  });

  it('resolveMediaUrl 拒绝规则字面量，避免拼成 gyks/.cover_m@img@src', () => {
    expect(
      resolveMediaUrl('https://v1.gyks.cf/', '.cover_m@img@src'),
    ).toBeUndefined();
    expect(isLikelyUnresolvedRuleResult('.cover_m@img@src')).toBe(true);
  });

  it('resolveMediaUrl 正常解析相对封面路径', () => {
    expect(resolveMediaUrl('https://bachashuku.org/search', '/cover/123.jpg')).toBe(
      'https://bachashuku.org/cover/123.jpg',
    );
    expect(
      resolveMediaUrl(
        'https://v1.gyks.cf/',
        'https://reader-img.example/thumb/abc.jpg',
      ),
    ).toBe('https://reader-img.example/thumb/abc.jpg');
  });

  it('JSON 列表项上误走 CSS 规则时不泄漏规则字面量', () => {
    const item = JSON.stringify({
      book_name: '测试书',
      thumb_url: 'https://reader-img.example/thumb/abc.jpg',
    });
    const out = parseCss('.cover_m@img@src', item);
    expect(out).toEqual([]);
  });

  it('晴天聚合 JSON 列表项应解析 thumb_url', async () => {
    const item = JSON.stringify({
      book_name: '测试书',
      author: '作者',
      thumb_url: 'https://reader-img.example/thumb/abc.jpg',
    });
    const context: RuleContext = {
      content: item,
      contentType: 'html',
      baseUrl: 'https://v1.gyks.cf/',
      source: {},
      result: item,
    };
    const normalized = await normalizeSearchDisplayFields(context, {
      author: '作者',
      coverUrl: '',
    });
    expect(normalized.coverUrl).toBe('https://reader-img.example/thumb/abc.jpg');
  });

  it('analyzeString($.thumb_url) 在 JSON 列表项上返回封面', async () => {
    const item = JSON.stringify({
      thumb_url: 'https://reader-img.example/thumb/xyz.jpg',
    });
    const context: RuleContext = {
      content: item,
      contentType: 'json',
      baseUrl: 'https://v1.gyks.cf/',
      source: {},
      result: JSON.parse(item),
      book: JSON.parse(item),
    };
    const cover = await analyzeString('$.thumb_url', context, { isUrl: true });
    expect(cover).toBe('https://reader-img.example/thumb/xyz.jpg');
    expect(resolveMediaUrl('https://v1.gyks.cf/', cover)).toBe(
      'https://reader-img.example/thumb/xyz.jpg',
    );
  });
});
