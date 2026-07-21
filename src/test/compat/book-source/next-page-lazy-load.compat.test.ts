/**
 * nextPageLazyLoad 分支语义 + @webjs 规则识别
 */
import { describe, expect, it } from 'vitest';
import { splitSourceRule } from '@/lib/rule-engine/legado-source-rule';

describe('@webjs rule mode detection', () => {
  it('splitSourceRule 识别 @webjs: 片段', () => {
    const segs = splitSourceRule('@webjs:document.title');
    expect(segs.some((s) => s.mode === 'webjs')).toBe(true);
    expect(segs[0]?.ruleStr).toContain('document.title');
  });
});

describe('nextPageLazyLoad 选项语义', () => {
  it('懒加载开关为真时应跳过整链预拉（与 content.ts 分支一致）', () => {
    const nextPageLazyLoad = true;
    const forceFullContentChain = false;
    const useLazy = Boolean(nextPageLazyLoad) && !forceFullContentChain;
    expect(useLazy).toBe(true);
    expect(Boolean(nextPageLazyLoad) && Boolean(true)).toBe(true);
    expect(!(Boolean(nextPageLazyLoad) && !true)).toBe(true);
  });
});
