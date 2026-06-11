import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scriptReferencesJsLibFunctions } from '@/lib/js-engine/legado/js-lib-script-guard';

const here = dirname(fileURLToPath(import.meta.url));
const eliteBabes = JSON.parse(
  readFileSync(join(here, '../../../../examples/EliteBabes.json'), 'utf8'),
) as Array<Record<string, unknown>>;
const source = eliteBabes[0]!;

describe('jsLib script guard', () => {
  it('ruleArticles @js 不依赖 jsLib', () => {
    const ruleArticles = String(source.ruleArticles);
    const js = ruleArticles.split('<js>')[1]?.split('</js>')[0] ?? '';
    expect(scriptReferencesJsLibFunctions(js)).toBe(false);
  });

  it('ruleContent @js 依赖 danyeHtml', () => {
    const ruleContent = String(source.ruleContent);
    const js = ruleContent.split('<js>')[1]?.split('</js>')[0] ?? '';
    expect(scriptReferencesJsLibFunctions(js)).toBe(true);
  });
});
