/**
 * RSS 链接拦截与资源黑白名单：对齐 Legado ReadRssActivity.shouldOverrideUrlLoading
 */

import type { RssSource } from '@/types';
import { evalJs } from '@/lib/js-engine';
import { rssAsBookSource } from '@/lib/rss-source/rss-as-book-source';

function splitRuleList(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function matchRule(url: string, rule: string): boolean {
  if (!rule) return false;
  if (url.startsWith(rule)) return true;
  try {
    return new RegExp(rule).test(url);
  } catch {
    return false;
  }
}

/** 对齐 contentBlacklist / contentWhitelist */
export function shouldBlockRssResourceUrl(source: RssSource, url: string): boolean {
  const blacklist = splitRuleList(source.contentBlacklist);
  if (blacklist.length > 0) {
    return blacklist.some((rule) => matchRule(url, rule));
  }
  const whitelist = splitRuleList(source.contentWhitelist);
  if (whitelist.length > 0) {
    return !whitelist.some((rule) => matchRule(url, rule));
  }
  return false;
}

function isLegadoTruthy(result: string): boolean {
  const v = result.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

export interface RssUrlLoadingContext {
  source: RssSource;
  /** 当前页 baseUrl */
  baseUrl: string;
}

/**
 * 执行 shouldOverrideUrlLoading JS；返回 true 表示已拦截（不继续导航）
 */
export async function evalRssShouldOverrideUrlLoading(
  ctx: RssUrlLoadingContext,
  targetUrl: string,
): Promise<boolean> {
  const js = ctx.source.shouldOverrideUrlLoading?.trim();
  if (!js) return false;

  const book = rssAsBookSource(ctx.source);
  try {
    const wrapped = `var url=${JSON.stringify(targetUrl)};\n${js}`;
    const out = await evalJs(wrapped, {
      result: targetUrl,
      baseUrl: ctx.baseUrl,
      source: ctx.source as unknown as Record<string, unknown>,
      bookSource: book,
    });
    return isLegadoTruthy(out == null ? '' : String(out));
  } catch (e) {
    console.warn('[rss] shouldOverrideUrlLoading 执行失败', e);
    return false;
  }
}

export type RssLinkSchemeAction =
  | { type: 'navigate'; url: string }
  | { type: 'import'; url: string }
  | { type: 'external'; url: string }
  | { type: 'blocked' };

/** 相对 / 协议相对链接解析为绝对 URL（对齐 WebView baseUrl） */
export function resolveRssLinkUrl(url: string, baseUrl?: string): string | null {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('#') || /^javascript:/i.test(trimmed)) {
    return null;
  }
  const base = baseUrl?.trim();
  try {
    return new URL(trimmed, base || 'https://placeholder.invalid/').href;
  } catch {
    return null;
  }
}

/**
 * 对齐 handleCommonSchemes：http(s) 在 WebView 内导航，其它 scheme 特殊处理
 */
export function resolveRssLinkScheme(url: string, baseUrl?: string): RssLinkSchemeAction {
  const resolved = resolveRssLinkUrl(url, baseUrl);
  if (!resolved) return { type: 'blocked' };

  let scheme = '';
  try {
    scheme = new URL(resolved).protocol.replace(':', '').toLowerCase();
  } catch {
    return { type: 'blocked' };
  }
  if (scheme === 'http' || scheme === 'https') {
    return { type: 'navigate', url: resolved };
  }
  if (scheme === 'legado' || scheme === 'yuedu') {
    return { type: 'import', url: resolved };
  }
  return { type: 'external', url: resolved };
}
