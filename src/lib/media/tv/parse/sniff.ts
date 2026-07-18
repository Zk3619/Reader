/**
 * Parse type 0：WebView / iframe 嗅探媒体 URL
 */

import { runWebJs } from '@/lib/rule-engine/webjs-runner';
import { buildWebJsSniffScript } from '@/lib/rule-engine/webjs-sniff';
import { request } from '@/lib/http';

const MEDIA_RE =
  'https?:\\/\\/[^\\s"\'<>]+\\.(?:m3u8|mp4|flv|mkv|ts|mpd)[^\\s"\'<>]*';

export async function sniffParseUrl(
  pageUrl: string,
  header?: Record<string, string>,
  timeoutMs = 20000,
): Promise<string | null> {
  const sniffScript = buildWebJsSniffScript({
    sourceRegex: MEDIA_RE,
    overrideUrlRegex: MEDIA_RE,
    timeoutMs: Math.min(timeoutMs, 25000),
    pollMs: 250,
  });

  const userScript = `
${sniffScript}
(async function(){
  try {
    if (typeof window.__readerWaitSniff === 'function') {
      var hit = await window.__readerWaitSniff();
      if (hit) return hit;
    }
  } catch (e) {}
  var html = document.documentElement ? document.documentElement.outerHTML : '';
  var m = html.match(/${MEDIA_RE}/i);
  return m ? m[0] : '';
})()
`;

  try {
    const out = await runWebJs({
      url: pageUrl,
      script: userScript,
      headers: header,
      timeoutMs,
      delayMs: 400,
    });
    const hit = String(out ?? '').trim();
    if (hit && /^https?:\/\//i.test(hit)) return hit;
  } catch (e) {
    console.warn('[tv-sniff] webjs failed', e);
  }

  // 正则回退：直接 GET 页面
  try {
    const res = await request(pageUrl, {
      method: 'GET',
      headers: header,
      timeout: Math.min(timeoutMs, 15000),
      allowNon2xx: true,
    });
    const text = await res.text();
    const m = text.match(new RegExp(MEDIA_RE, 'i'));
    if (m?.[0]) return m[0];
  } catch (e) {
    console.warn('[tv-sniff] regex fallback failed', e);
  }
  return null;
}
