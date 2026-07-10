/**
 * 酷我歌词解密（对齐 lx-music kw_decodeLyric）
 */

import { inflate } from 'fflate';

const BUF_KEY = new Uint8Array([121, 101, 101, 108, 105, 111, 110]); // yeelion

function decodeGb18030(bytes: Uint8Array): string {
  try {
    return new TextDecoder('gb18030').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

async function inflateBuffer(data: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    inflate(data, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

export async function decodeKwLyricRaw(
  raw: ArrayBuffer,
  isGetLyricx = true,
): Promise<string> {
  const buf = new Uint8Array(raw);
  const header = decodeGb18030(buf.subarray(0, Math.min(10, buf.length)));
  if (!header.startsWith('tp=content')) return '';

  const marker = new TextEncoder().encode('\r\n\r\n');
  let headerEnd = -1;
  for (let i = 0; i <= buf.length - 4; i++) {
    if (buf[i] === marker[0] && buf[i + 1] === marker[1] && buf[i + 2] === marker[2] && buf[i + 3] === marker[3]) {
      headerEnd = i + 4;
      break;
    }
  }
  if (headerEnd < 0) return '';

  const inflated = await inflateBuffer(buf.subarray(headerEnd));
  if (!isGetLyricx) return decodeGb18030(inflated);

  const b64Text = decodeGb18030(inflated);
  const binary = Uint8Array.from(atob(b64Text), (c) => c.charCodeAt(0));
  const output = new Uint8Array(binary.length);
  let i = 0;
  while (i < binary.length) {
    let j = 0;
    while (j < BUF_KEY.length && i < binary.length) {
      output[i] = binary[i]! ^ BUF_KEY[j]!;
      i++;
      j++;
    }
  }
  return decodeGb18030(output);
}

const EXIST_TIME_EXP = /\[\d{1,2}:.*\d{1,4}\]/;
const WORD_TIME_ALL = /<(-?\d+),(-?\d+)(?:,-?\d+)?>/g;

function sortLrcArr(arr: Array<{ time: string; text: string }>) {
  const lrcSet = new Set<string>();
  const lrc: Array<{ time: string; text: string }> = [];
  const lrcT: Array<{ time: string; text: string }> = [];
  for (const item of arr) {
    if (lrcSet.has(item.time)) {
      if (lrc.length < 2) continue;
      const tItem = lrc.pop()!;
      tItem.time = lrc[lrc.length - 1]!.time;
      lrcT.push(tItem);
      lrc.push(item);
    } else {
      lrc.push(item);
      lrcSet.add(item.time);
    }
  }
  return { lrc, lrcT };
}

function transformLrc(tags: string[], lrclist: Array<{ time: string; text: string }> | null): string {
  const body = lrclist?.map((l) => `[${l.time}]${l.text}\n`).join('') ?? '暂无歌词';
  return `${tags.join('\n')}\n${body}`;
}

export function parseKwLrcText(lrc: string): { lyric: string; tlyric: string } {
  const lines = lrc.split(/\r\n|\r|\n/);
  const tags: string[] = [];
  const lrcArr: Array<{ time: string; text: string }> = [];
  const timeRe = /^\[([\d:.]*)\]/;
  for (const line of lines) {
    const trimmed = line.trim();
    const result = timeRe.exec(trimmed);
    if (result) {
      const text = trimmed.replace(timeRe, '').trim();
      let time = result[1] ?? '';
      if (/\.\d\d$/.test(time)) time += '0';
      lrcArr.push({ time, text });
    } else if (/^\[(ver|ti|ar|al|offset|by|kuwo):/i.test(trimmed)) {
      tags.push(trimmed);
    }
  }
  const lrcInfo = sortLrcArr(lrcArr);
  return {
    lyric: transformLrc(tags, lrcInfo.lrc),
    tlyric: lrcInfo.lrcT.length ? transformLrc(tags, lrcInfo.lrcT) : '',
  };
}

export function stripKwWordTimeTags(lrc: string): string {
  return lrc.replace(WORD_TIME_ALL, '');
}

export function isValidKwLrc(lrc: string): boolean {
  return EXIST_TIME_EXP.test(lrc);
}
