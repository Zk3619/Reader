/**
 * RSS WebView HTML 包装：对齐 Legado ReadRssViewModel.clHtml / loadStartHtml
 */

import type { RssSource } from '@/types';
import { buildLegadoWebJsInjection } from '@/lib/rule-engine/webjs-legado-injection';
import { inlineScriptTag } from '@/lib/rss-source/rss-inline-script';
import { buildRssParentFetchBridgeScript, rssContentNeedsSubframeBridge } from '@/lib/rss-source/rss-parent-fetch-bridge';
import { buildRssSubframeFetchPatch } from '@/lib/rss-source/rss-subframe-fetch-patch';
import { injectRssContentImageBridge } from '@/lib/rss-source/rss-content-document';
import { RSS_CONTENT_READER_OVERRIDE_STYLE } from '@/lib/rss-source/rss-content-images';

const DEFAULT_RSS_STYLE =
  'img{max-width:100% !important; width:auto; height:auto;}' +
  'video{object-fit:fill; max-width:100% !important; width:auto; height:auto;}' +
  'body{word-wrap:break-word; height:auto; max-width:100%; width:auto;}';

function injectAfterHeadOpen(html: string, injection: string): string {
  const headIndex = html.indexOf('<head>');
  if (headIndex >= 0) {
    return `${html.slice(0, headIndex + 6)}${injection}${html.slice(headIndex + 6)}`;
  }
  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${injection}`);
  }
  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${injection}</head>`);
  }
  return `<head>${injection}</head>${html}`;
}

/**
 * 对齐 Legado clHtml：注入 preloadJs 脚本占位、style
 */
export function wrapRssHtmlForWebView(
  content: string,
  source: RssSource,
  style?: string | null,
): string {
  const enableJs = source.enableJs !== false;
  const hasPreloadJs = Boolean(source.preloadJs?.trim());
  const needsSubframe = rssContentNeedsSubframeBridge(content, enableJs);
  let html = content;

  if (hasPreloadJs) {
    const injection = inlineScriptTag(
      [
        buildLegadoWebJsInjection(source.jsLib),
        buildRssParentFetchBridgeScript(),
        needsSubframe ? buildRssSubframeFetchPatch() : '',
        source.preloadJs!,
      ]
        .filter(Boolean)
        .join('\n'),
    );
    html = injectAfterHeadOpen(html, injection);
  } else if (needsSubframe) {
    const injection = inlineScriptTag(
      [buildRssParentFetchBridgeScript(), buildRssSubframeFetchPatch()].join('\n'),
    );
    html = injectAfterHeadOpen(html, injection);
  }

  const styleEndIndex = html.indexOf('</style>');
  const baseStyle = style?.trim() || DEFAULT_RSS_STYLE;
  const finalStyle = baseStyle + RSS_CONTENT_READER_OVERRIDE_STYLE;
  const readerOverrideTag = `<style>${RSS_CONTENT_READER_OVERRIDE_STYLE}</style>`;

  if (styleEndIndex >= 0) {
    if (style?.trim()) {
      return `${html.slice(0, styleEndIndex + 8)}<style>${style}</style>${readerOverrideTag}${html.slice(styleEndIndex + 8)}`;
    }
    return `${html.slice(0, styleEndIndex + 8)}${readerOverrideTag}${html.slice(styleEndIndex + 8)}`;
  }

  const headEndIndex = html.indexOf('</head>');
  const styleTag = `<style>${finalStyle}</style>`;
  if (headEndIndex >= 0) {
    return `${html.slice(0, headEndIndex)}${styleTag}${html.slice(headEndIndex)}`;
  }
  return `${styleTag}${html}`;
}

/** 注入正文图片桥（父页 fetch→blob，须在正文脚本前） */
export function injectRssContentImageProxy(html: string): string {
  return injectRssContentImageBridge(html);
}

/**
 * 对齐 loadStartHtml：注入 startJs + clHtml
 */
export function wrapRssStartHtml(source: RssSource, startHtml: string): string {
  const javascript = source.startJs?.trim();
  let processed = startHtml;

  if (javascript) {
    const bodyEndIndex = startHtml.indexOf('</body>');
    if (bodyEndIndex >= 0) {
      processed =
        `${startHtml.slice(0, bodyEndIndex)}${inlineScriptTag(javascript)}${startHtml.slice(bodyEndIndex)}`;
    } else {
      processed = `<body>${startHtml}${inlineScriptTag(javascript)}</body>`;
    }
  }

  return wrapRssHtmlForWebView(processed, source, source.startStyle ?? source.style);
}
