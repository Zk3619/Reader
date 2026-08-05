/**
 * Native HLS media-playlist parse + AES-128 segment decrypt (yt-dlp HlsFD subset).
 * Prefer TS/crypto; ffmpeg only when playlist is live / DRM / unsupported METHOD.
 */

import { aes128CbcDecrypt } from './aes';
import { downloadFragmentsConcat, type FragmentPart } from './fragment-downloader';

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

    if (line.startsWith('#EXT-X-MAP:')) {
      if (adNext) continue;
      const attrs = parseM3u8Attributes(line.slice(11));
      const uri = attrs.URI;
      if (!uri) continue;
      fragments.push({
        url: absolutize(manifestUrl, uri),
        mediaSequence,
        decrypt: { ...decrypt },
      });
      mediaSequence += 1;
      continue;
    }

    if (line.startsWith('#')) continue;
    if (adNext) continue;

    fragments.push({
      url: absolutize(manifestUrl, line),
      mediaSequence,
      decrypt: { ...decrypt },
    });
    mediaSequence += 1;
  }

  return {
    isLive,
    hasDrm,
    unsupportedAes,
    fragments,
    mediaSequenceStart: fragments[0]?.mediaSequence ?? 0,
  };
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
    proxy: null,
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
  const parts: FragmentPart[] = parsed.fragments.map((f) => ({ url: f.url, duration: f.duration }));

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
