/**
 * 从 LRC / 逐字歌词文本中解析当前播放位置对应的一行歌词。
 */
export function currentLyricLine(lyric: string, positionSec: number): string {
  const timestamp = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  const lines: { time: number; text: string }[] = [];
  for (const rawLine of lyric.split(/\r?\n/)) {
    const matches = [...rawLine.matchAll(timestamp)];
    if (matches.length === 0) continue;
    const text = rawLine
      .replace(timestamp, '')
      .replace(/<\d+(?:\.\d+)?,\d+(?:\.\d+)?>/g, '')
      .trim();
    if (!text) continue;
    for (const match of matches) {
      const fraction = match[3] ? parseInt(match[3], 10) / 1000 : 0;
      lines.push({
        time: Number(match[1]) * 60 + Number(match[2]) + (Number.isFinite(fraction) ? fraction : 0),
        text,
      });
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
