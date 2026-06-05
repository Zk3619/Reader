import { describe, expect, it } from 'vitest';
import {
  extractLeadingLegadoJsonBody,
  parseLegadoApiJsonResponse,
} from '@/lib/js-engine/legado/normalize-legado-ajax-body';

describe('legado ajax json body normalization', () => {
  it('extractLeadingLegadoJsonBody 裁剪 JSON 尾部垃圾字节', () => {
    const json = '{"code":0,"data":[{"title":"a"}]}';
    const polluted = `${json}${'X'.repeat(163)}`;
    expect(polluted.length).toBe(json.length + 163);
    expect(() => JSON.parse(polluted)).toThrow();
    const cleaned = extractLeadingLegadoJsonBody(polluted);
    expect(JSON.parse(cleaned).data).toHaveLength(1);
  });

  it('parseLegadoApiJsonResponse 在尾部垃圾时仍能解析 data', () => {
    const json = '{"code":0,"data":[{"title":"a"},{"title":"b"}]}';
    const parsed = parseLegadoApiJsonResponse(`${json}TRAILING_JUNK`);
    expect(Array.isArray(parsed?.data)).toBe(true);
    expect((parsed?.data as unknown[]).length).toBe(2);
  });
});
