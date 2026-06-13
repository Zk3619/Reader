import { describe, expect, it } from 'vitest';
import {
  isOnlineVideoBrowserUrl,
  normalizeOnlineVideoBrowserUrl,
  resolveOnlineVideoBrowserHints,
} from '@/lib/platform/online-video-browser-url';

describe('normalizeOnlineVideoBrowserUrl', () => {
  it('为缺 item_id 的 online_video 链接补上章节 item_id', () => {
    const url =
      'https://v3.gyks.cf/online_video?book_id=abc&source=%E7%95%AA%E8%8C%84&tab=%E7%9F%AD%E5%89%A7';
    const out = normalizeOnlineVideoBrowserUrl(url, { itemId: '7598095883883793433' });
    expect(out).toContain('item_id=7598095883883793433');
    expect(isOnlineVideoBrowserUrl(out)).toBe(true);
  });

  it('已有 item_id 时不改写 URL', () => {
    const url =
      'https://v3.gyks.cf/online_video?book_id=abc&item_id=123&source=%E7%95%AA%E8%8C%84';
    expect(normalizeOnlineVideoBrowserUrl(url, { itemId: '456' })).toBe(url);
  });

  it('从 variables 解析 item_id', () => {
    const hints = resolveOnlineVideoBrowserHints({
      variables: { item_id: 'chapter-item' },
    });
    expect(hints.itemId).toBe('chapter-item');
  });
});

describe('INNER_WEB_HOST_FIXES_SCRIPT', () => {
  it('包含 beacon 屏蔽与进度日志节流', async () => {
    const { INNER_WEB_HOST_FIXES_SCRIPT } = await import('@/lib/platform/inner-web-host-fixes');
    expect(INNER_WEB_HOST_FIXES_SCRIPT).toContain('cloudflareinsights');
    expect(INNER_WEB_HOST_FIXES_SCRIPT).toContain('sendBeacon');
    expect(INNER_WEB_HOST_FIXES_SCRIPT).toContain('upgrade-insecure-requests');
    expect(INNER_WEB_HOST_FIXES_SCRIPT).not.toContain('gyks.cf');
    expect(INNER_WEB_HOST_FIXES_SCRIPT).toContain('保存进度');
  });
});

describe('injectHtmlForInnerWeb host fixes', () => {
  it('代理 HTML 注入宿主修复脚本', async () => {
    const { injectHtmlForInnerWeb } = await import('@/lib/http/inner-web-inject-snippet');
    const html = injectHtmlForInnerWeb(
      '<html><head></head><body>ok</body></html>',
      'https://v3.gyks.cf/online_video?book_id=1',
      'a=1',
      'sess',
      '/__reader_http',
    );
    expect(html).toContain('__READER_HOST_FIXES__');
    expect(html).toContain('cloudflareinsights');
  });
});
