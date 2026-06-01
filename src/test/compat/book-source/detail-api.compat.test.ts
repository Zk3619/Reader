import { describe, expect, it } from 'vitest';
import { buildCatalogApiVariable } from '@/lib/book-source/chapters';

/** 与 detail.ts buildDetailApiUrl 保持同一拼接规则 */
function buildDetailApiUrl(
  serverUrl: string,
  bookId: string,
  sources: string,
  tab: string,
  bookVariable?: string,
): string {
  const base = serverUrl.replace(/\/+$/, '');
  const variable = encodeURIComponent(buildCatalogApiVariable(bookVariable));
  return (
    `${base}/detail?book_id=${encodeURIComponent(bookId)}` +
    `&source=${encodeURIComponent(sources)}` +
    `&tab=${encodeURIComponent(tab)}` +
    `&variable=${variable}`
  );
}

describe('gyks detail API url', () => {
  it('包含 variable 查询参数（对齐 ruleBookInfo.init）', () => {
    const url = buildDetailApiUrl(
      'https://v1.gyks.cf',
      'book123',
      '番茄',
      '短剧',
      '{"custom":"x"}',
    );
    expect(url).toContain('variable=');
    expect(decodeURIComponent(url)).toContain('{"custom":"x"}');
    expect(url).toContain('book_id=book123');
    expect(url).toContain('source=%E7%95%AA%E8%8C%84');
    expect(url).toContain('tab=%E7%9F%AD%E5%89%A7');
  });
});
