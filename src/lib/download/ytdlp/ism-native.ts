/**
 * SmoothStreaming / ISM — PIFF header writer (yt-dlp downloader/ism.py).
 */

export type IsmDownloadParams = {
  track_id?: number;
  fourcc: string;
  duration: number;
  timescale?: number;
  language?: string;
  height?: number;
  width?: number;
  stream_type: 'audio' | 'video' | 'text';
  channels?: number;
  bits_per_sample?: number;
  sampling_rate?: number;
  codec_private_data?: string | null;
  nal_unit_length_field?: number;
};

const TRACK_ENABLED = 0x1;
const TRACK_IN_MOVIE = 0x2;
const TRACK_IN_PREVIEW = 0x4;
const SELF_CONTAINED = 0x1;

function u8(n: number): Uint8Array {
  return new Uint8Array([n & 0xff]);
}
function u16(n: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n >>> 0, false);
  return b;
}
function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, false);
  return b;
}
function u64(n: number): Uint8Array {
  const b = new Uint8Array(8);
  const hi = Math.floor(n / 0x100000000);
  const lo = n >>> 0;
  const dv = new DataView(b.buffer);
  dv.setUint32(0, hi >>> 0, false);
  dv.setUint32(4, lo >>> 0, false);
  return b;
}
function s16(n: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setInt16(0, n, false);
  return b;
}
function s32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setInt32(0, n, false);
  return b;
}
/** fixed-point 8.8 */
function s88(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, 0]);
}
/** fixed-point 16.16 */
function s1616(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setInt16(0, n, false);
  return b;
}
function u1616(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint16(0, n >>> 0, false);
  return b;
}
function concat(...parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
function ascii(s: string): Uint8Array {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
}
function box(type: string, payload: Uint8Array): Uint8Array {
  return concat(u32(8 + payload.length), ascii(type), payload);
}
function fullBox(type: string, version: number, flags: number, payload: Uint8Array): Uint8Array {
  const flagBytes = u32(flags);
  return box(type, concat(u8(version), flagBytes.slice(1), payload));
}

const unityMatrix = concat(
  ...(Array.from({ length: 2 }, () => concat(s32(0x10000), s32(0), s32(0), s32(0)))),
  s32(0x40000000),
);

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Write ftyp + moov PIFF header (yt-dlp write_piff_header). */
export function writePiffHeader(params: IsmDownloadParams): Uint8Array {
  const trackId = params.track_id ?? 1;
  const fourcc = (params.fourcc || '').toUpperCase();
  const duration = params.duration || 0;
  const timescale = params.timescale ?? 10_000_000;
  const language = (params.language || 'und').slice(0, 3).padEnd(3, 'd');
  const height = params.height || 0;
  const width = params.width || 0;
  const streamType = params.stream_type;
  const now = Math.floor(Date.now() / 1000);

  const ftyp = box('ftyp', concat(ascii('isml'), u32(1), ascii('piff'), ascii('iso2')));

  const mvhd = fullBox(
    'mvhd',
    1,
    0,
    concat(
      u64(now),
      u64(now),
      u32(timescale),
      u64(duration),
      s1616(1),
      s88(1),
      u16(0),
      u32(0),
      u32(0),
      unityMatrix,
      u32(0),
      u32(0),
      u32(0),
      u32(0),
      u32(0),
      u32(0),
      u32(0xffffffff),
    ),
  );

  const tkhd = fullBox(
    'tkhd',
    1,
    TRACK_ENABLED | TRACK_IN_MOVIE | TRACK_IN_PREVIEW,
    concat(
      u64(now),
      u64(now),
      u32(trackId),
      u32(0),
      u64(duration),
      u32(0),
      u32(0),
      s16(0),
      s16(0),
      s88(streamType === 'audio' ? 1 : 0),
      u16(0),
      unityMatrix,
      u1616(width),
      u1616(height),
    ),
  );

  const langCode =
    ((language.charCodeAt(0) - 0x60) << 10) |
    ((language.charCodeAt(1) - 0x60) << 5) |
    (language.charCodeAt(2) - 0x60);
  const mdhd = fullBox(
    'mdhd',
    1,
    0,
    concat(u64(now), u64(now), u32(timescale), u64(duration), u16(langCode & 0xffff), u16(0)),
  );

  let hdlrPayload: Uint8Array;
  if (streamType === 'audio') {
    hdlrPayload = concat(u32(0), ascii('soun'), u32(0), u32(0), u32(0), ascii('SoundHandler\0'));
  } else if (streamType === 'video') {
    hdlrPayload = concat(u32(0), ascii('vide'), u32(0), u32(0), u32(0), ascii('VideoHandler\0'));
  } else {
    hdlrPayload = concat(u32(0), ascii('subt'), u32(0), u32(0), u32(0), ascii('SubtitleHandler\0'));
  }
  const hdlr = fullBox('hdlr', 0, 0, hdlrPayload);

  let mediaHeader: Uint8Array;
  if (streamType === 'audio') {
    mediaHeader = fullBox('smhd', 0, 0, concat(s88(0), u16(0)));
  } else if (streamType === 'video') {
    mediaHeader = fullBox('vmhd', 0, 1, concat(u16(0), u16(0), u16(0), u16(0)));
  } else {
    mediaHeader = fullBox('sthd', 0, 0, new Uint8Array(0));
  }

  const dref = fullBox(
    'dref',
    0,
    0,
    concat(u32(1), fullBox('url ', 0, SELF_CONTAINED, new Uint8Array(0))),
  );
  const dinf = box('dinf', dref);

  let sampleEntryPayload = concat(new Uint8Array(6), u16(1));
  let sampleEntryBox: Uint8Array;

  if (streamType === 'audio') {
    sampleEntryPayload = concat(
      sampleEntryPayload,
      u32(0),
      u32(0),
      u16(params.channels ?? 2),
      u16(params.bits_per_sample ?? 16),
      u16(0),
      u16(0),
      u1616(params.sampling_rate || 0),
    );
    if (fourcc === 'AACL') sampleEntryBox = box('mp4a', sampleEntryPayload);
    else if (fourcc === 'EC-3') sampleEntryBox = box('ec-3', sampleEntryPayload);
    else sampleEntryBox = box('mp4a', sampleEntryPayload);
  } else if (streamType === 'video') {
    sampleEntryPayload = concat(
      sampleEntryPayload,
      u16(0),
      u16(0),
      u32(0),
      u32(0),
      u32(0),
      u16(width),
      u16(height),
      u1616(0x48),
      u1616(0x48),
      u32(0),
      u16(1),
      new Uint8Array(32),
      u16(0x18),
      s16(-1),
    );
    const codecPrivate = params.codec_private_data
      ? hexToBytes(params.codec_private_data)
      : new Uint8Array(0);
    if ((fourcc === 'H264' || fourcc === 'AVC1') && codecPrivate.length) {
      // split on 00 00 00 01
      const parts: Uint8Array[] = [];
      let i = 0;
      while (i + 4 <= codecPrivate.length) {
        if (
          codecPrivate[i] === 0 &&
          codecPrivate[i + 1] === 0 &&
          codecPrivate[i + 2] === 0 &&
          codecPrivate[i + 3] === 1
        ) {
          let j = i + 4;
          while (j + 4 <= codecPrivate.length) {
            if (
              codecPrivate[j] === 0 &&
              codecPrivate[j + 1] === 0 &&
              codecPrivate[j + 2] === 0 &&
              codecPrivate[j + 3] === 1
            )
              break;
            j++;
          }
          parts.push(codecPrivate.slice(i + 4, j));
          i = j;
        } else {
          i++;
        }
      }
      const sps = parts[0] || new Uint8Array(0);
      const pps = parts[1] || new Uint8Array(0);
      const nalLen = (params.nal_unit_length_field ?? 4) - 1;
      const avcc = concat(
        u8(1),
        sps.slice(1, 4),
        u8(0xfc | (nalLen & 3)),
        u8(0xe0 | 1),
        u16(sps.length),
        sps,
        u8(1),
        u16(pps.length),
        pps,
      );
      sampleEntryPayload = concat(sampleEntryPayload, box('avcC', avcc));
      sampleEntryBox = box('avc1', sampleEntryPayload);
    } else {
      sampleEntryBox = box('avc1', sampleEntryPayload);
    }
  } else {
    // text / TTML
    sampleEntryPayload = concat(
      sampleEntryPayload,
      ascii('http://www.w3.org/ns/ttml\0'),
      u8(0),
      u8(0),
    );
    sampleEntryBox = box('stpp', sampleEntryPayload);
  }

  const stsd = fullBox('stsd', 0, 0, concat(u32(1), sampleEntryBox));
  const stts = fullBox('stts', 0, 0, u32(0));
  const stsc = fullBox('stsc', 0, 0, u32(0));
  const stco = fullBox('stco', 0, 0, u32(0));
  const stbl = box('stbl', concat(stsd, stts, stsc, stco));
  const minf = box('minf', concat(mediaHeader, dinf, stbl));
  const mdia = box('mdia', concat(mdhd, hdlr, minf));
  const trak = box('trak', concat(tkhd, mdia));

  const mehd = fullBox('mehd', 1, 0, u64(duration));
  const trex = fullBox(
    'trex',
    0,
    0,
    concat(u32(trackId), u32(1), u32(0), u32(0), u32(0)),
  );
  const mvex = box('mvex', concat(mehd, trex));
  const moov = box('moov', concat(mvhd, trak, mvex));

  return concat(ftyp, moov);
}

/** Walk nested boxes; return payload of deepest type in sequence. */
export function extractBoxData(data: Uint8Array, boxSequence: string[]): Uint8Array | null {
  let cur = data;
  for (let si = 0; si < boxSequence.length; si++) {
    const want = boxSequence[si]!;
    let offset = 0;
    let found: Uint8Array | null = null;
    while (offset + 8 <= cur.length) {
      const size = new DataView(cur.buffer, cur.byteOffset + offset, 4).getUint32(0, false);
      if (size < 8 || offset + size > cur.length) break;
      const type = String.fromCharCode(
        cur[offset + 4]!,
        cur[offset + 5]!,
        cur[offset + 6]!,
        cur[offset + 7]!,
      );
      if (type === want) {
        found = cur.subarray(offset + 8, offset + size);
        break;
      }
      offset += size;
    }
    if (!found) return null;
    if (si === boxSequence.length - 1) return found;
    cur = found;
  }
  return null;
}

export function trackIdFromFragment(frag: Uint8Array): number | null {
  const tfhd = extractBoxData(frag, ['moof', 'traf', 'tfhd']);
  if (!tfhd || tfhd.length < 8) return null;
  return new DataView(tfhd.buffer, tfhd.byteOffset + 4, 4).getUint32(0, false);
}

/**
 * Download ISM fragments and prepend PIFF header (IsmFD.real_download).
 */
export async function writeIsmFragmentsToFile(
  fragments: Array<{ url: string }>,
  outputPath: string,
  downloadParams: IsmDownloadParams,
  headers?: Record<string, string>,
  opts?: {
    concurrency?: number;
    retries?: number;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<string> {
  const { downloadFragmentsConcat } = await import('./fragment-downloader');
  if (!fragments.length) throw new Error('ISM: no fragments');

  const body = await downloadFragmentsConcat(
    fragments.map((f) => ({ url: f.url })),
    headers,
    {
      concurrency: opts?.concurrency ?? 4,
      retries: opts?.retries ?? 2,
      onProgress: opts?.onProgress,
    },
  );
  const trackId = trackIdFromFragment(body.subarray(0, Math.min(body.length, 65536))) ??
    downloadParams.track_id ??
    1;
  // Prefer track_id from first moof — body starts with first fragment
  const header = writePiffHeader({ ...downloadParams, track_id: trackId });
  const out = new Uint8Array(header.length + body.length);
  out.set(header, 0);
  out.set(body, header.length);

  const { invoke } = await import('@tauri-apps/api/core');
  // Prefer chunked write if available; fall back to number array for small buffers
  try {
    await invoke('write_binary_file', {
      path: outputPath,
      data: Array.from(out),
    });
  } catch (e) {
    throw new Error(`ISM write failed: ${(e as Error).message || e}`);
  }
  return outputPath;
}
