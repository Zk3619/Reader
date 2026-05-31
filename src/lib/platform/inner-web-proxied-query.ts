/**
 * 内嵌 Web 代理页：从真实文档 URL 提取 query，并修补 HTML 内 location.search 读取。
 */

/** 从真实文档 URL 提取 query（不含 `?`） */
export function extractProxiedDocumentQuery(documentUrl: string): string {
  try {
    const u = new URL(documentUrl.trim());
    return u.search ? u.search.slice(1) : '';
  } catch {
    return '';
  }
}

/**
 * 代理 iframe 内页面常读 `location.search`，实为 `?target=...&session=...`。
 * 将 `new URLSearchParams(window.location.search)` 等改为嵌入真实 query（静态兜底）。
 */
export function patchProxiedDocumentLocationQuery(
  html: string,
  documentUrl: string,
): string {
  const query = extractProxiedDocumentQuery(documentUrl);
  if (!query) return html;
  const encoded = JSON.stringify(query);
  return html
    .replace(
      /new URLSearchParams\s*\(\s*window\.location\.search\s*\)/g,
      `new URLSearchParams(${encoded})`,
    )
    .replace(
      /new URLSearchParams\s*\(\s*location\.search\s*\)/g,
      `new URLSearchParams(${encoded})`,
    );
}
