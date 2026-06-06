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

  it('ajax 首轮空响应时 content 赋值为空串而非 undefined', () => {
    const patched = patchLegadoRuleScript('content = data.content');
    expect(patched).toContain("data.content != null ? String(data.content) : ''");
  });

  it('hex 载荷为空时 res = JSON.parse(result) 不抛错', () => {
    const patched = patchLegadoRuleScript('} else {\n    res = JSON.parse(result);\n}');
    expect(patched).toContain('return {}');
    expect(patched).not.toMatch(/\bres\s*=\s*JSON\.parse\s*\(\s*result\s*\)/);
  });

  it('光遇 chapterList 末尾返回 processCatalogList 结果', () => {
    const tail = `if (showSource == "true") {
    processCatalogList(data);
} else {
    data;
}`;
    const patched = patchLegadoRuleScript(tail);
    expect(patched).toContain(
      'return showSource == "true" ? processCatalogList(data) : data;',
    );
  });
});
