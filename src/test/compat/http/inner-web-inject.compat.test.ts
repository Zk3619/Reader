import { describe, expect, it } from 'vitest';
import {
  buildInnerWebInjectScript,
  injectHtmlForInnerWeb,
  stripInnerWebMetaRefresh,
  stripInnerWebCspMetaTags,
} from '@/lib/http/inner-web-inject-snippet';

describe('inner-web inject snippet', () => {
  it('含 history / location 导航改写（CF 挑战页 replaceState）', () => {
    const script = buildInnerWebInjectScript({
      targetOrigin: 'https://banzhu66666.net',
      targetPageUrl: 'https://banzhu66666.net/',
      documentTargetUrl: 'https://banzhu66666.net/',
      cookie: '',
      sessionId: 'iw_test',
      proxyPath: '/__reader_http',
      cloudflareChallenge: true,
    });
    expect(script).toContain('CF_CHALLENGE');
    expect(script).toContain('history.replaceState');
    expect(script).toContain('history.pushState');
    expect(script).toContain('rewriteHistoryUrl');
    expect(script).toContain('loc.assign');
    expect(script).toContain('HTMLScriptElement.prototype');
    expect(script).toContain('isBrowserDirectPath');
    expect(script).toContain('shouldProxyRequest');
    expect(script).toContain('shouldProxySameOrigin');
    expect(script).toContain('canonicalizeProxyHistoryUrl');
    expect(script).toContain('isProxyFrameUrl');
    expect(script).toContain('if(!CF_CHALLENGE)patchDocumentLocation()');
    expect(script).toContain('isImportDeepLink');
    expect(script).toContain('reader-inner-web-navigate');
    expect(script).toContain('navTargetKey');
    expect(script).toContain('shouldSkipRepeatedNav');
    expect(script).toContain('shouldProxyDocumentNavigate');
    expect(script).toContain('navigateInFrame');
    expect(script).toContain('bindImportDeepLinkCapture');
    expect(script).toContain('HTMLAnchorElement.prototype');
    expect(script).toContain('interceptMetaRefresh');
    expect(script).toContain('actualFrameHref');
  });

  it('CF 验证注入放宽 CSP meta', () => {
    const out = injectHtmlForInnerWeb(
      '<html><head></head><body>x</body></html>',
      'https://banzhu66666.net/',
      '',
      'iw_test',
      '/__reader_http',
      'https://banzhu66666.net/',
      true,
    );
    expect(out).toContain('img-src \'self\' https: http: data: blob:');
  });

  it('canonicalizeProxyHistoryUrl 将书源域上的 __reader_http 规范为 localhost 代理 URL', () => {
    const script = buildInnerWebInjectScript({
      targetOrigin: 'https://banzhu66666.net',
      targetPageUrl: 'https://banzhu66666.net/',
      documentTargetUrl: 'https://banzhu66666.net/',
      cookie: '',
      sessionId: 'iw_test',
      proxyPath: '/__reader_http',
      cloudflareChallenge: true,
    });
    expect(script).toContain("if(rest.charAt(0)==='?')return proxyEndpoint()+rest");
  });

  it('stripInnerWebCspMetaTags 移除 CSP meta', () => {
    const html =
      '<head><meta http-equiv="Content-Security-Policy" content="img-src \'self\' https://challenges.cloudflare.com"></head>';
    expect(stripInnerWebCspMetaTags(html)).not.toContain('Content-Security-Policy');
  });

  it('stripInnerWebMetaRefresh 移除全部 meta refresh', () => {
    const html =
      '<head><meta http-equiv="refresh" content="0;url=https://ged520.yeoi.me/"><meta http-equiv="refresh" content="0;url=legado://import/rssSource?src=https%3A%2F%2Fa.com"></head>';
    const out = stripInnerWebMetaRefresh(html);
    expect(out).not.toContain('http-equiv');
    expect(out).not.toContain('legado://');
  });

  it('injectHtmlForInnerWeb 注入前移除 legado meta refresh', () => {
    const html =
      '<html><head><meta http-equiv="refresh" content="0;url=yuedu://booksource/importonline?src=https%3A%2F%2Fa.com"></head><body>x</body></html>';
    const out = injectHtmlForInnerWeb(
      html,
      'https://ged520.yeoi.me/',
      '',
      'iw_test',
      '/__reader_http',
      'https://ged520.yeoi.me/',
    );
    expect(out).not.toMatch(/http-equiv\s*=\s*["']?refresh/i);
    expect(out).toContain('isImportDeepLink');
  });

  it('CF 验证注入不添加 base href（避免 /__reader_http 相对路径错位）', () => {
    const out = injectHtmlForInnerWeb(
      '<html><head></head><body>x</body></html>',
      'https://banzhu66666.net/',
      '',
      'iw_test',
      '/__reader_http',
      'https://banzhu66666.net/',
      true,
    );
    expect(out).not.toContain('<base href=');
    expect(out).toContain('CF_CHALLENGE');
  });
});
