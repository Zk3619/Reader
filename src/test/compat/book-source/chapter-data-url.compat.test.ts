import { describe, expect, it } from 'vitest';
import {
  decodeDataUrl,
  isLegadoTypedDataUrl,
  legadoDataUrlRuleBody,
  normalizeChapterDataUrl,
  splitLegadoUrlOptions,
} from '@/lib/book-source/utils';

describe('Legado data URL 解析', () => {
  it('normalizeChapterDataUrl 不包装 HTTP 相对路径', () => {
    const path = '/index.php/qqmhchapter/2059882.html';
    expect(normalizeChapterDataUrl(path)).toBe(path);
  });

  it('splitLegadoUrlOptions 分离 type 选项', () => {
    const payload = JSON.stringify({ item_id: '1', sources: '测试', tab: '漫画' });
    const b64 =
      typeof btoa !== 'undefined'
        ? btoa(unescape(encodeURIComponent(payload)))
        : Buffer.from(payload, 'utf-8').toString('base64');
    const url = `data:;base64,${b64},{"type":"qingtian3"}`;
    const { urlNoOption, options } = splitLegadoUrlOptions(url);
    expect(urlNoOption).toBe(`data:;base64,${b64}`);
    expect(options?.type).toBe('qingtian3');
  });

  it('legadoDataUrlRuleBody 输出 hex 载荷', () => {
    const payload = JSON.stringify({
      item_id: 'abc',
      sources: '全面漫画',
      tab: '漫画',
    });
    const b64 =
      typeof btoa !== 'undefined'
        ? btoa(unescape(encodeURIComponent(payload)))
        : Buffer.from(payload, 'utf-8').toString('base64');
    const url = `data:;base64,${b64},{"type":"qingtian3"}`;
    const hex = legadoDataUrlRuleBody(url);
    expect(hex).toBeTruthy();
    expect(hex).toMatch(/^[0-9a-f]+$/i);
    expect(isLegadoTypedDataUrl(url)).toBe(true);
    expect(decodeDataUrl(url)?.item_id).toBe('abc');
  });

  it('无 type 选项的 data URL 不走 typed 分支', () => {
    expect(isLegadoTypedDataUrl('data:;base64,YQ==')).toBe(false);
    expect(legadoDataUrlRuleBody('data:;base64,YQ==')).toBeNull();
  });
});
