import { describe, expect, it } from 'vitest';
import { parseXPath } from '@/lib/rule-engine/xpath-parser';

/** 与 bachashuku.org/book/6963.html 中 p.gray.fss 结构一致（iconfont 切段） */
const GRAY_FSS_REAL = `
<p class="gray fss">
<span class="fr fss"><a href="#">编辑</a></span><a href="#">8083979（我不是大神）</a> 著<br />
<span class="iconfont">&#xee21;</span>25851 | <span class="iconfont">&#xee5d;</span>28 | <span class="iconfont">&#xee81;</span>299 | 1425230字<br />
<b class="fl">标签：</b><a href="#">#NTR</a>
</p>`;

describe('gray fss text()[6] word count', () => {
  it('text()[6] 命中字数段（含 | 与 字）', () => {
    const hit = parseXPath('//p[@class="gray fss"]/text()[6]', GRAY_FSS_REAL);
    expect(hit[0]).toBe('299 | 1425230字');
  });

  it('wordCount @js 解析为万字', async () => {
    const a = parseXPath('//p[@class="gray fss"]/text()[6]', GRAY_FSS_REAL)[0] ?? '';
    const b = String(a).replace(/.*\|/, '').replace(/字/, '');
    const number = parseInt(b, 10);
    expect(number).toBe(1425230);
    const c = number >= 10000 ? (number / 10000).toFixed(2) + '万字' : number + '字';
    expect(c).toBe('142.52万字');
  });
});
