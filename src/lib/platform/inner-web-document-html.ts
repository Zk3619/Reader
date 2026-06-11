/**
 * 内嵌 iframe / HTML 文档处理（纯 Web srcdoc、Tauri 直连 URL 等）。
 * 段评 API 如 `/get_para_review`：base 指向站点根，避免 query 留在 get_para_review URL 上。
 */

import { isTauri } from '@/lib/platform/detect';

/** get_para_review 页将 base 设为站点根，避免相对 `/para_review` 等 API 路径错误 */
export function resolveInnerWebDocumentBaseUrl(pageUrl: string): string {
  const trimmed = pageUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    if (/\/get_para_review\b/i.test(u.pathname)) {
      return `${u.origin}/`;
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

/** 在 <head> 内注入 <base href>，修正相对 API/资源路径 */
export function injectInnerWebBaseTag(html: string, pageUrl: string): string {
  const baseHref = resolveInnerWebDocumentBaseUrl(pageUrl);
  const baseTag = `<base href="${baseHref}">`;
  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
  }
  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${baseTag}</head>`);
  }
  return `<!DOCTYPE html><html><head>${baseTag}</head><body>${html}</body></html>`;
}

/**
 * 是否用 srcdoc 展示预取 HTML。
 * Tauri 且有 http(s) URL 时走直连导航（panel/iframe src），避免 srcdoc/null 源跨域字体与 API。
 */
export function shouldUseInnerWebSrcdoc(
  pageUrl: string | undefined,
  html: string | undefined,
  options?: { useProxyDocument?: boolean; proxyFailed?: boolean },
): boolean {
  const h = html?.trim() ?? '';
  if (!h) return false;
  if (options?.useProxyDocument && !options?.proxyFailed) return false;
  const u = pageUrl?.trim() ?? '';
  if (isTauri() && /^https?:/i.test(u)) return false;
  return !shouldPreferInnerWebUrlOverHtml(u, h);
}

/** 将预取 HTML 挂到 blob:，对齐 Legado loadDataWithBaseURL（Tauri 下 srcdoc 脚本/iframe 易失效） */
export function buildBlobDocumentUrl(html: string): string {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  return URL.createObjectURL(blob);
}

export function revokeBlobDocumentUrl(url: string | undefined): void {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

/** iframe 有 http(s) url 且无 base 时优先 url；有 HTML 且已注入 base 时用 srcdoc */
export function shouldPreferInnerWebUrlOverHtml(
  url: string | undefined,
  html: string | undefined,
): boolean {
  const u = url?.trim() ?? '';
  const h = html?.trim() ?? '';
  if (!/^https?:\/\//i.test(u) || !h) return false;
  if (/<base\s+href=/i.test(h)) return false;
  return true;
}
