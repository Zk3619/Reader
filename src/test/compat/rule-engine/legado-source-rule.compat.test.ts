import { describe, expect, it } from 'vitest';
import { splitSourceRule } from '@/lib/rule-engine/legado-source-rule';

describe('splitSourceRule inline <js>result</js>', () => {
  it('does not split replacement placeholder as independent js segment', () => {
    const rule =
      "{{//p[@class='gray']/text()[1]##\\s##,}}\n##.*\\|<js>result</js>##\\#";
    const segments = splitSourceRule(rule);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.mode).toBe('default');
    expect(segments[0]?.ruleStr).toContain('<js>result</js>');
    expect(segments[0]?.ruleStr).not.toMatch(/^result$/m);
  });
});
