/**
 * Shared helpers for hand-a extractors.
 */

import type { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { clean_html, extract_attributes, unified_timestamp } from '../../utils';

export function parseIso8601(dateStr: unknown): number | null {
  if (dateStr == null || dateStr === '') return null;
  const s = String(dateStr).trim();
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? Math.trunc(ms / 1000) : null;
}

export function md5Hex(text: string): string {
  // Minimal MD5 for Anvato auth (pure JS, no Node crypto).
  const md5 = (() => {
    /* eslint-disable no-bitwise */
    function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
      a = (a + q + x + t) | 0;
      return (((a << s) | (a >>> (32 - s))) + b) | 0;
    }
    function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
      return cmn((b & c) | (~b & d), a, b, x, s, t);
    }
    function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
      return cmn((b & d) | (c & ~d), a, b, x, s, t);
    }
    function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
      return cmn(b ^ c ^ d, a, b, x, s, t);
    }
    function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
      return cmn(c ^ (b | ~d), a, b, x, s, t);
    }
    function md5cycle(x: number[], k: number[]) {
      let [a, b, c, d] = x;
      a = ff(a, b, c, d, k[0], 7, -680876936);
      d = ff(d, a, b, c, k[1], 12, -389564586);
      c = ff(c, d, a, b, k[2], 17, 606105819);
      b = ff(b, c, d, a, k[3], 22, -1044525330);
      a = ff(a, b, c, d, k[4], 7, -176418897);
      d = ff(d, a, b, c, k[5], 12, 1200080426);
      c = ff(c, d, a, b, k[6], 17, -1473231341);
      b = ff(b, c, d, a, k[7], 22, -45705983);
      a = ff(a, b, c, d, k[8], 7, 1770035416);
      d = ff(d, a, b, c, k[9], 12, -1958414417);
      c = ff(c, d, a, b, k[10], 17, -42063);
      b = ff(b, c, d, a, k[11], 22, -1990404162);
      a = ff(a, b, c, d, k[12], 7, 1804603682);
      d = ff(d, a, b, c, k[13], 12, -40341101);
      c = ff(c, d, a, b, k[14], 17, -1502002290);
      b = ff(b, c, d, a, k[15], 22, 1236535329);
      a = gg(a, b, c, d, k[1], 5, -165796510);
      d = gg(d, a, b, c, k[6], 9, -1069501632);
      c = gg(c, d, a, b, k[11], 14, 643717713);
      b = gg(b, c, d, a, k[0], 20, -373897302);
      a = gg(a, b, c, d, k[5], 5, -701558691);
      d = gg(d, a, b, c, k[10], 9, 38016083);
      c = gg(c, d, a, b, k[15], 14, -660478335);
      b = gg(b, c, d, a, k[4], 20, -405537848);
      a = gg(a, b, c, d, k[9], 5, 568446438);
      d = gg(d, a, b, c, k[14], 9, -1019803690);
      c = gg(c, d, a, b, k[3], 14, -187363961);
      b = gg(b, c, d, a, k[8], 20, 1163531501);
      a = gg(a, b, c, d, k[13], 5, -1444681467);
      d = gg(d, a, b, c, k[2], 9, -51403784);
      c = gg(c, d, a, b, k[7], 14, 1735328473);
      b = gg(b, c, d, a, k[12], 20, -1926607734);
      a = hh(a, b, c, d, k[5], 4, -378558);
      d = hh(d, a, b, c, k[8], 11, -2022574463);
      c = hh(c, d, a, b, k[11], 16, 1839030562);
      b = hh(b, c, d, a, k[14], 23, -35309556);
      a = hh(a, b, c, d, k[1], 4, -1530992060);
      d = hh(d, a, b, c, k[4], 11, 1272893353);
      c = hh(c, d, a, b, k[7], 16, -155497632);
      b = hh(b, c, d, a, k[10], 23, -1094730640);
      a = hh(a, b, c, d, k[13], 4, 681279174);
      d = hh(d, a, b, c, k[0], 11, -358537222);
      c = hh(c, d, a, b, k[3], 16, -722521979);
      b = hh(b, c, d, a, k[6], 23, 76029189);
      a = hh(a, b, c, d, k[9], 4, -640364487);
      d = hh(d, a, b, c, k[12], 11, -421815835);
      c = hh(c, d, a, b, k[15], 16, 530742520);
      b = hh(b, c, d, a, k[2], 23, -995338651);
      a = ii(a, b, c, d, k[0], 6, -198630844);
      d = ii(d, a, b, c, k[7], 10, 1126891415);
      c = ii(c, d, a, b, k[14], 15, -1416354905);
      b = ii(b, c, d, a, k[5], 21, -57434055);
      a = ii(a, b, c, d, k[12], 6, 1700485571);
      d = ii(d, a, b, c, k[3], 10, -1894986606);
      c = ii(c, d, a, b, k[10], 15, -1051523);
      b = ii(b, c, d, a, k[1], 21, -2054922799);
      a = ii(a, b, c, d, k[8], 6, 1873313359);
      d = ii(d, a, b, c, k[15], 10, -30611744);
      c = ii(c, d, a, b, k[6], 15, -1560198380);
      b = ii(b, c, d, a, k[13], 21, 1309151649);
      a = ii(a, b, c, d, k[4], 6, -145523070);
      d = ii(d, a, b, c, k[11], 10, -1120210379);
      c = ii(c, d, a, b, k[2], 15, 718787259);
      b = ii(b, c, d, a, k[9], 21, -343485551);
      x[0] = (a + x[0]) | 0;
      x[1] = (b + x[1]) | 0;
      x[2] = (c + x[2]) | 0;
      x[3] = (d + x[3]) | 0;
    }
    function md5blk(s: string, i: number) {
      const blk: number[] = [];
      for (let j = 0; j < 16; j++) {
        blk[j] =
          s.charCodeAt(i + j * 4) |
          (s.charCodeAt(i + j * 4 + 1) << 8) |
          (s.charCodeAt(i + j * 4 + 2) << 16) |
          (s.charCodeAt(i + j * 4 + 3) << 24);
      }
      return blk;
    }
    return (s: string) => {
      const n = s.length;
      const state = [1732584193, -271733879, -1732584194, 271733878];
      let i: number;
      for (i = 64; i <= n; i += 64) md5cycle(state, md5blk(s, i - 64));
      s = s.slice(i - 64);
      const tail = new Array(16).fill(0);
      for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
      tail[i >> 2] |= 0x80 << ((i % 4) << 3);
      if (i > 55) {
        md5cycle(state, tail);
        tail.fill(0);
      }
      tail[14] = n * 8;
      md5cycle(state, tail);
      return state.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
    };
    /* eslint-enable no-bitwise */
  })();
  return md5(text);
}

