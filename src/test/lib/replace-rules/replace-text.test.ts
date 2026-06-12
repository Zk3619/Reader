import { describe, expect, it, vi } from 'vitest';
import {
  applyReplaceRuleToText,
  applyReplaceRulesToText,
  isReplaceRuleValid,
  quoteReplacementJs,
  trimContentLinesForReplace,
} from '@/lib/replace-rules/replace-text';
import type { ReplaceRule } from '@/types';

vi.mock('@/lib/js-engine/quickjs-sandbox', () => ({
  evalJs: vi.fn(async (_code: string, ctx: { result?: unknown }) => {
    const matched = String(ctx.result ?? '');
    return matched.toUpperCase();
  }),
}));

vi.mock('@/lib/database/replace-rules', () => ({
  updateReplaceRule: vi.fn(async () => undefined),
}));

function rule(partial: Partial<ReplaceRule> & Pick<ReplaceRule, 'pattern'>): ReplaceRule {
  return {
    id: 1,
    name: 'test',
    replacement: '',
    scopeTitle: false,
    scopeContent: true,
    isEnabled: true,
    isRegex: true,
    timeoutMillisecond: 3000,
    order: 0,
    ...partial,
  };
}

describe('replace-text', () => {
  it('validates regex patterns', () => {
    expect(isReplaceRuleValid({ pattern: 'abc', isRegex: true })).toBe(true);
    expect(isReplaceRuleValid({ pattern: '(', isRegex: true })).toBe(false);
    expect(isReplaceRuleValid({ pattern: 'a|', isRegex: true })).toBe(false);
    expect(isReplaceRuleValid({ pattern: 'a\\|', isRegex: true })).toBe(true);
  });

  it('quotes backslashes for js replacement', () => {
    expect(quoteReplacementJs('a\\b')).toBe('a\\\\b');
    expect(quoteReplacementJs('plain')).toBe('plain');
  });

  it('trims each line before replace', () => {
    expect(trimContentLinesForReplace('  a  \n  b  ')).toBe('a\nb');
  });

  it('applies plain text replacement globally', async () => {
    const out = await applyReplaceRuleToText('foo bar foo', rule({
      isRegex: false,
      pattern: 'foo',
      replacement: 'baz',
    }));
    expect(out).toBe('baz bar baz');
  });

  it('applies regex replacement with capture groups', async () => {
    const out = await applyReplaceRuleToText('第1章 标题', rule({
      pattern: '^第(\\d+)章\\s*',
      replacement: '',
    }));
    expect(out).toBe('标题');
  });

  it('keeps title when replace result is blank', async () => {
    const out = await applyReplaceRuleToText('原标题', rule({
      pattern: '.*',
      replacement: '',
    }), { keepOnBlank: true });
    expect(out).toBe('原标题');
  });

  it('supports @js: replacement', async () => {
    const out = await applyReplaceRuleToText('hello', rule({
      pattern: 'hello',
      replacement: '@js:result',
    }));
    expect(out).toBe('HELLO');
  });

  it('tracks effective rules only when content changes', async () => {
    const { text, effectiveRules } = await applyReplaceRulesToText('abc', [
      rule({ name: 'noop', pattern: 'zzz', replacement: 'x' }),
      rule({ name: 'hit', pattern: 'a', replacement: 'A' }),
    ]);
    expect(text).toBe('Abc');
    expect(effectiveRules.map((r) => r.name)).toEqual(['hit']);
  });
});
