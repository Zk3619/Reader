/**
 * Shared helpers for hand-g — re-export prior batch helpers.
 */
export * from '../hand-f/_helpers';
export { parseHtml5MediaEntries } from '../hand-c/_helpers';
export { playlistFromMatches } from '../hand-a/helpers';
export { urlBasename as url_basename } from '../hand-a/_helpers';

import type { InfoExtractor } from '../../common';
import type { Subtitle } from '../../types';

export function genericId(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || 'generic';
  } catch {
    return 'generic';
  }
}

export function genericTitle(ie: InfoExtractor, url: string, webpage?: string): string {
  return (
    ie._og_search_title(webpage || '') ||
    ie._html_search_regex(/<title[^>]*>([^<]+)<\/title>/i, webpage || url, 'title', null, false) ||
    genericId(url)
  );
}

export function protoRelative(url: string): string {
  if (!url) return url;
  return url.startsWith('//') ? `https:${url}` : url;
}

export function format_field(obj: Record<string, unknown>, key: string, fmt: string): string | null {
  const val = obj[key];
  if (val == null || val === '') return null;
  return fmt.replace('%s', String(val));
}

export function parse_age_limit(rating: string | null | undefined): number | undefined {
  if (!rating) return undefined;
  const m = /(\d+)/.exec(rating);
  return m ? Number(m[1]) : undefined;
}

export function base_url(url: string): string {
  try {
    const u = new URL(url.startsWith('//') ? `https:${url}` : url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return url;
  }
}

export async function extractMpdFormatsAndSubtitles(
  ie: InfoExtractor,
  mpdUrl: string,
  videoId: string,
  mpdId = 'dash',
) {
  const formats = await ie._extract_mpd_formats(mpdUrl, videoId, mpdId, undefined, false);
  return { formats, subtitles: {} as Record<string, Subtitle[]> };
}
