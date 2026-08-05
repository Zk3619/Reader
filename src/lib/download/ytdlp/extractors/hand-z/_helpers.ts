// @ts-nocheck
/**
 * Shared helpers for hand-z ù re-export prior batch helpers.
 */
export * from '../hand-y/_helpers';

import { extract_attributes } from '../../utils';

/** Alias of yt-dlp `extract_attributes` (HTML tag ? attr map). */
export function parseHtmlAttributes(htmlTag: string): Record<string, string> {
  return extract_attributes(htmlTag);
}

/**
 * Decode a URL-safe Base64 string (yt-dlp `base64.urlsafe_b64decode`).
 * Returns null on failure so callers can fall back to the original id.
 */
export function b64UrlDecode(s: string): string | null {
  try {
    const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
    const b64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}
