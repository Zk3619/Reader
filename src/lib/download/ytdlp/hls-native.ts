/**
 * Native HLS media-playlist parse + AES-128 segment decrypt (yt-dlp HlsFD subset).
 * Prefer TS/crypto; ffmpeg only when playlist is live / DRM / unsupported METHOD.
 */

import { aes128CbcDecrypt } from './aes';
import { downloadFragmentsConcat, type FragmentPart } from './fragment-downloader';

import { downloadBinaryProxyArgs } from '@/lib/http/download-binary-proxy';
export type HlsDecryptInfo = {
  method: 'NONE' | 'AES-128' | string;
  keyUri?: string;
  /** Raw 16-byte key once fetched */
  key?: Uint8Array;
  /** 16-byte IV; if absent, use media_sequence as big-endian IV */
  iv?: Uint8Array;
};

export type HlsFragment = FragmentPart & {
  mediaSequence: number;
  decrypt: HlsDecryptInfo;
};

export type ParsedHlsMedia = {
  isLive: boolean;
  hasDrm: boolean;
  unsupportedAes: boolean;
  fragments: HlsFragment[];
  mediaSequenceStart: number;
};

const DRM_RE =
  /#EXT-X-(?:SESSION-)?KEY:.*?URI="skd:\/\/|#EXT-X-(?:SESSION-)?KEY:.*?KEYFORMAT="com\.(?:apple\.streamingkeydelivery|microsoft\.playready)"|#EXT-X-FAXS-CM:/i;

export function hasHlsDrm(manifest: string): boolean {
  return DRM_RE.test(manifest);
}

export function parseM3u8Attributes(attrLine: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Z0-9-]+)=("([^"]*)"|[^,]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrLine))) {
    const key = m[1]!.toUpperCase();
    out[key] = (m[3] ?? m[2] ?? '').replace(/^"|"$/g, '');
  }
  return out;
}

function absolutize(base: string, rel: string): string {
  try {
    return new URL(rel, base).toString();
  } catch {
    return rel;
  }
}

function ivFromMediaSequence(seq: number): Uint8Array {
  const iv = new Uint8Array(16);
  const view = new DataView(iv.buffer);
  view.setUint32(12, seq >>> 0, false);
  return iv;
}

