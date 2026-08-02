/**
 * Shared helpers for hand-l — re-export prior batch helpers.
 */
export * from '../hand-k/_helpers';

import { get_element_by_id } from '../../utils';
import { stripOrNone as _stripOrNone } from '../hand-a/_helpers';
import { parseIso8601 as _parseIso8601 } from '../hand-a/helpers';

export { clean_html, extract_attributes, parse_duration } from '../../utils';

/** yt-dlp make_archive_id — pragmatic `{ie_key} {video_id}` id used for archive de-dup. */
export function make_archive_id(ieOrKey: { ie_key: string } | string, videoId: string): string {
  const key = typeof ieOrKey === 'string' ? ieOrKey : ieOrKey.ie_key;
  return `${key.toLowerCase()} ${videoId}`;
}

/** yt-dlp parse_resolution — pragmatic subset: pulls width/height out of a string like "1920x1080". */
export function parse_resolution(
  s: string | null | undefined,
  opts?: { lenient?: boolean },
): { width?: number; height?: number } {
  if (!s) return {};
  const full = /(\d+)\s*[xX×]\s*(\d+)/.exec(s);
  if (full) return { width: Number(full[1]), height: Number(full[2]) };
  if (opts?.lenient) {
    const h = /(\d+)p/.exec(s);
    if (h) return { height: Number(h[1]) };
  }
  const h2 = /^(\d+)p$/.exec(s.trim());
  if (h2) return { height: Number(h2[1]) };
  return {};
}

/** yt-dlp get_element_html_by_id — like get_element_by_id but returns the outer HTML (opening+closing tags included). */
export function get_element_html_by_id(id: string, html: string, _fatal?: boolean): string | null {
  const re = new RegExp(`<([a-zA-Z0-9]+)([^>]*\\sid=["']${id}["'][^>]*)>([\\s\\S]*?)<\\/\\1>`, 'i');
  const m = html.match(re);
  return m?.[0] ?? null;
}

export { get_element_by_id };

/** snake_case aliases used by some ported extractors. */
export function strip_or_none(s: unknown): string | null {
  return _stripOrNone(s);
}

export function parse_iso8601(dateStr: unknown): number | null {
  return _parseIso8601(dateStr);
}
