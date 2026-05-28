import { describe, expect, it } from 'vitest';
import { getRegexElements, parseRegex } from '@/lib/rule-engine/regex-parser';

const text = '<item id="1">A</item><item id="2">B</item>';

describe('regex parser legado compatibility', () => {
  it('chains && stages for list extraction', () => {
    expect(parseRegex('(<item[^>]*>.*?</item>)&&>([^<]+)<', text)).toEqual(['A', 'B']);
  });

  it('uses || fallback at top level', () => {
    expect(parseRegex('missing-(\\d+)-||<item id="(\\d+)">([^<]+)</item>', text)).toEqual(['1', '2']);
  });

  it('returns capture groups for :regex list', () => {
    const groups = getRegexElements('<item id="(\\d+)">([^<]+)</item>', text);
    expect(groups).toHaveLength(2);
    expect(groups[1][1]).toBe('2');
    expect(groups[1][2]).toBe('B');
  });
});
