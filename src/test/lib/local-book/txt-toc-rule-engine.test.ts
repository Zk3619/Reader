import { describe, expect, it } from 'vitest';
import {
  encodeTocRuleStorage,
  evalTxtTocReplacement,
  isStoredTxtTocRule,
  parseTocRuleStorage,
  selectBestTxtTocRule,
} from '@/lib/local-book/txt-toc-rule-engine';
import type { TxtTocRule } from '@/types';

describe('txt-toc-rule-engine', () => {
  it('encodes and parses Legado tocUrl storage', () => {
    const raw = encodeTocRuleStorage('^第\\d+章', 'result.trim()');
    expect(isStoredTxtTocRule(raw)).toBe(true);
    expect(parseTocRuleStorage(raw)).toEqual({
      rule: '^第\\d+章',
      replacement: 'result.trim()',
    });
  });

  it('evalTxtTocReplacement supports java.putVolume', () => {
    const out = evalTxtTocReplacement(
      '第一章 开端',
      'java.putVolume("第一卷"); result',
      { index: 1, prevTitle: null, prevLength: -1, lastVolumeTitle: '', volumeTitles: [] },
    );
    expect(out.title).toBe('第一章 开端');
    expect(out.volumeTitles).toEqual(['第一卷']);
    expect(out.lastVolumeTitle).toBe('第一卷');
  });

  it('selectBestTxtTocRule picks standard chapter rule', async () => {
    const sample = [
      '书名',
      '作者：测试',
      '',
      '第一章 开始',
      '正文内容'.repeat(200),
      '第二章 继续',
      '更多正文'.repeat(200),
      '第三章 收尾',
    ].join('\n');

    const rules: TxtTocRule[] = [
      {
        id: -2,
        name: '目录',
        rule: '^[ 　\\t]{0,4}(?:序章|楔子|正文(?!完|结)|终章|后记|尾声|番外|第\\s{0,4}[\\d〇零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+?\\s{0,4}(?:章|节(?!课)|卷|集(?![合和])|部(?![分赛游])|篇(?!张))).{0,30}$',
        replacement: '',
        serialNumber: 1,
        enable: true,
      },
      {
        id: -8,
        name: '数字 分隔符 标题名称',
        rule: '^[ 　\\t]{0,4}\\d{1,5}[:：,.， 、_—\\-].{1,30}$',
        replacement: '',
        serialNumber: 7,
        enable: true,
      },
    ];

    const best = await selectBestTxtTocRule(sample, rules);
    expect(best?.name).toBe('目录');
  });
});
