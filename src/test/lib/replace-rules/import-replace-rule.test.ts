import { describe, expect, it } from 'vitest';
import { parseReplaceRuleJson, parseSingleReplaceRulePayload } from '@/lib/book-source/import-replace-rule';

describe('import-replace-rule', () => {
  it('parses modern legado replace rule json', () => {
    const rules = parseReplaceRuleJson(
      JSON.stringify([
        {
          name: '去广告',
          pattern: '广告',
          replacement: '',
          scopeContent: true,
          isRegex: false,
        },
      ]),
    );
    expect(rules).toHaveLength(1);
    expect(rules[0]?.name).toBe('去广告');
    expect(rules[0]?.pattern).toBe('广告');
  });

  it('parses legacy replace rule fields', () => {
    const rules = parseReplaceRuleJson(
      JSON.stringify([
        {
          regex: '^第\\d+章',
          replaceSummary: '去章号',
          replacement: '',
          useTo: '某书名',
          enable: true,
          serialNumber: 2,
          isRegex: true,
        },
      ]),
    );
    expect(rules).toHaveLength(1);
    expect(rules[0]?.name).toBe('去章号');
    expect(rules[0]?.pattern).toBe('^第\\d+章');
    expect(rules[0]?.scope).toBe('某书名');
    expect(rules[0]?.order).toBe(2);
  });

  it('parseSingleReplaceRulePayload reads legacy id and regex', () => {
    const rule = parseSingleReplaceRulePayload(
      JSON.stringify({ id: 5, regex: 'a', replacement: 'b', replaceSummary: 't' }),
    );
    expect(rule?.id).toBe(5);
    expect(rule?.pattern).toBe('a');
    expect(rule?.name).toBe('t');
  });
});
