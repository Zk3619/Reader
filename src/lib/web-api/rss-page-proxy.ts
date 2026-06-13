/**
 * RSS url 模式：服务端拉取 HTML 并改写资源，供 Web iframe/srcdoc 展示
 */

import { resolveUrl } from '@/lib/book-source/utils';
import { fetchRssPage } from '@/lib/rss-source/fetch-rss-page';
import type { RssSource } from '@/types';

function stripFrameBlockers(html: string): string {
  return html
    .replace(/<meta[^>]+http-equiv=["']?X-Frame-Options[^>]*>/gi, '')
    .replace(
      /<meta[^>]+http-equiv=["']?Content-Security-Policy[^>]*frame-ancestors[^>]*>/gi,
      '',
    );
}

function injectBaseAndViewport(html: string, baseUrl: string): string {
  const safeBase = baseUrl.replace(/"/g, '&quot;');
  const injection =
    `<base href="${safeBase}" target="_blank">` +
    '<meta name="viewport" content="width=device-width, initial-scale=1">';
  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${injection}`);
  }
  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${injection}</head>`);
  }
  return `<!DOCTYPE html><html><head>${injection}</head><body>${html}</body></html>`;
}

function toAbsoluteUrl(src: string, pageUrl: string): string {
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('#')) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    return resolveUrl(pageUrl, trimmed);
  } catch {
    return trimmed;
  }
}

function imageProxyPath(src: string, pageUrl: string, width = 720): string {
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('/image?')) {
    return trimmed;
  }
  const absolute = toAbsoluteUrl(trimmed, pageUrl);
  if (!/^https?:\/\//i.test(absolute)) return trimmed;
  const params = new URLSearchParams({
    path: absolute,
    url: pageUrl,
    width: String(width),
  });
  return `/image?${params}`;
}

function rewriteProxyAssets(html: string, pageUrl: string): string {
  let out = html.replace(
    /<img([^>]*?)src=["']([^"']+)["']([^>]*)>/gi,
    (_match, before, src, after) =>
      `<img${before}src="${imageProxyPath(src, pageUrl)}"${after}>`,
  );
  out = out.replace(
    /url\(\s*["']?([^"')]+)["']?\s*\)/gi,
    (match, raw) => {
      const abs = toAbsoluteUrl(String(raw), pageUrl);
      if (!/^https?:\/\//i.test(abs)) return match;
      return `url("${imageProxyPath(abs, pageUrl)}")`;
    },
  );
  return out;
}

const PROXY_READER_STYLE =
  '<style>img,video{max-width:100%!important;height:auto!important}body{word-wrap:break-word;max-width:100%}</style>';

export async function proxyRssUrlPage(
  source: RssSource,
  pageUrl: string,
): Promise<{ html: string; finalUrl: string }> {
  const target = pageUrl.trim();
  if (!target.startsWith('http')) {
    throw new Error('代理需要 http(s) URL');
  }

  const { body, url: finalUrl } = await fetchRssPage({
    source,
    url: target,
    baseUrl: source.sourceUrl,
  });

  if (!body.trim()) {
    throw new Error('页面正文为空');
  }

  const docBase = finalUrl || target;
  let html = body;
  html = stripFrameBlockers(html);
  html = injectBaseAndViewport(html, docBase);
  html = rewriteProxyAssets(html, docBase);
  if (!html.includes(PROXY_READER_STYLE)) {
    html = html.replace(/<\/head>/i, `${PROXY_READER_STYLE}</head>`);
  }

  return { html, finalUrl: docBase };
}
