import { describe, expect, it } from 'vitest';
import { enrichJsonListItemContext } from '@/lib/book-source/json-list-context';
import { jsonToHex } from '@/lib/book-source/utils';
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
    expect(ctx.result).toMatchObject(JSON.parse(row));
    expect((ctx.result as Record<string, unknown>).book_id).toBe('12345');
    expect((ctx.result as Record<string, unknown>).sources).toBe('番茄');
  });

  it('hex list item exposes JSON content for JSONPath templates', () => {
    const row = {
      item_id: 'ch-1',
      title: '第1话',
      sources: '全面漫画',
      tab: '漫画',
    };
    const hex = jsonToHex(JSON.stringify(row));
    const ctx = enrichJsonListItemContext(hex, 'text', 'https://api.test/', {});
    expect(ctx.contentType).toBe('json');
    expect(JSON.parse(ctx.content)).toMatchObject(row);
    expect((ctx.result as Record<string, unknown>).item_id).toBe('ch-1');
  });

  it('normalizeJsRuleResult unwraps JSON strings (all list-item @js segments)', () => {
    const row = '{"book_id":"99","source":"七猫"}';
    expect(normalizeJsRuleResult(row)).toEqual({ book_id: '99', source: '七猫' });
    expect(normalizeJsRuleResult({ book_id: '1' })).toEqual({ book_id: '1' });
  });
});
