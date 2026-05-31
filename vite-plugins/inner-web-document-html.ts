/**
 * 代理注入用：段评等页的 base 解析（与 src 侧逻辑保持一致，供 vite-plugins 独立编译）。
 */

/** get_para_review 页：base 设为站点根，便于页内 `/para_review` 等相对 API */
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
