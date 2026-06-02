import { describe, expect, it } from 'vitest';
import { resolveCheckKeyword } from '@/lib/book-source/search-keyword';
import {
  normalizeSearchDisplayFields,
  parseSearchThrottleAlertMessage,
} from '@/lib/book-source/search';
import type { RuleContext } from '@/lib/rule-engine';

describe('search checkKeyWord compatibility', () => {
  it('uses checkKeyWord as validate keyword override', () => {
    const rule = { checkKeyWord: '我的26岁女房客@番茄' };
    expect(resolveCheckKeyword('我的', rule)).toBe('我的26岁女房客@番茄');
  });

  it('keeps raw checkKeyWord semantics like legado', () => {
    const rule = { checkKeyWord: 'http://example.com' };
    expect(resolveCheckKeyword('我的', rule)).toBe('http://example.com');
  });
});

describe('search display normalization', () => {
  it('keeps rule-extracted author/intro semantics and html formatting', async () => {
    const itemHtml = `
      <div class="c_row cf">
        <div class="cover_m"><img data-src="/cover/123.jpg" /></div>
        <h4>我的炉鼎美母</h4>
        <p class="gray">散人 | #后宫 #母子 #制服</p>
        <p class="desc">半夜无聊寄在房间里上网，<br/>随手滑到一个奇怪的网站。</p>
        <span class="last">最新章节：--</span>
      </div>
    `;
    const context: RuleContext = {
      content: itemHtml,
      contentType: 'html',
      baseUrl: 'https://bachashuku.org/modules/article/search.php',
      source: {} as Record<string, unknown>,
      result: itemHtml,
    };
    const out = await normalizeSearchDisplayFields(context, {
      author: '作者：散人 著',
      intro: '<p>半夜无聊寄在房间里上网，<br/>随手滑到一个奇怪的网站。</p>',
      coverUrl: '',
      kind: '#后宫 #母子 #制服',
      latestChapterTitle: '最新章节：--',
    });

    expect(out).toMatchInlineSnapshot(`
      {
        "author": "散人",
        "coverUrl": "/cover/123.jpg",
        "intro": "半夜无聊寄在房间里上网，
      随手滑到一个奇怪的网站。",
        "kind": "后宫,母子,制服",
        "latestChapterTitle": "最新章节：--",
      }
    `);
  });

  it('falls back kind from gray textNodes tags', async () => {
    const itemHtml = `
      <div class="c_row cf">
        <h4>书名</h4>
        <p class="gray">
          散人 | #后宫 #母子 #制服
          半夜无聊窝在房间里上网
        </p>
      </div>
    `;
    const context: RuleContext = {
      content: itemHtml,
      contentType: 'html',
      baseUrl: 'https://bachashuku.org/modules/article/search.php',
      source: {} as Record<string, unknown>,
      result: itemHtml,
    };
    const out = await normalizeSearchDisplayFields(context, {
      author: '',
      intro: '',
      coverUrl: '',
      kind: '',
      latestChapterTitle: '',
    });
    expect(out.kind).toBe('#后宫 #母子 #制服');
  });
});

describe('search throttle alert detection', () => {
  it('parses alert("搜索间隔: 30 秒") and returns message', () => {
    const html = '<script>alert("搜索间隔: 30 秒");window.history.go(-1);</script>';
    expect(parseSearchThrottleAlertMessage(html)).toBe('搜索间隔: 30 秒');
  });

  it('parses java.toast("搜索间隔: 30 秒") and returns message', () => {
    const html = '<script>java.toast("搜索间隔: 30 秒");window.history.go(-1);</script>';
    expect(parseSearchThrottleAlertMessage(html)).toBe('搜索间隔: 30 秒');
  });

  it('parses plain throttle text without alert call', () => {
    const html = '<div>搜索过于频繁，请稍后再搜索</div>';
    expect(parseSearchThrottleAlertMessage(html)).toContain('搜索过于频繁');
  });

  it('ignores unrelated alert text', () => {
    const html = '<script>alert("加入收藏失败");</script>';
    expect(parseSearchThrottleAlertMessage(html)).toBeUndefined();
  });
});
