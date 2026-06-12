import { describe, expect, it, beforeAll } from 'vitest';
import { analyzeString } from '@/lib/rule-engine';
import {
  evalSearchUrlExpression,
  isLegadoStatementSearchExpression,
} from '@/lib/book-source/search-script-runner';
import {
  clearSourceVerificationResultCache,
  registerSourceVerificationHandler,
  SourceVerificationCancelledError,
} from '@/lib/book-source/source-verification';
import { getSourceArgsKey } from '@/lib/js-engine/legado/source-script-shared';
import {
  invalidateLegadoRuleUrlExpandCache,
  resolveLegadoRuleUrl,
} from '@/lib/book-source/analyze-search-url';
import { rssAsBookSource } from '@/lib/rss-source/rss-as-book-source';
import { initQuickJSRuntime, isQuickJSFallback } from '@/lib/js-engine/core/runtime';
import huabanSource from '../../../../examples/花瓣.json';

beforeAll(async () => {
  await initQuickJSRuntime();
});

const source = (huabanSource as unknown[])[0] as import('@/types').RssSource;

describe('花瓣 RSS 源', () => {
  it('ruleImage 展开 {$...} 内嵌 JSONPath', async () => {
    const pin = JSON.stringify({
      file: { key: 'abc123def' },
      board: { title: 'UI' },
      raw_text: '测试',
    });
    const image = await analyzeString('https://hbimg.huabanimg.com//{$.file.key}', {
      content: pin,
      contentType: 'json',
      baseUrl: 'https://api.huaban.com',
    });
    expect(image).toBe('https://hbimg.huabanimg.com//abc123def');
  });

  it('搜索 sortUrl 模板为语句型表达式', () => {
    const sortUrl = source.sortUrl ?? '';
    expect(sortUrl).toContain('getVerificationCode');
    const match = sortUrl.match(/\{\{([\s\S]*?)\}\}/);
    expect(match?.[1]).toBeTruthy();
    expect(isLegadoStatementSearchExpression(match![1]!)).toBe(true);
  });

  it('同一次列表请求内 resolveLegadoRuleUrl 只触发一次验证弹窗', async () => {
    if (isQuickJSFallback()) return;
    let promptCount = 0;
    registerSourceVerificationHandler(async () => {
      promptCount += 1;
      return '图标设计';
    });
    try {
      const book = rssAsBookSource(source);
      const sortUrl =
        'https://api.huaban.com/search/file?sort=created_at&limit=62&text={{svg=String(java.base64Encode(`<svg xmlns="http://www.w3.org/2000/svg"/>`));if(page==1){let a="";try{a=java.getVerificationCode("data:image/svg+xml;base64,"+svg);}catch(e){};if(a==""){a=source.getVariable()}source.setVariable(a);a}else{source.getVariable()};}}&page={{page}}&position=search_pin';
      invalidateLegadoRuleUrlExpandCache(book);
      clearSourceVerificationResultCache();
      await resolveLegadoRuleUrl(sortUrl, book, { page: 1, preserveUrlOptions: true });
      await resolveLegadoRuleUrl(sortUrl, book, { page: 1, forRuleBase: true });
      expect(promptCount).toBe(1);
    } finally {
      registerSourceVerificationHandler(null);
      clearSourceVerificationResultCache();
    }
  });

  it('取消搜索输入时清除源变量并中止展开', async () => {
    if (isQuickJSFallback()) return;
    const book = rssAsBookSource(source);
    const argsKey = getSourceArgsKey(book);
    localStorage.setItem(argsKey, '上次搜索');

    registerSourceVerificationHandler(() =>
      Promise.reject(new SourceVerificationCancelledError()),
    );
    try {
      const expr =
        source.sortUrl?.match(/text=\{\{([\s\S]*?)\}\}/)?.[1] ?? '';
      invalidateLegadoRuleUrlExpandCache(book);
      clearSourceVerificationResultCache();
      await expect(evalSearchUrlExpression(expr, book, '', 1)).rejects.toBeInstanceOf(
        SourceVerificationCancelledError,
      );
      expect(localStorage.getItem(argsKey)).toBeNull();
    } finally {
      registerSourceVerificationHandler(null);
      clearSourceVerificationResultCache();
      localStorage.removeItem(argsKey);
    }
  });

  it('搜索分类 sortUrl 展开时弹出输入并写入 text 参数', async () => {
    if (isQuickJSFallback()) return;
    registerSourceVerificationHandler(async () => '图标设计');
    try {
      const sortUrl =
        'https://api.huaban.com/search/file?sort=created_at&limit=62&text={{svg=String(java.base64Encode(`<svg xmlns="http://www.w3.org/2000/svg"/>`));if(page==1){let a="";try{a=java.getVerificationCode("data:image/svg+xml;base64,"+svg);}catch(e){};if(a==""){a=source.getVariable()}source.setVariable(a);a}else{source.getVariable()};}}&page={{page}}&position=search_pin';
      const expanded = await evalSearchUrlExpression(
        sortUrl.match(/text=\{\{([\s\S]*?)\}\}/)?.[1] ?? '',
        source as never,
        '',
        1,
      );
      expect(expanded).toBe('图标设计');
    } finally {
      registerSourceVerificationHandler(null);
    }
  });
});