function parseHexIv(iv: string): Uint8Array {
  const hex = iv.replace(/^0x/i, '').padStart(32, '0');
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Parse `length[@offset]` → exclusive [start, end). Matches yt-dlp HlsFD. */
function parseByteRange(
  raw: string,
  defaultStart: number,
): { start: number; end: number } | undefined {
  const parts = raw.trim().split('@');
  const length = Number(parts[0]);
  if (!(length > 0)) return undefined;
  const start = parts.length === 2 ? Number(parts[1]) : defaultStart;
  if (!Number.isFinite(start) || start < 0) return undefined;
  return { start, end: start + length };
}

/** Parse a media playlist into ordered fragments + per-fragment decrypt state. */
export function parseHlsMediaPlaylist(manifest: string, manifestUrl: string): ParsedHlsMedia {
  const hasDrm = hasHlsDrm(manifest);
  const isLive =
    /#EXT-X-PLAYLIST-TYPE:\s*EVENT/i.test(manifest) ||
    (!/#EXT-X-ENDLIST/i.test(manifest) && /#EXT-X-MEDIA-SEQUENCE:(?!0$)/m.test(manifest));

  let mediaSequence = 0;
  let decrypt: HlsDecryptInfo = { method: 'NONE' };
  let unsupportedAes = false;
  const fragments: HlsFragment[] = [];
  let adNext = false;
  /** Pending `#EXT-X-BYTERANGE` for the next URI line (yt-dlp HlsFD). */
  let pendingByteRange: { start: number; end: number } | undefined;
  let byteRangeOffset = 0;

  for (const raw of manifest.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      mediaSequence = Number(line.slice(22)) || 0;
      continue;
    }
    if (line.startsWith('#ANVATO-SEGMENT-INFO') && line.includes('type=ad')) {
      adNext = true;
      continue;
    }
    if (line.startsWith('#ANVATO-SEGMENT-INFO') && line.includes('type=master')) {
      adNext = false;
      continue;
    }
    if (line.startsWith('#UPLYNK-SEGMENT') && line.endsWith(',ad')) {
      adNext = true;
      continue;
    }
    if (line.startsWith('#UPLYNK-SEGMENT') && line.endsWith(',segment')) {
      adNext = false;
      continue;
    }

    if (line.startsWith('#EXT-X-KEY:')) {
      const attrs = parseM3u8Attributes(line.slice(11));
      const method = (attrs.METHOD || 'NONE').toUpperCase();
      decrypt = { method };
      if (method === 'AES-128') {
        if (attrs.IV) decrypt.iv = parseHexIv(attrs.IV);
        if (attrs.URI) decrypt.keyUri = absolutize(manifestUrl, attrs.URI);
      } else if (method !== 'NONE') {
        unsupportedAes = true;
      }
      continue;
    }

    if (line.startsWith('#EXT-X-BYTERANGE:')) {
      pendingByteRange = parseByteRange(line.slice(17), byteRangeOffset);
      continue;
    }

    if (line.startsWith('#EXT-X-MAP:')) {
      if (adNext) continue;
      const attrs = parseM3u8Attributes(line.slice(11));
      const uri = attrs.URI;
      if (!uri) continue;
      const mapRange = attrs.BYTERANGE
        ? parseByteRange(attrs.BYTERANGE, 0)
        : undefined;
      fragments.push({
        url: absolutize(manifestUrl, uri),
        mediaSequence,
        decrypt: { ...decrypt },
        byteRange: mapRange,
      });
      mediaSequence += 1;
      if (mapRange) byteRangeOffset = mapRange.end;
      continue;
    }

    if (line.startsWith('#')) continue;
    if (adNext) continue;

    const range = pendingByteRange;
    pendingByteRange = undefined;
    fragments.push({
      url: absolutize(manifestUrl, line),
      mediaSequence,
      decrypt: { ...decrypt },
      byteRange: range,
    });
    mediaSequence += 1;
    if (range) byteRangeOffset = range.end;
  }

  return {
    isLive,
    hasDrm,
    unsupportedAes,
    fragments,
    mediaSequenceStart: fragments[0]?.mediaSequence ?? 0,
  };
}

/**
 * Arte / CMAF VOD: many `#EXT-X-BYTERANGE` entries on one URI, contiguous from MAP.
 * Collapse to a single exclusive range so we can HTTP-download the asset once (yt-dlp still
 * ranges per fragment; we optimize when safe).
 */
export function collapseContiguousSameUrlByteRanges(
  fragments: Array<{ url: string; byteRange?: { start: number; end: number } }>,
): { url: string; byteRange: { start: number; end: number } } | null {
  if (!fragments.length) return null;
  const first = fragments[0]!;
  if (!first.byteRange || !(first.byteRange.end > first.byteRange.start)) return null;
  const url = first.url;
  let expected = first.byteRange.start;
  let end = first.byteRange.end;
  for (const f of fragments) {
    if (f.url !== url || !f.byteRange || !(f.byteRange.end > f.byteRange.start)) return null;
    if (f.byteRange.start !== expected) return null;
    expected = f.byteRange.end;
    end = f.byteRange.end;
  }
  return { url, byteRange: { start: first.byteRange.start, end } };
}

async function fetchKey(
  uri: string,
  headers?: Record<string, string>,
  fetchBinary?: (url: string, headers?: Record<string, string>) => Promise<Uint8Array>,
): Promise<Uint8Array> {
  if (fetchBinary) return fetchBinary(uri, headers);
  const { invoke } = await import('@tauri-apps/api/core');
  const result = await invoke<{ data: number[]; status: number }>('download_binary', {
    url: uri,
    method: 'GET',
    headers: headers || {},
    body: null,
    timeoutMs: 30000,
    useOkhttpUserAgent: false,
    ...downloadBinaryProxyArgs(),
  });
  if (result.status >= 400) throw new Error(`HLS key HTTP ${result.status}`);
  return new Uint8Array(result.data);
}

/**
 * Download + AES-128 decrypt an HLS media playlist to a single byte buffer.
 * Throws when DRM / unsupported METHOD / empty.
 */
export async function downloadHlsMediaNative(
  manifestText: string,
  manifestUrl: string,
  opts?: {
    headers?: Record<string, string>;
    /** Pre-supplied key/iv from extractor `hls_aes` */
    hlsAes?: { key?: string; iv?: string; uri?: string };
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<Uint8Array> {
  const parsed = parseHlsMediaPlaylist(manifestText, manifestUrl);
  if (parsed.hasDrm) throw new Error('HLS stream is DRM protected');
  if (parsed.unsupportedAes) throw new Error('HLS encryption METHOD not supported (need AES-128)');
  if (!parsed.fragments.length) throw new Error('HLS media playlist has no segments');

  let externalKey: Uint8Array | undefined;
  let externalIv: Uint8Array | undefined;
  if (opts?.hlsAes?.key) {
    const hex = opts.hlsAes.key.replace(/^0x/i, '');
    externalKey = Uint8Array.from(hex.match(/.{1,2}/g)!.map((h) => parseInt(h, 16)));
  }
  if (opts?.hlsAes?.iv) {
    externalIv = parseHexIv(opts.hlsAes.iv);
  }

  const keyCache = new Map<string, Uint8Array>();
  const parts: FragmentPart[] = parsed.fragments.map((f) => ({
    url: f.url,
    duration: f.duration,
    byteRange: f.byteRange,
  }));

  return downloadFragmentsConcat(parts, opts?.headers, {
    concurrency: opts?.concurrency ?? 4,
    onProgress: opts?.onProgress,
    decrypt: async (chunk, index) => {
      const frag = parsed.fragments[index]!;
      const dec = frag.decrypt;
      if (dec.method !== 'AES-128') return chunk;

      let key = externalKey || dec.key;
      const keyUri = opts?.hlsAes?.uri || dec.keyUri;
      if (!key && keyUri) {
        let cached = keyCache.get(keyUri);
        if (!cached) {
          cached = await fetchKey(keyUri, opts?.headers);
          keyCache.set(keyUri, cached);
        }
        key = cached;
      }
      if (!key) throw new Error(`Missing AES-128 key for fragment ${index}`);

      const iv = externalIv || dec.iv || ivFromMediaSequence(frag.mediaSequence);
      return aes128CbcDecrypt(chunk, key, iv);
    },
  });
}

/** True when manifest looks like a media playlist (has segments) rather than master. */
export function isHlsMediaPlaylist(text: string): boolean {
  if (/#EXT-X-STREAM-INF:/i.test(text)) return false;
  return /#EXTINF:/i.test(text) || /#EXT-X-MAP:/i.test(text);
}

export function mediaPlaylistNeedsNativeAes(text: string): boolean {
  return /#EXT-X-KEY:.*?METHOD=AES-128/i.test(text) && !hasHlsDrm(text);
}

/**
 * Master playlist → 选变体。
 * - 无 maxHeight：最高 RESOLUTION / BANDWIDTH（Twitch Source/`chunked` 优先）
 * - 有 maxHeight：选不超过上限的最高变体（对齐用户画质档）；若全超限则选最接近上限的
 */
export function pickHlsMasterVariant(
  manifestText: string,
  masterUrl: string,
  opts?: { maxHeight?: number },
): string | null {
  const lines = manifestText.split(/\r?\n/);
  const variants: { url: string; height: number; width: number; bandwidth: number; sourceBonus: number }[] =
    [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;
    const next = lines[i + 1]?.trim();
    if (!next || next.startsWith('#')) continue;
    const abs = absolutize(masterUrl, next);
    const res = /RESOLUTION=(\d+)x(\d+)/i.exec(line);
    const h = res ? Number(res[2]) : 0;
    const w = res ? Number(res[1]) : 0;
    const bw = Number(/BANDWIDTH=(\d+)/i.exec(line)?.[1] || 0);
    const sourceBonus = /\/chunked\//i.test(abs) || /\bNAME="Source"/i.test(line) ? 1 : 0;
    variants.push({ url: abs, height: h, width: w, bandwidth: bw, sourceBonus });
  }
  if (!variants.length) return null;

  const scoreOf = (v: (typeof variants)[number]) =>
    v.sourceBonus * 1_000_000_000 + v.height * 10_000 + v.width + Math.round(v.bandwidth / 1000);

  const maxH = opts?.maxHeight != null && opts.maxHeight > 0 ? opts.maxHeight : null;
  if (maxH != null) {
    const within = variants.filter((v) => v.height <= 0 || v.height <= maxH);
    const pool = within.length ? within : variants;
    // within：选最高；若只能从超限里选，选最接近上限的
    if (within.length) {
      return pool.sort((a, b) => scoreOf(b) - scoreOf(a))[0]?.url ?? null;
    }
    return [...pool].sort(
      (a, b) =>
        Math.abs((a.height || 99999) - maxH) - Math.abs((b.height || 99999) - maxH) ||
        scoreOf(b) - scoreOf(a),
    )[0]?.url ?? null;
  }

  return [...variants].sort((a, b) => scoreOf(b) - scoreOf(a))[0]?.url ?? null;
}

/** @deprecated 使用 pickHlsMasterVariant */
export function pickBestHlsMasterVariant(manifestText: string, masterUrl: string): string | null {
  return pickHlsMasterVariant(manifestText, masterUrl);
}
