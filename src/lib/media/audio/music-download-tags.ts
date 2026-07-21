/**
 * 下载完成时嵌入元数据：
 * - MP3：简易 ID3v2.3（标题/艺术家/专辑/歌词 USLT/封面 APIC）
 * - FLAC：改写 STREAMINFO 之后的 Vorbis Comment（+ 可选 PICTURE）
 * 旁路 .lrc 仍可同时使用。
 */

export type DownloadEmbedMeta = {
  title: string;
  artist: string;
  album?: string;
  lyric?: string;
  coverJpeg?: Uint8Array | null;
  embedLyric?: boolean;
  embedCover?: boolean;
  /** ID3 TXXX:Description=Source / Vorbis DESCRIPTION */
  sourceComment?: string;
};

function encodeLatin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    out[i] = text.charCodeAt(i) & 0xff;
  }
  return out;
}

function encodeUtf16Bom(text: string): Uint8Array {
  const bom = new Uint8Array([0xff, 0xfe]);
  const body = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    body[i * 2] = c & 0xff;
    body[i * 2 + 1] = (c >> 8) & 0xff;
  }
  const out = new Uint8Array(bom.length + body.length);
  out.set(bom, 0);
  out.set(body, bom.length);
  return out;
}

function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function synchsafe(size: number): Uint8Array {
  return new Uint8Array([
    (size >> 21) & 0x7f,
    (size >> 14) & 0x7f,
    (size >> 7) & 0x7f,
    size & 0x7f,
  ]);
}

function frame(id: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(10 + payload.length);
  out.set(encodeLatin1(id), 0);
  out[4] = (payload.length >>> 24) & 0xff;
  out[5] = (payload.length >>> 16) & 0xff;
  out[6] = (payload.length >>> 8) & 0xff;
  out[7] = payload.length & 0xff;
  out.set(payload, 10);
  return out;
}

function textFrame(id: string, text: string): Uint8Array {
  const encoded = encodeUtf16Bom(text);
  const payload = new Uint8Array(1 + encoded.length);
  payload[0] = 1; // UTF-16
  payload.set(encoded, 1);
  return frame(id, payload);
}

function usltFrame(text: string): Uint8Array {
  const desc = encodeUtf16Bom('');
  const body = encodeUtf16Bom(text);
  // encoding(1) + lang(3) + desc + 0x00 0x00 + lyric
  const payload = new Uint8Array(1 + 3 + desc.length + 2 + body.length);
  let o = 0;
  payload[o++] = 1;
  payload[o++] = 0x65; // e
  payload[o++] = 0x6e; // n
  payload[o++] = 0x67; // g
  payload.set(desc, o);
  o += desc.length;
  payload[o++] = 0;
  payload[o++] = 0;
  payload.set(body, o);
  return frame('USLT', payload);
}

function txxxFrame(description: string, value: string): Uint8Array {
  const desc = encodeUtf16Bom(description);
  const body = encodeUtf16Bom(value);
  const payload = new Uint8Array(1 + desc.length + 2 + body.length);
  let o = 0;
  payload[o++] = 1;
  payload.set(desc, o);
  o += desc.length;
  payload[o++] = 0;
  payload[o++] = 0;
  payload.set(body, o);
  return frame('TXXX', payload);
}
function apicFrame(jpeg: Uint8Array): Uint8Array {
  const mime = encodeLatin1('image/jpeg\0');
  const desc = encodeUtf16Bom('');
  // encoding + mime\0 + pictureType + desc + 00 00 + data
  const payload = new Uint8Array(1 + mime.length + 1 + desc.length + 2 + jpeg.length);
  let o = 0;
  payload[o++] = 1;
  payload.set(mime, o);
  o += mime.length;
  payload[o++] = 3; // cover front
  payload.set(desc, o);
  o += desc.length;
  payload[o++] = 0;
  payload[o++] = 0;
  payload.set(jpeg, o);
  return frame('APIC', payload);
}

function stripExistingId3(audio: Uint8Array): Uint8Array {
  if (audio.length < 10) return audio;
  if (audio[0] !== 0x49 || audio[1] !== 0x44 || audio[2] !== 0x33) return audio;
  const size =
    ((audio[6] & 0x7f) << 21) |
    ((audio[7] & 0x7f) << 14) |
    ((audio[8] & 0x7f) << 7) |
    (audio[9] & 0x7f);
  const start = 10 + size;
  return start < audio.length ? audio.subarray(start) : audio;
}

