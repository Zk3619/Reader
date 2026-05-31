/**
 * ?? iframe ? HTML ???? Web / srcdoc ?????
 * ????? API ? `/para_review`?base ???????? query ? get_para_review URL?
 */

/** get_para_review ??base ?????????? `/para_review` ??? API */
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

/** ? <head> ?? <base href>????? API/??????? */
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

/** iframe ? http(s) url ?? base ?? url???? HTML ? srcdoc??? API ??????? */
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
