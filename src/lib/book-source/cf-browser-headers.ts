/**
 * CF 站点 HTTP 回退：补齐浏览器 navigate 请求常见的 Client Hints（对齐 Edge/Chrome 过 CF 后的 fetch）
 */

export function applyCfBrowserDocumentHeaders(headers: Record<string, string>): void {
  const ua = String(headers['User-Agent'] ?? headers['user-agent'] ?? '').trim();
  const chromeMajor = ua.match(/Chrome\/(\d+)/)?.[1] ?? '120';
  const mobile = /Mobile|Android/i.test(ua);

  headers.Accept =
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';
  headers['Accept-Language'] = 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6';
  headers['Cache-Control'] = 'max-age=0';
  headers['sec-ch-ua'] =
    `"Chromium";v="${chromeMajor}", "Microsoft Edge";v="${chromeMajor}", "Not/A)Brand";v="99"`;
  headers['sec-ch-ua-mobile'] = mobile ? '?1' : '?0';
  headers['sec-ch-ua-platform'] = mobile ? '"Android"' : '"Windows"';
  headers['sec-fetch-dest'] = 'document';
  headers['sec-fetch-mode'] = 'navigate';
  headers['sec-fetch-site'] = 'none';
  headers['sec-fetch-user'] = '?1';
  headers['upgrade-insecure-requests'] = '1';
  delete headers['user-agent'];
}
