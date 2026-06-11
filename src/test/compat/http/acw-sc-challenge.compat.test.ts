import { describe, expect, it } from 'vitest';
import {
  isAcwScChallengeHtml,
  looksLikeAcwScChallengeResolved,
  maybeBypassAcwScChallenge,
  normalizeAcwScCookieForHeader,
  solveAcwScV2CookieFromHtml,
} from '@/lib/http/acw-sc-challenge';
import type { AnalyzeUrlOption } from '@/lib/book-source/analyze-url-option';

describe('acw_sc__v2 质询', () => {
  it('识别 arg1 质询页', () => {
    expect(isAcwScChallengeHtml("<html><script>var arg1='abc';acw_sc__v2</script></html>")).toBe(
      true,
    );
    expect(isAcwScChallengeHtml('<html><script>var pgs=1;</script></html>')).toBe(false);
  });

  it('solveAcwScV2CookieFromHtml 可解出 cookie', async () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 8.0.0; MI 5s Plus Build/OPR1.170623.032; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/71.0.3578.99 Mobile Safari/537.36';
    const res = await fetch('https://mby.lanzoub.com/b016iz5kgd', {
      headers: { 'User-Agent': ua },
    });
    const html = await res.text();
    expect(isAcwScChallengeHtml(html)).toBe(true);
    const raw = solveAcwScV2CookieFromHtml(html);
    expect(raw).toMatch(/acw_sc__v2=/);
    const header = normalizeAcwScCookieForHeader(raw!);
    expect(header).toMatch(/^acw_sc__v2=[a-f0-9]+$/i);
  }, 30_000);

  it('maybeBypassAcwScChallenge 重试后拿到 var pgs 正文', async () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 8.0.0; MI 5s Plus Build/OPR1.170623.032; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/71.0.3578.99 Mobile Safari/537.36';
    const url = 'https://mby.lanzoub.com/b016iz5kgd';
    const first = await fetch(url, { headers: { 'User-Agent': ua } });
    const challenge = await first.text();
    const option: AnalyzeUrlOption = {
      method: 'GET',
      useWebView: false,
      webJs: '',
      bodyJs: '',
      js: '',
      retry: 0,
      webViewDelayMs: 0,
      headers: {},
      dnsIp: '',
      origin: '',
      sourceRegex: '',
      overrideUrlRegex: '',
      charset: '',
    };
    const out = await maybeBypassAcwScChallenge(
      challenge,
      url,
      option,
      { 'User-Agent': ua },
      false,
      30_000,
      undefined,
      async (retryUrl, _opt, hdrs) => {
        const r = await fetch(retryUrl, { headers: hdrs as Record<string, string> });
        return r.text();
      },
    );
    expect(out).not.toBeNull();
    expect(looksLikeAcwScChallengeResolved(out!.body)).toBe(true);
    expect(out!.body).toContain('var pgs');
  }, 30_000);
});
