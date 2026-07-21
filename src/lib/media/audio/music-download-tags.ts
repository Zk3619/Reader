/**
 * 下载完成时嵌入简易 ID3v2.3 元数据（标题/艺术家/专辑/歌词/封面）。
 * FLAC 暂不改写文件体（仍可旁路 .lrc）。
 */

export type DownloadEmbedMeta = {
  title: string;
  artist: string;
  album?: string;
  lyric?: string;
  coverJpeg?: Uint8Array | null;
  embedLyric?: boolean;
  embedCover?: boolean;
  /** ID3 TXXX:Description=Source */
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

/** 仅对 MP3 写入 ID3；其他格式原样返回 */
export function embedDownloadAudioTags(
  bytes: Uint8Array,
  ext: string,
  meta: DownloadEmbedMeta,
): Uint8Array {
  const lower = ext.toLowerCase();
  if (lower !== 'mp3' && lower !== 'mpeg') return bytes;

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
