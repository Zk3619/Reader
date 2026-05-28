import { describe, expect, it } from 'vitest';
import { parseJsonPath } from '@/lib/rule-engine/jsonpath-parser';

describe('jsonpath parser legado compatibility', () => {
  it('zip merges %% segments on one document', () => {
    const json = JSON.stringify({
      left: [{ n: 'L1' }, { n: 'L2' }],
      right: [{ n: 'R1' }],
    });
    expect(parseJsonPath('$.left[*].n%%$.right[*].n', json)).toEqual(['L1', 'R1', 'L2']);
  });

  it('expands {$...} inner path before query', () => {
    const json = JSON.stringify({ data: { title: '嵌套标题' } });
    const out = parseJsonPath('前缀{$.data.title}后缀', json);
    expect(out[0]).toBe('前缀嵌套标题后缀');
  });
});
