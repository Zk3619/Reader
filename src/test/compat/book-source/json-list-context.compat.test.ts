import { describe, expect, it } from 'vitest';
import { enrichJsonListItemContext } from '@/lib/book-source/json-list-context';
import { normalizeJsRuleResult } from '@/lib/js-engine/quickjs-sandbox';

describe('json list context', () => {
  it('parses JSON string into result object for @js rules', () => {
    const row = JSON.stringify({
      book_id: '12345',
      source: '番茄',
      tab: '小说',
      toc_url: 'https://example.com/toc',
    });
    const ctx = enrichJsonListItemContext(row, 'json', 'https://api.test/', {});
    expect(ctx.result).toEqual(JSON.parse(row));
    expect((ctx.result as Record<string, unknown>).book_id).toBe('12345');
  });

  it('normalizeJsRuleResult unwraps JSON strings (all list-item @js segments)', () => {
    const row = '{"book_id":"99","source":"七猫"}';
    expect(normalizeJsRuleResult(row)).toEqual({ book_id: '99', source: '七猫' });
    expect(normalizeJsRuleResult({ book_id: '1' })).toEqual({ book_id: '1' });
  });
});