function embedMp3Tags(bytes: Uint8Array, meta: DownloadEmbedMeta): Uint8Array {
  const frames: Uint8Array[] = [];
  if (meta.title) frames.push(textFrame('TIT2', meta.title));
  if (meta.artist) frames.push(textFrame('TPE1', meta.artist));
  if (meta.album) frames.push(textFrame('TALB', meta.album));
  if (meta.sourceComment) frames.push(txxxFrame('Source', meta.sourceComment));
  if (meta.embedLyric && meta.lyric) frames.push(usltFrame(meta.lyric));
  if (meta.embedCover && meta.coverJpeg && meta.coverJpeg.length > 0) {
    frames.push(apicFrame(meta.coverJpeg));
  }
  if (frames.length === 0) return bytes;

  const body = stripExistingId3(bytes);
  let framesSize = 0;
  for (const f of frames) framesSize += f.length;

  const header = new Uint8Array(10);
  header.set(encodeLatin1('ID3'), 0);
  header[3] = 3; // v2.3
  header[4] = 0;
  header.set(synchsafe(framesSize), 6);

  const out = new Uint8Array(header.length + framesSize + body.length);
  let o = 0;
  out.set(header, o);
  o += header.length;
  for (const f of frames) {
    out.set(f, o);
    o += f.length;
  }
  out.set(body, o);
  return out;
}

function writeU32BE(n: number): Uint8Array {
  return new Uint8Array([
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ]);
}

function writeU32LE(n: number): Uint8Array {
  return new Uint8Array([
    n & 0xff,
    (n >>> 8) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 24) & 0xff,
  ]);
}

function flacBlockHeader(type: number, length: number, isLast: boolean): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = (isLast ? 0x80 : 0) | (type & 0x7f);
  out[1] = (length >>> 16) & 0xff;
  out[2] = (length >>> 8) & 0xff;
  out[3] = length & 0xff;
  return out;
}

function buildVorbisCommentBlock(meta: DownloadEmbedMeta, isLast: boolean): Uint8Array {
  const comments: string[] = [];
  if (meta.title) comments.push(`TITLE=${meta.title}`);
  if (meta.artist) comments.push(`ARTIST=${meta.artist}`);
  if (meta.album) comments.push(`ALBUM=${meta.album}`);
  if (meta.embedLyric && meta.lyric) comments.push(`LYRICS=${meta.lyric}`);
  if (meta.sourceComment) comments.push(`DESCRIPTION=${meta.sourceComment}`);

  const vendor = encodeUtf8('Reader');
  const encodedComments = comments.map((c) => encodeUtf8(c));
  let bodyLen = 4 + vendor.length + 4;
  for (const c of encodedComments) bodyLen += 4 + c.length;

  const body = new Uint8Array(bodyLen);
  let o = 0;
  body.set(writeU32LE(vendor.length), o);
  o += 4;
  body.set(vendor, o);
  o += vendor.length;
  body.set(writeU32LE(encodedComments.length), o);
  o += 4;
  for (const c of encodedComments) {
    body.set(writeU32LE(c.length), o);
    o += 4;
    body.set(c, o);
    o += c.length;
  }

  const header = flacBlockHeader(4, body.length, isLast);
  const out = new Uint8Array(header.length + body.length);
  out.set(header, 0);
  out.set(body, header.length);
  return out;
}

function buildPictureBlock(jpeg: Uint8Array, isLast: boolean): Uint8Array {
  const mime = encodeUtf8('image/jpeg');
  const desc = encodeUtf8('');
  // type(4) + mimeLen(4)+mime + descLen(4)+desc + w/h/depth/colors(16) + dataLen(4)+data
  const bodyLen = 4 + 4 + mime.length + 4 + desc.length + 16 + 4 + jpeg.length;
  const body = new Uint8Array(bodyLen);
  let o = 0;
  body.set(writeU32BE(3), o); // Cover (front)
  o += 4;
  body.set(writeU32BE(mime.length), o);
  o += 4;
  body.set(mime, o);
  o += mime.length;
  body.set(writeU32BE(desc.length), o);
  o += 4;
  body.set(desc, o);
  o += desc.length;
  body.set(writeU32BE(0), o); // width
  o += 4;
  body.set(writeU32BE(0), o); // height
  o += 4;
  body.set(writeU32BE(0), o); // depth
  o += 4;
  body.set(writeU32BE(0), o); // colors
  o += 4;
  body.set(writeU32BE(jpeg.length), o);
  o += 4;
  body.set(jpeg, o);

  const header = flacBlockHeader(6, body.length, isLast);
  const out = new Uint8Array(header.length + body.length);
  out.set(header, 0);
  out.set(body, header.length);
  return out;
}

type FlacMetaBlock = { type: number; data: Uint8Array; isLast: boolean };

