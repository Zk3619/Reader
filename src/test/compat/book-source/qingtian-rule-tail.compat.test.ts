import { describe, expect, it } from 'vitest';
import { readProjectFile } from '@/test/helpers/fixtures';
import { patchLegadoRuleScript } from '@/lib/js-engine/legado/rule-script-patches';
import { wrapLegadoJsBodyWithImplicitReturn } from '@/lib/js-engine/quickjs-sandbox';

describe('debug qingtian rule tail', () => {
  it('implicit return targets data', () => {
    const s = JSON.parse(readProjectFile('examples/shareBookSource(1).json')) as {
      ruleContent: { content: string };
    }[];
    const raw = s[0]!.ruleContent.content
      .replace(/^<js>/i, '')
      .replace(/<\/js>[\s\S]*$/i, '')
      .trim();
    const wrapped = wrapLegadoJsBodyWithImplicitReturn(patchLegadoRuleScript(raw));
    expect(wrapped.trimEnd()).toMatch(/return\s*\(\s*data\s*\)\s*;?\s*$/);
  });
});
