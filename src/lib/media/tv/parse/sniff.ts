/**
 * Parse type 0：WebView / iframe 嗅探媒体 URL（尊重配置 rules[]）
 */

import { runWebJs } from '@/lib/rule-engine/webjs-runner';
import { buildWebJsSniffScript } from '@/lib/rule-engine/webjs-sniff';
import { tvRequest } from '../net/rules';
import {
  extractMediaUrlsByRule,
  findSniffRuleForUrl,
} from '../net/sniff-rules';

const MEDIA_RE =
  'https?:\\/\\/[^\\s"\'<>]+\\.(?:m3u8|mp4|flv|mkv|ts|mpd)[^\\s"\'<>]*';

export async function sniffParseUrl(
  pageUrl: string,
  header?: Record<string, string>,
  timeoutMs = 20000,
): Promise<string | null> {
  const rule = findSniffRuleForUrl(pageUrl);
  const sourceRegex = rule?.regex?.[0]?.trim() || MEDIA_RE;
  const sniffScript = buildWebJsSniffScript({
    sourceRegex,
    overrideUrlRegex: sourceRegex,
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
    if (hit && /^https?:\/\//i.test(hit)) {
      const filtered = extractMediaUrlsByRule(hit, rule);
      return filtered[0] ?? hit;
    }
  } catch (e) {
    console.warn('[tv-sniff] webjs failed', e);
  }

  try {
    const res = await tvRequest(pageUrl, {
      method: 'GET',
      headers: header,
      timeout: Math.min(timeoutMs, 15000),
      allowNon2xx: true,
    });
    const text = await res.text();
    const hits = extractMediaUrlsByRule(text, rule);
    if (hits[0]) return hits[0];
  } catch (e) {
    console.warn('[tv-sniff] regex fallback failed', e);
  }
  return null;
}