function parseFlacMetadata(bytes: Uint8Array): {
  streamInfo: FlacMetaBlock;
  others: FlacMetaBlock[];
  audioOffset: number;
} | null {
  if (bytes.length < 8) return null;
  if (bytes[0] !== 0x66 || bytes[1] !== 0x4c || bytes[2] !== 0x61 || bytes[3] !== 0x43) {
    return null; // fLaC
  }
  let offset = 4;
  let streamInfo: FlacMetaBlock | null = null;
  const others: FlacMetaBlock[] = [];
  while (offset + 4 <= bytes.length) {
    const header = bytes[offset]!;
    const isLast = (header & 0x80) !== 0;
    const type = header & 0x7f;
    const length =
      ((bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
    const dataStart = offset + 4;
    const dataEnd = dataStart + length;
    if (dataEnd > bytes.length) return null;
    const block: FlacMetaBlock = {
      type,
      data: bytes.subarray(dataStart, dataEnd),
      isLast,
    };
    if (type === 0) {
      if (streamInfo) return null;
      streamInfo = block;
    } else {
      others.push(block);
    }
    offset = dataEnd;
    if (isLast) break;
  }
  if (!streamInfo) return null;
  return { streamInfo, others, audioOffset: offset };
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function embedFlacTags(bytes: Uint8Array, meta: DownloadEmbedMeta): Uint8Array {
  const parsed = parseFlacMetadata(bytes);
  if (!parsed) return bytes;

  const wantComment =
    Boolean(meta.title) ||
    Boolean(meta.artist) ||
    Boolean(meta.album) ||
    Boolean(meta.sourceComment) ||
    Boolean(meta.embedLyric && meta.lyric);
  const wantPicture = Boolean(meta.embedCover && meta.coverJpeg && meta.coverJpeg.length > 0);
  if (!wantComment && !wantPicture) return bytes;

  // 丢弃旧 VORBIS_COMMENT(4) 与 PICTURE(6)，保留其余块
  const kept = parsed.others.filter((b) => b.type !== 4 && b.type !== 6);
  const parts: Uint8Array[] = [encodeLatin1('fLaC')];

  const streamInfoBody = parsed.streamInfo.data;
  // STREAMINFO 之后还有块 → 非 last
  const streamInfoLast = !wantComment && !wantPicture && kept.length === 0;
  parts.push(flacBlockHeader(0, streamInfoBody.length, streamInfoLast));
  parts.push(streamInfoBody);

  if (wantComment) {
    const commentLast = !wantPicture && kept.length === 0;
    parts.push(buildVorbisCommentBlock(meta, commentLast));
  }
  if (wantPicture && meta.coverJpeg) {
    const picLast = kept.length === 0;
    parts.push(buildPictureBlock(meta.coverJpeg, picLast));
  }

  for (let i = 0; i < kept.length; i++) {
    const block = kept[i]!;
    const isLast = i === kept.length - 1;
    parts.push(flacBlockHeader(block.type, block.data.length, isLast));
    parts.push(block.data);
  }

  parts.push(bytes.subarray(parsed.audioOffset));
  return concatBytes(parts);
}

/** MP3 写 ID3；FLAC 写 Vorbis Comment（+ 可选 PICTURE）；其他格式原样返回 */
export function embedDownloadAudioTags(
  bytes: Uint8Array,
  ext: string,
  meta: DownloadEmbedMeta,
): Uint8Array {
  const lower = ext.toLowerCase();
  if (lower === 'mp3' || lower === 'mpeg') return embedMp3Tags(bytes, meta);
  if (lower === 'flac') return embedFlacTags(bytes, meta);
  return bytes;
}

/** 测试辅助：构造仅含 STREAMINFO 的最小 FLAC（无音频帧亦可用于元数据往返） */
export function createMinimalFlacForTests(): Uint8Array {
  const streamInfo = new Uint8Array(34);
  // min/max block size
  streamInfo[0] = 0;
  streamInfo[1] = 16;
  streamInfo[2] = 0;
  streamInfo[3] = 16;
  // sample rate 44100 in top 20 bits of bytes 10-12, channels=2-1 in next 3 bits, bps=16-1
  // 44100 << 12 | 1 << 9 | 15 << 4 | 0 ... simplify: write known-good layout
  const sampleRate = 44100;
  const channelsMinus1 = 1;
  const bpsMinus1 = 15;
  const packed =
    ((sampleRate & 0xfffff) << 12) | ((channelsMinus1 & 0x7) << 9) | ((bpsMinus1 & 0x1f) << 4);
  streamInfo[10] = (packed >>> 16) & 0xff;
  streamInfo[11] = (packed >>> 8) & 0xff;
  streamInfo[12] = packed & 0xff;
  const header = flacBlockHeader(0, streamInfo.length, true);
  return concatBytes([encodeLatin1('fLaC'), header, streamInfo]);
}

/** 从 FLAC Vorbis Comment 读取 TITLE（测试用） */
export function readFlacVorbisTitleForTests(bytes: Uint8Array): string | null {
  const parsed = parseFlacMetadata(bytes);
  if (!parsed) return null;
  const comment = parsed.others.find((b) => b.type === 4);
  if (!comment) return null;
  const data = comment.data;
  if (data.length < 8) return null;
  const vendorLen =
    data[0]! | (data[1]! << 8) | (data[2]! << 16) | (data[3]! << 24);
  let o = 4 + vendorLen;
  if (o + 4 > data.length) return null;
  const count =
    data[o]! | (data[o + 1]! << 8) | (data[o + 2]! << 16) | (data[o + 3]! << 24);
  o += 4;
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (o + 4 > data.length) return null;
    const len =
      data[o]! | (data[o + 1]! << 8) | (data[o + 2]! << 16) | (data[o + 3]! << 24);
    o += 4;
    if (o + len > data.length) return null;
    const text = decoder.decode(data.subarray(o, o + len));
    o += len;
    if (text.toUpperCase().startsWith('TITLE=')) return text.slice(6);
  }
  return null;
}