/** Anvato X-Anvato-Adst-Auth (upstream aes_encrypt with 8-byte key, 0 rounds). */
export function anvatoAdstAuth(input: string, authKey: Uint8Array): string {
  const bytes: number[] = [];
  const len = Math.min(input.length, 64);
  for (let i = 0; i < len; i++) bytes.push(input.charCodeAt(i));
  const out: number[] = [];
  for (let i = 0; i < 8; i++) out.push((bytes[i] ?? 0) ^ (authKey[i] ?? 0));
  return btoa(String.fromCharCode(...out));
}

export function stripJsonp(text: string): string {
  const m = text.match(/^[^(]*\(([\s\S]*)\)\s*;?\s*$/);
  return m?.[1] ?? text;
}

export function playlistFromMatches(
  ie: InfoExtractor,
  urls: string[],
  playlistId: string,
  opts?: {
    title?: string | null;
    description?: string | null;
    ie?: string;
    video_kwargs?: Record<string, unknown>;
  },
): VideoInfo {
  const entries = urls.map((u) => ({
    ...ie.url_result(u, opts?.ie || null),
    ...(opts?.video_kwargs || {}),
  }));
  return ie.playlist_result(entries, playlistId, opts?.title || playlistId, opts?.description || null);
}

export function parseArchivePlaylist(webpage: string): Record<string, unknown>[] {
  const m = webpage.match(/<play-av[^>]*>/i);
  if (!m) return [];
  const attrs = extract_attributes(m[0]!);
  const pl = attrs.playlist;
  if (!pl) return [];
  try {
    return JSON.parse(pl.replace(/&quot;/g, '"').replace(/&#39;/g, "'")) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

export function archiveMetadataFields(m: Record<string, unknown>): Partial<VideoInfo> {
  const desc = m.description;
  let description: string | null = null;
  if (typeof desc === 'string') description = clean_html(desc);
  else if (Array.isArray(desc)) description = clean_html(desc.map(String).join(' '));
  const creators = m.creator;
  const creatorList = creators == null ? undefined : Array.isArray(creators) ? creators.map(String) : [String(creators)];
  return {
    title: m.title != null ? String(m.title) : undefined,
    description,
    uploader: m.uploader != null ? String(m.uploader) : m.adder != null ? String(m.adder) : undefined,
    creators: creatorList,
    license: m.licenseurl != null ? String(m.licenseurl) : undefined,
    release_date: m.date != null ? String(m.date).slice(0, 10).replace(/-/g, '') : undefined,
    timestamp: unified_timestamp(m.publicdate ?? m.addeddate),
    location: m.venue != null ? String(m.venue) : undefined,
    release_year: m.year != null ? Number(m.year) || undefined : undefined,
  };
}

export function videoInfoFromDirectUrl(
  id: string,
  url: string,
  extra?: Partial<VideoInfo>,
): VideoInfo {
  return {
    id,
    title: extra?.title || id,
    formats: [{ format_id: 'direct', url, ext: url.includes('.m3u8') ? 'mp4' : undefined }],
    ...extra,
    webpage_url: extra?.webpage_url,
    original_url: extra?.original_url,
  };
}

export const KNOWN_MEDIA_EXTENSIONS = new Set([
  'mp4', 'webm', 'mkv', 'flv', 'mov', 'm4v', 'mp3', 'm4a', 'aac', 'opus', 'ogg', 'wav', 'flac',
  'ogv', 'mpg', 'mpeg', 'wmv', '3gp', 'ts', 'wma', 'shn', 'avi',
]);

export function buildArchiveFormats(
  identifier: string,
  fileName: string,
  fileMeta: Record<string, unknown>,
): Format | null {
  const parts = fileName.split('.');
  const ext = parts.length > 1 ? parts.pop()!.toLowerCase() : null;
  if (!ext || !KNOWN_MEDIA_EXTENSIONS.has(ext)) return null;
  const encoded = fileName.split('/').map(encodeURIComponent).join('/');
  return {
    format_id: ext,
    url: `https://archive.org/download/${identifier}/${encoded}`,
    format: fileMeta.format != null ? String(fileMeta.format) : undefined,
    width: fileMeta.width != null ? Number(fileMeta.width) || null : null,
    height: fileMeta.height != null ? Number(fileMeta.height) || null : null,
    filesize: fileMeta.size != null ? Number(fileMeta.size) || null : null,
    protocol: 'https',
    source_preference: fileMeta.source === 'original' ? 0 : -1,
    format_note: fileMeta.source != null ? String(fileMeta.source) : undefined,
    ext,
  };
}
