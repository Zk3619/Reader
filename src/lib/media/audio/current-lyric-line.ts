/**
 * 从 LRC / 逐字歌词文本中解析当前播放位置对应的一行歌词。
 * 支持标准 [mm:ss.xxx] 与 MusicFree [ss] / [ss.xx]。
 */
import {
  LRC_TIME_TAG_RE,
  parseLrcTimeTagToSec,
} from '@/lib/media/audio/lrc-time';

export function currentLyricLine(lyric: string, positionSec: number): string {
  const lines: { time: number; text: string }[] = [];
  for (const rawLine of lyric.split(/\r?\n/)) {
    const matches = [...rawLine.matchAll(LRC_TIME_TAG_RE)];
    if (matches.length === 0) continue;
    const text = rawLine
      .replace(LRC_TIME_TAG_RE, '')
      .replace(/<\d+(?:\.\d+)?,\d+(?:\.\d+)?>/g, '')
      .trim();
    if (!text) continue;
    for (const match of matches) {
      const time = parseLrcTimeTagToSec(match[0]!);
      if (time == null) continue;
      lines.push({ time, text });
    }
  }
  if (lines.length === 0) {
    // 无时间戳：展示首行可读文本，避免播放栏空白
    const plain = lyric
      .split(/\r?\n/)
      .map((line) => line.replace(/<\d+(?:\.\d+)?,\d+(?:\.\d+)?>/g, '').trim())
      .find((line) => line.length > 0 && !line.startsWith('['));
    return plain ?? '';
  }
  lines.sort((a, b) => a.time - b.time);
  let active = '';
  for (const line of lines) {
    if (line.time > positionSec) break;
    active = line.text;
  }
  return active;
}
