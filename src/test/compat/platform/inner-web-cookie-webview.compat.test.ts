import { describe, expect, it } from 'vitest';
import { resolveInnerWebCookiesUseMainWebview } from '@/lib/platform/inner-web-cookie-webview';

describe('resolveInnerWebCookiesUseMainWebview', () => {
  it('iframe 且 useProxyDocument 时读子 WebView / 代理会话', () => {
    expect(
      resolveInnerWebCookiesUseMainWebview({ iframeMode: true, useProxyDocument: true }),
    ).toBe(false);
  });

  it('iframe 无代理文档时读主 WebView', () => {
    expect(
      resolveInnerWebCookiesUseMainWebview({ iframeMode: true, useProxyDocument: false }),
    ).toBe(true);
  });

  it('panel 模式不读主 WebView', () => {
    expect(
      resolveInnerWebCookiesUseMainWebview({ iframeMode: false, useProxyDocument: true }),
    ).toBe(false);
  });
});
