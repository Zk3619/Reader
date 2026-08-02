/**
 * Shared helpers for hand-r — re-export prior batch helpers, plus a few
 * additions needed by the hand-r/s/t batches.
 */
export * from '../hand-q/_helpers';
export { strip_or_none } from '../hand-l/_helpers';
export { urljoin } from '../hand-a/_helpers';

/** yt-dlp get_element_by_attribute — first element whose attribute matches value. */
export function get_element_by_attribute(
  attribute: string,
  value: string,
  html: string,
  escapeValue = true,
): string | null {
  const valuePattern = escapeValue ? value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : value;
  const re = new RegExp(
    `<([a-zA-Z0-9:-]+)([^>]*\\s${attribute}\\s*=\\s*(['"])${valuePattern}\\3[^>]*)>([\\s\\S]*?)<\\/\\1>`,
    'i',
  );
  const m = html.match(re);
  return m?.[4] ?? null;
}

/** yt-dlp qualities — returns a function mapping a quality id to its rank (index) in the given order. */
export function qualities(qualityIds: string[]): (qid: string) => number {
  return (qid: string) => {
    const idx = qualityIds.indexOf(qid);
    return idx;
  };
}

/** yt-dlp clean_podcast_url — strips known podcast tracking/redirector prefixes. */
export function clean_podcast_url(url: string): string {
  let out = url.replace(
    /(?:(?:chtbl\.com\/track|media\.blubrry\.com|play\.podtrac\.com|chrt\.fm\/track|mgln\.ai\/e)(?:\/[^/.]+)?|(?:dts|www)\.podtrac\.com\/(?:pts\/)?redirect\.[a-z0-9]{3,4}|flex\.acast\.com|pd(?:cn\.co|st\.fm)\/e)\//i,
    '',
  );
  out = out.replace(/^(\w+:\/\/)(\w+:\/\/)/, '$2');
  return out;
}

/** yt-dlp try_call — invoke each fn until one returns a non-undefined value without throwing. */
export function try_call<T>(...fns: Array<() => T | undefined>): T | undefined {
  for (const fn of fns) {
    try {
      const v = fn();
      if (v !== undefined) return v;
    } catch {
      /* continue */
    }
  }
  return undefined;
}

/** yt-dlp update_url — replace URL components (query/fragment) with given overrides. */
export function update_url(
  url: string,
  opts?: { query_update?: Record<string, string | number | (string | number)[] | null | undefined> },
): string {
  if (!opts?.query_update) return url;
  const u = new URL(url);
  for (const [k, v] of Object.entries(opts.query_update)) {
    if (v == null) {
      u.searchParams.delete(k);
      continue;
    }
    if (Array.isArray(v)) {
      u.searchParams.delete(k);
      for (const item of v) u.searchParams.append(k, String(item));
    } else {
      u.searchParams.set(k, String(v));
    }
  }
  return u.toString();
}
