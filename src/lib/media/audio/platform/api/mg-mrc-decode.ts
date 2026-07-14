/**
 * 咪咕 MRC TEA 解密（对齐 lx mg/utils/mrc.js）
 */

const DELTA = 2654435769n;
const MIN_LENGTH = 32;
const KEY_ARR = [
  27303562373562475n,
  18014862372307051n,
  22799692160172081n,
  34058940340699235n,
  30962724186095721n,
  27303523720101991n,
  27303523720101998n,
  31244139033526382n,
  28992395054481524n,
];

const MAX = 9223372036854775807n;
const MIN = -9223372036854775808n;

function toLong(str: bigint | string): bigint {
  let num = typeof str === 'string' ? BigInt(`0x${str}`) : str;
  if (num > MAX) return toLong(num - (1n << 64n));
  if (num < MIN) return toLong(num + (1n << 64n));
  return num;
}

function longToBytes(l: bigint): Uint8Array {
  const result = new Uint8Array(8);
  let v = l;
  for (let i = 0; i < 8; i++) {
    result[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return result;
}

function longArrToString(data: bigint[]): string {
  const decoder = new TextDecoder('utf-16le');
  return data.map((j) => decoder.decode(longToBytes(j))).join('');
}

function toBigintArray(data: string): bigint[] {
  const length = Math.floor(data.length / 16);
  const jArr: bigint[] = Array(length);
  for (let i = 0; i < length; i++) {
    jArr[i] = toLong(data.substring(i * 16, i * 16 + 16));
  }
  return jArr;
}

function teaDecrypt(data: bigint[], key: bigint[]): bigint[] {
  const length = data.length;
  const lengthBitint = BigInt(length);
  if (length >= 1) {
    let j2 = data[0]!;
    let j3 = toLong((6n + 52n / lengthBitint) * DELTA);
    while (true) {
      const j4 = j3;
      if (j4 === 0n) break;
      const j5 = toLong(3n & toLong(j4 >> 2n));
      let j6 = lengthBitint;
      while (true) {
        j6--;
        if (j6 > 0n) {
          const j7 = data[Number(j6 - 1n)]!;
          const i = Number(j6);
          j2 = toLong(
            data[i]! -
              toLong(
                toLong(toLong(j2 ^ j4) + toLong(j7 ^ key[Number(toLong(toLong(3n & j6) ^ j5))])) ^
                  toLong(toLong(toLong(j7 >> 5n) ^ toLong(j2 << 2n)) + toLong(toLong(j2 >> 3n) ^ toLong(j7 << 4n))),
              ),
          );
          data[i] = j2;
        } else break;
      }
      const j8 = data[Number(lengthBitint - 1n)]!;
      j2 = toLong(
        data[0]! -
          toLong(
            toLong(toLong(key[Number(toLong(toLong(j6 & 3n) ^ j5))]! ^ j8) + toLong(j2 ^ j4)) ^
              toLong(toLong(toLong(j8 >> 5n) ^ toLong(j2 << 2n)) + toLong(toLong(j2 >> 3n) ^ toLong(j8 << 4n))),
          ),
      );
      data[0] = j2;
      j3 = toLong(j4 - DELTA);
    }
  }
  return data;
}

export function decryptMrc(data: string): string {
  if (data == null || data.length < MIN_LENGTH) return data;
  return longArrToString(teaDecrypt(toBigintArray(data), KEY_ARR));
}

const RX_LINE_TIME = /^\s*\[(\d+),\d+\]/;
const RX_WORD_TIME = /\(\d+,\d+\)/;
const RX_WORD_TIME_ALL = /(\(\d+,\d+\))/g;

export function parseMrcLyric(str: string): { lyric: string; lxlyric: string } {
  str = str.replace(/\r/g, '');
  const lines = str.split('\n');
  const lxlrcLines: string[] = [];
  const lrcLines: string[] = [];

  for (const line of lines) {
    if (line.length < 6) continue;
    const result = RX_LINE_TIME.exec(line);
    if (!result) continue;

    const startTime = parseInt(result[1]!, 10);
    let time = startTime;
    const ms = time % 1000;
    time = Math.floor(time / 1000);
    const m = Math.floor(time / 60)
      .toString()
      .padStart(2, '0');
    time %= 60;
    const s = Math.floor(time).toString().padStart(2, '0');
    const timeLabel = `${m}:${s}.${ms}`;

    let words = line.replace(RX_LINE_TIME, '');
    lrcLines.push(`[${timeLabel}]${words.replace(RX_WORD_TIME_ALL, '')}`);

    const timesRaw = words.match(RX_WORD_TIME_ALL);
    if (!timesRaw) continue;
    const times = timesRaw.map((t) => {
      const m2 = /\((\d+),(\d+)\)/.exec(t);
      return `<${parseInt(m2![1]!, 10) - startTime},${m2![2]!}>`;
    });
    const wordArr = words.split(RX_WORD_TIME);
    const newWords = times.map((t, index) => `${t}${wordArr[index] ?? ''}`).join('');
    lxlrcLines.push(`[${timeLabel}]${newWords}`);
  }
  return {
    lyric: lrcLines.join('\n'),
    lxlyric: lxlrcLines.join('\n'),
  };
}
