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

/** 对齐 lx kw/util.js lrcTools：将酷我 `<a,b,c>` 转为 `<start,dur>` */
type KwWordInfo = {
  startTime: number;
  endTime: number;
  timeStr: string;
  newTimeStr?: string;
};

const lrcToolsBase = {
  wordLine: /^(\[\d{1,2}:.*\d{1,4}\])\s*(\S+(?:\s+\S+)*)?\s*/,
  tagLine: /\[(ver|ti|ar|al|offset|by|kuwo):\s*(\S+(?:\s+\S+)*)\s*\]/,
  wordTimeAll: /<(-?\d+),(-?\d+)(?:,-?\d+)?>/g,
  wordTime: /<(-?\d+),(-?\d+)(?:,-?\d+)?>/,
};

function getKwWordInfo(
  offset: number,
  offset2: number,
  scale: number,
  scale2: number,
  prevWord?: KwWordInfo,
): KwWordInfo {
  let startTime = Math.abs((offset + offset2) / (scale * 2));
  let endTime = Math.abs((offset - offset2) / (scale2 * 2)) + startTime;
  const info: KwWordInfo = {
    startTime,
    endTime,
    timeStr: `<${startTime},${endTime - startTime}>`,
  };
  if (prevWord) {
    if (startTime < prevWord.endTime) {
      prevWord.endTime = startTime;
      if (prevWord.startTime > prevWord.endTime) prevWord.startTime = prevWord.endTime;
      prevWord.newTimeStr = `<${prevWord.startTime},${prevWord.endTime - prevWord.startTime}>`;
    }
  }
  return info;
}

export function parseKwLxLyric(lrc: string): string {
  const lines = lrc.split(/\r\n|\r|\n/);
  let isOK = true;
  let offset = 1;
  let offset2 = 1;
  const outLines: string[] = [];
  const tags: string[] = [];

  for (const line of lines) {
    if (!isOK) throw new Error('failed');
    if (line.length < 6) continue;
    let result = lrcToolsBase.wordLine.exec(line);
    if (result) {
      const time = result[1]!;
      let words = result[2] ?? '';
      const wordTimes = words.match(lrcToolsBase.wordTimeAll);
      if (!wordTimes) continue;
      let preTimeInfo: KwWordInfo | undefined;
      for (const timeStr of wordTimes) {
        const m = lrcToolsBase.wordTime.exec(timeStr);
        if (!m) continue;
        const wordInfo = getKwWordInfo(
          parseInt(m[1]!, 10),
          parseInt(m[2]!, 10),
          offset,
          offset2,
          preTimeInfo,
        );
        words = words.replace(timeStr, wordInfo.timeStr);
        if (preTimeInfo?.newTimeStr) {
          words = words.replace(preTimeInfo.timeStr, preTimeInfo.newTimeStr);
        }
        preTimeInfo = wordInfo;
      }
      outLines.push(time + words);
      continue;
    }
    result = lrcToolsBase.tagLine.exec(line);
    if (!result) continue;
    if (result[1] === 'kuwo') {
      let content = result[2] ?? '';
      if (content.includes('][')) content = content.substring(0, content.indexOf(']['));
      const valueOf = parseInt(content, 8);
      offset = Math.trunc(valueOf / 10);
      offset2 = Math.trunc(valueOf % 10);
      if (offset === 0 || Number.isNaN(offset) || offset2 === 0 || Number.isNaN(offset2)) {
        isOK = false;
      }
    } else {
      tags.push(line);
    }
  }
  if (!outLines.length) return '';
  let lrcs = outLines.join('\n');
  if (tags.length) lrcs = `${tags.join('\n')}\n${lrcs}`;
  return lrcs;
}
