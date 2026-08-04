// @ts-nocheck
/**
 * Shared helpers for hand-w â€?re-export prior batch helpers, plus a few W-batch utilities.
 */
export * from '../hand-v/_helpers';
export { stripJsonp } from '../hand-a/helpers';

import type { InfoExtractor } from '../../common';
import { js_to_json, traverse_obj } from '../../utils';

/** ROT13 (codecs.decode(..., 'rot-13') equivalent) for webcamerapl etc. */
export function rot13(s: string): string {
  return s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

/** yt-dlp InfoExtractor._search_nuxt_data (default traverse: data[0]). */
export function searchNuxtData(
  ie: InfoExtractor,
  webpage: string,
  videoId: string,
  traverse: Array<string | number> = ['data', 0],
): Record<string, unknown> {
  const fnRe =
    /\(function\((?<arg_keys>[^)]*)\)\{[\s\S]*?\breturn\s+(?<js>\{[\s\S]*?\})\s*;?\s*\}\((?<arg_vals>[\s\S]*?)\)\s*\)/;
  const patterns = [
    new RegExp(`<script>\\s*window\\.__NUXT__=${fnRe.source}\\s*;?\\s*<\\/script>`, 'i'),
    new RegExp(`__NUXT__\\([\\s\\S]*?${fnRe.source}`, 'i'),
  ];
  let js: string | null = null;
  let argKeys = '';
  let argVals = '';
  for (const re of patterns) {
    const m = webpage.match(re);
    if (m?.groups) {
      js = m.groups.js || null;
      argKeys = m.groups.arg_keys || '';
      argVals = m.groups.arg_vals || '';
      break;
    }
  }
  if (!js) return {};

  const argsList = ie._parse_json(`[${argVals}]`, videoId, js_to_json, false) as unknown[] | null;
  const args: Record<string, string> = {};
  argKeys.split(',').forEach((key, idx) => {
    const k = key.trim();
    if (!k) return;
    args[k] = JSON.stringify(argsList?.[idx] ?? null);
  });

  // Keep JSON literals (args values are already JSON.stringify'd).
  const substituted = js.replace(/(\w+)/g, (token) => (token in args ? args[token]! : token));
  const parsed = ie._parse_json(substituted, videoId, null, false) as Record<string, unknown>;
  return (traverse_obj(parsed, traverse) as Record<string, unknown>) || {};
}

/** Best-effort first-tag text under a parent XML snippet. */
export function xmlChildText(parentXml: string, tag: string): string | null {
  const m = parentXml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m?.[1] != null ? m[1].trim() : null;
}

/** Collect repeated child element outer HTML / inner text pairs. */
export function xmlFindAll(parentXml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(parentXml))) out.push(m[1] || '');
  return out;
}

export function removeDuplicateFormats<T extends { url?: string | null }>(formats: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const f of formats) {
    const u = f.url || '';
    if (u && seen.has(u)) continue;
    if (u) seen.add(u);
    out.push(f);
  }
  return out;
}
