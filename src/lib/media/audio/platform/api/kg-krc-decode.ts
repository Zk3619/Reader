/**
 * 酷狗 KRC 解密与解析（对齐 lx lyricUtils/kg.js）
 */

import { inflate } from 'fflate';

const ENC_KEY = new Uint8Array([
  0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69,
]);

const HEAD_EXP = /^.*\[id:\$\w+\]\n/;

const ENCODE_NAMES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#039;': "'",
};

function decodeName(str: string): string {
  return str.replace(
    /(?:&amp;|&lt;|&gt;|&quot;|&apos;|&#039;|&nbsp;)/gm,
    (s) => ENCODE_NAMES[s] ?? s,
  );
}

function inflateBuffer(data: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    inflate(data, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

async function decodeLyricRaw(b64: string): Promise<string> {
  if (!b64) return '';
  const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const buf = binary.subarray(4);
  for (let i = 0; i < buf.length; i++) {
    buf[i] = buf[i]! ^ ENC_KEY[i % 16]!;
  }
  const inflated = await inflateBuffer(buf);
  return new TextDecoder('utf-8').decode(inflated);
}

function parseKrcText(str: string): {
  lyric: string;
  tlyric: string;
  rlyric: string;
  lxlyric: string;
} {
  str = str.replace(/\r/g, '');
  if (HEAD_EXP.test(str)) str = str.replace(HEAD_EXP, '');

  let rlyricContent: string[][] | null = null;
  let tlyricContent: string[][] | null = null;
  const trans = str.match(/\[language:([\w=\\/+]+)\]/);
  if (trans) {
    str = str.replace(/\[language:[\w=\\/+]+\]\n/, '');
    try {
      const json = JSON.parse(atob(trans[1]!)) as {
        content?: Array<{ type?: number; lyricContent?: string[][] }>;
      };
      for (const item of json.content ?? []) {
        if (item.type === 0) rlyricContent = item.lyricContent ?? null;
        if (item.type === 1) tlyricContent = item.lyricContent ?? null;
      }
    } catch {
      // ignore
    }
  }

  let i = 0;
  let lxlyric = str.replace(/\[((\d+),\d+)\].*/g, (full) => {
    const result = full.match(/\[((\d+),\d+)\].*/);
    if (!result) return full;
    let time = parseInt(result[2]!, 10);
    const ms = time % 1000;
    time = Math.floor(time / 1000);
    const m = Math.floor(time / 60)
      .toString()
      .padStart(2, '0');
    time %= 60;
    const s = Math.floor(time).toString().padStart(2, '0');
    const timeLabel = `${m}:${s}.${ms}`;
    if (rlyricContent) {
      rlyricContent[i] = [`[${timeLabel}]${(rlyricContent[i] ?? []).join('')}`] as unknown as string[];
    }
    if (tlyricContent) {
      tlyricContent[i] = [`[${timeLabel}]${(tlyricContent[i] ?? []).join('')}`] as unknown as string[];
    }
    i += 1;
    return full.replace(result[1]!, timeLabel);
  });

  // Align with lx: after rewrite, join the mutated language arrays
  const rlyric = rlyricContent ? rlyricContent.map((row) => (row[0] ?? '')).join('\n') : '';
  const tlyric = tlyricContent ? tlyricContent.map((row) => (row[0] ?? '')).join('\n') : '';

  lxlyric = lxlyric.replace(/<(\d+,\d+),\d+>/g, '<$1>');
  lxlyric = decodeName(lxlyric);
  const lyric = lxlyric.replace(/<\d+,\d+>/g, '');
  return {
    lyric,
    tlyric: decodeName(tlyric),
    rlyric: decodeName(rlyric),
    lxlyric,
  };
}

export async function decodeKrc(contentBase64: string): Promise<{
  lyric: string;
  tlyric: string;
  rlyric: string;
  lxlyric: string;
}> {
  const text = await decodeLyricRaw(contentBase64);
  return parseKrcText(text);
}

export function decodeKgLrcBase64(contentBase64: string): {
  lyric: string;
  tlyric: string;
  rlyric: string;
  lxlyric: string;
} {
  const lyric = atob(contentBase64);
  return { lyric, tlyric: '', rlyric: '', lxlyric: '' };
}
