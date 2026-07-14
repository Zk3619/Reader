/**
 * 网易云 yrc → lxlyric（对齐 lx-music wy/lyric.js parseTools）
 */

const RX_INFO = /^{"/;
const RX_LINE_TIME = /^\[(\d+),\d+\]/;
const RX_WORD_TIME = /\(\d+,\d+,\d+\)/;
const RX_WORD_TIME_ALL = /(\(\d+,\d+,\d+\))/g;

function msFormat(timeMs: number): string {
  if (Number.isNaN(timeMs)) return '';
  let ms = timeMs % 1000;
  timeMs = Math.floor(timeMs / 1000);
  const m = Math.floor(timeMs / 60)
    .toString()
    .padStart(2, '0');
  timeMs %= 60;
  const s = Math.floor(timeMs).toString().padStart(2, '0');
  return `[${m}:${s}.${ms}]`;
}

function parseLyricLines(lines: string[]): { lyric: string; lxlyric: string } {
  const lxlrcLines: string[] = [];
  const lrcLines: string[] = [];

  for (let line of lines) {
    line = line.trim();
    const result = RX_LINE_TIME.exec(line);
    if (!result) {
      if (line.startsWith('[offset')) {
        lxlrcLines.push(line);
        lrcLines.push(line);
      }
      continue;
    }

    const startMsTime = parseInt(result[1]!, 10);
    const startTimeStr = msFormat(startMsTime);
    if (!startTimeStr) continue;

    let words = line.replace(RX_LINE_TIME, '');
    lrcLines.push(`${startTimeStr}${words.replace(RX_WORD_TIME_ALL, '')}`);

    const timesRaw = words.match(RX_WORD_TIME_ALL);
    if (!timesRaw) continue;
    const times = timesRaw.map((time) => {
      const m = /\((\d+),(\d+),\d+\)/.exec(time);
      return `<${Math.max(parseInt(m![1]!, 10) - startMsTime, 0)},${m![2]!}>`;
    });
    const wordArr = words.split(RX_WORD_TIME);
    wordArr.shift();
    const newWords = times.map((time, index) => `${time}${wordArr[index] ?? ''}`).join('');
    lxlrcLines.push(`${startTimeStr}${newWords}`);
  }
  return {
    lyric: lrcLines.join('\n'),
    lxlyric: lxlrcLines.join('\n'),
  };
}

function parseHeaderInfo(str: string): string[] | null {
  str = str.trim().replace(/\r/g, '');
  if (!str) return null;
  return str.split('\n').map((line) => {
    if (!RX_INFO.test(line)) return line;
    try {
      const info = JSON.parse(line) as { t?: number; c?: Array<{ tx?: string }> };
      const timeTag = msFormat(Number(info.t ?? NaN));
      return timeTag ? `${timeTag}${(info.c ?? []).map((t) => t.tx ?? '').join('')}` : '';
    } catch {
      return '';
    }
  });
}

function getIntv(interval: string): number {
  if (!interval) return 0;
  if (!interval.includes('.')) interval += '.0';
  const arr = interval.split(/:|\./);
  while (arr.length < 3) arr.unshift('0');
  const [m, s, ms] = arr;
  return parseInt(m!, 10) * 60_000 + parseInt(s!, 10) * 1000 + parseInt(ms!, 10);
}

function fixTimeTag(lrc: string, targetlrc: string): string {
  let lrcLines = lrc.split('\n');
  const targetlrcLines = targetlrc.split('\n');
  const timeRxp = /^\[([\d:.]+)\]/;
  let temp: string[] = [];
  const newLrc: string[] = [];
  for (const line of targetlrcLines) {
    const result = timeRxp.exec(line);
    if (!result) continue;
    const words = line.replace(timeRxp, '');
    if (!words.trim()) continue;
    const t1 = getIntv(result[1]!);

    while (lrcLines.length) {
      const lrcLine = lrcLines.shift()!;
      const lrcLineResult = timeRxp.exec(lrcLine);
      if (!lrcLineResult) continue;
      const t2 = getIntv(lrcLineResult[1]!);
      if (Math.abs(t1 - t2) < 100) {
        const fixed = line.replace(timeRxp, lrcLineResult[0]).trim();
        if (fixed) newLrc.push(fixed);
        break;
      }
      temp.push(lrcLine);
    }
    lrcLines = [...temp, ...lrcLines];
    temp = [];
  }
  return newLrc.join('\n');
}

export function parseWyYrcBundle(
  ylrc?: string | null,
  ytlrc?: string | null,
  yrlrc?: string | null,
  lrc?: string | null,
  tlrc?: string | null,
  rlrc?: string | null,
): { lyric: string; tlyric: string; rlyric: string; lxlyric: string } {
  const info = { lyric: '', tlyric: '', rlyric: '', lxlyric: '' };
  if (ylrc) {
    const lines = parseHeaderInfo(ylrc);
    if (lines) {
      const result = parseLyricLines(lines);
      if (ytlrc) {
        const tLines = parseHeaderInfo(ytlrc);
        if (tLines) info.tlyric = fixTimeTag(result.lyric, tLines.join('\n'));
      }
      if (yrlrc) {
        const rLines = parseHeaderInfo(yrlrc);
        if (rLines) info.rlyric = fixTimeTag(result.lyric, rLines.join('\n'));
      }
      const timeRxp = /^\[[\d:.]+\]/;
      const headers = lines.filter((l) => timeRxp.test(l)).join('\n');
      info.lyric = `${headers}\n${result.lyric}`;
      info.lxlyric = result.lxlyric;
      return info;
    }
  }
  if (lrc) {
    const lines = parseHeaderInfo(lrc);
    if (lines) info.lyric = lines.join('\n');
  }
  if (tlrc) {
    const lines = parseHeaderInfo(tlrc);
    if (lines) info.tlyric = lines.join('\n');
  }
  if (rlrc) {
    const lines = parseHeaderInfo(rlrc);
    if (lines) info.rlyric = lines.join('\n');
  }
  return info;
}

export function fixWyTimeLabel(
  lrc: string | null | undefined,
  tlrc: string | null | undefined,
  romalrc: string | null | undefined,
): { lrc: string; tlrc: string; romalrc: string } {
  let outLrc = lrc ?? '';
  let outTlrc = tlrc ?? '';
  let outRoma = romalrc ?? '';
  if (outLrc) {
    const newLrc = outLrc.replace(/\[(\d{2}:\d{2}):(\d{2})]/g, '[$1.$2]');
    const newTlrc = outTlrc.replace(/\[(\d{2}:\d{2}):(\d{2})]/g, '[$1.$2]');
    if (newLrc !== outLrc || newTlrc !== outTlrc) {
      outLrc = newLrc;
      outTlrc = newTlrc;
      if (outRoma) {
        outRoma = outRoma
          .replace(/\[(\d{2}:\d{2}):(\d{2,3})]/g, '[$1.$2]')
          .replace(/\[(\d{2}:\d{2}\.\d{2})0]/g, '[$1]');
      }
    }
  }
  return { lrc: outLrc, tlrc: outTlrc, romalrc: outRoma };
}
