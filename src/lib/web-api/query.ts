/** 解析 Legado Web API 查询参数（取首值） */

export function parseQueryString(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = search.startsWith('?') ? search.slice(1) : search;
  if (!raw) return out;
  for (const part of raw.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const key = decodeURIComponent(eq >= 0 ? part.slice(0, eq) : part);
    const value = decodeURIComponent(eq >= 0 ? part.slice(eq + 1) : '');
    if (key && !(key in out)) out[key] = value;
  }
  return out;
}

export function queryParam(
  query: Record<string, string> | undefined,
  name: string,
): string | undefined {
  const value = query?.[name];
  return value?.trim() ? value.trim() : undefined;
}
